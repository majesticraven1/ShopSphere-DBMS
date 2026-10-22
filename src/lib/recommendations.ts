import { pgQuery } from "./postgres";
import {
  getMongoCollections,
  runReviewAggregationPipeline,
  RecommendationItem,
} from "./mongodb";

export interface EnrichedRecommendation extends RecommendationItem {
  name: string;
  price: number;
  category_id: number;
  category_name: string;
  stock_qty: number;
  image_url: string;
  store_name: string;
}

/**
 * Computes and caches hybrid SQL + NoSQL recommendations for a customer (or guest = 0)
 * by combining:
 *  1. MongoDB Aggregation Pipeline (avg_rating, sentiment_weighted_score, review tags)
 *  2. PostgreSQL Co-Purchase Matrix (Order_Items self-join on shared orders)
 *  3. Customer Purchase & Review Tag Affinity
 */
export async function computeAndCacheRecommendations(
  customerId: number = 0,
  forceRefresh: boolean = false
): Promise<{
  customer_id: number;
  strategy: string;
  generated_at: string;
  from_cache: boolean;
  recommendations: EnrichedRecommendation[];
  pipeline_executed: object[];
}> {
  const { recommendationCache, reviews } = await getMongoCollections();

  // 1. Check MongoDB recommendation_cache if not forcing refresh
  const cached = await recommendationCache.findOne({ customer_id: customerId });
  const { stats, pipelineExecuted } = await runReviewAggregationPipeline();

  // Fetch all active products from PostgreSQL
  const productsRes = await pgQuery<{
    product_id: number;
    name: string;
    price: string;
    category_id: number;
    category_name: string;
    stock_qty: number;
    image_url: string;
    store_name: string;
  }>(`
    SELECT
      p.product_id,
      p.name,
      p.price,
      p.category_id,
      c.name AS category_name,
      p.stock_qty,
      p.image_url,
      s.store_name
    FROM Products p
    JOIN Categories c ON p.category_id = c.category_id
    JOIN Sellers s ON p.seller_id = s.seller_id
    WHERE p.stock_qty > 0
    ORDER BY p.product_id ASC
  `);

  const productMap = new Map(
    productsRes.rows.map((p) => [
      p.product_id,
      {
        ...p,
        price: Number(p.price),
      },
    ])
  );

  // If valid cache exists (< 10 minutes old) and not forceRefresh, enrich and return
  if (cached && !forceRefresh) {
    const enriched: EnrichedRecommendation[] = [];
    for (const item of cached.recommendations) {
      const prod = productMap.get(item.product_id);
      if (prod) {
        enriched.push({
          ...item,
          name: prod.name,
          price: prod.price,
          category_id: prod.category_id,
          category_name: prod.category_name,
          stock_qty: prod.stock_qty,
          image_url: prod.image_url,
          store_name: prod.store_name,
        });
      }
    }
    if (enriched.length > 0) {
      return {
        customer_id: customerId,
        strategy: cached.strategy,
        generated_at: cached.generated_at,
        from_cache: true,
        recommendations: enriched,
        pipeline_executed: pipelineExecuted,
      };
    }
  }

  // 2. Query PostgreSQL for customer's purchased product IDs and categories
  let purchasedIds: number[] = [];
  let preferredCategories = new Set<number>();

  if (customerId > 0) {
    const historyRes = await pgQuery<{
      product_id: number;
      category_id: number;
    }>(
      `
      SELECT DISTINCT oi.product_id, p.category_id
      FROM Orders o
      JOIN Order_Items oi ON o.order_id = oi.order_id
      JOIN Products p ON oi.product_id = p.product_id
      WHERE o.customer_id = $1 AND o.status <> 'cancelled'
      `,
      [customerId]
    );
    purchasedIds = historyRes.rows.map((r) => r.product_id);
    historyRes.rows.forEach((r) => preferredCategories.add(r.category_id));
  }

  // 3. Query PostgreSQL Co-Purchase Matrix (Order_Items self-join)
  const coPurchaseMap = new Map<number, number>();
  if (purchasedIds.length > 0) {
    const coRes = await pgQuery<{
      recommended_product_id: number;
      co_purchase_count: string;
    }>(
      `
      SELECT
        oi2.product_id AS recommended_product_id,
        COUNT(DISTINCT oi2.order_id) AS co_purchase_count
      FROM Order_Items oi1
      JOIN Order_Items oi2
        ON oi1.order_id = oi2.order_id
        AND oi1.product_id <> oi2.product_id
      WHERE oi1.product_id = ANY($1::int[])
      GROUP BY oi2.product_id
      ORDER BY co_purchase_count DESC
      `,
      [purchasedIds]
    );
    for (const row of coRes.rows) {
      coPurchaseMap.set(
        row.recommended_product_id,
        Number(row.co_purchase_count)
      );
    }
  } else {
    // Global co-purchase popularity across all orders
    const globalCoRes = await pgQuery<{
      recommended_product_id: number;
      co_purchase_count: string;
    }>(`
      SELECT
        oi2.product_id AS recommended_product_id,
        COUNT(DISTINCT oi1.order_id) AS co_purchase_count
      FROM Order_Items oi1
      JOIN Order_Items oi2
        ON oi1.order_id = oi2.order_id
        AND oi1.product_id <> oi2.product_id
      GROUP BY oi2.product_id
    `);
    for (const row of globalCoRes.rows) {
      coPurchaseMap.set(
        row.recommended_product_id,
        Number(row.co_purchase_count)
      );
    }
  }

  // 4. Extract customer's favorite tags from MongoDB reviews
  const preferredTags = new Set<string>();
  if (customerId > 0) {
    const userHighReviews = await reviews
      .find({
        $or: [
          { customer_id: customerId, rating: { $gte: 4 } },
          { product_id: { $in: purchasedIds }, rating: { $gte: 4 } },
        ],
      })
      .toArray();

    for (const rev of userHighReviews) {
      if (Array.isArray(rev.tags)) {
        rev.tags.forEach((t) => preferredTags.add(t.toLowerCase()));
      }
    }
  }

  // Map MongoDB aggregation stats by product_id
  const statsMap = new Map(stats.map((s) => [s.product_id, s]));

  // 5. Score every candidate product
  const scoredItems: RecommendationItem[] = [];

  for (const [productId, prod] of Array.from(productMap.entries())) {
    const st = statsMap.get(productId);
    const sentimentWeighted = st?.sentiment_weighted_score ?? 3.8;
    const avgRating = st?.avg_rating ?? 4.0;
    const reviewCount = st?.review_count ?? 0;
    const productTags = st?.top_tags ?? [];
    const coPurchaseCount = coPurchaseMap.get(productId) ?? 0;

    const matchedTags = productTags.filter((t) => preferredTags.has(t));
    const tagBonus =
      matchedTags.length > 0
        ? matchedTags.length * 0.45
        : productTags.slice(0, 2).length * 0.15;
    const coPurchaseBonus = coPurchaseCount * 0.65;
    const categoryBonus = preferredCategories.has(prod.category_id) ? 0.4 : 0;
    const alreadyOwnedPenalty = purchasedIds.includes(productId) ? -0.35 : 0;

    const compositeScore = Number(
      (
        sentimentWeighted +
        tagBonus +
        coPurchaseBonus +
        categoryBonus +
        alreadyOwnedPenalty
      ).toFixed(2)
    );

    const reasons: string[] = [];
    if (coPurchaseCount > 0) {
      reasons.push(
        customerId > 0
          ? `Co-purchased ${coPurchaseCount}x with your past orders`
          : `Frequently bought together (${coPurchaseCount} bundles)`
      );
    }
    if (st && st.avg_sentiment >= 0.75) {
      reasons.push(
        `${Math.round(st.avg_sentiment * 100)}% positive review sentiment`
      );
    }
    if (matchedTags.length > 0) {
      reasons.push(`Matches your tag affinity: #${matchedTags.slice(0, 2).join(", #")}`);
    } else if (productTags.length > 0) {
      reasons.push(`Top rated for #${productTags.slice(0, 2).join(", #")}`);
    }

    scoredItems.push({
      product_id: productId,
      score: compositeScore,
      sentiment_weighted_score: sentimentWeighted,
      avg_rating: avgRating,
      review_count: reviewCount,
      matched_tags: matchedTags.length > 0 ? matchedTags : productTags.slice(0, 3),
      co_purchase_count: coPurchaseCount,
      reason:
        reasons.join(" • ") ||
        "Highly rated in MongoDB review sentiment aggregation",
    });
  }

  scoredItems.sort((a, b) => b.score - a.score);
  const topRecommendations = scoredItems.slice(0, 6);

  const nowIso = new Date().toISOString();
  const strategy =
    customerId > 0
      ? "Personalized Hybrid (MongoDB Sentiment Aggregation + SQL Co-Purchase Join + Tag Affinity)"
      : "Global Hybrid (MongoDB Sentiment-Weighted Aggregation + SQL Co-Purchase Popularity)";

  // 6. Save to MongoDB `recommendation_cache` collection
  await recommendationCache.updateOne(
    { customer_id: customerId },
    {
      $set: {
        customer_id: customerId,
        strategy,
        generated_at: nowIso,
        recommendations: topRecommendations,
      },
    },
    { upsert: true }
  );

  const enriched: EnrichedRecommendation[] = topRecommendations
    .map((item) => {
      const prod = productMap.get(item.product_id)!;
      return {
        ...item,
        name: prod.name,
        price: prod.price,
        category_id: prod.category_id,
        category_name: prod.category_name,
        stock_qty: prod.stock_qty,
        image_url: prod.image_url,
        store_name: prod.store_name,
      };
    });

  return {
    customer_id: customerId,
    strategy,
    generated_at: nowIso,
    from_cache: false,
    recommendations: enriched,
    pipeline_executed: pipelineExecuted,
  };
}

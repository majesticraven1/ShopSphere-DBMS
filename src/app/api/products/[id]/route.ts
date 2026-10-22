import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { pgQuery } from "@/lib/postgres";
import {
  getMongoCollections,
  runReviewAggregationPipeline,
} from "@/lib/mongodb";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureSeeded();
    const productId = Number(params.id);
    if (isNaN(productId)) {
      return NextResponse.json({ error: "Invalid product ID" }, { status: 400 });
    }

    const [prodRes, coPurchaseRes, invLogRes, mongoCols, aggRes] =
      await Promise.all([
        pgQuery(
          `
          SELECT
            p.product_id,
            p.seller_id,
            s.store_name,
            s.store_description,
            p.name,
            p.description,
            p.price,
            p.category_id,
            c.name AS category_name,
            c.parent_category_id,
            pc.name AS parent_category_name,
            c.discount_pct,
            p.stock_qty,
            p.image_url,
            p.created_at
          FROM Products p
          JOIN Categories c ON p.category_id = c.category_id
          LEFT JOIN Categories pc ON c.parent_category_id = pc.category_id
          JOIN Sellers s ON p.seller_id = s.seller_id
          WHERE p.product_id = $1
          `,
          [productId]
        ),
        // Co-purchase SQL query on Order_Items composite index (order_id, product_id)
        pgQuery(
          `
          SELECT
            p2.product_id,
            p2.name,
            p2.price,
            p2.image_url,
            c.name AS category_name,
            COUNT(DISTINCT oi1.order_id) AS co_purchase_count
          FROM Order_Items oi1
          JOIN Order_Items oi2
            ON oi1.order_id = oi2.order_id
            AND oi1.product_id <> oi2.product_id
          JOIN Products p2 ON oi2.product_id = p2.product_id
          JOIN Categories c ON p2.category_id = c.category_id
          WHERE oi1.product_id = $1
          GROUP BY p2.product_id, p2.name, p2.price, p2.image_url, c.name
          ORDER BY co_purchase_count DESC
          LIMIT 4
          `,
          [productId]
        ),
        pgQuery(
          `
          SELECT log_id, product_id, change_qty, old_stock_qty, new_stock_qty, reason, timestamp
          FROM Inventory_Log
          WHERE product_id = $1
          ORDER BY log_id DESC
          LIMIT 10
          `,
          [productId]
        ),
        getMongoCollections(),
        runReviewAggregationPipeline(productId),
      ]);

    if (prodRes.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const row = prodRes.rows[0];

    const [specDoc, productReviews, productQna] = await Promise.all([
      mongoCols.productSpecs.findOne({ product_id: productId }),
      mongoCols.reviews
        .find({ product_id: productId })
        .sort({ helpful_votes: -1, created_at: -1 })
        .toArray(),
      mongoCols.qna
        .find({ product_id: productId })
        .sort({ created_at: -1 })
        .toArray(),
    ]);

    const aggStat = aggRes.stats[0] || {
      product_id: productId,
      avg_rating: 0,
      review_count: 0,
      total_helpful_votes: 0,
      avg_sentiment: 0,
      sentiment_weighted_score: 0,
      top_tags: [],
      spec_rating_averages: {},
    };

    return NextResponse.json({
      product: {
        ...row,
        price: Number(row.price),
        discount_pct: Number(row.discount_pct || 0),
        stock_qty: Number(row.stock_qty),
        avg_rating: aggStat.avg_rating,
        review_count: aggStat.review_count,
        total_helpful_votes: aggStat.total_helpful_votes,
        avg_sentiment: aggStat.avg_sentiment,
        sentiment_weighted_score: aggStat.sentiment_weighted_score,
        top_tags: aggStat.top_tags,
        spec_rating_averages: aggStat.spec_rating_averages,
      },
      specsDoc: specDoc || {
        product_id: productId,
        category_name: row.category_name,
        specs: {},
        highlights: [],
        warranty_info: "1 Year Standard Warranty",
      },
      reviews: productReviews,
      qna: productQna,
      coPurchasedProducts: coPurchaseRes.rows.map((cp: any) => ({
        ...cp,
        price: Number(cp.price),
        co_purchase_count: Number(cp.co_purchase_count),
      })),
      inventoryLogs: invLogRes.rows,
      mongoAggregationPipeline: aggRes.pipelineExecuted,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load product details" },
      { status: 500 }
    );
  }
}

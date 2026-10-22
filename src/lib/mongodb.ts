import { MongoClient, Db, Collection } from "mongodb";

export interface ReviewDocument {
  review_id: string;
  product_id: number;
  customer_id: number;
  customer_name: string;
  rating: number;
  review_text: string;
  sentiment_score: number; // 0.0 to 1.0
  tags: string[];
  images: string[];
  helpful_votes: number;
  verified_purchase: boolean;
  spec_ratings?: Record<string, number>; // Variable per product category!
  created_at: string;
}

export interface ProductSpecDocument {
  product_id: number;
  category_name: string;
  specs: Record<string, string | number | boolean | string[]>;
  highlights: string[];
  warranty_info: string;
  updated_at: string;
}

export interface QnAAnswer {
  answer_id: string;
  responder_id: number;
  responder_name: string;
  responder_role: "seller" | "customer" | "admin";
  answer_text: string;
  is_seller_response: boolean;
  helpful_count: number;
  answered_at: string;
}

export interface QnADocument {
  question_id: string;
  product_id: number;
  customer_id: number;
  customer_name: string;
  question: string;
  answers: QnAAnswer[];
  created_at: string;
}

export interface RecommendationItem {
  product_id: number;
  score: number;
  sentiment_weighted_score: number;
  avg_rating: number;
  review_count: number;
  matched_tags: string[];
  co_purchase_count: number;
  reason: string;
}

export interface RecommendationCacheDocument {
  customer_id: number; // 0 represents global/guest recommendation cache
  strategy: string;
  generated_at: string;
  recommendations: RecommendationItem[];
}

export interface AggregatedProductReviewStats {
  product_id: number;
  avg_rating: number;
  review_count: number;
  total_helpful_votes: number;
  avg_sentiment: number;
  sentiment_weighted_score: number;
  top_tags: string[];
  spec_rating_averages: Record<string, number>;
}

declare global {
  // eslint-disable-next-line no-var
  var __shopsphere_mongo_client: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var __shopsphere_mongo_db: Db | undefined;
}

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB = process.env.MONGODB_DB || "shopsphere";

export async function getMongoDb(): Promise<Db> {
  if (global.__shopsphere_mongo_db) {
    return global.__shopsphere_mongo_db;
  }

  if (!global.__shopsphere_mongo_client) {
    global.__shopsphere_mongo_client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 4000,
    });
    await global.__shopsphere_mongo_client.connect();
  }

  global.__shopsphere_mongo_db = global.__shopsphere_mongo_client.db(MONGODB_DB);
  return global.__shopsphere_mongo_db;
}

export async function getMongoCollections(): Promise<{
  db: Db;
  reviews: Collection<ReviewDocument>;
  productSpecs: Collection<ProductSpecDocument>;
  qna: Collection<QnADocument>;
  recommendationCache: Collection<RecommendationCacheDocument>;
}> {
  const db = await getMongoDb();
  return {
    db,
    reviews: db.collection<ReviewDocument>("reviews"),
    productSpecs: db.collection<ProductSpecDocument>("product_specs"),
    qna: db.collection<QnADocument>("qna"),
    recommendationCache: db.collection<RecommendationCacheDocument>(
      "recommendation_cache"
    ),
  };
}

/**
 * Advanced Database Feature #6:
 * Executes a real MongoDB Aggregation Pipeline on the `reviews` collection
 * to compute average ratings, helpfulness multipliers, and sentiment-weighted scores
 * per product to power review-driven product recommendations.
 */
export async function runReviewAggregationPipeline(
  filterProductId?: number
): Promise<{
  stats: AggregatedProductReviewStats[];
  pipelineExecuted: object[];
}> {
  const { reviews } = await getMongoCollections();

  const pipeline: object[] = [];
  if (typeof filterProductId === "number") {
    pipeline.push({ $match: { product_id: filterProductId } });
  }

  pipeline.push(
    {
      $addFields: {
        helpfulMultiplier: {
          $add: [1, { $multiply: [{ $ifNull: ["$helpful_votes", 0] }, 0.04] }],
        },
        effectiveSentiment: {
          $ifNull: [
            "$sentiment_score",
            { $divide: [{ $subtract: ["$rating", 1] }, 4] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$product_id",
        avg_rating: { $avg: "$rating" },
        review_count: { $sum: 1 },
        total_helpful_votes: { $sum: "$helpful_votes" },
        avg_sentiment: { $avg: "$effectiveSentiment" },
        weighted_score_raw: {
          $avg: {
            $multiply: [
              "$rating",
              { $add: [0.65, { $multiply: ["$effectiveSentiment", 0.35] }] },
              "$helpfulMultiplier",
            ],
          },
        },
        tags_nested: { $push: "$tags" },
        spec_docs: { $push: "$spec_ratings" },
      },
    },
    {
      $project: {
        _id: 0,
        product_id: "$_id",
        avg_rating: { $round: ["$avg_rating", 2] },
        review_count: 1,
        total_helpful_votes: 1,
        avg_sentiment: { $round: ["$avg_sentiment", 2] },
        sentiment_weighted_score: { $round: ["$weighted_score_raw", 2] },
        tags_nested: 1,
        spec_docs: 1,
      },
    },
    {
      $sort: { sentiment_weighted_score: -1, review_count: -1 },
    }
  );

  const rawDocs = await reviews.aggregate(pipeline).toArray();

  const stats: AggregatedProductReviewStats[] = rawDocs.map((doc: any) => {
    // Flatten and count tags frequency
    const tagCounts: Record<string, number> = {};
    if (Array.isArray(doc.tags_nested)) {
      for (const arr of doc.tags_nested) {
        if (Array.isArray(arr)) {
          for (const t of arr) {
            if (typeof t === "string" && t.trim()) {
              const key = t.trim().toLowerCase();
              tagCounts[key] = (tagCounts[key] || 0) + 1;
            }
          }
        }
      }
    }
    const top_tags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);

    // Compute averages for category-specific spec_ratings sub-documents
    const specSums: Record<string, { sum: number; count: number }> = {};
    if (Array.isArray(doc.spec_docs)) {
      for (const specObj of doc.spec_docs) {
        if (specObj && typeof specObj === "object") {
          for (const [k, v] of Object.entries(specObj)) {
            const num = Number(v);
            if (!isNaN(num)) {
              if (!specSums[k]) specSums[k] = { sum: 0, count: 0 };
              specSums[k].sum += num;
              specSums[k].count += 1;
            }
          }
        }
      }
    }
    const spec_rating_averages: Record<string, number> = {};
    for (const [k, v] of Object.entries(specSums)) {
      spec_rating_averages[k] = Number((v.sum / v.count).toFixed(2));
    }

    return {
      product_id: doc.product_id,
      avg_rating: Number(doc.avg_rating ?? 0),
      review_count: Number(doc.review_count ?? 0),
      total_helpful_votes: Number(doc.total_helpful_votes ?? 0),
      avg_sentiment: Number(doc.avg_sentiment ?? 0),
      sentiment_weighted_score: Number(doc.sentiment_weighted_score ?? 0),
      top_tags,
      spec_rating_averages,
    };
  });

  return { stats, pipelineExecuted: pipeline };
}

export function getMongoEngineInfo() {
  return {
    engine: "MongoDB Document Store (Native Wire Protocol)",
    uri: MONGODB_URI,
    database: MONGODB_DB,
    collections: ["reviews", "product_specs", "qna", "recommendation_cache"],
  };
}

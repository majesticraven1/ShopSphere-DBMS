/**
 * ============================================================================
 * ShopSphere: Hybrid E-Commerce DBMS (MongoDB NoSQL Document Model & Pipelines)
 * DBMS Experiential Learning - Level 3 Project
 * ============================================================================
 *
 * Collections:
 *  1. reviews              - Unstructured customer reviews, tags[], images[],
 *                            helpful_votes, and category-specific spec_ratings{}
 *  2. product_specs        - Flexible polymorphic key-value product specifications
 *                            that vary widely across categories (Laptops vs Apparel vs Audio)
 *  3. qna                  - Customer Q&A threads with variable-length nested answers[]
 *  4. recommendation_cache - Precomputed recommendation lists per customer/segment
 *                            refreshed via MongoDB Aggregation + SQL Co-Purchase patterns
 */

// Run inside mongosh: use shopsphere;

// 1. Create Indexes on MongoDB Collections
db.reviews.createIndex({ product_id: 1, created_at: -1 });
db.reviews.createIndex({ customer_id: 1 });
db.reviews.createIndex({ tags: 1 });
db.product_specs.createIndex({ product_id: 1 }, { unique: true });
db.qna.createIndex({ product_id: 1 });
db.recommendation_cache.createIndex({ customer_id: 1 }, { unique: true });

// 2. MongoDB Aggregation Pipeline: Compute Average Rating & Sentiment-Weighted Score per Product
const reviewRecommendationPipeline = [
  {
    $addFields: {
      // Weight helpful votes + sentiment score + rating into a composite quality score
      helpfulMultiplier: {
        $add: [1, { $multiply: [{ $ifNull: ["$helpful_votes", 0] }, 0.05] }]
      },
      effectiveSentiment: {
        $ifNull: [
          "$sentiment_score",
          { $divide: [{ $subtract: ["$rating", 1] }, 4] }
        ]
      }
    }
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
            { $add: [0.7, { $multiply: ["$effectiveSentiment", 0.3] }] },
            "$helpfulMultiplier"
          ]
        }
      },
      all_tags: { $push: "$tags" }
    }
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
      tags_nested: "$all_tags"
    }
  },
  {
    $sort: { sentiment_weighted_score: -1, review_count: -1 }
  }
];

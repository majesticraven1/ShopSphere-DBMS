import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { getMongoCollections, ReviewDocument } from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";
import { pgQuery } from "@/lib/postgres";
import { computeAndCacheRecommendations } from "@/lib/recommendations";

function analyzeReviewSentiment(text: string, rating: number): number {
  const positiveWords = [
    "amazing",
    "excellent",
    "great",
    "love",
    "fast",
    "breathtaking",
    "sharp",
    "comfortable",
    "solid",
    "best",
    "super",
    "quiet",
    "clean",
    "perfect",
    "premium",
    "worth",
  ];
  const negativeWords = [
    "bad",
    "slow",
    "heavy",
    "broken",
    "poor",
    "issue",
    "disappointed",
    "expensive",
    "weak",
    "noisy",
  ];

  const lower = text.toLowerCase();
  let bonus = 0;
  for (const w of positiveWords) {
    if (lower.includes(w)) bonus += 0.03;
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) bonus -= 0.05;
  }

  const base = (rating - 1) / 4; // 0.0 to 1.0
  return Number(Math.min(0.99, Math.max(0.05, base * 0.85 + 0.1 + bonus)).toFixed(2));
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const body = await req.json();

    const productId = Number(body.product_id);
    const customerId = Number(body.customer_id || user?.user_id || 4);
    const customerName = body.customer_name || user?.name || "Aarav Sharma";
    const rating = Number(body.rating);
    const reviewText = (body.review_text || "").trim();
    const tags: string[] = Array.isArray(body.tags)
      ? body.tags
          .map((t: string) => t.trim().toLowerCase().replace(/^#/, ""))
          .filter(Boolean)
      : [];
    const images: string[] = Array.isArray(body.images)
      ? body.images.filter(Boolean)
      : [];
    const specRatings: Record<string, number> =
      body.spec_ratings && typeof body.spec_ratings === "object"
        ? body.spec_ratings
        : {};

    if (!productId || !rating || rating < 1 || rating > 5 || !reviewText) {
      return NextResponse.json(
        {
          error:
            "product_id, rating (1-5), and review_text are required to submit a MongoDB review document",
        },
        { status: 400 }
      );
    }

    // Check if customer has purchased this product in PostgreSQL Orders/Order_Items
    const verifiedRes = await pgQuery(
      `
      SELECT 1
      FROM Orders o
      JOIN Order_Items oi ON o.order_id = oi.order_id
      WHERE o.customer_id = $1 AND oi.product_id = $2 AND o.status <> 'cancelled'
      LIMIT 1
      `,
      [customerId, productId]
    );
    const verifiedPurchase = verifiedRes.rows.length > 0;

    const sentimentScore = analyzeReviewSentiment(reviewText, rating);

    const newReview: ReviewDocument = {
      review_id: `REV-${Date.now().toString().slice(-5)}`,
      product_id: productId,
      customer_id: customerId,
      customer_name: customerName,
      rating,
      review_text: reviewText,
      sentiment_score: sentimentScore,
      tags: tags.length > 0 ? tags : ["verified-review", "quality"],
      images,
      helpful_votes: 1,
      verified_purchase: verifiedPurchase,
      spec_ratings: specRatings,
      created_at: new Date().toISOString(),
    };

    const { reviews } = await getMongoCollections();
    await reviews.insertOne(newReview);

    // Refresh MongoDB recommendation_cache via Aggregation Pipeline!
    await computeAndCacheRecommendations(customerId, true);
    await computeAndCacheRecommendations(0, true);

    return NextResponse.json(
      {
        message:
          "Review stored in MongoDB `reviews` collection and `recommendation_cache` updated via Aggregation Pipeline!",
        review: newReview,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to submit review" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSeeded();
    const { review_id } = await req.json();
    if (!review_id) {
      return NextResponse.json(
        { error: "review_id is required" },
        { status: 400 }
      );
    }

    const { reviews } = await getMongoCollections();
    await reviews.updateOne(
      { review_id },
      { $inc: { helpful_votes: 1 } }
    );

    return NextResponse.json({
      message: "Incremented helpful_votes in MongoDB `reviews` document",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to vote" },
      { status: 500 }
    );
  }
}

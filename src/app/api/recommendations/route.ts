import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { getUserFromRequest } from "@/lib/auth";
import { computeAndCacheRecommendations } from "@/lib/recommendations";
import { getMongoCollections } from "@/lib/mongodb";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const { searchParams } = new URL(req.url);

    const customerId = searchParams.get("customer_id")
      ? Number(searchParams.get("customer_id"))
      : user?.role === "customer"
      ? user.user_id
      : 0;

    const forceRefresh = searchParams.get("refresh") === "true";

    const result = await computeAndCacheRecommendations(
      customerId,
      forceRefresh
    );

    const { recommendationCache } = await getMongoCollections();
    const allCacheDocs = await recommendationCache.find({}).toArray();

    return NextResponse.json({
      ...result,
      cache_documents_count: allCacheDocs.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to compute recommendations" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const customerId = Number(body.customer_id ?? user?.user_id ?? 0);

    const result = await computeAndCacheRecommendations(customerId, true);
    return NextResponse.json({
      message:
        "Refreshed MongoDB `recommendation_cache` via Review Sentiment Aggregation Pipeline + PostgreSQL Co-Purchase Matrix",
      ...result,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to refresh recommendation cache" },
      { status: 500 }
    );
  }
}

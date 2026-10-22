import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { pgQuery } from "@/lib/postgres";
import {
  getMongoCollections,
  runReviewAggregationPipeline,
} from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const categoryId = searchParams.get("category_id")
      ? Number(searchParams.get("category_id"))
      : null;
    const sellerId = searchParams.get("seller_id")
      ? Number(searchParams.get("seller_id"))
      : null;
    const minPrice = searchParams.get("min_price")
      ? Number(searchParams.get("min_price"))
      : null;
    const maxPrice = searchParams.get("max_price")
      ? Number(searchParams.get("max_price"))
      : null;
    const minRating = searchParams.get("min_rating")
      ? Number(searchParams.get("min_rating"))
      : null;
    const tagFilter = searchParams.get("tag")?.trim().toLowerCase() || "";
    const sortBy = searchParams.get("sort") || "recommended";

    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(search);
      const idx = params.length;
      conditions.push(`(
        to_tsvector('english', p.name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $${idx})
        OR p.name ILIKE '%' || $${idx} || '%'
        OR p.description ILIKE '%' || $${idx} || '%'
      )`);
    }

    if (categoryId && !isNaN(categoryId)) {
      params.push(categoryId);
      const idx = params.length;
      // Match either exact category_id OR child categories whose parent_category_id = categoryId
      conditions.push(
        `(p.category_id = $${idx} OR c.parent_category_id = $${idx})`
      );
    }

    if (sellerId && !isNaN(sellerId)) {
      params.push(sellerId);
      conditions.push(`p.seller_id = $${params.length}`);
    }

    if (minPrice !== null && !isNaN(minPrice)) {
      params.push(minPrice);
      conditions.push(`p.price >= $${params.length}`);
    }

    if (maxPrice !== null && !isNaN(maxPrice)) {
      params.push(maxPrice);
      conditions.push(`p.price <= $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        p.product_id,
        p.seller_id,
        s.store_name,
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
      ${whereClause}
      ORDER BY p.product_id ASC
    `;

    const [pgProductsRes, categoriesRes, mongoAgg, mongoCols] =
      await Promise.all([
        pgQuery(sql, params),
        pgQuery(`
          SELECT
            c.category_id,
            c.name,
            c.parent_category_id,
            pc.name AS parent_name,
            c.discount_pct,
            c.description,
            COUNT(p.product_id) AS product_count
          FROM Categories c
          LEFT JOIN Categories pc ON c.parent_category_id = pc.category_id
          LEFT JOIN Products p ON c.category_id = p.category_id
          GROUP BY c.category_id, c.name, c.parent_category_id, pc.name, c.discount_pct, c.description
          ORDER BY c.parent_category_id NULLS FIRST, c.category_id ASC
        `),
        runReviewAggregationPipeline(),
        getMongoCollections(),
      ]);

    const allSpecs = await mongoCols.productSpecs.find({}).toArray();
    const specsMap = new Map(allSpecs.map((s) => [s.product_id, s]));
    const statsMap = new Map(mongoAgg.stats.map((s) => [s.product_id, s]));

    let unifiedProducts = pgProductsRes.rows.map((row: any) => {
      const reviewStats = statsMap.get(row.product_id);
      const specDoc = specsMap.get(row.product_id);

      return {
        product_id: row.product_id,
        seller_id: row.seller_id,
        store_name: row.store_name,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        category_id: row.category_id,
        category_name: row.category_name,
        parent_category_id: row.parent_category_id,
        parent_category_name: row.parent_category_name,
        discount_pct: Number(row.discount_pct || 0),
        stock_qty: Number(row.stock_qty),
        image_url: row.image_url,
        created_at: row.created_at,
        // MongoDB enriched fields:
        avg_rating: reviewStats?.avg_rating ?? 0,
        review_count: reviewStats?.review_count ?? 0,
        total_helpful_votes: reviewStats?.total_helpful_votes ?? 0,
        avg_sentiment: reviewStats?.avg_sentiment ?? 0,
        sentiment_weighted_score: reviewStats?.sentiment_weighted_score ?? 0,
        top_tags: reviewStats?.top_tags ?? [],
        spec_rating_averages: reviewStats?.spec_rating_averages ?? {},
        specs: specDoc?.specs ?? {},
        highlights: specDoc?.highlights ?? [],
        warranty_info: specDoc?.warranty_info ?? "1 Year Standard Warranty",
      };
    });

    if (minRating !== null && !isNaN(minRating) && minRating > 0) {
      unifiedProducts = unifiedProducts.filter(
        (p) => p.avg_rating >= minRating
      );
    }

    if (tagFilter) {
      unifiedProducts = unifiedProducts.filter((p) =>
        p.top_tags.some((t: string) => t.toLowerCase().includes(tagFilter))
      );
    }

    if (sortBy === "price_asc") {
      unifiedProducts.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price_desc") {
      unifiedProducts.sort((a, b) => b.price - a.price);
    } else if (sortBy === "rating_desc") {
      unifiedProducts.sort(
        (a, b) =>
          b.sentiment_weighted_score - a.sentiment_weighted_score ||
          b.avg_rating - a.avg_rating
      );
    } else if (sortBy === "recommended") {
      unifiedProducts.sort(
        (a, b) =>
          b.sentiment_weighted_score - a.sentiment_weighted_score ||
          b.review_count - a.review_count
      );
    }

    return NextResponse.json({
      products: unifiedProducts,
      categories: categoriesRes.rows.map((c: any) => ({
        ...c,
        discount_pct: Number(c.discount_pct),
        product_count: Number(c.product_count),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch products" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    if (!user || (user.role !== "seller" && user.role !== "admin")) {
      return NextResponse.json(
        { error: "Only Sellers or Admins can create products" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      description,
      price,
      category_id,
      stock_qty,
      image_url,
      specs,
      highlights,
      warranty_info,
      seller_id: explicitSellerId,
    } = body;

    if (!name || !price || !category_id || stock_qty === undefined) {
      return NextResponse.json(
        { error: "Name, price (>0), category_id, and stock_qty (>=0) are required" },
        { status: 400 }
      );
    }

    const targetSellerId =
      user.role === "seller" ? user.user_id : Number(explicitSellerId || 2);

    // 1. Insert relational product into PostgreSQL `Products`
    const insertRes = await pgQuery<{ product_id: number }>(
      `INSERT INTO Products (seller_id, name, description, price, category_id, stock_qty, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING product_id`,
      [
        targetSellerId,
        name.trim(),
        (description || name).trim(),
        Number(price),
        Number(category_id),
        Number(stock_qty),
        image_url ||
          "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=900&q=80",
      ]
    );

    const newProductId = insertRes.rows[0].product_id;

    // Lookup category name
    const catRes = await pgQuery<{ name: string }>(
      `SELECT name FROM Categories WHERE category_id = $1`,
      [Number(category_id)]
    );
    const categoryName = catRes.rows[0]?.name || "General";

    // 2. Insert flexible category-specific specifications into MongoDB `product_specs`
    const { productSpecs } = await getMongoCollections();
    await productSpecs.updateOne(
      { product_id: newProductId },
      {
        $set: {
          product_id: newProductId,
          category_name: categoryName,
          specs:
            specs && typeof specs === "object"
              ? specs
              : {
                  brand: user.store_name || "ShopSphere Verified",
                  model_year: 2026,
                  edition: "Flagship Edition",
                },
          highlights: Array.isArray(highlights)
            ? highlights
            : ["Verified Authentic Listing", "Fast Express Dispatch"],
          warranty_info: warranty_info || "1 Year Official Seller Warranty",
          updated_at: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json(
      {
        message:
          "Product created in PostgreSQL `Products` and specs stored in MongoDB `product_specs`",
        product_id: newProductId,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to add product" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    if (!user || (user.role !== "seller" && user.role !== "admin")) {
      return NextResponse.json(
        { error: "Only Sellers or Admins can update inventory/products" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { product_id, price, stock_qty, name, description, specs } = body;

    if (!product_id) {
      return NextResponse.json(
        { error: "product_id is required" },
        { status: 400 }
      );
    }

    // Updating stock_qty in PostgreSQL automatically fires `trg_products_stock_audit` into `Inventory_Log`!
    const updates: string[] = [];
    const params: any[] = [];

    if (stock_qty !== undefined) {
      params.push(Number(stock_qty));
      updates.push(`stock_qty = $${params.length}`);
    }
    if (price !== undefined) {
      params.push(Number(price));
      updates.push(`price = $${params.length}`);
    }
    if (name !== undefined) {
      params.push(name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description.trim());
      updates.push(`description = $${params.length}`);
    }

    if (updates.length > 0) {
      params.push(Number(product_id));
      await pgQuery(
        `UPDATE Products SET ${updates.join(", ")} WHERE product_id = $${params.length}`,
        params
      );
    }

    if (specs && typeof specs === "object") {
      const { productSpecs } = await getMongoCollections();
      await productSpecs.updateOne(
        { product_id: Number(product_id) },
        {
          $set: {
            specs,
            updated_at: new Date().toISOString(),
          },
        }
      );
    }

    // Fetch latest Inventory_Log row triggered by the stock change
    const logRes = await pgQuery(
      `SELECT * FROM Inventory_Log WHERE product_id = $1 ORDER BY log_id DESC LIMIT 1`,
      [Number(product_id)]
    );

    return NextResponse.json({
      message:
        "Product updated in PostgreSQL (Trigger `trg_products_stock_audit` logged stock change to `Inventory_Log`)",
      latestInventoryLog: logRes.rows[0] || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Update failed (Check constraint violation)" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    if (!user || (user.role !== "seller" && user.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const productId = Number(searchParams.get("product_id"));
    if (!productId) {
      return NextResponse.json(
        { error: "product_id is required" },
        { status: 400 }
      );
    }

    // Will enforce ON DELETE RESTRICT if product is referenced in Order_Items or Inventory_Log!
    await pgQuery(`DELETE FROM Products WHERE product_id = $1`, [productId]);

    const { productSpecs, reviews, qna } = await getMongoCollections();
    await productSpecs.deleteOne({ product_id: productId });
    await reviews.deleteMany({ product_id: productId });
    await qna.deleteMany({ product_id: productId });

    return NextResponse.json({ message: "Product removed successfully" });
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          "PostgreSQL Foreign Key ON DELETE RESTRICT enforced: Cannot delete a product that has historical Orders or Inventory_Log records.",
        details: error.message,
      },
      { status: 409 }
    );
  }
}

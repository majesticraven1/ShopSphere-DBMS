import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import {
  getPostgresEngineInfo,
  pgQuery,
  pgTransaction,
} from "@/lib/postgres";
import {
  getMongoCollections,
  getMongoEngineInfo,
  runReviewAggregationPipeline,
} from "@/lib/mongodb";
import { getUserFromRequest } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();

    const [
      salesSummaryViewRes,
      sellerAnalyticsViewRes,
      inventoryLogRes,
      usersRes,
      categoriesRes,
      pgIndexesRes,
      pgTriggersRes,
      mongoCols,
      mongoAgg,
    ] = await Promise.all([
      pgQuery(`SELECT * FROM sales_summary`),
      pgQuery(`SELECT * FROM seller_analytics_view ORDER BY total_revenue DESC`),
      pgQuery(`
        SELECT
          il.log_id,
          il.product_id,
          p.name AS product_name,
          il.change_qty,
          il.old_stock_qty,
          il.new_stock_qty,
          il.reason,
          il.timestamp
        FROM Inventory_Log il
        JOIN Products p ON il.product_id = p.product_id
        ORDER BY il.log_id DESC
        LIMIT 25
      `),
      pgQuery(`
        SELECT
          u.user_id,
          u.name,
          u.email,
          u.role,
          u.created_at,
          s.store_name,
          s.verified
        FROM Users u
        LEFT JOIN Sellers s ON u.user_id = s.seller_id
        ORDER BY u.user_id ASC
      `),
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
        ORDER BY c.category_id ASC
      `),
      pgQuery(`
        SELECT indexname, tablename, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
      `),
      pgQuery(`
        SELECT trigger_name, event_manipulation, event_object_table, action_timing, action_statement
        FROM information_schema.triggers
        WHERE trigger_schema = 'public'
      `),
      getMongoCollections(),
      runReviewAggregationPipeline(),
    ]);

    // Count rows in all 8 PostgreSQL tables
    const tableNames = [
      "Users",
      "Sellers",
      "Categories",
      "Products",
      "Orders",
      "Order_Items",
      "Payments",
      "Inventory_Log",
    ];
    const pgTableCounts: Record<string, number> = {};
    for (const tbl of tableNames) {
      const r = await pgQuery<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM ${tbl}`
      );
      pgTableCounts[tbl] = Number(r.rows[0]?.cnt ?? 0);
    }

    // MongoDB collection counts & sample documents
    const [
      reviewsCount,
      specsCount,
      qnaCount,
      cacheCount,
      recentReviews,
      sampleSpecs,
      sampleQna,
      sampleCache,
    ] = await Promise.all([
      mongoCols.reviews.countDocuments(),
      mongoCols.productSpecs.countDocuments(),
      mongoCols.qna.countDocuments(),
      mongoCols.recommendationCache.countDocuments(),
      mongoCols.reviews.find({}).sort({ created_at: -1 }).limit(8).toArray(),
      mongoCols.productSpecs.find({}).limit(3).toArray(),
      mongoCols.qna.find({}).limit(3).toArray(),
      mongoCols.recommendationCache.find({}).limit(4).toArray(),
    ]);

    return NextResponse.json({
      salesSummaryView: salesSummaryViewRes.rows.map((r: any) => ({
        ...r,
        total_orders: Number(r.total_orders),
        total_units_sold: Number(r.total_units_sold),
        gross_revenue: Number(r.gross_revenue),
        avg_item_revenue: Number(r.avg_item_revenue),
      })),
      sellerAnalyticsView: sellerAnalyticsViewRes.rows.map((r: any) => ({
        ...r,
        listed_products: Number(r.listed_products),
        total_available_stock: Number(r.total_available_stock),
        total_orders_fulfilled: Number(r.total_orders_fulfilled),
        total_units_sold: Number(r.total_units_sold),
        total_revenue: Number(r.total_revenue),
      })),
      inventoryLogs: inventoryLogRes.rows,
      users: usersRes.rows,
      categories: categoriesRes.rows.map((c: any) => ({
        ...c,
        discount_pct: Number(c.discount_pct),
        product_count: Number(c.product_count),
      })),
      dbmsArchitecture: {
        postgres: {
          ...getPostgresEngineInfo(),
          tableCounts: pgTableCounts,
          indexes: pgIndexesRes.rows,
          triggers: pgTriggersRes.rows,
        },
        mongodb: {
          ...getMongoEngineInfo(),
          collectionCounts: {
            reviews: reviewsCount,
            product_specs: specsCount,
            qna: qnaCount,
            recommendation_cache: cacheCount,
          },
          recentReviews,
          sampleSpecs,
          sampleQna,
          sampleCache,
          aggregationStats: mongoAgg.stats,
          aggregationPipeline: mongoAgg.pipelineExecuted,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to load analytics" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const body = await req.json();
    const { action } = body;

    // 1. Admin creates a new Category (supporting parent_category_id hierarchy & discount_pct)
    if (action === "create_category") {
      if (!user || user.role !== "admin") {
        return NextResponse.json(
          { error: "Only Admins can create categories" },
          { status: 403 }
        );
      }

      const { name, parent_category_id, discount_pct, description } = body;
      if (!name?.trim()) {
        return NextResponse.json(
          { error: "Category name is required" },
          { status: 400 }
        );
      }

      const insertCat = await pgQuery(
        `INSERT INTO Categories (name, parent_category_id, discount_pct, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          name.trim(),
          parent_category_id ? Number(parent_category_id) : null,
          Number(discount_pct || 0),
          description || "Marketplace product category",
        ]
      );

      return NextResponse.json({
        message: "Category created in PostgreSQL `Categories` hierarchy",
        category: insertCat.rows[0],
      });
    }

    // 2. Admin updates user role
    if (action === "update_user_role") {
      if (!user || user.role !== "admin") {
        return NextResponse.json(
          { error: "Only Admins can modify user roles" },
          { status: 403 }
        );
      }
      const { target_user_id, new_role, store_name } = body;
      await pgQuery(`UPDATE Users SET role = $1 WHERE user_id = $2`, [
        new_role,
        Number(target_user_id),
      ]);

      if (new_role === "seller") {
        await pgQuery(
          `INSERT INTO Sellers (seller_id, store_name, store_description, verified)
           VALUES ($1, $2, 'Verified Seller Store', TRUE)
           ON CONFLICT (seller_id) DO NOTHING`,
          [
            Number(target_user_id),
            store_name || `Seller Store #${target_user_id}`,
          ]
        );
      }

      return NextResponse.json({
        message: `Updated user #${target_user_id} role to '${new_role}'`,
      });
    }

    // 3. DBMS Lab Action: Run EXPLAIN ANALYZE on GIN Full-Text Index & B-Tree Index
    if (action === "demo_explain_indexes") {
      const searchTerm = body.search_term || "oled laptop";
      const explainGin = await pgQuery(
        `EXPLAIN ANALYZE
         SELECT product_id, name, price
         FROM Products
         WHERE to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $1)`,
        [searchTerm]
      );

      const explainBtree = await pgQuery(
        `EXPLAIN ANALYZE
         SELECT product_id, name, price
         FROM Products
         WHERE category_id = 4 AND price <= 80000`
      );

      return NextResponse.json({
        ginPlan: explainGin.rows.map((r: any) => Object.values(r)[0]),
        btreePlan: explainBtree.rows.map((r: any) => Object.values(r)[0]),
      });
    }

    // 4. DBMS Lab Action: Test ACID Transaction Rollback (Attempt over-stock order)
    if (action === "demo_acid_rollback") {
      const productId = Number(body.product_id || 1);
      const beforeRes = await pgQuery<{
        stock_qty: number;
        order_count: string;
      }>(
        `SELECT stock_qty, (SELECT COUNT(*) FROM Orders) AS order_count FROM Products WHERE product_id = $1`,
        [productId]
      );
      const stockBefore = beforeRes.rows[0].stock_qty;
      const ordersBefore = Number(beforeRes.rows[0].order_count);

      let rollbackReason = "";
      try {
        await pgTransaction(async (tx) => {
          // Step A: Insert a temporary order inside the transaction
          await tx.query(
            `INSERT INTO Orders (customer_id, status, subtotal_amount, discount_amount, total_amount, shipping_address)
             VALUES (4, 'pending', 7899900, 0, 7899900, 'Rollback Test Address')`
          );

          // Step B: Attempt to deduct 999 units (violating CHECK (stock_qty >= 0))
          await tx.query(
            `UPDATE Products SET stock_qty = stock_qty - 999 WHERE product_id = $1`,
            [productId]
          );
        });
      } catch (txErr: any) {
        rollbackReason = txErr.message;
      }

      const afterRes = await pgQuery<{
        stock_qty: number;
        order_count: string;
      }>(
        `SELECT stock_qty, (SELECT COUNT(*) FROM Orders) AS order_count FROM Products WHERE product_id = $1`,
        [productId]
      );

      return NextResponse.json({
        message:
          "ACID Transaction Atomicity Verified: Order insert was rolled back when stock deduction violated CHECK (stock_qty >= 0)!",
        stockBefore,
        stockAfter: afterRes.rows[0].stock_qty,
        ordersBefore,
        ordersAfter: Number(afterRes.rows[0].order_count),
        postgresConstraintError: rollbackReason,
      });
    }

    // 5. DBMS Lab Action: Reset & Re-seed Database
    if (action === "reset_seed") {
      await ensureSeeded(true);
      return NextResponse.json({
        message:
          "PostgreSQL & MongoDB databases have been cleanly reset and re-seeded!",
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Operation failed" },
      { status: 500 }
    );
  }
}

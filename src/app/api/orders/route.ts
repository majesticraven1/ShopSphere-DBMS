import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { pgQuery, pgTransaction } from "@/lib/postgres";
import { getUserFromRequest } from "@/lib/auth";
import { computeAndCacheRecommendations } from "@/lib/recommendations";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const { searchParams } = new URL(req.url);

    // 1. Live Preview of PL/pgSQL Stored Function `fn_calculate_order_total`
    if (searchParams.get("preview") === "true") {
      const pIdsStr = searchParams.get("product_ids") || "";
      const qtysStr = searchParams.get("quantities") || "";

      const productIds = pIdsStr
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => !isNaN(n) && n > 0);
      const quantities = qtysStr
        .split(",")
        .map((n) => Number(n.trim()))
        .filter((n) => !isNaN(n) && n > 0);

      if (productIds.length === 0 || productIds.length !== quantities.length) {
        return NextResponse.json({
          subtotal: 0,
          discount: 0,
          final_total: 0,
          discount_breakdown: "Cart is empty",
        });
      }

      const calcRes = await pgQuery<{
        subtotal: string;
        discount: string;
        final_total: string;
        discount_breakdown: string;
      }>(`SELECT * FROM fn_calculate_order_total($1::int[], $2::int[])`, [
        productIds,
        quantities,
      ]);

      const row = calcRes.rows[0];
      return NextResponse.json({
        subtotal: Number(row.subtotal),
        discount: Number(row.discount),
        final_total: Number(row.final_total),
        discount_breakdown: row.discount_breakdown,
        function_executed: "fn_calculate_order_total(INT[], INT[])",
      });
    }

    const user = getUserFromRequest(req);
    const filterCustomerId = searchParams.get("customer_id")
      ? Number(searchParams.get("customer_id"))
      : user?.role === "customer"
      ? user.user_id
      : null;

    const filterSellerId = searchParams.get("seller_id")
      ? Number(searchParams.get("seller_id"))
      : user?.role === "seller"
      ? user.user_id
      : null;

    let whereSql = "";
    const params: any[] = [];

    if (filterCustomerId) {
      params.push(filterCustomerId);
      whereSql = `WHERE o.customer_id = $1`;
    } else if (filterSellerId) {
      params.push(filterSellerId);
      whereSql = `WHERE EXISTS (
        SELECT 1 FROM Order_Items oi_s
        JOIN Products p_s ON oi_s.product_id = p_s.product_id
        WHERE oi_s.order_id = o.order_id AND p_s.seller_id = $1
      )`;
    }

    const ordersRes = await pgQuery(
      `
      SELECT
        o.order_id,
        o.customer_id,
        u.name AS customer_name,
        u.email AS customer_email,
        o.order_date,
        o.status,
        o.subtotal_amount,
        o.discount_amount,
        o.total_amount,
        o.shipping_address,
        pay.payment_id,
        pay.method AS payment_method,
        pay.status AS payment_status,
        pay.transaction_ref
      FROM Orders o
      JOIN Users u ON o.customer_id = u.user_id
      LEFT JOIN Payments pay ON o.order_id = pay.order_id
      ${whereSql}
      ORDER BY o.order_date DESC, o.order_id DESC
      `,
      params
    );

    const itemsRes = await pgQuery(`
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        p.name AS product_name,
        p.image_url,
        p.seller_id,
        s.store_name,
        c.name AS category_name,
        oi.qty,
        oi.unit_price
      FROM Order_Items oi
      JOIN Products p ON oi.product_id = p.product_id
      JOIN Sellers s ON p.seller_id = s.seller_id
      JOIN Categories c ON p.category_id = c.category_id
      ORDER BY oi.order_item_id ASC
    `);

    const itemsByOrder = new Map<number, any[]>();
    for (const item of itemsRes.rows) {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push({
        ...item,
        qty: Number(item.qty),
        unit_price: Number(item.unit_price),
      });
      itemsByOrder.set(item.order_id, list);
    }

    const enrichedOrders = ordersRes.rows.map((o: any) => ({
      ...o,
      subtotal_amount: Number(o.subtotal_amount),
      discount_amount: Number(o.discount_amount),
      total_amount: Number(o.total_amount),
      items: itemsByOrder.get(o.order_id) || [],
    }));

    return NextResponse.json({ orders: enrichedOrders });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    const body = await req.json();

    const customerId = Number(body.customer_id || user?.user_id || 4);
    const items: { product_id: number; qty: number }[] = body.items || [];
    const paymentMethod = body.payment_method || "upi";
    const shippingAddress =
      body.shipping_address || "Indiranagar, Bengaluru, Karnataka 560038";
    const simulatePaymentFailure = Boolean(body.simulate_payment_failure);

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Order must contain at least one item" },
        { status: 400 }
      );
    }

    const productIds = items.map((i) => Number(i.product_id));
    const quantities = items.map((i) => Number(i.qty));

    // ========================================================================
    // ADVANCED DBMS FEATURE #1, #2, #3:
    // Full ACID Transaction wrapping:
    //  1) PL/pgSQL Stored Function `fn_calculate_order_total`
    //  2) `Orders` & `Order_Items` Insertion
    //  3) `Products.stock_qty` Deduction (which fires Trigger `trg_products_stock_audit`
    //     into `Inventory_Log` and enforces `CHECK (stock_qty >= 0)`)
    //  4) `Payments` Recording (1:1 with `Orders`)
    // ========================================================================
    const txResult = await pgTransaction(async (tx) => {
      // Step 1: Call PL/pgSQL Stored Function to compute totals and category discounts
      const calcRes = await tx.query<{
        subtotal: string;
        discount: string;
        final_total: string;
        discount_breakdown: string;
      }>(`SELECT * FROM fn_calculate_order_total($1::int[], $2::int[])`, [
        productIds,
        quantities,
      ]);

      const { subtotal, discount, final_total, discount_breakdown } =
        calcRes.rows[0];

      // Step 2: Insert into `Orders`
      const orderInsert = await tx.query<{ order_id: number }>(
        `INSERT INTO Orders (customer_id, status, subtotal_amount, discount_amount, total_amount, shipping_address)
         VALUES ($1, 'confirmed', $2, $3, $4, $5)
         RETURNING order_id`,
        [customerId, subtotal, discount, final_total, shippingAddress]
      );
      const orderId = orderInsert.rows[0].order_id;

      // Step 3: Insert each item into `Order_Items` and deduct `Products.stock_qty`
      for (const item of items) {
        const prodRes = await tx.query<{
          product_id: number;
          name: string;
          price: string;
          stock_qty: number;
        }>(
          `SELECT product_id, name, price, stock_qty FROM Products WHERE product_id = $1`,
          [Number(item.product_id)]
        );

        if (prodRes.rows.length === 0) {
          throw new Error(`Product ID ${item.product_id} does not exist`);
        }

        const prod = prodRes.rows[0];

        // Deduct stock (CHECK constraint `stock_qty >= 0` will abort and ROLLBACK if qty > stock_qty!)
        // Also fires AFTER UPDATE trigger `trg_products_stock_audit` -> inserts into `Inventory_Log`!
        await tx.query(
          `UPDATE Products SET stock_qty = stock_qty - $1 WHERE product_id = $2`,
          [Number(item.qty), prod.product_id]
        );

        await tx.query(
          `INSERT INTO Order_Items (order_id, product_id, qty, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, prod.product_id, Number(item.qty), prod.price]
        );
      }

      // Optional simulated payment gateway failure to demonstrate atomic ROLLBACK
      if (simulatePaymentFailure) {
        throw new Error(
          "Simulated Payment Gateway Failure: PostgreSQL Transaction ROLLED BACK atomically (Stock deduction, Order, and Inventory_Log reverted!)"
        );
      }

      // Step 4: Record 1:1 Payment in `Payments`
      const txnRef = `TXN-SS-${Date.now().toString().slice(-6)}`;
      const paymentInsert = await tx.query<{ payment_id: number }>(
        `INSERT INTO Payments (order_id, amount, method, status, transaction_ref)
         VALUES ($1, $2, $3, 'completed', $4)
         RETURNING payment_id`,
        [orderId, final_total, paymentMethod, txnRef]
      );

      return {
        order_id: orderId,
        payment_id: paymentInsert.rows[0].payment_id,
        transaction_ref: txnRef,
        subtotal: Number(subtotal),
        discount: Number(discount),
        total_amount: Number(final_total),
        discount_breakdown,
      };
    });

    // Refresh customer's MongoDB `recommendation_cache` based on new co-purchase history
    await computeAndCacheRecommendations(customerId, true);

    return NextResponse.json(
      {
        message:
          "Order placed successfully inside an ACID PostgreSQL Transaction (Inventory deducted, Trigger fired into Inventory_Log, Payment recorded, and MongoDB Recommendation Cache refreshed!)",
        order: txResult,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        error:
          error.message ||
          "Transaction Rolled Back due to constraint violation",
        rolledBack: true,
      },
      { status: 400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSeeded();
    const user = getUserFromRequest(req);
    if (!user || (user.role !== "seller" && user.role !== "admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { order_id, status } = await req.json();
    if (!order_id || !status) {
      return NextResponse.json(
        { error: "order_id and status are required" },
        { status: 400 }
      );
    }

    await pgQuery(`UPDATE Orders SET status = $1 WHERE order_id = $2`, [
      status,
      Number(order_id),
    ]);

    return NextResponse.json({
      message: `Order #${order_id} status updated to '${status}'`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update order status" },
      { status: 400 }
    );
  }
}

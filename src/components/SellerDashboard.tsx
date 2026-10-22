"use client";

import React, { useState } from "react";
import {
  Package,
  PlusCircle,
  TrendingUp,
  Star,
  AlertCircle,
  CheckCircle2,
  Database,
  FileJson,
  Trash2,
  ArrowUpRight,
  Layers,
  Truck,
} from "lucide-react";

interface SellerDashboardProps {
  currentUser: any;
  products: any[];
  categories: any[];
  orders: any[];
  onRefresh: () => Promise<void>;
  onSelectProduct: (id: number) => void;
}

export default function SellerDashboard({
  currentUser,
  products,
  categories,
  orders,
  onRefresh,
  onSelectProduct,
}: SellerDashboardProps) {
  const activeSellerId =
    currentUser?.role === "seller" ? currentUser.user_id : 2;

  const sellerProducts = products.filter(
    (p) =>
      currentUser?.role === "admin" || p.seller_id === activeSellerId
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("9999");
  const [categoryId, setCategoryId] = useState(
    categories[3]?.category_id || 4
  );
  const [stockQty, setStockQty] = useState("15");
  const [imageUrl, setImageUrl] = useState(
    "https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=900&q=80"
  );

  // Flexible MongoDB product_specs key-value pairs
  const [specPairs, setSpecPairs] = useState<
    { key: string; value: string }[]
  >([
    { key: "connectivity", value: "Bluetooth 5.4 / USB-C" },
    { key: "battery_life", value: "36 Hours Continuous" },
    { key: "chassis_material", value: "Anodized Recycled Aluminum" },
  ]);

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showNotice = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 6000);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const specsObj: Record<string, string> = {};
      specPairs.forEach((p) => {
        if (p.key.trim() && p.value.trim()) {
          specsObj[p.key.trim().toLowerCase().replace(/\s+/g, "_")] =
            p.value.trim();
        }
      });

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: activeSellerId,
          name,
          description,
          price: Number(price),
          category_id: Number(categoryId),
          stock_qty: Number(stockQty),
          image_url: imageUrl,
          specs: specsObj,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setName("");
        setDescription("");
        showNotice("success", json.message);
        await onRefresh();
      } else {
        showNotice("error", json.error || "Failed to create product");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjustStock = async (product: any, delta: number) => {
    const newStock = product.stock_qty + delta;
    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: product.product_id,
        stock_qty: newStock,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      const logInfo = json.latestInventoryLog
        ? ` [Trigger Log #${json.latestInventoryLog.log_id}: ${json.latestInventoryLog.old_stock_qty} → ${json.latestInventoryLog.new_stock_qty}]`
        : "";
      showNotice(
        "success",
        `Updated "${product.name}" stock to ${newStock} units in PostgreSQL! AFTER UPDATE Trigger inserted audit row into Inventory_Log${logInfo}`
      );
      await onRefresh();
    } else {
      showNotice(
        "error",
        `PostgreSQL CHECK (stock_qty >= 0) Constraint Enforced: ${json.error}`
      );
    }
  };

  const handleDeleteProduct = async (productId: number) => {
    const res = await fetch(`/api/products?product_id=${productId}`, {
      method: "DELETE",
    });
    const json = await res.json();
    if (res.ok) {
      showNotice("success", json.message);
      await onRefresh();
    } else {
      showNotice("error", `${json.error}`);
    }
  };

  const handleUpdateOrderStatus = async (orderId: number, status: string) => {
    const res = await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id: orderId, status }),
    });
    const json = await res.json();
    if (res.ok) {
      showNotice("success", json.message);
      await onRefresh();
    }
  };

  // Compute Seller KPIs
  const totalStock = sellerProducts.reduce((acc, p) => acc + p.stock_qty, 0);
  const avgSentimentScore =
    sellerProducts.length > 0
      ? (
          sellerProducts.reduce(
            (acc, p) => acc + (p.sentiment_weighted_score || 0),
            0
          ) / sellerProducts.length
        ).toFixed(2)
      : "0.00";

  const sellerOrders = orders.filter((o) =>
    o.items?.some(
      (i: any) =>
        currentUser?.role === "admin" || i.seller_id === activeSellerId
    )
  );

  const totalRevenue = sellerOrders.reduce((acc, o) => {
    const sellerItemsRev = (o.items || [])
      .filter(
        (i: any) =>
          currentUser?.role === "admin" || i.seller_id === activeSellerId
      )
      .reduce((s: number, i: any) => s + i.qty * i.unit_price, 0);
    return acc + sellerItemsRev;
  }, 0);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30 mb-2">
            <Package className="w-3.5 h-3.5" />
            Seller Inventory & Review Analytics Studio
          </div>
          <h1 className="text-2xl font-bold">
            {currentUser?.store_name || "NovaTech Flagship Store"} Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Dual-Database Operations: Manage relational stock & pricing in{" "}
            <strong className="text-white">PostgreSQL (`Products`)</strong>{" "}
            with automatic{" "}
            <strong className="text-indigo-300">
              `AFTER UPDATE` Triggers (`Inventory_Log`)
            </strong>{" "}
            and polymorphic specs in{" "}
            <strong className="text-emerald-300">
              MongoDB (`product_specs`)
            </strong>
            .
          </p>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-sm font-medium ${
            statusMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-rose-50 border-rose-200 text-rose-900"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div>{statusMessage.text}</div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Listed Products</span>
            <Package className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {sellerProducts.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Synced across PostgreSQL & MongoDB
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Total Available Stock</span>
            <Layers className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {totalStock} units
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Audited by `trg_products_stock_audit`
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>Store Gross Revenue</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            ₹{totalRevenue.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Across {sellerOrders.length} fulfilled orders
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase">
            <span>MongoDB Sentiment Score</span>
            <Star className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {avgSentimentScore} / 5.0
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Computed via `reviews` Aggregation
          </div>
        </div>
      </div>

      {/* Main Grid: Add Product (Dual DB) + Inventory Control Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Add New Product Form */}
        <form
          onSubmit={handleCreateProduct}
          className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-indigo-600" />
              Add New Product (SQL + NoSQL)
            </h2>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
              <Database className="w-3.5 h-3.5" />
              1. PostgreSQL `Products` Relational Attributes
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NovaBook Air 15 M3 Workstation"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Price (₹) [CHECK &gt; 0]
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Initial Stock [CHECK &gt;= 0]
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Category (FK → `Categories`)
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none bg-white"
              >
                {categories.map((cat) => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.parent_name
                      ? `${cat.parent_name} › ${cat.name}`
                      : cat.name}{" "}
                    ({cat.discount_pct}% rule)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description (Indexed via PostgreSQL GIN `to_tsvector`)
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Full-text searchable product description..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* MongoDB Flexible Specs Builder */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                <FileJson className="w-3.5 h-3.5" />
                2. MongoDB `product_specs` Flexible Key-Values
              </div>
              <button
                type="button"
                onClick={() =>
                  setSpecPairs((prev) => [...prev, { key: "", value: "" }])
                }
                className="text-xs font-semibold text-indigo-600 hover:underline"
              >
                + Add Spec Field
              </button>
            </div>

            {specPairs.map((pair, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  placeholder="Attribute (e.g. ram_size)"
                  value={pair.key}
                  onChange={(e) => {
                    const copy = [...specPairs];
                    copy[idx].key = e.target.value;
                    setSpecPairs(copy);
                  }}
                  className="col-span-5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. 32GB DDR5)"
                  value={pair.value}
                  onChange={(e) => {
                    const copy = [...specPairs];
                    copy[idx].value = e.target.value;
                    setSpecPairs(copy);
                  }}
                  className="col-span-7 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm transition"
          >
            {submitting
              ? "Writing to PostgreSQL & MongoDB..."
              : "Create Product in PostgreSQL + MongoDB"}
          </button>
        </form>

        {/* Right: Live Inventory & Trigger Control Table */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Inventory Control & Review Analytics
              </h2>
              <p className="text-xs text-slate-500">
                Adjusting stock executes{" "}
                <code className="font-mono text-indigo-600">
                  UPDATE Products SET stock_qty = ...
                </code>{" "}
                and fires Trigger{" "}
                <code className="font-mono text-indigo-600">
                  trg_products_stock_audit
                </code>
                .
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Product</th>
                  <th className="py-3 px-4">Price</th>
                  <th className="py-3 px-4">Stock & Trigger Action</th>
                  <th className="py-3 px-4">MongoDB Reviews</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sellerProducts.map((p) => (
                  <tr key={p.product_id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                        <div>
                          <div
                            onClick={() => onSelectProduct(p.product_id)}
                            className="font-bold text-slate-900 hover:text-indigo-600 cursor-pointer flex items-center gap-1"
                          >
                            {p.name}
                            <ArrowUpRight className="w-3 h-3" />
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {p.category_name} • {p.store_name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-900">
                      ₹{p.price.toLocaleString("en-IN")}
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold ${
                            p.stock_qty <= 5
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {p.stock_qty}
                        </span>
                        <button
                          onClick={() => handleAdjustStock(p, -1)}
                          title="Deduct 1 unit (Fires Inventory_Log Trigger)"
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition"
                        >
                          -1
                        </button>
                        <button
                          onClick={() => handleAdjustStock(p, 5)}
                          title="Restock +5 units (Fires Inventory_Log Trigger)"
                          className="px-2 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold transition"
                        >
                          +5
                        </button>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 font-semibold text-slate-800">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        {p.avg_rating > 0 ? p.avg_rating.toFixed(1) : "New"}
                        <span className="text-slate-400 font-normal">
                          ({p.review_count})
                        </span>
                      </div>
                      <div className="text-[10px] text-emerald-700 font-mono">
                        Score: {p.sentiment_weighted_score?.toFixed(2)}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteProduct(p.product_id)}
                        title="Test ON DELETE RESTRICT constraint or delete unreferenced product"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Seller Order Fulfillment Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              Recent Customer Orders for Your Listings
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Status enforced via PostgreSQL `CHECK (status IN (...))`
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Order ID</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Items Ordered</th>
                <th className="py-3 px-4">Order Total</th>
                <th className="py-3 px-4">Payment (1:1)</th>
                <th className="py-3 px-4">Update Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {sellerOrders.map((ord) => (
                <tr key={ord.order_id}>
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    #{ord.order_id}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-slate-900">
                      {ord.customer_name}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(ord.order_date).toLocaleDateString("en-IN")}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      {(ord.items || []).map((item: any) => (
                        <div key={item.order_item_id} className="text-slate-700">
                          {item.qty}x <strong>{item.product_name}</strong>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    ₹{ord.total_amount.toLocaleString("en-IN")}
                    {ord.discount_amount > 0 && (
                      <div className="text-[10px] text-emerald-600 font-normal">
                        Saved ₹{ord.discount_amount} via PL/pgSQL
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="uppercase font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                      {ord.payment_method} • {ord.payment_status}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <select
                      value={ord.status}
                      onChange={(e) =>
                        handleUpdateOrderStatus(ord.order_id, e.target.value)
                      }
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold bg-white"
                    >
                      <option value="pending">pending</option>
                      <option value="confirmed">confirmed</option>
                      <option value="shipped">shipped</option>
                      <option value="delivered">delivered</option>
                      <option value="cancelled">cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

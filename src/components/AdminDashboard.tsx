"use client";

import React, { useState } from "react";
import {
  Shield,
  BarChart3,
  Users,
  FolderTree,
  History,
  CheckCircle2,
  Database,
  TrendingUp,
  Store,
  Plus,
} from "lucide-react";

interface AdminDashboardProps {
  analyticsData: any;
  onRefresh: () => Promise<void>;
}

export default function AdminDashboard({
  analyticsData,
  onRefresh,
}: AdminDashboardProps) {
  const [catName, setCatName] = useState("");
  const [parentCatId, setParentCatId] = useState<string>("");
  const [discountPct, setDiscountPct] = useState("10");
  const [catDesc, setCatDesc] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  if (!analyticsData) {
    return (
      <div className="p-12 text-center text-slate-500">
        Loading Admin PostgreSQL Views (`sales_summary`) & MongoDB Metrics...
      </div>
    );
  }

  const salesSummary = analyticsData.salesSummaryView || [];
  const sellerView = analyticsData.sellerAnalyticsView || [];
  const inventoryLogs = analyticsData.inventoryLogs || [];
  const users = analyticsData.users || [];
  const categories = analyticsData.categories || [];

  const totalPlatformRevenue = salesSummary.reduce(
    (acc: number, row: any) => acc + row.gross_revenue,
    0
  );
  const totalUnitsSold = salesSummary.reduce(
    (acc: number, row: any) => acc + row.total_units_sold,
    0
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_category",
        name: catName,
        parent_category_id: parentCatId ? Number(parentCatId) : null,
        discount_pct: Number(discountPct),
        description: catDesc,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setCatName("");
      setCatDesc("");
      showToast(json.message);
      await onRefresh();
    }
  };

  const handleRoleChange = async (userId: number, newRole: string) => {
    const res = await fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_user_role",
        target_user_id: userId,
        new_role: newRole,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      showToast(json.message);
      await onRefresh();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-300 bg-amber-500/20 px-3 py-1 rounded-full border border-amber-500/30 mb-2">
            <Shield className="w-3.5 h-3.5" />
            Platform Administrator Command Center
          </div>
          <h1 className="text-2xl font-bold">
            ShopSphere Platform Sales, Category Hierarchy & Audit Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Powered by PostgreSQL{" "}
            <code className="text-indigo-300 font-mono">
              VIEW sales_summary
            </code>
            ,{" "}
            <code className="text-indigo-300 font-mono">
              TRIGGER trg_products_stock_audit
            </code>
            , and Self-Referencing{" "}
            <code className="text-indigo-300 font-mono">
              Categories(parent_category_id)
            </code>
            .
          </p>
        </div>
      </div>

      {toast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {toast}
        </div>
      )}

      {/* Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Gross Platform Revenue</span>
            <TrendingUp className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            ₹{totalPlatformRevenue.toLocaleString("en-IN")}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Aggregated via `sales_summary` View
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Total Units Sold</span>
            <BarChart3 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {totalUnitsSold} units
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Across {salesSummary.length} category-month cohorts
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Registered Accounts</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {users.length} Users
          </div>
          <div className="text-xs text-slate-500 mt-1">
            RBAC: Admin, Seller, Customer
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
            <span>Trigger Audit Events</span>
            <History className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {inventoryLogs.length} Logs
          </div>
          <div className="text-xs text-slate-500 mt-1">
            PostgreSQL `Inventory_Log` table
          </div>
        </div>
      </div>

      {/* SECTION 1: PostgreSQL VIEW `sales_summary` (Revenue by Category & Month) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                PostgreSQL View: `sales_summary` (Revenue by Category & Month)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Executes{" "}
              <code className="font-mono text-indigo-600">
                SELECT * FROM sales_summary
              </code>{" "}
              joining `Orders`, `Order_Items`, `Products`, and hierarchical
              `Categories`.
            </p>
          </div>
          <span className="text-xs font-mono bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded border border-indigo-200">
            Advanced Feature #4: SQL View
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Sales Month</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Parent Root Category</th>
                <th className="py-3 px-4">Total Orders</th>
                <th className="py-3 px-4">Units Sold</th>
                <th className="py-3 px-4">Gross Revenue</th>
                <th className="py-3 px-4">Avg Line Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {salesSummary.map((row: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-700">
                    {row.sales_month}
                  </td>
                  <td className="py-3 px-4 font-bold text-slate-900">
                    {row.category_name}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    {row.parent_category_name}
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {row.total_orders}
                  </td>
                  <td className="py-3 px-4 font-semibold">
                    {row.total_units_sold} units
                  </td>
                  <td className="py-3 px-4 font-extrabold text-emerald-700">
                    ₹{row.gross_revenue.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 px-4 text-slate-600">
                    ₹{row.avg_item_revenue.toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: Category Hierarchy Manager + Seller Performance View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Category Hierarchy & Discount Rule Manager */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FolderTree className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Category Hierarchy (`parent_category_id` Self-FK)
              </h3>
            </div>
          </div>

          <form
            onSubmit={handleCreateCategory}
            className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3"
          >
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Plus className="w-3.5 h-3.5 text-indigo-600" />
              Add Category & PL/pgSQL Discount Rule
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder="Category Name"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs bg-white"
              />
              <select
                value={parentCatId}
                onChange={(e) => setParentCatId(e.target.value)}
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
              >
                <option value="">No Parent (Root Category)</option>
                {categories.map((c: any) => (
                  <option key={c.category_id} value={c.category_id}>
                    Parent: {c.name}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  className="w-16 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs bg-white"
                />
                <span className="text-xs text-slate-600 font-medium">% Off</span>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
            >
              Insert into `Categories`
            </button>
          </form>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Parent Category</th>
                  <th className="py-2.5 px-3">Discount Rule</th>
                  <th className="py-2.5 px-3">Products</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {categories.map((c: any) => (
                  <tr key={c.category_id}>
                    <td className="py-2.5 px-3 font-mono">#{c.category_id}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {c.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {c.parent_name || "— Root —"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                        {c.discount_pct}% off
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-semibold">
                      {c.product_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Users & Role-Based Access Control + Seller View */}
        <div className="lg:col-span-6 space-y-6">
          {/* Seller Performance View */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">
                Seller Storefront Performance (`seller_analytics_view`)
              </h3>
            </div>
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Store Name (1:1 Seller)</th>
                    <th className="py-2.5 px-3">Listings</th>
                    <th className="py-2.5 px-3">Stock</th>
                    <th className="py-2.5 px-3">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {sellerView.map((s: any) => (
                    <tr key={s.seller_id}>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">
                          {s.store_name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Owner: {s.owner_name}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-semibold">
                        {s.listed_products}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {s.total_available_stock}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-indigo-700">
                        ₹{s.total_revenue.toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Users & Role Access Control (`Users` Table)
                </h3>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                UNIQUE(email) • bcrypt hash
              </span>
            </div>

            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Role (CHECK constraint)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.map((u: any) => (
                    <tr key={u.user_id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {u.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {u.email}
                      </td>
                      <td className="py-2.5 px-3">
                        <select
                          value={u.role}
                          onChange={(e) =>
                            handleRoleChange(u.user_id, e.target.value)
                          }
                          className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold bg-white"
                        >
                          <option value="customer">customer</option>
                          <option value="seller">seller</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: PostgreSQL `Inventory_Log` Trigger Audit Trail */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">
                PostgreSQL Trigger Audit Stream: `Inventory_Log`
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Automatically populated by{" "}
              <code className="font-mono text-indigo-600">
                AFTER UPDATE OF stock_qty ON Products
              </code>{" "}
              trigger (`trg_products_stock_audit`).
            </p>
          </div>
          <span className="text-xs font-mono bg-amber-50 text-amber-800 px-2.5 py-1 rounded border border-amber-200">
            Advanced Feature #2: SQL Trigger
          </span>
        </div>

        <div className="overflow-x-auto max-h-80">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200 sticky top-0">
              <tr>
                <th className="py-3 px-4">Log ID</th>
                <th className="py-3 px-4">Product</th>
                <th className="py-3 px-4">Change</th>
                <th className="py-3 px-4">Stock Transition</th>
                <th className="py-3 px-4">Trigger Event Reason</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {inventoryLogs.map((log: any) => (
                <tr key={log.log_id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono font-bold">
                    #{log.log_id}
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-slate-900">
                    {log.product_name}
                  </td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded font-mono font-bold ${
                        Number(log.change_qty) < 0
                          ? "bg-amber-50 text-amber-800"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {Number(log.change_qty) > 0
                        ? `+${log.change_qty}`
                        : log.change_qty}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-600">
                    {log.old_stock_qty} → {log.new_stock_qty}
                  </td>
                  <td className="py-2.5 px-4 text-slate-700">{log.reason}</td>
                  <td className="py-2.5 px-4 text-slate-400">
                    {new Date(log.timestamp).toLocaleString("en-IN")}
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

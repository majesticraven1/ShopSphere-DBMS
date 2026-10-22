"use client";

import React, { useState } from "react";
import {
  Database,
  FileJson,
  Cpu,
  Play,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  RotateCcw,
  Layers,
  Terminal,
} from "lucide-react";

interface DbmsLabViewProps {
  analyticsData: any;
  onRefresh: () => Promise<void>;
}

export default function DbmsLabView({
  analyticsData,
  onRefresh,
}: DbmsLabViewProps) {
  const [labResult, setLabResult] = useState<{
    title: string;
    badge: string;
    payload: any;
  } | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [selectedMongoCol, setSelectedMongoCol] = useState<
    "reviews" | "product_specs" | "qna" | "recommendation_cache"
  >("reviews");

  if (!analyticsData?.dbmsArchitecture) {
    return (
      <div className="p-12 text-center text-slate-500">
        Loading Hybrid PostgreSQL + MongoDB Architecture Lab...
      </div>
    );
  }

  const { postgres, mongodb } = analyticsData.dbmsArchitecture;

  const handleTestRollback = async () => {
    setRunningAction("rollback");
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demo_acid_rollback", product_id: 1 }),
      });
      const json = await res.json();
      setLabResult({
        title: "Feature #1: PostgreSQL ACID Transaction Rollback Verification",
        badge: "BEGIN → INSERT Orders → UPDATE Products (CHECK Violation) → ROLLBACK",
        payload: json,
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleTestTrigger = async () => {
    setRunningAction("trigger");
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: 1, stock_qty: 20 }),
      });
      const json = await res.json();
      await onRefresh();
      setLabResult({
        title:
          "Feature #2: PostgreSQL AFTER UPDATE Trigger (`trg_products_stock_audit`)",
        badge: "AFTER UPDATE OF stock_qty ON Products FOR EACH ROW",
        payload: json,
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleTestStoredFunction = async () => {
    setRunningAction("function");
    try {
      const res = await fetch(
        "/api/orders?preview=true&product_ids=1,4,9&quantities=2,1,1"
      );
      const json = await res.json();
      setLabResult({
        title:
          "Feature #3: PL/pgSQL Stored Function (`fn_calculate_order_total`)",
        badge: "SELECT * FROM fn_calculate_order_total(ARRAY[1,4,9], ARRAY[2,1,1])",
        payload: json,
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleTestExplainIndexes = async () => {
    setRunningAction("explain");
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "demo_explain_indexes",
          search_term: "oled creator laptop",
        }),
      });
      const json = await res.json();
      setLabResult({
        title:
          "Feature #5: PostgreSQL EXPLAIN ANALYZE on GIN Full-Text & B-Tree Indexes",
        badge: "idx_products_search_gin & idx_products_category_price",
        payload: json,
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleTestMongoAggregation = async () => {
    setRunningAction("mongo_agg");
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_id: 4 }),
      });
      const json = await res.json();
      await onRefresh();
      setLabResult({
        title:
          "Feature #6: MongoDB Aggregation Pipeline & `recommendation_cache` Refresh",
        badge: "db.reviews.aggregate([$addFields, $group, $project, $sort])",
        payload: {
          message: json.message,
          strategy: json.strategy,
          generated_at: json.generated_at,
          top_recommendations: json.recommendations?.slice(0, 3),
          pipeline_stages: json.pipeline_executed,
        },
      });
    } finally {
      setRunningAction(null);
    }
  };

  const handleResetSeed = async () => {
    setRunningAction("reset");
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_seed" }),
      });
      const json = await res.json();
      await onRefresh();
      setLabResult({
        title: "Database Reset & Re-Seed Complete",
        badge: "PostgreSQL + MongoDB Restored",
        payload: json,
      });
    } finally {
      setRunningAction(null);
    }
  };

  const getSampleDocsForCollection = () => {
    if (selectedMongoCol === "reviews") return mongodb.recentReviews;
    if (selectedMongoCol === "product_specs") return mongodb.sampleSpecs;
    if (selectedMongoCol === "qna") return mongodb.sampleQna;
    return mongodb.sampleCache;
  };

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-emerald-950 rounded-2xl p-6 text-white shadow-lg border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30 mb-2">
            <Cpu className="w-3.5 h-3.5" />
            DBMS Experiential Learning – Level 3 Live Architecture Lab
          </div>
          <h1 className="text-2xl font-bold">
            Hybrid SQL (PostgreSQL) + NoSQL (MongoDB) Verification Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Interactive testbed demonstrating all 6 Advanced Database Features,
            live relational table counts, MongoDB document collections, and architectural justification.
          </p>
        </div>

        <button
          onClick={handleResetSeed}
          disabled={runningAction === "reset"}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 shrink-0 transition"
        >
          <RotateCcw className="w-4 h-4" />
          {runningAction === "reset" ? "Resetting..." : "Reset Demo Data"}
        </button>
      </div>

      {/* Interactive 6 Advanced Database Features Workbench */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="w-5 h-5 text-indigo-600" />
              Interactive Demonstration of the 6 Advanced Database Features
            </h2>
            <p className="text-xs text-slate-500">
              Click any card below to execute the database feature live against
              PostgreSQL or MongoDB and inspect the output.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. ACID Transactions */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  1. ACID Transactions
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  COMMIT / ROLLBACK
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Atomic Order & Stock Rollback Test
              </h3>
              <p className="text-xs text-slate-600">
                Wraps order creation, stock deduction, and payment in a single
                transaction. Tests automatic `ROLLBACK` when `CHECK (stock_qty
                &gt;= 0)` fails.
              </p>
            </div>
            <button
              onClick={handleTestRollback}
              disabled={runningAction !== null}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Run ACID Rollback Test
            </button>
          </div>

          {/* 2. Triggers */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  2. SQL Triggers
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  AFTER UPDATE
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Automatic `Inventory_Log` Audit Trigger
              </h3>
              <p className="text-xs text-slate-600">
                Updates `Products.stock_qty` and verifies that
                `trg_products_stock_audit` automatically inserts a change record
                into `Inventory_Log`.
              </p>
            </div>
            <button
              onClick={handleTestTrigger}
              disabled={runningAction !== null}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Fire Stock Audit Trigger
            </button>
          </div>

          {/* 3. Stored Procedures / Functions */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  3. Stored Functions
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  PL/pgSQL
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                `fn_calculate_order_total` Discount Engine
              </h3>
              <p className="text-xs text-slate-600">
                Executes our PL/pgSQL function to calculate order subtotal and
                apply category-based and multi-unit bundle discount rules.
              </p>
            </div>
            <button
              onClick={handleTestStoredFunction}
              disabled={runningAction !== null}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Execute PL/pgSQL Function
            </button>
          </div>

          {/* 4. Views */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  4. SQL Views
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  sales_summary
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Category & Monthly Revenue View
              </h3>
              <p className="text-xs text-slate-600">
                Queries `SELECT * FROM sales_summary` aggregating gross revenue,
                order count, and units sold by category and month.
              </p>
            </div>
            <button
              onClick={() =>
                setLabResult({
                  title: "Feature #4: PostgreSQL `sales_summary` View Output",
                  badge: "SELECT * FROM sales_summary",
                  payload: analyticsData.salesSummaryView,
                })
              }
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Query `sales_summary` View
            </button>
          </div>

          {/* 5. Indexing */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-indigo-600">
                  5. Advanced Indexing
                </span>
                <span className="text-[11px] font-mono bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                  GIN + B-Tree
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Full-Text GIN & Composite B-Tree `EXPLAIN`
              </h3>
              <p className="text-xs text-slate-600">
                Runs `EXPLAIN ANALYZE` on `to_tsvector` GIN full-text search and
                `Products(category_id, price)` B-tree index.
              </p>
            </div>
            <button
              onClick={handleTestExplainIndexes}
              disabled={runningAction !== null}
              className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Play className="w-3.5 h-3.5" />
              Run `EXPLAIN ANALYZE`
            </button>
          </div>

          {/* 6. MongoDB Aggregation */}
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 flex flex-col justify-between space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-emerald-700">
                  6. MongoDB Aggregation
                </span>
                <span className="text-[11px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  $group • $project
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Review Sentiment Recommendation Pipeline
              </h3>
              <p className="text-xs text-slate-600">
                Computes average rating, helpfulness multiplier, and
                sentiment-weighted score per product from `reviews` and updates
                `recommendation_cache`.
              </p>
            </div>
            <button
              onClick={handleTestMongoAggregation}
              disabled={runningAction !== null}
              className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Run MongoDB Aggregation
            </button>
          </div>
        </div>

        {/* Live Execution Output Console */}
        {labResult && (
          <div className="bg-slate-950 text-slate-100 rounded-xl p-5 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-bold text-white">
                  {labResult.title}
                </span>
              </div>
              <span className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2.5 py-1 rounded border border-indigo-500/30">
                {labResult.badge}
              </span>
            </div>
            <pre className="text-xs font-mono text-emerald-300 overflow-x-auto max-h-80 leading-relaxed">
              {JSON.stringify(labResult.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Side-by-Side Live Database State: PostgreSQL vs MongoDB */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* PostgreSQL Relational Schema State */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  PostgreSQL (Relational 3NF Backbone)
                </h3>
                <p className="text-xs text-slate-500">{postgres.engine}</p>
              </div>
            </div>
            <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full">
              8 Relational Tables
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Object.entries(postgres.tableCounts || {}).map(
              ([tbl, cnt]: [string, any]) => (
                <div
                  key={tbl}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="text-xs font-mono font-bold text-indigo-700 truncate">
                    {tbl}
                  </div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {cnt} <span className="text-xs font-normal text-slate-500">rows</span>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="space-y-2 pt-2">
            <div className="text-xs font-bold uppercase text-slate-500">
              Active PostgreSQL Indexes (`pg_indexes`)
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {(postgres.indexes || []).map((idx: any, i: number) => (
                <div
                  key={i}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono"
                >
                  <div className="font-bold text-slate-800">
                    {idx.indexname}{" "}
                    <span className="text-indigo-600 font-normal">
                      ON {idx.tablename}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {idx.indexdef}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MongoDB Document Store State */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FileJson className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  MongoDB (NoSQL Document Store)
                </h3>
                <p className="text-xs text-slate-500">
                  {mongodb.uri} / {mongodb.database}
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">
              4 Collections
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {Object.entries(mongodb.collectionCounts || {}).map(
              ([col, cnt]: [string, any]) => (
                <button
                  key={col}
                  onClick={() => setSelectedMongoCol(col as any)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedMongoCol === col
                      ? "bg-emerald-50 border-emerald-400 ring-2 ring-emerald-500/20"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-xs font-mono font-bold text-emerald-800 truncate">
                    {col}
                  </div>
                  <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                    {cnt} <span className="text-xs font-normal text-slate-500">docs</span>
                  </div>
                </button>
              )
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase text-slate-500">
                Live Documents in `db.{selectedMongoCol}`
              </span>
              <span className="font-mono text-[11px] text-emerald-700">
                Click collection above to switch
              </span>
            </div>
            <pre className="bg-slate-900 text-emerald-300 p-3.5 rounded-xl text-[11px] font-mono overflow-x-auto max-h-52">
              {JSON.stringify(getSampleDocsForCollection(), null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Architectural Justification Table (Objective #6) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Architectural Justification: SQL (PostgreSQL) vs. NoSQL (MongoDB)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Explicit mapping of each data domain based on structure, ACID
            consistency, and query access patterns (Synopsis Objective #6).
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Data Domain / Entity</th>
                <th className="py-3 px-4">Database Chosen</th>
                <th className="py-3 px-4">Schema Structure</th>
                <th className="py-3 px-4">Engineering Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="py-3 px-4 font-bold text-slate-900">
                  Orders, Order_Items, Payments & Stock (`Products`)
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                    PostgreSQL (SQL)
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  Normalized 3NF Relational Tables with Foreign Keys & CHECK
                  constraints
                </td>
                <td className="py-3 px-4 text-slate-700">
                  Requires strict ACID transactions (`COMMIT`/`ROLLBACK`) so
                  inventory deduction, order creation, and payment recording
                  succeed or fail atomically without race conditions or negative
                  stock.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-slate-900">
                  Customer Reviews, Tags & Category Spec Ratings (`reviews`)
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    MongoDB (NoSQL)
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  Polymorphic JSON Documents (`tags[]`, `images[]`,
                  `spec_ratings`)
                </td>
                <td className="py-3 px-4 text-slate-700">
                  Review sub-ratings vary by category (e.g., laptop
                  `battery_life` vs shoe `cushioning`) and contain variable-length
                  tag/image arrays ideal for MongoDB Aggregation Pipelines.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-slate-900">
                  Category-Specific Product Specifications (`product_specs`)
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    MongoDB (NoSQL)
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  Flexible Key-Value Sub-Documents (`specs` sub-object)
                </td>
                <td className="py-3 px-4 text-slate-700">
                  Avoids sparse relational columns (hundreds of NULLs) or
                  expensive Entity-Attribute-Value (EAV) self-joins across
                  diverse product categories.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-slate-900">
                  Product Q&A Threads (`qna`)
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    MongoDB (NoSQL)
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  Embedded Document Array (`answers: [...]`)
                </td>
                <td className="py-3 px-4 text-slate-700">
                  Questions and their nested seller/customer answers are always
                  fetched together in a single document read without multi-table
                  joins.
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-bold text-slate-900">
                  Inventory Audit Trail (`Inventory_Log`)
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                    PostgreSQL (SQL)
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600">
                  Append-only Relational Table populated via `AFTER UPDATE`
                  Trigger
                </td>
                <td className="py-3 px-4 text-slate-700">
                  Database-level trigger guarantees every stock change is
                  logged inside the same ACID transaction as the stock update.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

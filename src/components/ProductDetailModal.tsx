"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Star,
  ThumbsUp,
  ShieldCheck,
  Database,
  FileJson,
  MessageSquare,
  Sparkles,
  ShoppingCart,
  CheckCircle2,
  Send,
  Layers,
  Tag,
  History,
} from "lucide-react";

interface ProductDetailModalProps {
  productId: number | null;
  onClose: () => void;
  onAddToCart: (product: any) => void;
  onSelectProduct: (id: number) => void;
  currentUser: any;
  onDataMutated: () => void;
}

const DEFAULT_SPEC_DIMENSIONS: Record<string, string[]> = {
  "Laptops & Computing": [
    "display_quality",
    "battery_life",
    "performance",
    "build_quality",
  ],
  "Audio & Wearables": [
    "noise_cancellation",
    "sound_stage",
    "comfort",
    "battery_life",
  ],
  "Performance Footwear & Apparel": [
    "cushioning",
    "breathability",
    "fit",
    "durability",
  ],
  "Smart Kitchen & Coffee": [
    "extraction_quality",
    "build_quality",
    "ease_of_use",
  ],
};

export default function ProductDetailModal({
  productId,
  onClose,
  onAddToCart,
  onSelectProduct,
  currentUser,
  onDataMutated,
}: ProductDetailModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "specs" | "reviews" | "qna" | "audit"
  >("reviews");

  // Review Form State
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [tagsInput, setTagsInput] = useState("high-quality, value, recommended");
  const [specRatings, setSpecRatings] = useState<Record<string, number>>({});
  const [submittingReview, setSubmittingReview] = useState(false);

  // Q&A Form State
  const [questionText, setQuestionText] = useState("");
  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [submittingQna, setSubmittingQna] = useState(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const fetchDetails = async (id: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`);
      const json = await res.json();
      setData(json);

      // Initialize category-specific spec_ratings sliders
      const catName = json.product?.category_name || "";
      const dims = DEFAULT_SPEC_DIMENSIONS[catName] || [
        "overall_quality",
        "value_for_money",
        "reliability",
      ];
      const initialSpecs: Record<string, number> = {};
      dims.forEach((d) => (initialSpecs[d] = 5));
      setSpecRatings(initialSpecs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (productId !== null) {
      fetchDetails(productId);
    } else {
      setData(null);
    }
  }, [productId]);

  if (productId === null) return null;

  const showToast = (msg: string) => {
    setFeedbackToast(msg);
    setTimeout(() => setFeedbackToast(null), 4500);
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewText.trim()) return;
    setSubmittingReview(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          customer_id: currentUser?.user_id || 4,
          customer_name: currentUser?.name || "Aarav Sharma",
          rating,
          review_text: reviewText,
          tags,
          spec_ratings: specRatings,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setReviewText("");
        showToast(
          "Saved to MongoDB `reviews` & refreshed `recommendation_cache` via Aggregation Pipeline!"
        );
        await fetchDetails(productId);
        onDataMutated();
      } else {
        showToast(json.error || "Failed to submit review");
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleHelpfulVote = async (reviewId: string) => {
    await fetch("/api/reviews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: reviewId }),
    });
    await fetchDetails(productId);
    onDataMutated();
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;
    setSubmittingQna(true);
    try {
      const res = await fetch("/api/qna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: productId,
          question: questionText,
        }),
      });
      if (res.ok) {
        setQuestionText("");
        showToast("Question added to MongoDB `qna` collection!");
        await fetchDetails(productId);
      }
    } finally {
      setSubmittingQna(false);
    }
  };

  const handlePostAnswer = async (questionId: string) => {
    const text = answerInputs[questionId];
    if (!text?.trim()) return;
    setSubmittingQna(true);
    try {
      const res = await fetch("/api/qna", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          question_id: questionId,
          answer_text: text,
        }),
      });
      if (res.ok) {
        setAnswerInputs((prev) => ({ ...prev, [questionId]: "" }));
        showToast(
          "Answer pushed into nested `answers[]` array in MongoDB `qna`!"
        );
        await fetchDetails(productId);
      }
    } finally {
      setSubmittingQna(false);
    }
  };

  const product = data?.product;
  const specsDoc = data?.specsDoc;
  const reviews = data?.reviews || [];
  const qnaList = data?.qna || [];
  const coPurchased = data?.coPurchasedProducts || [];
  const inventoryLogs = data?.inventoryLogs || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white border-b border-slate-800">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              <Database className="w-3.5 h-3.5" />
              PostgreSQL `Products` #{productId}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <FileJson className="w-3.5 h-3.5" />
              MongoDB `reviews` + `product_specs` + `qna`
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {feedbackToast && (
          <div className="bg-emerald-600 text-white px-6 py-2.5 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedbackToast}
          </div>
        )}

        {loading || !product ? (
          <div className="p-16 text-center text-slate-500">
            Loading unified PostgreSQL + MongoDB product document...
          </div>
        ) : (
          <div className="overflow-y-auto p-6 space-y-8">
            {/* Hero Product Summary */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              <div className="md:col-span-5 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 aspect-[4/3] relative">
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
                {product.discount_pct > 0 && (
                  <span className="absolute top-3 left-3 bg-indigo-600 text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
                    {product.discount_pct}% Category Discount Eligible
                  </span>
                )}
              </div>

              <div className="md:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-md">
                    {product.parent_category_name
                      ? `${product.parent_category_name} › ${product.category_name}`
                      : product.category_name}
                  </span>
                  <span>•</span>
                  <span>
                    Sold by{" "}
                    <strong className="text-slate-700">
                      {product.store_name}
                    </strong>
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-slate-900">
                  {product.name}
                </h2>

                <p className="text-sm text-slate-600 leading-relaxed">
                  {product.description}
                </p>

                {/* MongoDB Aggregated Rating & Sentiment Pill */}
                <div className="flex flex-wrap items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                    <span className="text-lg font-bold text-slate-900">
                      {product.avg_rating > 0
                        ? product.avg_rating.toFixed(1)
                        : "New"}
                    </span>
                    <span className="text-xs text-slate-500">
                      ({product.review_count} reviews)
                    </span>
                  </div>
                  <div className="h-4 w-px bg-slate-300" />
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                    <Sparkles className="w-3.5 h-3.5" />
                    Sentiment Score:{" "}
                    <strong>
                      {product.sentiment_weighted_score.toFixed(2)} / 5.0
                    </strong>{" "}
                    ({Math.round((product.avg_sentiment || 0.85) * 100)}%
                    Positive)
                  </div>
                </div>

                {/* Price & Stock Action */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-200">
                  <div>
                    <div className="text-2xl font-extrabold text-slate-900">
                      ₹{product.price.toLocaleString("en-IN")}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      PostgreSQL Stock:{" "}
                      <span
                        className={
                          product.stock_qty > 5
                            ? "text-emerald-600 font-semibold"
                            : "text-amber-600 font-semibold"
                        }
                      >
                        {product.stock_qty} units available
                      </span>
                    </div>
                  </div>

                  <button
                    disabled={product.stock_qty <= 0}
                    onClick={() => {
                      onAddToCart(product);
                      showToast(`Added "${product.name}" to transactional cart!`);
                    }}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold text-sm shadow-sm transition"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {product.stock_qty > 0 ? "Add to Cart" : "Out of Stock"}
                  </button>
                </div>

                {/* Top Review Tags from MongoDB */}
                {product.top_tags?.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <Tag className="w-3.5 h-3.5 text-slate-400" />
                    {product.top_tags.map((t: string) => (
                      <span
                        key={t}
                        className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Co-Purchased Products (PostgreSQL Order_Items Composite Index Self-Join) */}
            {coPurchased.length > 0 && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Frequently Bought Together (PostgreSQL `Order_Items`
                      Co-Purchase Join)
                    </h3>
                  </div>
                  <span className="text-[11px] font-mono text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                    idx_order_items_order_product
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {coPurchased.map((cp: any) => (
                    <div
                      key={cp.product_id}
                      onClick={() => onSelectProduct(cp.product_id)}
                      className="bg-white p-2.5 rounded-lg border border-indigo-100 hover:border-indigo-300 cursor-pointer transition flex items-center gap-3"
                    >
                      <img
                        src={cp.image_url}
                        alt={cp.name}
                        className="w-12 h-12 rounded-md object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          {cp.name}
                        </div>
                        <div className="text-xs font-bold text-indigo-600">
                          ₹{cp.price.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[10px] text-emerald-700 font-medium">
                          Co-purchased in {cp.co_purchase_count} order(s)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-Navigation Tabs */}
            <div className="border-b border-slate-200 flex items-center gap-2 overflow-x-auto">
              <button
                onClick={() => setActiveTab("reviews")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "reviews"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <Star className="w-4 h-4" />
                MongoDB Reviews & Spec Ratings ({reviews.length})
              </button>
              <button
                onClick={() => setActiveTab("specs")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "specs"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <FileJson className="w-4 h-4" />
                Flexible Category Specs (`product_specs`)
              </button>
              <button
                onClick={() => setActiveTab("qna")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "qna"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Seller Q&A Threads (`qna` nested array) ({qnaList.length})
              </button>
              <button
                onClick={() => setActiveTab("audit")}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition whitespace-nowrap flex items-center gap-2 ${
                  activeTab === "audit"
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <History className="w-4 h-4" />
                PostgreSQL Trigger Log (`Inventory_Log`) ({inventoryLogs.length})
              </button>
            </div>

            {/* TAB 1: MONGODB REVIEWS & CATEGORY SPEC RATINGS */}
            {activeTab === "reviews" && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Aggregated Category Spec Ratings + Review Submission Form */}
                <div className="lg:col-span-5 space-y-5">
                  {Object.keys(product.spec_rating_averages || {}).length >
                    0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Category Spec Ratings (MongoDB Sub-Doc)
                        </h4>
                        <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          reviews.spec_ratings
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {Object.entries(product.spec_rating_averages).map(
                          ([dim, val]: [string, any]) => (
                            <div key={dim} className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="capitalize font-medium text-slate-700">
                                  {dim.replace(/_/g, " ")}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {val} / 5.0
                                </span>
                              </div>
                              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 rounded-full"
                                  style={{
                                    width: `${Math.min(100, (Number(val) / 5) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Write a Review Form */}
                  <form
                    onSubmit={handleSubmitReview}
                    className="bg-white p-4 rounded-xl border border-slate-200 space-y-3.5 shadow-sm"
                  >
                    <h4 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                      <span>Write a Customer Review</span>
                      <span className="text-[11px] font-normal text-slate-500">
                        Inserts into MongoDB `reviews`
                      </span>
                    </h4>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Overall Star Rating
                      </label>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            type="button"
                            key={num}
                            onClick={() => setRating(num)}
                            className={`p-1.5 rounded-lg border transition ${
                              rating >= num
                                ? "bg-amber-50 border-amber-300 text-amber-500"
                                : "bg-slate-50 border-slate-200 text-slate-300"
                            }`}
                          >
                            <Star className="w-4 h-4 fill-current" />
                          </button>
                        ))}
                        <span className="ml-2 text-xs font-bold text-slate-700">
                          {rating} / 5 Stars
                        </span>
                      </div>
                    </div>

                    {/* Dynamic Spec Ratings Sub-Document Sliders */}
                    <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div className="text-[11px] font-semibold text-slate-600">
                        Category-Specific `spec_ratings` Sub-Document:
                      </div>
                      {Object.entries(specRatings).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="capitalize text-slate-700">
                            {k.replace(/_/g, " ")}:
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={1}
                              max={5}
                              step={0.5}
                              value={v}
                              onChange={(e) =>
                                setSpecRatings((prev) => ({
                                  ...prev,
                                  [k]: Number(e.target.value),
                                }))
                              }
                              className="w-24 accent-indigo-600"
                            />
                            <span className="w-6 text-right font-bold">
                              {v}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Review Text (Analyzed for Sentiment Score)
                      </label>
                      <textarea
                        rows={3}
                        required
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Share your experience with build quality, performance, comfort..."
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Review Tags (comma-separated `tags[]` array)
                      </label>
                      <input
                        type="text"
                        value={tagsInput}
                        onChange={(e) => setTagsInput(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition"
                    >
                      {submittingReview
                        ? "Running MongoDB Aggregation..."
                        : "Submit Review & Update Recommendations"}
                    </button>
                  </form>
                </div>

                {/* Right Column: Review Cards */}
                <div className="lg:col-span-7 space-y-4">
                  {reviews.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-500">
                      No reviews yet for this product. Be the first to review!
                    </div>
                  ) : (
                    reviews.map((rev: any) => (
                      <div
                        key={rev.review_id}
                        className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-900">
                                {rev.customer_name}
                              </span>
                              {rev.verified_purchase && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <ShieldCheck className="w-3 h-3" /> Verified
                                  SQL Buyer
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {new Date(rev.created_at).toLocaleDateString(
                                "en-IN",
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )}{" "}
                              • Doc ID: {rev.review_id}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1" />
                              <span className="text-xs font-bold text-amber-900">
                                {rev.rating}.0
                              </span>
                            </div>
                            <span className="text-[11px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                              Sentiment: {Math.round((rev.sentiment_score || 0.85) * 100)}%
                            </span>
                          </div>
                        </div>

                        <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                          {rev.review_text}
                        </p>

                        {/* Variable spec_ratings chips */}
                        {rev.spec_ratings &&
                          Object.keys(rev.spec_ratings).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {Object.entries(rev.spec_ratings).map(
                                ([k, v]: [string, any]) => (
                                  <span
                                    key={k}
                                    className="text-[11px] bg-indigo-50/70 text-indigo-800 px-2 py-0.5 rounded border border-indigo-100 capitalize"
                                  >
                                    {k.replace(/_/g, " ")}: <strong>{v}/5</strong>
                                  </span>
                                )
                              )}
                            </div>
                          )}

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                          <div className="flex flex-wrap gap-1">
                            {(rev.tags || []).map((t: string) => (
                              <span
                                key={t}
                                className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>

                          <button
                            onClick={() => handleHelpfulVote(rev.review_id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50 px-2.5 py-1 rounded-lg border border-slate-200 transition"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            Helpful ({rev.helpful_votes || 0})
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: FLEXIBLE CATEGORY SPECIFICATIONS (MongoDB `product_specs`) */}
            {activeTab === "specs" && (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-7 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-900">
                      Category-Specific Specifications (`product_specs` Document)
                    </h4>
                    <span className="text-xs font-mono text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                      Polymorphic Schema
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <tbody className="divide-y divide-slate-200 text-xs sm:text-sm">
                        {Object.entries(specsDoc?.specs || {}).map(
                          ([key, value]: [string, any]) => (
                            <tr
                              key={key}
                              className="odd:bg-slate-50/70 even:bg-white"
                            >
                              <td className="py-2.5 px-4 font-semibold text-slate-600 capitalize w-2/5">
                                {key.replace(/_/g, " ")}
                              </td>
                              <td className="py-2.5 px-4 text-slate-900 font-medium">
                                {Array.isArray(value)
                                  ? value.join(", ")
                                  : typeof value === "boolean"
                                  ? value
                                    ? "Yes"
                                    : "No"
                                  : String(value)}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="md:col-span-5 space-y-4">
                  <div className="bg-slate-900 text-slate-100 p-4 rounded-xl space-y-3">
                    <div className="text-xs font-mono text-indigo-300">
                      Why MongoDB for `product_specs`?
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      A laptop requires attributes like{" "}
                      <code className="text-emerald-300">processor</code>,{" "}
                      <code className="text-emerald-300">memory_ram</code>, and{" "}
                      <code className="text-emerald-300">ports[]</code>, whereas
                      running shoes require{" "}
                      <code className="text-emerald-300">midsole_compound</code>{" "}
                      and{" "}
                      <code className="text-emerald-300">
                        heel_to_toe_drop_mm
                      </code>
                      . Storing this in MongoDB avoids sparse relational tables
                      with dozens of NULL columns or complex EAV joins.
                    </p>
                    {specsDoc?.highlights?.length > 0 && (
                      <div className="pt-2 border-t border-slate-800 space-y-1.5">
                        <div className="text-xs font-bold text-white">
                          Key Product Highlights:
                        </div>
                        <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                          {specsDoc.highlights.map((h: string, idx: number) => (
                            <li key={idx}>{h}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="pt-2 text-[11px] text-emerald-400 font-medium">
                      Warranty: {specsDoc?.warranty_info}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: SELLER Q&A THREADS (MongoDB `qna` with variable-length nested `answers[]`) */}
            {activeTab === "qna" && (
              <div className="space-y-6">
                <form
                  onSubmit={handleAskQuestion}
                  className="flex flex-col sm:flex-row gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200"
                >
                  <input
                    type="text"
                    required
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Ask a technical or product question about this listing..."
                    className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white"
                  />
                  <button
                    type="submit"
                    disabled={submittingQna}
                    className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 transition"
                  >
                    Ask Question (MongoDB `qna`)
                  </button>
                </form>

                <div className="space-y-4">
                  {qnaList.map((thread: any) => (
                    <div
                      key={thread.question_id}
                      className="p-4 rounded-xl border border-slate-200 bg-white space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-bold text-slate-900">
                          Q: {thread.question}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400 shrink-0">
                          {thread.question_id} • by {thread.customer_name}
                        </span>
                      </div>

                      {/* Nested answers[] array */}
                      <div className="pl-4 border-l-2 border-indigo-200 space-y-2.5">
                        {(thread.answers || []).map((ans: any) => (
                          <div
                            key={ans.answer_id}
                            className="bg-slate-50 p-3 rounded-lg text-xs space-y-1"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800">
                                {ans.responder_name}
                              </span>
                              {ans.is_seller_response && (
                                <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">
                                  Verified Seller
                                </span>
                              )}
                            </div>
                            <p className="text-slate-700 leading-relaxed">
                              {ans.answer_text}
                            </p>
                          </div>
                        ))}

                        {/* Add nested answer input */}
                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            value={answerInputs[thread.question_id] || ""}
                            onChange={(e) =>
                              setAnswerInputs((prev) => ({
                                ...prev,
                                [thread.question_id]: e.target.value,
                              }))
                            }
                            placeholder="Write an answer (pushed to `answers[]` via MongoDB $push)..."
                            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handlePostAnswer(thread.question_id)}
                            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium inline-flex items-center gap-1"
                          >
                            <Send className="w-3 h-3" /> Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 4: POSTGRESQL INVENTORY_LOG TRIGGER HISTORY */}
            {activeTab === "audit" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-600">
                    Populated automatically by PostgreSQL{" "}
                    <code className="font-mono font-bold text-indigo-700">
                      AFTER UPDATE OF stock_qty ON Products
                    </code>{" "}
                    trigger (<code className="font-mono">trg_products_stock_audit</code>).
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 uppercase">
                      <tr>
                        <th className="py-2.5 px-4">Log ID</th>
                        <th className="py-2.5 px-4">Change Qty</th>
                        <th className="py-2.5 px-4">Old → New Stock</th>
                        <th className="py-2.5 px-4">Trigger Audit Reason</th>
                        <th className="py-2.5 px-4">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inventoryLogs.map((log: any) => (
                        <tr key={log.log_id} className="bg-white">
                          <td className="py-2.5 px-4 font-mono font-semibold">
                            #{log.log_id}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                Number(log.change_qty) < 0
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {Number(log.change_qty) > 0
                                ? `+${log.change_qty}`
                                : log.change_qty}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono">
                            {log.old_stock_qty} → {log.new_stock_qty}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">
                            {log.reason}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">
                            {new Date(log.timestamp).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

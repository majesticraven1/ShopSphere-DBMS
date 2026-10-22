"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  ShoppingBag,
  Search,
  Star,
  Sparkles,
  ShoppingCart,
  UserCheck,
  Database,
  FileJson,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Package,
  Shield,
  Cpu,
  Clock,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  LogIn,
  RefreshCw,
  Tag,
  ChevronRight,
  X,
} from "lucide-react";
import ProductDetailModal from "@/components/ProductDetailModal";
import SellerDashboard from "@/components/SellerDashboard";
import AdminDashboard from "@/components/AdminDashboard";
import DbmsLabView from "@/components/DbmsLabView";

interface CartItem {
  product_id: number;
  name: string;
  price: number;
  qty: number;
  stock_qty: number;
  image_url: string;
  category_name: string;
}

export default function ShopSphereApp() {
  const [activeView, setActiveView] = useState<
    "storefront" | "orders" | "seller" | "admin" | "dbms_lab"
  >("storefront");

  // Auth & Demo Accounts
  const [currentUser, setCurrentUser] = useState<any>({
    user_id: 4,
    name: "Aarav Sharma",
    email: "aarav@shopsphere.in",
    role: "customer",
  });
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authRole, setAuthRole] = useState<"customer" | "seller">("customer");
  const [authStoreName, setAuthStoreName] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  // Catalog Filters
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [maxPrice, setMaxPrice] = useState<number>(90000);
  const [minRating, setMinRating] = useState<number>(0);
  const [selectedTag, setSelectedTag] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("recommended");
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  // Hybrid Recommendations (`recommendation_cache`)
  const [recommendationsData, setRecommendationsData] = useState<any>(null);
  const [refreshingRecs, setRefreshingRecs] = useState(false);

  // Orders & Analytics
  const [orders, setOrders] = useState<any[]>([]);
  const [analyticsData, setAnalyticsData] = useState<any>(null);

  // Cart & PL/pgSQL Preview
  const [cart, setCart] = useState<CartItem[]>([
    {
      product_id: 1,
      name: "ProBook Ultra 14 OLED Creator Laptop",
      price: 78999,
      qty: 1,
      stock_qty: 16,
      image_url:
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80",
      category_name: "Laptops & Computing",
    },
    {
      product_id: 4,
      name: "KeyChronos Q1 Gasket Mechanical Keyboard",
      price: 6499,
      qty: 1,
      stock_qty: 20,
      image_url:
        "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",
      category_name: "Laptops & Computing",
    },
  ]);
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [plpgsqlPreview, setPlpgsqlPreview] = useState<{
    subtotal: number;
    discount: number;
    final_total: number;
    discount_breakdown: string;
  }>({
    subtotal: 0,
    discount: 0,
    final_total: 0,
    discount_breakdown: "",
  });
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [shippingAddress, setShippingAddress] = useState(
    "Indiranagar 100ft Road, Bengaluru, Karnataka 560038"
  );
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  // Product Detail Modal
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );

  // Global Notification Banner
  const [banner, setBanner] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const showBanner = (type: "success" | "error", text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 6500);
  };

  // Fetch Auth & Demo Accounts
  const fetchAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth");
      const json = await res.json();
      if (json.demoAccounts) {
        setDemoAccounts(json.demoAccounts);
      }
      if (json.user) {
        setCurrentUser(json.user);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Fetch Products Catalog
  const fetchCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set("search", searchQuery.trim());
      if (selectedCategory)
        params.set("category_id", String(selectedCategory));
      if (maxPrice < 90000) params.set("max_price", String(maxPrice));
      if (minRating > 0) params.set("min_rating", String(minRating));
      if (selectedTag) params.set("tag", selectedTag);
      params.set("sort", sortBy);

      const res = await fetch(`/api/products?${params.toString()}`);
      const json = await res.json();
      setProducts(json.products || []);
      if (json.categories) setCategories(json.categories);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingCatalog(false);
    }
  }, [searchQuery, selectedCategory, maxPrice, minRating, selectedTag, sortBy]);

  // Fetch Hybrid Recommendations
  const fetchRecommendations = useCallback(
    async (forceRefresh = false) => {
      setRefreshingRecs(true);
      try {
        const custId =
          currentUser?.role === "customer" ? currentUser.user_id : 4;
        const res = await fetch(
          `/api/recommendations?customer_id=${custId}${
            forceRefresh ? "&refresh=true" : ""
          }`
        );
        const json = await res.json();
        setRecommendationsData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setRefreshingRecs(false);
      }
    },
    [currentUser]
  );

  // Fetch Orders & Analytics
  const fetchOrdersAndAnalytics = useCallback(async () => {
    try {
      const [ordRes, anaRes] = await Promise.all([
        fetch("/api/orders"),
        fetch("/api/analytics"),
      ]);
      const [ordJson, anaJson] = await Promise.all([
        ordRes.json(),
        anaRes.json(),
      ]);
      setOrders(ordJson.orders || []);
      setAnalyticsData(anaJson);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Live PL/pgSQL Function Preview whenever Cart changes
  useEffect(() => {
    const updateCartPreview = async () => {
      if (cart.length === 0) {
        setPlpgsqlPreview({
          subtotal: 0,
          discount: 0,
          final_total: 0,
          discount_breakdown: "Cart is empty",
        });
        return;
      }
      const pIds = cart.map((c) => c.product_id).join(",");
      const qtys = cart.map((c) => c.qty).join(",");
      try {
        const res = await fetch(
          `/api/orders?preview=true&product_ids=${pIds}&quantities=${qtys}`
        );
        const json = await res.json();
        setPlpgsqlPreview(json);
      } catch (err) {
        console.error(err);
      }
    };
    updateCartPreview();
  }, [cart]);

  useEffect(() => {
    fetchAuth();
  }, [fetchAuth]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  useEffect(() => {
    fetchRecommendations(false);
    fetchOrdersAndAnalytics();
  }, [fetchRecommendations, fetchOrdersAndAnalytics]);

  const refreshAllData = async () => {
    await Promise.all([
      fetchCatalog(),
      fetchRecommendations(false),
      fetchOrdersAndAnalytics(),
    ]);
  };

  // Quick Role Switcher Handler
  const handleQuickRoleSwitch = async (account: any) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "quick_switch",
        email: account.email,
      }),
    });
    const json = await res.json();
    if (res.ok && json.user) {
      setCurrentUser(json.user);
      if (json.user.role === "admin") setActiveView("admin");
      else if (json.user.role === "seller") setActiveView("seller");
      else setActiveView("storefront");
      showBanner(
        "success",
        `Switched active JWT session to ${json.user.name} (Role: ${json.user.role.toUpperCase()})`
      );
    }
  };

  // Manual Auth Submit
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: authMode,
        email: authEmail,
        password: authPassword,
        name: authName,
        role: authRole,
        store_name: authStoreName,
      }),
    });
    const json = await res.json();
    if (res.ok && json.user) {
      setCurrentUser(json.user);
      setShowAuthModal(false);
      await fetchAuth();
      showBanner(
        "success",
        `Authenticated as ${json.user.name} (${json.user.role}) via JWT & bcrypt!`
      );
    } else {
      setAuthError(json.error || "Authentication failed");
    }
  };

  // Cart Operations
  const handleAddToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.product_id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.product_id ? { ...i, qty: i.qty + 1 } : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          name: product.name,
          price: product.price,
          qty: 1,
          stock_qty: product.stock_qty,
          image_url: product.image_url,
          category_name: product.category_name,
        },
      ];
    });
  };

  const handleUpdateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product_id === productId
            ? { ...item, qty: item.qty + delta }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  // Transactional Checkout
  const handlePlaceOrder = async () => {
    if (cart.length === 0) return;
    setPlacingOrder(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: currentUser?.user_id || 4,
          items: cart.map((c) => ({ product_id: c.product_id, qty: c.qty })),
          payment_method: paymentMethod,
          shipping_address: shippingAddress,
          simulate_payment_failure: simulateFailure,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setCart([]);
        setShowCartDrawer(false);
        setActiveView("orders");
        showBanner("success", json.message);
        await refreshAllData();
      } else {
        showBanner(
          "error",
          `PostgreSQL ACID Transaction ROLLED BACK: ${json.error}`
        );
      }
    } finally {
      setPlacingOrder(false);
    }
  };

  const totalCartItems = cart.reduce((acc, c) => acc + c.qty, 0);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Architecture Status Ribbon */}
      <div className="bg-slate-950 text-slate-300 text-[11px] border-b border-slate-800 px-4 py-1.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-medium text-indigo-300">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              SQL: PostgreSQL 16 (3NF Relational • ACID Transactions • Triggers
              • PL/pgSQL • Views • GIN Index)
            </span>
            <span className="text-slate-600">|</span>
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              NoSQL: MongoDB (`reviews` • `product_specs` • `qna` •
              `recommendation_cache` Aggregation)
            </span>
          </div>

          {/* Quick Role Switcher for Demo / Viva */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 hidden sm:inline">
              Quick Demo Role Switch:
            </span>
            {[
              {
                label: "Customer (Aarav)",
                email: "aarav@shopsphere.in",
                role: "customer",
              },
              {
                label: "Seller (NovaTech)",
                email: "nova@shopsphere.in",
                role: "seller",
              },
              {
                label: "Admin (Dr. Arjun)",
                email: "admin@shopsphere.in",
                role: "admin",
              },
            ].map((acc) => (
              <button
                key={acc.email}
                onClick={() => handleQuickRoleSwitch(acc)}
                className={`px-2 py-0.5 rounded font-semibold transition ${
                  currentUser?.email === acc.email
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div
            onClick={() => setActiveView("storefront")}
            className="flex items-center gap-3 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-slate-900">
                  ShopSphere
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  SQL + NoSQL
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Review-Driven Hybrid E-Commerce Platform
              </p>
            </div>
          </div>

          {/* Primary Navigation Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveView("storefront")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === "storefront"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              Storefront
            </button>

            <button
              onClick={() => setActiveView("orders")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === "orders"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Clock className="w-4 h-4" />
              Orders ({orders.length})
            </button>

            <button
              onClick={() => setActiveView("seller")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === "seller"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Package className="w-4 h-4" />
              Seller Studio
            </button>

            <button
              onClick={() => setActiveView("admin")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === "admin"
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Shield className="w-4 h-4" />
              Admin Dashboard
            </button>

            <button
              onClick={() => setActiveView("dbms_lab")}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 whitespace-nowrap ${
                activeView === "dbms_lab"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "text-emerald-700 hover:bg-emerald-50/70"
              }`}
            >
              <Cpu className="w-4 h-4" />
              DBMS Live Lab
            </button>
          </nav>

          {/* Right User Profile & Cart Button */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowAuthModal(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition"
            >
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <div className="text-left">
                <div className="text-slate-900 leading-none">
                  {currentUser?.name}
                </div>
                <div className="text-[10px] text-indigo-600 uppercase font-bold">
                  {currentUser?.role}
                </div>
              </div>
            </button>

            <button
              onClick={() => setShowCartDrawer(true)}
              className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold shadow-sm transition"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">Cart</span>
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-500 text-white text-[11px] font-bold">
                {totalCartItems}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Global Toast Notification */}
      {banner && (
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 pt-4">
          <div
            className={`p-4 rounded-xl border shadow-sm flex items-center justify-between gap-3 text-sm font-medium ${
              banner.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-rose-50 border-rose-200 text-rose-900"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {banner.type === "success" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              onClick={() => setBanner(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {/* VIEW 1: CUSTOMER STOREFRONT & HYBRID RECOMMENDATIONS */}
        {activeView === "storefront" && (
          <div className="space-y-8">
            {/* Review-Driven + Co-Purchase Recommendations Hero Section */}
            <section className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-300 bg-emerald-500/20 px-3 py-1 rounded-full border border-emerald-500/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    MongoDB `recommendation_cache` + PostgreSQL Co-Purchase
                    Engine
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold">
                    Personalized Review-Driven Recommendations for{" "}
                    {currentUser?.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300">
                    Ranked by{" "}
                    <strong className="text-white">
                      MongoDB Review Sentiment Aggregation
                    </strong>{" "}
                    (`$avg`, helpfulness multiplier, tag affinity) +{" "}
                    <strong className="text-indigo-300">
                      PostgreSQL `Order_Items` Co-Purchase Frequency
                    </strong>
                    .
                  </p>
                </div>

                <button
                  onClick={() => fetchRecommendations(true)}
                  disabled={refreshingRecs}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white border border-white/15 shrink-0 transition"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      refreshingRecs ? "animate-spin" : ""
                    }`}
                  />
                  Refresh `recommendation_cache`
                </button>
              </div>

              {/* Recommended Product Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {(recommendationsData?.recommendations || [])
                  .slice(0, 3)
                  .map((rec: any, idx: number) => (
                    <div
                      key={rec.product_id}
                      onClick={() => setSelectedProductId(rec.product_id)}
                      className="bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-xl p-4 border border-white/15 cursor-pointer transition flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <img
                          src={rec.image_url}
                          alt={rec.name}
                          className="w-16 h-16 rounded-lg object-cover shrink-0 border border-white/20"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                              #{idx + 1} Match • Score {rec.score}
                            </span>
                            <span className="inline-flex items-center text-xs font-bold text-white">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400 mr-1" />
                              {rec.avg_rating.toFixed(1)}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white truncate mt-0.5">
                            {rec.name}
                          </h3>
                          <div className="text-sm font-extrabold text-indigo-300 mt-0.5">
                            ₹{rec.price.toLocaleString("en-IN")}
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-emerald-200 bg-emerald-950/60 border border-emerald-500/30 rounded-lg px-2.5 py-1.5 leading-snug">
                        {rec.reason}
                      </div>
                    </div>
                  ))}
              </div>
            </section>

            {/* Search & Multi-Index Filter Bar */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                {/* GIN Full-Text Search Bar */}
                <div className="md:col-span-5 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Full-Text GIN Search (e.g. 'oled laptop', 'carbon marathon', 'anc')..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {/* Category Hierarchy Select (B-Tree Index) */}
                <div className="md:col-span-3">
                  <select
                    value={selectedCategory ?? ""}
                    onChange={(e) =>
                      setSelectedCategory(
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="">All Categories (Hierarchical)</option>
                    {categories.map((cat) => (
                      <option key={cat.category_id} value={cat.category_id}>
                        {cat.parent_name
                          ? `↳ ${cat.parent_name} › ${cat.name}`
                          : `★ ${cat.name} (Root)`}{" "}
                        ({cat.discount_pct}% Off)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Min Rating Filter (MongoDB Aggregation) */}
                <div className="md:col-span-2">
                  <select
                    value={minRating}
                    onChange={(e) => setMinRating(Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={0}>Any Review Rating</option>
                    <option value={4.5}>4.5★ & Above</option>
                    <option value={4.0}>4.0★ & Above</option>
                  </select>
                </div>

                {/* Sort Order */}
                <div className="md:col-span-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm bg-white focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="recommended">Sort: Sentiment Score</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="rating_desc">Highest Rated</option>
                  </select>
                </div>
              </div>

              {/* Price Range Slider & Popular Review Tag Chips */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-100 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-600 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-indigo-600" />
                    Max Price (B-Tree `idx_products_category_price`):
                  </span>
                  <input
                    type="range"
                    min={2000}
                    max={90000}
                    step={1000}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-32 accent-indigo-600"
                  />
                  <span className="font-bold text-indigo-700">
                    Up to ₹{maxPrice.toLocaleString("en-IN")}
                  </span>
                </div>

                {/* MongoDB Tag Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> MongoDB Review Tags:
                  </span>
                  {[
                    "",
                    "oled",
                    "creator",
                    "developer",
                    "anc",
                    "battery-life",
                    "marathon",
                    "ergonomic",
                  ].map((tag) => (
                    <button
                      key={tag || "all"}
                      onClick={() => setSelectedTag(tag)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                        selectedTag === tag
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {tag ? `#${tag}` : "All Tags"}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Product Catalog Grid */}
            {loadingCatalog ? (
              <div className="p-16 text-center text-slate-500">
                Querying PostgreSQL `Products` & MongoDB `reviews`
                Aggregation...
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                <div className="text-base font-bold text-slate-800">
                  No products match your current SQL / NoSQL filter criteria.
                </div>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory(null);
                    setMaxPrice(90000);
                    setMinRating(0);
                    setSelectedTag("");
                  }}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <div
                    key={product.product_id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col justify-between group"
                  >
                    <div>
                      {/* Product Image */}
                      <div
                        onClick={() => setSelectedProductId(product.product_id)}
                        className="relative aspect-[16/10] bg-slate-100 overflow-hidden cursor-pointer"
                      >
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        />
                        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                          <span className="bg-slate-900/85 backdrop-blur-sm text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">
                            {product.category_name}
                          </span>
                          {product.discount_pct > 0 && (
                            <span className="bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full w-fit">
                              {product.discount_pct}% Category Rule
                            </span>
                          )}
                        </div>
                        <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur px-2.5 py-1 rounded-lg shadow text-xs font-bold flex items-center gap-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>
                            {product.avg_rating > 0
                              ? product.avg_rating.toFixed(1)
                              : "New"}
                          </span>
                          <span className="text-slate-400 font-normal text-[11px]">
                            ({product.review_count})
                          </span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="p-5 space-y-3">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-medium truncate">
                            {product.store_name}
                          </span>
                          <span className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Sentiment: {product.sentiment_weighted_score.toFixed(2)}
                          </span>
                        </div>

                        <h3
                          onClick={() =>
                            setSelectedProductId(product.product_id)
                          }
                          className="text-base font-bold text-slate-900 hover:text-indigo-600 cursor-pointer line-clamp-1"
                        >
                          {product.name}
                        </h3>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {product.description}
                        </p>

                        {/* Sample Polymorphic Specs Preview from MongoDB */}
                        {Object.keys(product.specs || {}).length > 0 && (
                          <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                            <div className="text-[10px] font-mono uppercase text-slate-400 flex items-center justify-between">
                              <span>MongoDB `product_specs`</span>
                              <FileJson className="w-3 h-3 text-emerald-600" />
                            </div>
                            {Object.entries(product.specs)
                              .slice(0, 2)
                              .map(([k, v]: [string, any]) => (
                                <div
                                  key={k}
                                  className="text-[11px] text-slate-700 truncate"
                                >
                                  <span className="font-semibold capitalize text-slate-500">
                                    {k.replace(/_/g, " ")}:{" "}
                                  </span>
                                  {Array.isArray(v) ? v.join(", ") : String(v)}
                                </div>
                              ))}
                          </div>
                        )}

                        {/* Top MongoDB Tags */}
                        {product.top_tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {product.top_tags.slice(0, 3).map((t: string) => (
                              <span
                                key={t}
                                className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-lg font-extrabold text-slate-900">
                          ₹{product.price.toLocaleString("en-IN")}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          SQL Stock:{" "}
                          <strong
                            className={
                              product.stock_qty > 5
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }
                          >
                            {product.stock_qty} left
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            setSelectedProductId(product.product_id)
                          }
                          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
                        >
                          Reviews & Q&A
                        </button>
                        <button
                          disabled={product.stock_qty <= 0}
                          onClick={() => {
                            handleAddToCart(product);
                            showBanner(
                              "success",
                              `Added "${product.name}" to cart! PL/pgSQL function recalculated category discount.`
                            );
                          }}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-semibold shadow-sm transition inline-flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: CUSTOMER ORDERS & TRANSACTIONAL RECEIPTS */}
        {activeView === "orders" && (
          <div className="space-y-6">
            <div className="bg-slate-900 rounded-2xl p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-3 py-1 rounded-full border border-indigo-500/30 mb-2">
                  <Database className="w-3.5 h-3.5" />
                  PostgreSQL `Orders` • `Order_Items` • `Payments` (1:1)
                </div>
                <h1 className="text-2xl font-bold">
                  Transactional Order History & Payment Ledger
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Every order below was committed atomically in a single
                  PostgreSQL transaction (`BEGIN` → `Orders` → `Order_Items` →
                  `Products` Stock Trigger → `Payments` → `COMMIT`).
                </p>
              </div>
              <button
                onClick={() => setShowCartDrawer(true)}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0 transition"
              >
                Open Checkout Drawer ({totalCartItems} items)
              </button>
            </div>

            <div className="space-y-4">
              {orders.map((ord) => (
                <div
                  key={ord.order_id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <span className="text-slate-400 uppercase font-bold block text-[10px]">
                          Order ID
                        </span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          #{ord.order_id}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase font-bold block text-[10px]">
                          Customer
                        </span>
                        <span className="font-semibold text-slate-800">
                          {ord.customer_name}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase font-bold block text-[10px]">
                          Placed On
                        </span>
                        <span className="text-slate-700">
                          {new Date(ord.order_date).toLocaleDateString(
                            "en-IN",
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase font-bold block text-[10px]">
                          1:1 Payment Ref (`Payments`)
                        </span>
                        <span className="font-mono text-indigo-700 font-semibold">
                          {ord.transaction_ref} ({ord.payment_method?.toUpperCase()})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full font-bold uppercase text-[11px] ${
                          ord.status === "delivered"
                            ? "bg-emerald-100 text-emerald-800"
                            : ord.status === "shipped"
                            ? "bg-indigo-100 text-indigo-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {ord.status}
                      </span>
                      <div className="text-right">
                        <div className="text-base font-extrabold text-slate-900">
                          ₹{ord.total_amount.toLocaleString("en-IN")}
                        </div>
                        {ord.discount_amount > 0 && (
                          <div className="text-[11px] text-emerald-600 font-medium">
                            Saved ₹{ord.discount_amount.toLocaleString("en-IN")}{" "}
                            (PL/pgSQL Rule)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-5 divide-y divide-slate-100">
                    {(ord.items || []).map((item: any) => (
                      <div
                        key={item.order_item_id}
                        className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5">
                          <img
                            src={item.image_url}
                            alt={item.product_name}
                            className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                          />
                          <div>
                            <div
                              onClick={() =>
                                setSelectedProductId(item.product_id)
                              }
                              className="text-sm font-bold text-slate-900 hover:text-indigo-600 cursor-pointer"
                            >
                              {item.product_name}
                            </div>
                            <div className="text-xs text-slate-500">
                              {item.category_name} • Sold by {item.store_name} •
                              Qty: <strong>{item.qty}</strong> × ₹
                              {item.unit_price.toLocaleString("en-IN")}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => setSelectedProductId(item.product_id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition shrink-0"
                        >
                          Write MongoDB Review
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: SELLER STUDIO */}
        {activeView === "seller" && (
          <SellerDashboard
            currentUser={currentUser}
            products={products}
            categories={categories}
            orders={orders}
            onRefresh={refreshAllData}
            onSelectProduct={(id) => setSelectedProductId(id)}
          />
        )}

        {/* VIEW 4: ADMIN COMMAND CENTER */}
        {activeView === "admin" && (
          <AdminDashboard
            analyticsData={analyticsData}
            onRefresh={refreshAllData}
          />
        )}

        {/* VIEW 5: DBMS LIVE ARCHITECTURE LAB */}
        {activeView === "dbms_lab" && (
          <DbmsLabView
            analyticsData={analyticsData}
            onRefresh={refreshAllData}
          />
        )}
      </main>

      {/* TRANSACTIONAL CART & CHECKOUT DRAWER */}
      {showCartDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-indigo-400" />
                  ACID Transactional Checkout
                </h3>
                <p className="text-[11px] text-slate-400">
                  PostgreSQL `BEGIN ... COMMIT / ROLLBACK`
                </p>
              </div>
              <button
                onClick={() => setShowCartDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {cart.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  Your cart is empty. Add products from the catalog to test
                  transactional order placement!
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {cart.map((item) => (
                      <div
                        key={item.product_id}
                        className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 bg-slate-50/50"
                      >
                        <img
                          src={item.image_url}
                          alt={item.name}
                          className="w-12 h-12 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {item.name}
                          </div>
                          <div className="text-xs font-semibold text-indigo-600">
                            ₹{item.price.toLocaleString("en-IN")}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              handleUpdateCartQty(item.product_id, -1)
                            }
                            className="p-1 rounded bg-slate-200 hover:bg-slate-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-xs font-bold w-6 text-center">
                            {item.qty}
                          </span>
                          <button
                            onClick={() =>
                              handleUpdateCartQty(item.product_id, 1)
                            }
                            className="p-1 rounded bg-slate-200 hover:bg-slate-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* PL/pgSQL Stored Function Discount Calculation Box */}
                  <div className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-mono text-[11px] text-indigo-700 font-bold">
                      <span>PL/pgSQL: fn_calculate_order_total()</span>
                      <span>Live SQL Output</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal:</span>
                      <span className="font-semibold">
                        ₹{plpgsqlPreview.subtotal.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Category & Bundle Discount:</span>
                      <span>
                        -₹{plpgsqlPreview.discount.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 italic">
                      Rule: {plpgsqlPreview.discount_breakdown}
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-indigo-200">
                      <span>Final Total:</span>
                      <span>
                        ₹{plpgsqlPreview.final_total.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Payment & Shipping Inputs */}
                  <div className="space-y-3 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Payment Method (1:1 `Payments` Table)
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
                      >
                        <option value="upi">UPI Instant Pay</option>
                        <option value="credit_card">Credit / Debit Card</option>
                        <option value="net_banking">Net Banking</option>
                        <option value="wallet">ShopSphere Wallet</option>
                        <option value="cod">Cash on Delivery</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Shipping Address
                      </label>
                      <input
                        type="text"
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                    </div>

                    {/* Simulate Failure Checkbox for Viva Demonstration */}
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={simulateFailure}
                        onChange={(e) => setSimulateFailure(e.target.checked)}
                        className="mt-0.5 accent-amber-600"
                      />
                      <div>
                        <div className="font-bold text-amber-900">
                          Simulate Payment Failure (Test ACID Rollback)
                        </div>
                        <div className="text-[11px] text-amber-800">
                          When checked, the transaction aborts at step 4 and
                          rolls back stock deduction & order creation!
                        </div>
                      </div>
                    </label>
                  </div>
                </>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50">
              <button
                disabled={cart.length === 0 || placingOrder}
                onClick={handlePlaceOrder}
                className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-xs sm:text-sm shadow-md transition flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {placingOrder
                  ? "Executing PostgreSQL Transaction..."
                  : `Place Transactional Order (₹${plpgsqlPreview.final_total.toLocaleString(
                      "en-IN"
                    )})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JWT + BCRYPT AUTH MODAL */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-indigo-400" />
                <span className="text-sm font-bold">
                  JWT + bcrypt Role Authentication
                </span>
              </div>
              <button
                onClick={() => setShowAuthModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Quick Switch Accounts */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase text-slate-400">
                  1-Click Seeded Demo Accounts (Password: `password123`)
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {demoAccounts.map((acc) => (
                    <button
                      key={acc.user_id}
                      onClick={() => {
                        handleQuickRoleSwitch(acc);
                        setShowAuthModal(false);
                      }}
                      className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/40 text-left flex items-center justify-between transition"
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {acc.name}{" "}
                          {acc.store_name ? `(${acc.store_name})` : ""}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {acc.email}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {acc.role}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4">
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                      authMode === "login"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                      authMode === "register"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Register New User
                  </button>
                </div>

                {authError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-3">
                  {authMode === "register" && (
                    <>
                      <input
                        type="text"
                        required
                        placeholder="Full Name"
                        value={authName}
                        onChange={(e) => setAuthName(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                      />
                      <select
                        value={authRole}
                        onChange={(e) => setAuthRole(e.target.value as any)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
                      >
                        <option value="customer">Role: Customer</option>
                        <option value="seller">
                          Role: Seller (Creates 1:1 `Sellers` record)
                        </option>
                      </select>
                      {authRole === "seller" && (
                        <input
                          type="text"
                          required
                          placeholder="Official Seller Store Name"
                          value={authStoreName}
                          onChange={(e) => setAuthStoreName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                        />
                      )}
                    </>
                  )}
                  <input
                    type="email"
                    required
                    placeholder="Email Address"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <input
                    type="password"
                    required
                    placeholder="Password (hashed via bcrypt)"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                  >
                    {authMode === "login"
                      ? "Authenticate with bcrypt + JWT"
                      : "Register in PostgreSQL `Users`"}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PRODUCT DETAIL MODAL (PostgreSQL + MongoDB Unified View) */}
      <ProductDetailModal
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onAddToCart={handleAddToCart}
        onSelectProduct={(id) => setSelectedProductId(id)}
        currentUser={currentUser}
        onDataMutated={refreshAllData}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 px-4 sm:px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>ShopSphere</strong> — An E-Commerce Platform with
            Review-Driven Product Recommendations
          </div>
          <div>
            DBMS Experiential Learning (Level 3 Project) • PostgreSQL + MongoDB
            + Next.js App Router
          </div>
        </div>
      </footer>
    </div>
  );
}

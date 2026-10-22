# ShopSphere – An E-Commerce Platform with Review-Driven Product Recommendations

**Course:** DBMS Experiential Learning – Level 3 Project  
**Database Architecture:** Option 1 – Hybrid SQL (`PostgreSQL`) + NoSQL (`MongoDB`)  
**Tech Stack:** Next.js 14 (App Router + API Routes), TypeScript, Tailwind CSS, PostgreSQL, MongoDB, JWT + bcrypt Authentication

---

## 1. Architecture Overview

ShopSphere combines a **3NF normalized relational PostgreSQL backbone** for structured transactional data with a **flexible MongoDB document store** for unstructured, variable-format customer reviews, category-specific specifications, nested Q&A threads, and precomputed recommendation caches.

### 1.1 PostgreSQL Relational Schema (`database/postgresql_schema.sql`)
| Entity | Key Attributes | Constraints & Notes |
| :--- | :--- | :--- |
| **`Users`** | `user_id (PK)`, `name`, `email`, `password_hash`, `role` | `UNIQUE(email)`, `CHECK (role IN ('admin', 'seller', 'customer'))` |
| **`Sellers`** | `seller_id (PK, FK → Users)`, `store_name`, `verified` | 1:1 with `Users` where `role = 'seller'`, `ON DELETE RESTRICT` |
| **`Categories`** | `category_id (PK)`, `name`, `parent_category_id (FK)`, `discount_pct` | Self-referencing hierarchy (`parent_category_id → Categories`) |
| **`Products`** | `product_id (PK)`, `seller_id (FK)`, `name`, `price`, `category_id (FK)`, `stock_qty` | `CHECK (price > 0)`, `CHECK (stock_qty >= 0)`, B-Tree & GIN Full-Text Indexes |
| **`Orders`** | `order_id (PK)`, `customer_id (FK)`, `order_date`, `status`, `total_amount` | `CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled'))` |
| **`Order_Items`** | `order_item_id (PK)`, `order_id (FK)`, `product_id (FK)`, `qty`, `unit_price` | Composite B-Tree Index `(order_id, product_id)` for Co-Purchase Joins |
| **`Payments`** | `payment_id (PK)`, `order_id (UNIQUE FK)`, `amount`, `method`, `status` | 1:1 with `Orders` (`UNIQUE(order_id)`) |
| **`Inventory_Log`** | `log_id (PK)`, `product_id (FK)`, `change_qty`, `old_stock_qty`, `new_stock_qty`, `reason`, `timestamp` | Populated automatically via `AFTER UPDATE` Trigger on `Products.stock_qty` |

### 1.2 MongoDB Document Collections (`database/mongodb_setup.js`)
| Collection | Document Structure & Purpose |
| :--- | :--- |
| **`reviews`** | `{ review_id, product_id, customer_id, rating, review_text, sentiment_score, tags[], images[], helpful_votes, spec_ratings{} }` — Category-specific `spec_ratings` sub-documents |
| **`product_specs`** | `{ product_id, category_name, specs{}, highlights[], warranty_info }` — Polymorphic key-value specifications per category |
| **`qna`** | `{ question_id, product_id, question, answers[] }` — Variable-length nested `answers[]` arrays |
| **`recommendation_cache`** | `{ customer_id, strategy, generated_at, recommendations[] }` — Precomputed hybrid recommendations per customer |

---

## 2. Six Advanced Database Features Implemented

1. **ACID Transactions (`src/app/api/orders/route.ts`)**: Order placement wraps `fn_calculate_order_total()`, `Orders` creation, `Order_Items` insertion, `Products.stock_qty` deduction, and `Payments` insertion inside `BEGIN ... COMMIT / ROLLBACK`. If any item exceeds available stock (`CHECK (stock_qty >= 0)`), the entire transaction rolls back atomically.
2. **Triggers (`trg_products_stock_audit`)**: An `AFTER UPDATE OF stock_qty ON Products` PL/pgSQL trigger automatically computes `NEW.stock_qty - OLD.stock_qty` and inserts an audit trail row into `Inventory_Log`.
3. **Stored Functions (`fn_calculate_order_total`)**: A PL/pgSQL function calculates order subtotals and applies category-based discount rules (`Categories.discount_pct`) plus multi-unit bundle bonuses.
4. **Views (`sales_summary` & `seller_analytics_view`)**: Aggregates revenue, order counts, and units sold by category and month (`YYYY-MM`) for the Admin Dashboard.
5. **Indexing (B-Tree + GIN Full-Text Search)**:
   - `idx_products_category_price` on `Products(category_id, price)`
   - `idx_order_items_order_product` on `Order_Items(order_id, product_id)`
   - `idx_products_search_gin` using `GIN (to_tsvector('english', name || ' ' || description))`
6. **MongoDB Aggregation Pipeline (`runReviewAggregationPipeline`)**: Computes `avg_rating`, `helpfulMultiplier`, `sentiment_weighted_score`, `top_tags`, and category-specific `spec_rating_averages` from `reviews` to power recommendations.

---

## 3. Seeded Demo Accounts (Password: `password123`)

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Customer** | Aarav Sharma | `aarav@shopsphere.in` | `password123` |
| **Seller** | Rohan Verma (NovaTech Flagship Store) | `nova@shopsphere.in` | `password123` |
| **Seller** | Ananya Iyer (UrbanLoom & Smart Living) | `urban@shopsphere.in` | `password123` |
| **Admin** | Dr. Arjun Mehta | `admin@shopsphere.in` | `password123` |

---

## 4. Running Locally

```bash
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser.

-- ============================================================================
-- ShopSphere: Hybrid E-Commerce DBMS (PostgreSQL Relational Schema)
-- DBMS Experiential Learning - Level 3 Project
-- ============================================================================

-- 1. CORE RELATIONAL TABLES (3NF Normalized Schema)

CREATE TABLE IF NOT EXISTS Users (
    user_id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(180) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'seller', 'customer')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Sellers (
    seller_id INT PRIMARY KEY REFERENCES Users(user_id) ON DELETE RESTRICT,
    store_name VARCHAR(150) NOT NULL UNIQUE,
    store_description TEXT,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Categories (
    category_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    parent_category_id INT REFERENCES Categories(category_id) ON DELETE RESTRICT,
    discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 50),
    description TEXT
);

CREATE TABLE IF NOT EXISTS Products (
    product_id SERIAL PRIMARY KEY,
    seller_id INT NOT NULL REFERENCES Sellers(seller_id) ON DELETE RESTRICT,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    category_id INT NOT NULL REFERENCES Categories(category_id) ON DELETE RESTRICT,
    stock_qty INT NOT NULL CHECK (stock_qty >= 0),
    image_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES Users(user_id) ON DELETE RESTRICT,
    order_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(30) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    subtotal_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal_amount >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    shipping_address TEXT NOT NULL DEFAULT 'Bengaluru, Karnataka, India'
);

CREATE TABLE IF NOT EXISTS Order_Items (
    order_item_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES Orders(order_id) ON DELETE RESTRICT,
    product_id INT NOT NULL REFERENCES Products(product_id) ON DELETE RESTRICT,
    qty INT NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price > 0)
);

CREATE TABLE IF NOT EXISTS Payments (
    payment_id SERIAL PRIMARY KEY,
    order_id INT NOT NULL UNIQUE REFERENCES Orders(order_id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    method VARCHAR(30) NOT NULL CHECK (method IN ('credit_card', 'upi', 'net_banking', 'wallet', 'cod')),
    status VARCHAR(30) NOT NULL CHECK (status IN ('completed', 'pending', 'failed', 'refunded')),
    transaction_ref VARCHAR(100),
    paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Inventory_Log (
    log_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES Products(product_id) ON DELETE RESTRICT,
    change_qty INT NOT NULL,
    old_stock_qty INT,
    new_stock_qty INT,
    reason VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- 2. INDEXING (B-Tree, Composite, and Full-Text GIN Index)
-- ============================================================================

-- B-tree composite index on Products(category_id, price) for filtered catalog queries
CREATE INDEX IF NOT EXISTS idx_products_category_price
    ON Products(category_id, price);

-- B-tree index on Products(name)
CREATE INDEX IF NOT EXISTS idx_products_name
    ON Products(name);

-- Full-Text Search GIN Index on product name and description
CREATE INDEX IF NOT EXISTS idx_products_search_gin
    ON Products USING GIN (to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Composite index on Order_Items(order_id, product_id) for fast join & co-purchase lookup
CREATE INDEX IF NOT EXISTS idx_order_items_order_product
    ON Order_Items(order_id, product_id);

-- ============================================================================
-- 3. TRIGGERS (Automatic Inventory Audit Logging on Stock Changes)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_log_stock_change()
RETURNS TRIGGER AS $$
DECLARE
    v_diff INT;
    v_reason VARCHAR(255);
BEGIN
    IF OLD.stock_qty IS DISTINCT FROM NEW.stock_qty THEN
        v_diff := NEW.stock_qty - OLD.stock_qty;
        IF v_diff < 0 THEN
            v_reason := 'Order Placement / Stock Deduction (' || v_diff || ' units)';
        ELSE
            v_reason := 'Seller Restock / Inventory Adjustment (+' || v_diff || ' units)';
        END IF;

        INSERT INTO Inventory_Log (product_id, change_qty, old_stock_qty, new_stock_qty, reason, timestamp)
        VALUES (NEW.product_id, v_diff, OLD.stock_qty, NEW.stock_qty, v_reason, CURRENT_TIMESTAMP);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_stock_audit ON Products;

CREATE TRIGGER trg_products_stock_audit
AFTER UPDATE OF stock_qty ON Products
FOR EACH ROW
EXECUTE FUNCTION fn_log_stock_change();

-- ============================================================================
-- 4. STORED FUNCTIONS / PROCEDURES (PL/pgSQL Order Total & Category Discounts)
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_calculate_order_total(
    p_product_ids INT[],
    p_quantities INT[]
)
RETURNS TABLE (
    subtotal NUMERIC(10, 2),
    discount NUMERIC(10, 2),
    final_total NUMERIC(10, 2),
    discount_breakdown TEXT
) AS $$
DECLARE
    v_subtotal NUMERIC(10, 2) := 0.00;
    v_discount NUMERIC(10, 2) := 0.00;
    v_price NUMERIC(10, 2);
    v_disc_pct NUMERIC(5, 2);
    v_cat_name VARCHAR(100);
    v_line_total NUMERIC(10, 2);
    v_line_disc NUMERIC(10, 2);
    v_notes TEXT := '';
    i INT;
BEGIN
    FOR i IN 1 .. COALESCE(array_length(p_product_ids, 1), 0) LOOP
        SELECT p.price, COALESCE(c.discount_pct, 0), c.name
        INTO v_price, v_disc_pct, v_cat_name
        FROM Products p
        JOIN Categories c ON p.category_id = c.category_id
        WHERE p.product_id = p_product_ids[i];

        IF FOUND THEN
            v_line_total := v_price * p_quantities[i];
            v_subtotal := v_subtotal + v_line_total;

            -- Apply category-based discount rule + bulk tier bonus
            IF p_quantities[i] >= 2 AND v_disc_pct < 15 THEN
                v_disc_pct := v_disc_pct + 3.00; -- Multi-unit bundle bonus +3%
            END IF;

            v_line_disc := ROUND((v_line_total * v_disc_pct) / 100.0, 2);
            v_discount := v_discount + v_line_disc;

            IF v_line_disc > 0 THEN
                v_notes := v_notes || v_cat_name || ' (' || v_disc_pct || '% off: -Rs.' || v_line_disc || '); ';
            END IF;
        END IF;
    END LOOP;

    IF v_notes = '' THEN
        v_notes := 'Standard pricing applied';
    END IF;

    RETURN QUERY SELECT
        ROUND(v_subtotal, 2),
        ROUND(v_discount, 2),
        ROUND(GREATEST(v_subtotal - v_discount, 0.00), 2),
        v_notes;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. VIEWS (Admin Sales Summary by Category & Month + Seller Analytics View)
-- ============================================================================

CREATE OR REPLACE VIEW sales_summary AS
SELECT
    c.category_id,
    c.name AS category_name,
    COALESCE(pc.name, 'Root Category') AS parent_category_name,
    TO_CHAR(o.order_date, 'YYYY-MM') AS sales_month,
    COUNT(DISTINCT o.order_id) AS total_orders,
    SUM(oi.qty) AS total_units_sold,
    ROUND(SUM(oi.qty * oi.unit_price), 2) AS gross_revenue,
    ROUND(AVG(oi.qty * oi.unit_price), 2) AS avg_item_revenue
FROM Orders o
JOIN Order_Items oi ON o.order_id = oi.order_id
JOIN Products p ON oi.product_id = p.product_id
JOIN Categories c ON p.category_id = c.category_id
LEFT JOIN Categories pc ON c.parent_category_id = pc.category_id
WHERE o.status <> 'cancelled'
GROUP BY c.category_id, c.name, pc.name, TO_CHAR(o.order_date, 'YYYY-MM')
ORDER BY sales_month DESC, gross_revenue DESC;

CREATE OR REPLACE VIEW seller_analytics_view AS
SELECT
    s.seller_id,
    s.store_name,
    u.name AS owner_name,
    COUNT(DISTINCT p.product_id) AS listed_products,
    COALESCE(SUM(DISTINCT p.stock_qty), 0) AS total_available_stock,
    COUNT(DISTINCT oi.order_id) AS total_orders_fulfilled,
    COALESCE(SUM(oi.qty), 0) AS total_units_sold,
    COALESCE(ROUND(SUM(oi.qty * oi.unit_price), 2), 0.00) AS total_revenue
FROM Sellers s
JOIN Users u ON s.seller_id = u.user_id
LEFT JOIN Products p ON s.seller_id = p.seller_id
LEFT JOIN Order_Items oi ON p.product_id = oi.product_id
GROUP BY s.seller_id, s.store_name, u.name;

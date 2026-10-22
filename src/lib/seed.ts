import fs from "fs";
import path from "path";
import { pgExec, pgQuery } from "./postgres";
import {
  getMongoCollections,
  ProductSpecDocument,
  QnADocument,
  ReviewDocument,
} from "./mongodb";
import { hashPassword } from "./auth";
import { computeAndCacheRecommendations } from "./recommendations";

declare global {
  // eslint-disable-next-line no-var
  var __shopsphere_seeded: boolean | undefined;
  // eslint-disable-next-line no-var
  var __shopsphere_seeding_promise: Promise<void> | undefined;
}

export async function ensureSeeded(forceReset: boolean = false): Promise<void> {
  if (global.__shopsphere_seeded && !forceReset) {
    return;
  }

  if (global.__shopsphere_seeding_promise && !forceReset) {
    return global.__shopsphere_seeding_promise;
  }

  global.__shopsphere_seeding_promise = performSeed(forceReset);
  try {
    await global.__shopsphere_seeding_promise;
    global.__shopsphere_seeded = true;
  } finally {
    global.__shopsphere_seeding_promise = undefined;
  }
}

async function performSeed(forceReset: boolean): Promise<void> {
  const schemaPath = path.resolve(
    process.cwd(),
    "database/postgresql_schema.sql"
  );
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  if (forceReset) {
    await pgExec(`
      DROP VIEW IF EXISTS seller_analytics_view CASCADE;
      DROP VIEW IF EXISTS sales_summary CASCADE;
      DROP TABLE IF EXISTS Inventory_Log CASCADE;
      DROP TABLE IF EXISTS Payments CASCADE;
      DROP TABLE IF EXISTS Order_Items CASCADE;
      DROP TABLE IF EXISTS Orders CASCADE;
      DROP TABLE IF EXISTS Products CASCADE;
      DROP TABLE IF EXISTS Categories CASCADE;
      DROP TABLE IF EXISTS Sellers CASCADE;
      DROP TABLE IF EXISTS Users CASCADE;
    `);
  }

  // Execute DDL: Tables, Indexes (B-Tree + GIN), Triggers, Stored Functions, Views
  await pgExec(schemaSql);

  const countRes = await pgQuery<{ cnt: string }>(
    "SELECT COUNT(*) AS cnt FROM Users"
  );
  const existingUsers = Number(countRes.rows[0]?.cnt ?? 0);

  const { reviews, productSpecs, qna, recommendationCache } =
    await getMongoCollections();

  // Ensure MongoDB indexes
  await reviews.createIndex({ product_id: 1, created_at: -1 });
  await reviews.createIndex({ customer_id: 1 });
  await reviews.createIndex({ tags: 1 });
  await productSpecs.createIndex({ product_id: 1 }, { unique: true });
  await qna.createIndex({ product_id: 1 });
  await recommendationCache.createIndex({ customer_id: 1 }, { unique: true });

  if (existingUsers > 0 && !forceReset) {
    const mongoRevCount = await reviews.countDocuments();
    if (mongoRevCount > 0) {
      return;
    }
  }

  const defaultPasswordHash = await hashPassword("password123");

  if (existingUsers === 0) {
    // 1. Seed Users (Admin, Sellers, Customers)
    const users = [
      {
        name: "Dr. Arjun Mehta",
        email: "admin@shopsphere.in",
        role: "admin",
      },
      {
        name: "Rohan Verma",
        email: "nova@shopsphere.in",
        role: "seller",
      },
      {
        name: "Ananya Iyer",
        email: "urban@shopsphere.in",
        role: "seller",
      },
      {
        name: "Aarav Sharma",
        email: "aarav@shopsphere.in",
        role: "customer",
      },
      {
        name: "Priya Nair",
        email: "priya@shopsphere.in",
        role: "customer",
      },
      {
        name: "Kabir Patel",
        email: "kabir@shopsphere.in",
        role: "customer",
      },
    ];

    for (const u of users) {
      await pgQuery(
        `INSERT INTO Users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)`,
        [u.name, u.email, defaultPasswordHash, u.role]
      );
    }

    // 2. Seed Sellers (1:1 with Users where role='seller')
    await pgQuery(
      `INSERT INTO Sellers (seller_id, store_name, store_description, verified) VALUES
       (2, 'NovaTech Flagship Store', 'Authorized premier partner for high-performance laptops, creator displays, and wireless audio gear.', TRUE),
       (3, 'UrbanLoom & Smart Living', 'Curated performance activewear, ergonomic lifestyle accessories, and smart kitchen appliances.', TRUE)`
    );

    // 3. Seed Categories (Self-referencing hierarchy with category discount rules)
    await pgQuery(`
      INSERT INTO Categories (name, parent_category_id, discount_pct, description) VALUES
      ('Electronics', NULL, 5.00, 'Root category for computing, audio, and personal electronics'),
      ('Fashion & Apparel', NULL, 5.00, 'Root category for clothing, footwear, and travel gear'),
      ('Home & Smart Living', NULL, 6.00, 'Root category for modern home and kitchen appliances'),
      ('Laptops & Computing', 1, 8.00, 'Ultrabooks, mechanical keyboards, and 4K creator monitors'),
      ('Audio & Wearables', 1, 10.00, 'Active noise-cancelling headphones and AMOLED smartwatches'),
      ('Performance Footwear & Apparel', 2, 12.00, 'Carbon-plated running shoes and breathable merino apparel'),
      ('Smart Kitchen & Coffee', 3, 8.00, 'Barista espresso systems and adaptive workspace lighting');
    `);

    // 4. Seed Products
    const productsData = [
      {
        seller_id: 2,
        name: "ProBook Ultra 14 OLED Creator Laptop",
        description:
          "14-inch 2.8K 120Hz OLED display, Intel Core Ultra 7 processor, 32GB LPDDR5X RAM, 1TB NVMe Gen4 SSD, all-aluminum CNC chassis with 16-hour battery life.",
        price: 78999.0,
        category_id: 4,
        stock_qty: 18,
        image_url:
          "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 2,
        name: "AeroPulse Pro ANC Wireless Headphones",
        description:
          "Hybrid 48dB Active Noise Cancellation, spatial audio with LDAC hi-res codec, plush memory foam earcups, and 45-hour battery life with USB-C fast charge.",
        price: 14499.0,
        category_id: 5,
        stock_qty: 30,
        image_url:
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 2,
        name: "ChronoFit Titanium AMOLED Smart Watch",
        description:
          "Sapphire crystal 1.5-inch LTPO AMOLED display, dual-band GPS, ECG & SpO2 biometric sensors, 5ATM water resistance, and 10-day battery endurance.",
        price: 8999.0,
        category_id: 5,
        stock_qty: 25,
        image_url:
          "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 2,
        name: "KeyChronos Q1 Gasket Mechanical Keyboard",
        description:
          "Hot-swappable tactile mechanical switches, gasket-mounted CNC aluminum body, PBT double-shot keycaps, QMK/VIA programmable rotary knob, tri-mode wireless.",
        price: 6499.0,
        category_id: 4,
        stock_qty: 22,
        image_url:
          "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 3,
        name: "CloudStride Carbon Marathon Running Shoes",
        description:
          "Full-length carbon fiber propulsion plate, dual-density supercritical PEBA foam midsole, engineered breathable mesh upper for road racing and daily training.",
        price: 5299.0,
        category_id: 6,
        stock_qty: 35,
        image_url:
          "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 3,
        name: "MerinoWeave Breathable Performance Tee",
        description:
          "Ultrafine Australian Merino wool & organic bamboo blend, natural odor resistance, moisture-wicking flatlock seams for travel and athletic versatility.",
        price: 1899.0,
        category_id: 6,
        stock_qty: 48,
        image_url:
          "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 3,
        name: "NordicBrew 15-Bar Barista Espresso Machine",
        description:
          "PID temperature-controlled thermoblock boiler, 15-bar Italian pump, integrated conical burr grinder with 30 grind settings, and commercial steam wand.",
        price: 18999.0,
        category_id: 7,
        stock_qty: 12,
        image_url:
          "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 3,
        name: "LumiDesk Architect Adaptive LED Monitor Bar",
        description:
          "Asymmetric optical design eliminates screen glare, wireless puck controller, CRI 98 eye-care LED array with auto-dimming ambient light sensor.",
        price: 3499.0,
        category_id: 7,
        stock_qty: 28,
        image_url:
          "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 2,
        name: "PixelView 27-Inch 4K UHD ColorPro Monitor",
        description:
          "Factory-calibrated 99% DCI-P3 IPS Black panel, 90W USB-C single-cable power delivery, KVM switch, ergonomic height/pivot stand for developers and creators.",
        price: 29999.0,
        category_id: 4,
        stock_qty: 14,
        image_url:
          "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=80",
      },
      {
        seller_id: 3,
        name: "UrbanShield 24L Weatherproof Tech Backpack",
        description:
          "Ballistic Cordura nylon with YKK AquaGuard zippers, suspended 16-inch laptop compartment, magnetic sternum strap, and hidden RFID passport pocket.",
        price: 4199.0,
        category_id: 2,
        stock_qty: 20,
        image_url:
          "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
      },
    ];

    for (const p of productsData) {
      await pgQuery(
        `INSERT INTO Products (seller_id, name, description, price, category_id, stock_qty, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          p.seller_id,
          p.name,
          p.description,
          p.price,
          p.category_id,
          p.stock_qty,
          p.image_url,
        ]
      );
    }

    // 5. Seed Historical Orders, Order_Items, Payments, and trigger Inventory_Log!
    const seedOrders = [
      {
        customer_id: 4, // Aarav Sharma
        order_date: "2026-08-14 11:20:00",
        status: "delivered",
        method: "upi",
        address: "Indiranagar, Bengaluru, Karnataka 560038",
        items: [
          { product_id: 1, qty: 1, unit_price: 78999 },
          { product_id: 4, qty: 1, unit_price: 6499 },
          { product_id: 9, qty: 1, unit_price: 29999 },
        ],
      },
      {
        customer_id: 5, // Priya Nair
        order_date: "2026-08-26 16:45:00",
        status: "delivered",
        method: "credit_card",
        address: "Koramangala 4th Block, Bengaluru, Karnataka 560034",
        items: [
          { product_id: 2, qty: 1, unit_price: 14499 },
          { product_id: 3, qty: 1, unit_price: 8999 },
        ],
      },
      {
        customer_id: 6, // Kabir Patel
        order_date: "2026-09-08 09:15:00",
        status: "delivered",
        method: "net_banking",
        address: "HSR Layout Sector 2, Bengaluru, Karnataka 560102",
        items: [
          { product_id: 5, qty: 1, unit_price: 5299 },
          { product_id: 6, qty: 2, unit_price: 1899 },
        ],
      },
      {
        customer_id: 4, // Aarav Sharma
        order_date: "2026-09-21 19:30:00",
        status: "delivered",
        method: "upi",
        address: "Indiranagar, Bengaluru, Karnataka 560038",
        items: [
          { product_id: 7, qty: 1, unit_price: 18999 },
          { product_id: 8, qty: 1, unit_price: 3499 },
        ],
      },
      {
        customer_id: 5, // Priya Nair
        order_date: "2026-10-04 14:10:00",
        status: "delivered",
        method: "credit_card",
        address: "Koramangala 4th Block, Bengaluru, Karnataka 560034",
        items: [
          { product_id: 1, qty: 1, unit_price: 78999 },
          { product_id: 8, qty: 1, unit_price: 3499 },
          { product_id: 10, qty: 1, unit_price: 4199 },
        ],
      },
      {
        customer_id: 6, // Kabir Patel
        order_date: "2026-10-12 18:05:00",
        status: "shipped",
        method: "upi",
        address: "HSR Layout Sector 2, Bengaluru, Karnataka 560102",
        items: [
          { product_id: 4, qty: 1, unit_price: 6499 },
          { product_id: 9, qty: 1, unit_price: 29999 },
        ],
      },
      {
        customer_id: 4, // Aarav Sharma
        order_date: "2026-10-19 10:50:00",
        status: "confirmed",
        method: "wallet",
        address: "Indiranagar, Bengaluru, Karnataka 560038",
        items: [
          { product_id: 2, qty: 1, unit_price: 14499 },
          { product_id: 10, qty: 1, unit_price: 4199 },
        ],
      },
    ];

    for (let idx = 0; idx < seedOrders.length; idx++) {
      const ord = seedOrders[idx];
      const pIds = ord.items.map((i) => i.product_id);
      const qtys = ord.items.map((i) => i.qty);

      // Call our PL/pgSQL Stored Function fn_calculate_order_total!
      const calcRes = await pgQuery<{
        subtotal: string;
        discount: string;
        final_total: string;
      }>(`SELECT * FROM fn_calculate_order_total($1::int[], $2::int[])`, [
        pIds,
        qtys,
      ]);

      const { subtotal, discount, final_total } = calcRes.rows[0];

      const orderInsert = await pgQuery<{ order_id: number }>(
        `INSERT INTO Orders (customer_id, order_date, status, subtotal_amount, discount_amount, total_amount, shipping_address)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING order_id`,
        [
          ord.customer_id,
          ord.order_date,
          ord.status,
          subtotal,
          discount,
          final_total,
          ord.address,
        ]
      );
      const orderId = orderInsert.rows[0].order_id;

      for (const item of ord.items) {
        await pgQuery(
          `INSERT INTO Order_Items (order_id, product_id, qty, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, item.product_id, item.qty, item.unit_price]
        );

        // Deduct stock_qty -> This automatically fires `trg_products_stock_audit` into `Inventory_Log`!
        await pgQuery(
          `UPDATE Products SET stock_qty = stock_qty - $1 WHERE product_id = $2`,
          [item.qty, item.product_id]
        );
      }

      await pgQuery(
        `INSERT INTO Payments (order_id, amount, method, status, transaction_ref, paid_at)
         VALUES ($1, $2, $3, 'completed', $4, $5)`,
        [
          orderId,
          final_total,
          ord.method,
          `TXN-SS-2026-00${idx + 1}`,
          ord.order_date,
        ]
      );
    }
  }

  // ==========================================================================
  // 6. SEED MONGODB COLLECTIONS (reviews, product_specs, qna, recommendation_cache)
  // ==========================================================================
  if (forceReset) {
    await reviews.deleteMany({});
    await productSpecs.deleteMany({});
    await qna.deleteMany({});
    await recommendationCache.deleteMany({});
  }

  const existingSpecs = await productSpecs.countDocuments();
  if (existingSpecs === 0) {
    const specsDocs: ProductSpecDocument[] = [
      {
        product_id: 1,
        category_name: "Laptops & Computing",
        specs: {
          processor: "Intel Core Ultra 7 155H (16 Cores, up to 4.8 GHz)",
          graphics: "Intel Arc Integrated Ray-Tracing GPU + NPU",
          memory_ram: "32 GB LPDDR5X 7467MHz Dual-Channel",
          storage: "1 TB PCIe Gen4 NVMe M.2 SSD",
          display_panel: "14.0-inch 2.8K (2880x1800) OLED 120Hz, 600 nits HDR",
          battery_capacity: "75 Wh Li-Polymer (Up to 16 hrs)",
          ports: ["2x Thunderbolt 4", "1x HDMI 2.1", "1x USB-A 3.2", "3.5mm Audio"],
          weight_kg: 1.28,
        },
        highlights: [
          "Pantone Validated 100% DCI-P3 OLED Panel",
          "Dedicated AI Neural Processing Unit (NPU)",
          "Military-grade MIL-STD-810H CNC Aluminum body",
        ],
        warranty_info: "2 Years Onsite Domestic & International Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 2,
        category_name: "Audio & Wearables",
        specs: {
          driver_size_mm: 40,
          noise_cancellation: "Hybrid 6-Mic Adaptive ANC (Up to 48dB)",
          bluetooth_version: "Bluetooth 5.4 Multipoint (2 Devices)",
          supported_codecs: ["LDAC", "AAC", "SBC"],
          battery_life_anc_on: "45 Hours (60 Hours ANC Off)",
          fast_charging: "5 Mins Charge = 6 Hours Playback",
          weight_grams: 254,
        },
        highlights: [
          "Hi-Res Audio Wireless Certified with LDAC",
          "Transparency & Conversation Awareness Mode",
          "Plush Protein Leather Ear Cushions",
        ],
        warranty_info: "1 Year Manufacturer Replacement Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 3,
        category_name: "Audio & Wearables",
        specs: {
          case_material: "Grade 5 Aerospace Titanium Bezel + Sapphire Glass",
          display: "1.5-inch LTPO AMOLED Always-On (2000 nits peak)",
          biometric_sensors: ["Optical Heart Rate", "ECG", "Blood Oxygen SpO2", "Skin Temp"],
          gps_system: "Dual-Frequency L1+L5 GNSS",
          water_resistance: "5 ATM + IP68 (Swimproof)",
          battery_endurance_days: 10,
        },
        highlights: [
          "Offline Topographic Maps & Route Backtracking",
          "100+ Workout Modes with VO2 Max Recovery Score",
          "iOS & Android Companion App Sync",
        ],
        warranty_info: "1 Year Comprehensive Smart Wearable Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 4,
        category_name: "Laptops & Computing",
        specs: {
          layout: "75% Compact (82 Keys + Programmable Metal Knob)",
          mounting_style: "Double-Gasket Mount with Poron Foam Layers",
          switch_type: "Pre-lubed Tactile Gateron Jupiter Banana (Hot-Swappable)",
          connectivity: ["2.4GHz Wireless (1000Hz)", "Bluetooth 5.1", "USB-C Wired"],
          keycaps: "Double-Shot PBT OSA Profile",
          firmware_support: "Open-source QMK & VIA Web Configurator",
        },
        highlights: [
          "Full CNC Machined 6063 Aluminum Frame",
          "South-facing Per-Key RGB Backlight",
          "Hardware Mac / Windows Toggle Switch",
        ],
        warranty_info: "1 Year NovaTech Peripheral Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 5,
        category_name: "Performance Footwear & Apparel",
        specs: {
          midsole_compound: "Dual-Layer Supercritical Nitrogen-Infused PEBA Foam",
          propulsion_plate: "Full-Length Spoon-Shaped Carbon Fiber Plate",
          heel_to_toe_drop_mm: 8,
          stack_height: "39.5mm Heel / 31.5mm Forefoot (World Athletics Legal)",
          upper_material: "Recycled Monofilament Engineered Jacquard Mesh",
          available_sizes_uk: ["UK 7", "UK 8", "UK 9", "UK 10", "UK 11"],
          weight_grams_uk8: 198,
        },
        highlights: [
          "85% Energy Return for Marathon & Tempo Runs",
          "High-Abrasion Continental Grip Outsole",
          "Breathable Lockdown Gusseted Tongue",
        ],
        warranty_info: "6 Months Sole Integrity Guarantee",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 6,
        category_name: "Performance Footwear & Apparel",
        specs: {
          fabric_composition: "65% Ultrafine 17.5-Micron Merino Wool, 35% Bamboo Lyocell",
          fabric_weight_gsm: 165,
          fit_profile: "Relaxed Athletic Fit",
          care_instructions: ["Cold Machine Wash", "Lay Flat to Dry", "Do Not Bleach"],
          available_sizes: ["S", "M", "L", "XL"],
          uv_protection: "UPF 40+ Natural Sun Protection",
        },
        highlights: [
          "Naturally Anti-Microbial & Multi-Day Odor Resistant",
          "Thermoregulating in Both Warm & Cool Climates",
          "Chafe-Free Flatlock Shoulder Seams",
        ],
        warranty_info: "30-Day Fit & Quality Assurance",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 7,
        category_name: "Smart Kitchen & Coffee",
        specs: {
          pump_pressure: "15-Bar ULKA Italian Electromagnetic Pump",
          heating_system: "Digital PID ThermoCoil (93°C Precision Extraction)",
          integrated_grinder: "Stainless Steel Conical Burr (30 Micro-Settings)",
          water_tank_capacity_liters: 2.3,
          portafilter_size_mm: 58,
          power_rating_watts: 1650,
        },
        highlights: [
          "Low-Pressure Pre-Infusion for Balanced Crema",
          "Commercial 360° Cool-Touch Microfoam Steam Wand",
          "Includes Stainless Milk Pitcher & Calibrated Tamper",
        ],
        warranty_info: "2 Years Appliance Motor & Heater Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 8,
        category_name: "Smart Kitchen & Coffee",
        specs: {
          color_rendering_index: "Ra 98 Full-Spectrum Sunlike LED",
          color_temperature_range: "2700K Warm White to 6500K Daylight",
          illuminance_lux: "1100 Lux Center Desk Illumination",
          control_interface: "2.4GHz Wireless Aluminum Rotary Dial",
          power_input: "USB-C 5V/2A (Fits Curved & Flat Monitors)",
        },
        highlights: [
          "Zero Screen Glare Asymmetric Optical Lens",
          "Real-Time Ultrasonic Ambient Light Auto-Dimming",
          "Dual Front + Back Bias RGB Backlight",
        ],
        warranty_info: "1 Year Replacement Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 9,
        category_name: "Laptops & Computing",
        specs: {
          panel_type: "27-inch 4K UHD (3840x2160) IPS Black (2000:1 Contrast)",
          color_gamut: "99% DCI-P3, 100% sRGB, Factory Calibrated Delta E < 1.5",
          usb_c_hub: "90W Power Delivery + DisplayPort Alt Mode + 4x USB 3.2",
          ergonomics: "Height (150mm), Tilt, Swivel, 90° Portrait Pivot",
          built_in_kvm: true,
        },
        highlights: [
          "Single USB-C Cable Docking for MacBooks & Ultrabooks",
          "Hardware KVM Switch for Dual-PC Workflows",
          "TUV Rheinland Hardware Low Blue Light Certified",
        ],
        warranty_info: "3 Years Zero-Bright-Dot Panel Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
      {
        product_id: 10,
        category_name: "Fashion & Apparel",
        specs: {
          capacity_liters: 24,
          exterior_fabric: "840D Ballistic Cordura Nylon with DWR Coating",
          zippers: "YKK AquaGuard Waterproof Zippers",
          laptop_compartment: "Suspended False-Bottom Fits up to 16-inch Laptop",
          dimensions_cm: "47 x 30 x 18 cm",
          luggage_passthrough: true,
        },
        highlights: [
          "Fidlock Magnetic Quick-Release Sternum Strap",
          "Quick-Access Microfiber Lined Sunglass & Tech Caddy",
          "Ergonomic Airflow EVA Molded Back Panel",
        ],
        warranty_info: "Lifetime Seam & Zipper Warranty",
        updated_at: "2026-10-01T10:00:00Z",
      },
    ];

    await productSpecs.insertMany(specsDocs);
  }

  const existingReviews = await reviews.countDocuments();
  if (existingReviews === 0) {
    const initialReviews: ReviewDocument[] = [
      {
        review_id: "REV-101",
        product_id: 1,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        rating: 5,
        review_text:
          "The 2.8K 120Hz OLED display is breathtaking for coding and DaVinci Resolve color grading. Battery easily lasts 13+ hours on Wi-Fi, and Docker containers compile effortlessly on 32GB RAM.",
        sentiment_score: 0.96,
        tags: ["oled", "battery-life", "creator", "fast-performance", "ultrabook"],
        images: [
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=600&q=80",
        ],
        helpful_votes: 18,
        verified_purchase: true,
        spec_ratings: {
          display_quality: 5,
          battery_life: 5,
          performance: 5,
          thermals: 4.5,
        },
        created_at: "2026-08-20T14:22:00Z",
      },
      {
        review_id: "REV-102",
        product_id: 1,
        customer_id: 5,
        customer_name: "Priya Nair",
        rating: 5,
        review_text:
          "Switched from a heavier workstation to the ProBook Ultra 14. Paired it with the PixelView 4K monitor via a single Thunderbolt cable. Zero fan noise during normal dev work!",
        sentiment_score: 0.94,
        tags: ["oled", "lightweight", "thunderbolt", "creator", "silent"],
        images: [],
        helpful_votes: 12,
        verified_purchase: true,
        spec_ratings: {
          display_quality: 5,
          battery_life: 4.8,
          performance: 5,
          thermals: 5,
        },
        created_at: "2026-10-07T09:15:00Z",
      },
      {
        review_id: "REV-103",
        product_id: 2,
        customer_id: 5,
        customer_name: "Priya Nair",
        rating: 5,
        review_text:
          "AeroPulse Pro blocks out Bangalore traffic and café chatter completely. LDAC audio clarity is rich and warm, and multipoint switching between my laptop and phone is instant.",
        sentiment_score: 0.95,
        tags: ["anc", "audiophile", "battery-life", "comfort", "wireless"],
        images: [],
        helpful_votes: 15,
        verified_purchase: true,
        spec_ratings: {
          noise_cancellation: 5,
          sound_stage: 4.8,
          comfort: 5,
          battery_life: 5,
        },
        created_at: "2026-09-02T11:30:00Z",
      },
      {
        review_id: "REV-104",
        product_id: 2,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        rating: 4,
        review_text:
          "Super comfortable earcups even with glasses on for 4-hour coding sprints. Bass is punchy without muddying vocals.",
        sentiment_score: 0.84,
        tags: ["anc", "comfort", "deep-focus", "wireless"],
        images: [],
        helpful_votes: 7,
        verified_purchase: true,
        spec_ratings: {
          noise_cancellation: 4.5,
          sound_stage: 4.2,
          comfort: 5,
          battery_life: 4.8,
        },
        created_at: "2026-10-20T17:40:00Z",
      },
      {
        review_id: "REV-105",
        product_id: 3,
        customer_id: 5,
        customer_name: "Priya Nair",
        rating: 5,
        review_text:
          "Dual-band GPS locks in under 3 seconds at Cubbon Park. The titanium bezel looks super premium and I only charge it once every 9 days!",
        sentiment_score: 0.92,
        tags: ["fitness", "battery-life", "amoled", "gps-accuracy"],
        images: [],
        helpful_votes: 11,
        verified_purchase: true,
        spec_ratings: {
          gps_accuracy: 5,
          battery_life: 5,
          display_brightness: 5,
          sleep_tracking: 4.6,
        },
        created_at: "2026-09-05T08:10:00Z",
      },
      {
        review_id: "REV-106",
        product_id: 4,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        rating: 5,
        review_text:
          "Out-of-the-box thocky acoustics! The gasket mount and factory-lubed tactile switches make typing SQL queries and React code an absolute joy.",
        sentiment_score: 0.97,
        tags: ["mechanical", "thocky", "developer", "ergonomic", "creator"],
        images: [],
        helpful_votes: 21,
        verified_purchase: true,
        spec_ratings: {
          typing_feel: 5,
          acoustics: 5,
          build_quality: 5,
          wireless_latency: 4.8,
        },
        created_at: "2026-08-22T20:05:00Z",
      },
      {
        review_id: "REV-107",
        product_id: 4,
        customer_id: 6,
        customer_name: "Kabir Patel",
        rating: 5,
        review_text:
          "VIA web remapping worked immediately in Chrome without installing bloated software. Solid aluminum heft stays planted on the desk.",
        sentiment_score: 0.91,
        tags: ["mechanical", "developer", "qmk-via", "build-quality"],
        images: [],
        helpful_votes: 9,
        verified_purchase: true,
        spec_ratings: {
          typing_feel: 5,
          acoustics: 4.8,
          build_quality: 5,
          wireless_latency: 5,
        },
        created_at: "2026-10-15T13:12:00Z",
      },
      {
        review_id: "REV-108",
        product_id: 5,
        customer_id: 6,
        customer_name: "Kabir Patel",
        rating: 5,
        review_text:
          "Shaved 4 minutes off my half-marathon PB! The PEBA foam and carbon plate give a noticeable forward roll at tempo paces while keeping my calves fresh.",
        sentiment_score: 0.95,
        tags: ["marathon", "carbon-plate", "lightweight", "fitness", "breathable"],
        images: [],
        helpful_votes: 14,
        verified_purchase: true,
        spec_ratings: {
          cushioning: 5,
          energy_return: 5,
          fit_true_to_size: 4.8,
          grip: 4.9,
        },
        created_at: "2026-09-14T07:30:00Z",
      },
      {
        review_id: "REV-109",
        product_id: 6,
        customer_id: 6,
        customer_name: "Kabir Patel",
        rating: 4,
        review_text:
          "Incredibly soft merino-bamboo weave. Zero itchiness and stays completely odor-free after morning runs and travel.",
        sentiment_score: 0.87,
        tags: ["breathable", "merino", "travel", "fitness"],
        images: [],
        helpful_votes: 6,
        verified_purchase: true,
        spec_ratings: {
          fabric_softness: 5,
          breathability: 5,
          fit: 4.5,
          durability: 4.5,
        },
        created_at: "2026-09-15T10:45:00Z",
      },
      {
        review_id: "REV-110",
        product_id: 7,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        rating: 5,
        review_text:
          "Pulls cafe-quality espresso shots with thick tiger-striped crema every single morning. The built-in conical burr grinder and PID temperature stability are spot on.",
        sentiment_score: 0.96,
        tags: ["espresso", "barista", "home-cafe", "deep-focus"],
        images: [],
        helpful_votes: 16,
        verified_purchase: true,
        spec_ratings: {
          extraction_quality: 5,
          grinder_consistency: 4.8,
          steam_power: 4.9,
          ease_of_cleaning: 4.7,
        },
        created_at: "2026-09-28T08:50:00Z",
      },
      {
        review_id: "REV-111",
        product_id: 8,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        rating: 5,
        review_text:
          "Mounts cleanly on top of my 27-inch monitor without touching the bezel. The wireless puck dial on the desk feels futuristic and reduces late-night eye strain.",
        sentiment_score: 0.93,
        tags: ["ergonomic", "developer", "eye-care", "creator", "deep-focus"],
        images: [],
        helpful_votes: 10,
        verified_purchase: true,
        spec_ratings: {
          brightness: 5,
          glare_control: 5,
          build_quality: 4.8,
        },
        created_at: "2026-09-29T21:15:00Z",
      },
      {
        review_id: "REV-112",
        product_id: 9,
        customer_id: 6,
        customer_name: "Kabir Patel",
        rating: 5,
        review_text:
          "IPS Black contrast makes dark-mode IDEs look almost like OLED without any burn-in worry. Single USB-C cable charges my laptop at 90W and connects my keyboard.",
        sentiment_score: 0.95,
        tags: ["creator", "developer", "4k-monitor", "thunderbolt", "ergonomic"],
        images: [],
        helpful_votes: 19,
        verified_purchase: true,
        spec_ratings: {
          color_accuracy: 5,
          contrast_ratio: 4.9,
          usb_c_hub: 5,
          stand_ergonomics: 5,
        },
        created_at: "2026-10-16T15:30:00Z",
      },
      {
        review_id: "REV-113",
        product_id: 10,
        customer_id: 5,
        customer_name: "Priya Nair",
        rating: 5,
        review_text:
          "Survived a heavy monsoon downpour on my commute with my laptop and camera bone dry inside. The magnetic sternum strap and pocket layout are super thoughtful.",
        sentiment_score: 0.92,
        tags: ["travel", "waterproof", "ergonomic", "ultrabook"],
        images: [],
        helpful_votes: 8,
        verified_purchase: true,
        spec_ratings: {
          weatherproofing: 5,
          laptop_protection: 5,
          comfort: 4.8,
          organization: 4.9,
        },
        created_at: "2026-10-09T18:20:00Z",
      },
    ];

    await reviews.insertMany(initialReviews);
  }

  const existingQna = await qna.countDocuments();
  if (existingQna === 0) {
    const qnaDocs: QnADocument[] = [
      {
        question_id: "QNA-201",
        product_id: 1,
        customer_id: 6,
        customer_name: "Kabir Patel",
        question:
          "Does the Linux kernel (Ubuntu 24.04 / Fedora) support the OLED fractional scaling, Wi-Fi 7, and suspend-to-RAM out of the box?",
        created_at: "2026-09-10T11:00:00Z",
        answers: [
          {
            answer_id: "ANS-301",
            responder_id: 2,
            responder_name: "NovaTech Flagship Store (Official Seller)",
            responder_role: "seller",
            answer_text:
              "Yes! The ProBook Ultra 14 uses standard Intel AX211/BE200 wireless and S0ix modern standby supported natively in Linux Kernel 6.8+. Both Ubuntu 24.04 LTS and Fedora 40 work out of the box.",
            is_seller_response: true,
            helpful_count: 14,
            answered_at: "2026-09-10T13:20:00Z",
          },
          {
            answer_id: "ANS-302",
            responder_id: 4,
            responder_name: "Aarav Sharma",
            responder_role: "customer",
            answer_text:
              "I dual-boot Arch Linux and Windows 11 on mine. 150% fractional scaling in Wayland looks razor sharp on the 2.8K OLED panel.",
            is_seller_response: false,
            helpful_count: 9,
            answered_at: "2026-09-11T09:45:00Z",
          },
        ],
      },
      {
        question_id: "QNA-202",
        product_id: 4,
        customer_id: 5,
        customer_name: "Priya Nair",
        question:
          "Does the box include Mac Command / Option keycaps as well as a switch puller?",
        created_at: "2026-09-18T15:30:00Z",
        answers: [
          {
            answer_id: "ANS-303",
            responder_id: 2,
            responder_name: "NovaTech Flagship Store (Official Seller)",
            responder_role: "seller",
            answer_text:
              "Absolutely! Inside the box you get dedicated macOS (Cmd/Opt) and Windows keycaps, a braided USB-C coiled cable, a 2.4GHz dongle, and a combination keycap/switch puller.",
            is_seller_response: true,
            helpful_count: 11,
            answered_at: "2026-09-18T16:10:00Z",
          },
        ],
      },
      {
        question_id: "QNA-203",
        product_id: 7,
        customer_id: 5,
        customer_name: "Priya Nair",
        question:
          "Can the steam wand texture oat milk and almond milk for latte art, and is the burr grinder removable for cleaning?",
        created_at: "2026-10-02T10:15:00Z",
        answers: [
          {
            answer_id: "ANS-304",
            responder_id: 3,
            responder_name: "UrbanLoom & Smart Living (Official Seller)",
            responder_role: "seller",
            answer_text:
              "Yes! The commercial single-hole steam tip creates vortex microfoam with both dairy and barista oat milk. The upper conical burr unlocks with a quarter-turn for brush cleaning without tools.",
            is_seller_response: true,
            helpful_count: 8,
            answered_at: "2026-10-02T12:00:00Z",
          },
        ],
      },
      {
        question_id: "QNA-204",
        product_id: 5,
        customer_id: 4,
        customer_name: "Aarav Sharma",
        question:
          "Should I go true-to-size or half a size up for full marathon distances?",
        created_at: "2026-10-05T17:40:00Z",
        answers: [
          {
            answer_id: "ANS-305",
            responder_id: 6,
            responder_name: "Kabir Patel",
            responder_role: "customer",
            answer_text:
              "The forefoot has a generous anatomical toe box, so true-to-size (UK 9 for me) worked great with running socks even past 25 km.",
            is_seller_response: false,
            helpful_count: 6,
            answered_at: "2026-10-06T08:15:00Z",
          },
        ],
      },
    ];

    await qna.insertMany(qnaDocs);
  }

  // Precompute recommendation cache for Guest (0) and seeded Customers (4, 5, 6)
  await computeAndCacheRecommendations(0, true);
  await computeAndCacheRecommendations(4, true);
  await computeAndCacheRecommendations(5, true);
  await computeAndCacheRecommendations(6, true);
}

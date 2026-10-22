import { NextRequest, NextResponse } from "next/server";
import { ensureSeeded } from "@/lib/seed";
import { pgQuery, pgTransaction } from "@/lib/postgres";
import {
  getUserFromRequest,
  hashPassword,
  JwtUserPayload,
  signToken,
  verifyPassword,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const currentUser = getUserFromRequest(req);

    // Fetch demo accounts for quick 1-click evaluation switching
    const demoUsersRes = await pgQuery<{
      user_id: number;
      name: string;
      email: string;
      role: "admin" | "seller" | "customer";
      store_name: string | null;
    }>(`
      SELECT u.user_id, u.name, u.email, u.role, s.store_name
      FROM Users u
      LEFT JOIN Sellers s ON u.user_id = s.seller_id
      ORDER BY u.user_id ASC
    `);

    return NextResponse.json({
      user: currentUser,
      demoAccounts: demoUsersRes.rows,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Auth check failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const body = await req.json();
    const { action } = body;

    if (action === "logout") {
      const res = NextResponse.json({ message: "Logged out" });
      res.cookies.delete("shopsphere_token");
      return res;
    }

    if (action === "login" || action === "quick_switch") {
      const { email, password } = body;
      if (!email) {
        return NextResponse.json(
          { error: "Email is required" },
          { status: 400 }
        );
      }

      const userRes = await pgQuery<{
        user_id: number;
        name: string;
        email: string;
        password_hash: string;
        role: "admin" | "seller" | "customer";
        store_name: string | null;
      }>(
        `
        SELECT u.user_id, u.name, u.email, u.password_hash, u.role, s.store_name
        FROM Users u
        LEFT JOIN Sellers s ON u.user_id = s.seller_id
        WHERE LOWER(u.email) = LOWER($1)
        `,
        [email.trim()]
      );

      if (userRes.rows.length === 0) {
        return NextResponse.json(
          { error: "Invalid email or password" },
          { status: 401 }
        );
      }

      const dbUser = userRes.rows[0];

      if (action !== "quick_switch") {
        const valid = await verifyPassword(
          password || "",
          dbUser.password_hash
        );
        if (!valid) {
          return NextResponse.json(
            { error: "Invalid email or password" },
            { status: 401 }
          );
        }
      }

      const payload: JwtUserPayload = {
        user_id: dbUser.user_id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        store_name: dbUser.store_name || undefined,
      };

      const token = signToken(payload);
      const res = NextResponse.json({ user: payload, token });
      res.cookies.set("shopsphere_token", token, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    if (action === "register") {
      const { name, email, password, role, store_name, store_description } =
        body;
      if (!name || !email || !password) {
        return NextResponse.json(
          { error: "Name, email, and password are required" },
          { status: 400 }
        );
      }

      const validRole = ["customer", "seller", "admin"].includes(role)
        ? role
        : "customer";

      if (validRole === "seller" && !store_name) {
        return NextResponse.json(
          { error: "Store name is required for Seller registration" },
          { status: 400 }
        );
      }

      const passwordHash = await hashPassword(password);

      const newUser = await pgTransaction(async (tx) => {
        const insertUser = await tx.query<{
          user_id: number;
          name: string;
          email: string;
          role: "admin" | "seller" | "customer";
        }>(
          `INSERT INTO Users (name, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           RETURNING user_id, name, email, role`,
          [name.trim(), email.trim().toLowerCase(), passwordHash, validRole]
        );

        const u = insertUser.rows[0];

        if (validRole === "seller") {
          await tx.query(
            `INSERT INTO Sellers (seller_id, store_name, store_description, verified)
             VALUES ($1, $2, $3, TRUE)`,
            [
              u.user_id,
              store_name.trim(),
              store_description || "Official ShopSphere Marketplace Seller",
            ]
          );
        }

        return {
          ...u,
          store_name: validRole === "seller" ? store_name.trim() : undefined,
        };
      });

      const token = signToken(newUser);
      const res = NextResponse.json({ user: newUser, token }, { status: 201 });
      res.cookies.set("shopsphere_token", token, {
        httpOnly: false,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return res;
    }

    return NextResponse.json({ error: "Invalid auth action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Authentication error" },
      { status: 500 }
    );
  }
}

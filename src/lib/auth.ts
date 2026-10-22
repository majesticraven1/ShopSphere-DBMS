import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET =
  process.env.JWT_SECRET || "shopsphere_dbms_level3_jwt_secret_key_2026";

export interface JwtUserPayload {
  user_id: number;
  name: string;
  email: string;
  role: "admin" | "seller" | "customer";
  store_name?: string;
}

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainText, salt);
}

export async function verifyPassword(
  plainText: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plainText, hash);
}

export function signToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtUserPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
  } catch {
    return null;
  }
}

export function getUserFromRequest(req: NextRequest): JwtUserPayload | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);
    if (decoded) return decoded;
  }

  const cookieToken = req.cookies.get("shopsphere_token")?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  return null;
}

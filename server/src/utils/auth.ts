import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { UserRole } from "../models/User.js";

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

const PLACEHOLDER_SECRETS = new Set([
  "change-this-to-a-long-random-secret-in-production",
  "fallback_secret_key",
  "secret",
]);

let cachedSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedSecret) return cachedSecret;
  const configured = process.env.JWT_SECRET?.trim();
  const production = process.env.NODE_ENV === "production";

  if (configured) {
    if (production && (configured.length < 32 || PLACEHOLDER_SECRETS.has(configured))) {
      throw new Error("JWT_SECRET is too weak for production. Use a random value of at least 32 characters.");
    }
    if (PLACEHOLDER_SECRETS.has(configured)) {
      console.warn("[Auth] JWT_SECRET is still the example value. Change it before deploying.");
    }
    cachedSecret = configured;
    return configured;
  }

  if (production) {
    throw new Error("JWT_SECRET is not set. Add a long random value to the server environment.");
  }
  console.warn("[Auth] JWT_SECRET is not set. Using a temporary random secret; everyone is logged out when the server restarts.");
  cachedSecret = crypto.randomBytes(48).toString("hex");
  return cachedSecret;
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "7d" });
};

export const verifyToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
};
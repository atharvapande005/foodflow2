import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { UserRole } from "../models/User.js";

export interface TokenPayload {
  userId: string;
  role: UserRole;
}

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export const generateToken = (payload: TokenPayload): string => {
  const secret = process.env.JWT_SECRET || "fallback_secret_key";
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

export const verifyToken = (token: string): TokenPayload => {
  const secret = process.env.JWT_SECRET || "fallback_secret_key";
  return jwt.verify(token, secret) as TokenPayload;
};

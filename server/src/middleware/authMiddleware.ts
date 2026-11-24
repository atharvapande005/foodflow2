import type { Request, Response, NextFunction } from "express";
import { verifyToken, type TokenPayload } from "../utils/auth.js";
import type { UserRole } from "../models/User.js";
import { User } from "../models/User.js";

export interface AuthenticatedRequest extends Request {
  user?: TokenPayload;
}

/**
 * Verifies the JWT and then reloads the account from the database.
 * This means role changes, deactivation and ownership are always enforced
 * against current data rather than stale token claims.
 */
export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Access denied. Token missing." });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select("role isActive");
    if (!user) {
      res.status(401).json({ error: "Account no longer exists." });
      return;
    }
    if (!user.isActive) {
      res.status(403).json({ error: "Your account has been deactivated. Contact support." });
      return;
    }
    req.user = { userId: user._id.toString(), role: user.role };
    next();
  } catch (_err) {
    res.status(401).json({ error: "Invalid or expired token." });
  }
};

export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden. Insufficient privileges." });
      return;
    }

    next();
  };
};

import type { UserRole } from "../models/User.js";
import type { TokenPayload } from "./auth.js";

export const OWNER_ROLE: UserRole = "CANTEEN_OPERATOR";
export const ADMIN_ROLE: UserRole = "ADMIN";

export function isAdminRole(role: UserRole | string): boolean {
  return role === ADMIN_ROLE;
}

export function isOwnerRole(role: UserRole | string): boolean {
  return role === OWNER_ROLE;
}

export function isManagerRole(role: UserRole | string): boolean {
  return isAdminRole(role) || isOwnerRole(role);
}

export function isStudentRole(role: UserRole | string): boolean {
  return role === "STUDENT" || role === "FACULTY" || role === "STAFF";
}

/** Ownership always comes from the verified token/user, never from the request body. */
export function requiresOwnership(user: TokenPayload): boolean {
  return isOwnerRole(user.role);
}

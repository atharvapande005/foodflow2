import type { Types } from "mongoose";
import { Canteen, type ICanteen } from "../models/Canteen.js";
import type { TokenPayload } from "./auth.js";
import { isAdminRole, isOwnerRole } from "./roles.js";

/**
 * Returns the canteens an owner may manage. Admins are global and return null.
 * The list always comes from the authenticated user id, never from request input.
 */
export async function accessibleCanteenIds(
  user: TokenPayload
): Promise<Types.ObjectId[] | null> {
  if (isAdminRole(user.role)) return null;
  if (!isOwnerRole(user.role)) return [];
  const canteens = await Canteen.find({ ownerId: user.userId }).select("_id");
  return canteens.map((c) => c._id);
}

export function canManageCanteen(user: TokenPayload, canteen: ICanteen): boolean {
  if (isAdminRole(user.role)) return true;
  return isOwnerRole(user.role) && !!canteen.ownerId && canteen.ownerId.toString() === user.userId;
}

export function canViewCanteen(user: TokenPayload, canteen: ICanteen): boolean {
  if (canteen.isActive) return true;
  return canManageCanteen(user, canteen);
}

export async function findCanteenForUser(
  user: TokenPayload,
  canteenId: string,
  options: { requireManage?: boolean; allowInactive?: boolean } = {}
): Promise<ICanteen | null> {
  const canteen = await Canteen.findById(canteenId);
  if (!canteen) return null;
  if (options.requireManage) {
    return canManageCanteen(user, canteen) ? canteen : null;
  }
  if (!options.allowInactive && !canViewCanteen(user, canteen)) return null;
  return canteen;
}

/**
 * Build a Mongo filter scoped to the canteens the caller may manage.
 * A requested canteen must be owned by the caller (admins are global), so
 * management endpoints never fall back to public visibility rules.
 */
export async function canteenScopeFilter(
  user: TokenPayload,
  requestedCanteenId?: string
): Promise<Record<string, unknown> | null> {
  if (requestedCanteenId) {
    const canteen = await findCanteenForUser(user, requestedCanteenId, { requireManage: true });
    if (!canteen) return null;
    return { canteen: canteen._id };
  }

  const ids = await accessibleCanteenIds(user);
  if (ids === null) return {};
  return { canteen: { $in: ids } };
}

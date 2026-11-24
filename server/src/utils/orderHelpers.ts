import type { Types } from "mongoose";
import { Canteen, type ICanteen } from "../models/Canteen.js";
import { MenuItem, type IMenuItem } from "../models/MenuItem.js";
import { OperatingSession, type IOperatingSession } from "../models/OperatingSession.js";

export interface RawOrderItem {
  menuItem: string;
  quantity: number;
}

export interface OrderLine {
  menuItem: IMenuItem;
  quantity: number;
}

export interface OrderItemSnapshot {
  menuItem: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface PreparedOrder {
  ok: true;
  canteen: ICanteen | null;
  lines: OrderLine[];
  orderItems: OrderItemSnapshot[];
  totalAmount: number;
}

export interface PrepareFailure {
  ok: false;
  status: number;
  error: string;
}

export interface ReservedLine {
  id: string;
  name: string;
  quantity: number;
}

/** Human-facing token format, e.g. 1 -> #001, 143 -> #143. */
export function formatToken(token?: number | null): string {
  if (typeof token !== "number" || token <= 0) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

export function generateOrderNumber(): string {
  const stamp = Date.now().toString(36).toUpperCase().slice(-6);
  const random = Math.floor(Math.random() * 46656)
    .toString(36)
    .toUpperCase()
    .padStart(3, "0");
  return `FF-${stamp}${random}`;
}

function isDuplicateKey(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;
}

/**
 * Resolve item ids from the database, validate availability and prices, and
 * ensure every line belongs to the requested canteen. The client never supplies
 * prices or totals.
 */
export async function prepareOrder(input: {
  items: RawOrderItem[];
  canteenId?: string | null;
  requireOpen?: boolean;
  requireAvailable?: boolean;
}): Promise<PreparedOrder | PrepareFailure> {
  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.menuItem, (quantities.get(item.menuItem) || 0) + item.quantity);
  }

  const menuItems = await MenuItem.find({ _id: { $in: [...quantities.keys()] } });
  if (menuItems.length !== quantities.size) {
    return { ok: false, status: 400, error: "One or more menu items no longer exist." };
  }

  const byId = new Map(menuItems.map((item) => [item._id.toString(), item]));
  const lines: OrderLine[] = [];

  for (const [id, quantity] of quantities.entries()) {
    const menuItem = byId.get(id);
    if (!menuItem) return { ok: false, status: 400, error: "A menu item is unavailable." };

    if (input.requireAvailable !== false && !menuItem.available) {
      return { ok: false, status: 400, error: `${menuItem.name} is currently unavailable.` };
    }
    if (typeof menuItem.stock === "number" && menuItem.stock < quantity) {
      return {
        ok: false,
        status: 400,
        error:
          menuItem.stock <= 0
            ? `${menuItem.name} is sold out.`
            : `${menuItem.name} has only ${menuItem.stock} left.`,
      };
    }
    lines.push({ menuItem, quantity });
  }

  let canteen: ICanteen | null = null;
  if (input.canteenId) {
    canteen = await Canteen.findById(input.canteenId);
    if (!canteen) return { ok: false, status: 404, error: "Canteen not found." };
  } else {
    const derived = lines.map((line) => line.menuItem.canteen?.toString()).find(Boolean);
    if (derived) canteen = await Canteen.findById(derived);
    else canteen = await Canteen.findOne({ isActive: true }).sort({ createdAt: 1 });
  }

  if (canteen) {
    if (lines.some((line) => !line.menuItem.canteen || line.menuItem.canteen.toString() !== canteen!._id.toString())) {
      return { ok: false, status: 400, error: "All items in one order must belong to the same canteen." };
    }
    if (input.requireOpen !== false && (!canteen.isActive || !canteen.settings.acceptingOrders)) {
      return { ok: false, status: 400, error: "This canteen is not accepting orders right now." };
    }
  }

  const totalAmount = lines.reduce((sum, line) => sum + line.menuItem.price * line.quantity, 0);
  if (canteen && totalAmount < canteen.settings.minOrderAmount) {
    return {
      ok: false,
      status: 400,
      error: `Minimum order for this canteen is ₹${canteen.settings.minOrderAmount}.`,
    };
  }

  return {
    ok: true,
    canteen,
    lines,
    totalAmount,
    orderItems: lines.map((line) => ({
      menuItem: line.menuItem._id,
      name: line.menuItem.name,
      price: line.menuItem.price,
      quantity: line.quantity,
    })),
  };
}

/**
 * Atomically reserve tracked stock. If any line fails, every earlier line is
 * restored before returning, so concurrent orders can never oversell.
 */
export async function reserveStock(
  lines: OrderLine[]
): Promise<{ ok: true; reserved: ReservedLine[] } | { ok: false; error: string }> {
  const reserved: ReservedLine[] = [];

  for (const line of lines) {
    if (typeof line.menuItem.stock !== "number") continue;
    const result = await MenuItem.updateOne(
      { _id: line.menuItem._id, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } }
    );
    if (result.modifiedCount !== 1) {
      await releaseStock(reserved);
      return { ok: false, error: `${line.menuItem.name} just sold out. Please refresh your cart.` };
    }
    reserved.push({ id: line.menuItem._id.toString(), name: line.menuItem.name, quantity: line.quantity });
  }

  return { ok: true, reserved };
}

export async function releaseStock(reserved: ReservedLine[]): Promise<void> {
  for (const line of reserved) {
    await MenuItem.updateOne({ _id: line.id }, { $inc: { stock: line.quantity } });
  }
}

export async function releaseOrderStock(
  items: { menuItem: Types.ObjectId | string; quantity: number }[]
): Promise<void> {
  for (const item of items) {
    const menuItem = await MenuItem.findById(item.menuItem);
    if (menuItem && typeof menuItem.stock === "number") {
      menuItem.stock += item.quantity;
      await menuItem.save();
    }
  }
}

/** Return the current open session, creating one for legacy/seed canteens if needed. */
export async function ensureOpenSession(
  canteenId: Types.ObjectId | string,
  actorId?: string | null
): Promise<IOperatingSession> {
  const existing = await OperatingSession.findOne({ canteen: canteenId, status: "OPEN" }).sort({ openedAt: -1 });
  if (existing) return existing;

  try {
    return await OperatingSession.create({
      canteen: canteenId,
      status: "OPEN",
      tokenCounter: 0,
      openedAt: new Date(),
      openedBy: actorId || null,
    });
  } catch (error) {
    if (isDuplicateKey(error)) {
      const raced = await OperatingSession.findOne({ canteen: canteenId, status: "OPEN" }).sort({ openedAt: -1 });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function allocateToken(sessionId: Types.ObjectId | string): Promise<number> {
  const updated = await OperatingSession.findOneAndUpdate(
    { _id: sessionId, status: "OPEN" },
    { $inc: { tokenCounter: 1 } },
    { new: true }
  );
  if (!updated) throw new Error("The operating session is closed. Start the canteen before taking orders.");
  return updated.tokenCounter;
}

export async function getOpenSession(canteenId: Types.ObjectId | string): Promise<IOperatingSession | null> {
  return OperatingSession.findOne({ canteen: canteenId, status: "OPEN" }).sort({ openedAt: -1 });
}

export async function getLatestSession(canteenId: Types.ObjectId | string): Promise<IOperatingSession | null> {
  return OperatingSession.findOne({ canteen: canteenId }).sort({ openedAt: -1 });
}

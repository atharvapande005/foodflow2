import type { Response } from "express";
import { Canteen } from "../models/Canteen.js";
import { Order } from "../models/Order.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { cashOrderSchema } from "../utils/validation.js";
import { prepareOrder, releaseStock, reserveStock } from "../utils/orderHelpers.js";
import { createOrderRecord, resolveSessionAndToken } from "../utils/orderCreation.js";
import { canManageCanteen, canteenScopeFilter } from "../utils/canteenAccess.js";
import { isAdminRole } from "../utils/roles.js";

async function resolveCashCanteen(req: AuthenticatedRequest, requestedId?: string | null) {
  if (!req.user) return { error: "Unauthorized", status: 401 as const };
  if (requestedId) {
    const canteen = await Canteen.findById(requestedId);
    if (!canteen || !canManageCanteen(req.user, canteen)) {
      return { error: "You cannot record payments for that canteen.", status: 403 as const };
    }
    return { canteen };
  }
  if (isAdminRole(req.user.role)) {
    const canteen = await Canteen.findOne({ isActive: true }).sort({ createdAt: 1 });
    return canteen
      ? { canteen }
      : { error: "Create a canteen before recording a cash payment.", status: 400 as const };
  }
  const owned = await Canteen.find({ ownerId: req.user.userId });
  if (owned.length === 0) {
    return { error: "Create a canteen before recording a cash payment.", status: 400 as const };
  }
  if (owned.length > 1) {
    return { error: "Select a canteen before recording a cash payment.", status: 400 as const };
  }
  return { canteen: owned[0] };
}

/**
 * Counter sale. The operator selects items, cash is collected immediately, and
 * a token is issued from the current operating session. Stock is reserved
 * atomically against the database, never against client-supplied prices.
 */
export const createCashOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = cashOrderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const target = await resolveCashCanteen(req, validation.data.canteenId);
    if ("error" in target) {
      res.status(target.status || 403).json({ error: target.error });
      return;
    }

    const prepared = await prepareOrder({
      items: validation.data.items,
      canteenId: target.canteen._id.toString(),
    });
    if (!prepared.ok) {
      res.status(prepared.status).json({ error: prepared.error });
      return;
    }

    const reserved = await reserveStock(prepared.lines);
    if (!reserved.ok) {
      res.status(400).json({ error: reserved.error });
      return;
    }

    let sessionToken: Awaited<ReturnType<typeof resolveSessionAndToken>>;
    try {
      sessionToken = await resolveSessionAndToken(target.canteen._id, req.user.userId);
    } catch (error) {
      await releaseStock(reserved.reserved);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Start the canteen before recording cash orders.",
      });
      return;
    }

    let order: InstanceType<typeof Order>;
    try {
      order = await createOrderRecord({
        prepared,
        createdBy: req.user.userId,
        source: "COUNTER",
        paymentMethod: "CASH",
        paymentStatus: "PAID",
        status: "PREPARING",
        guestName: validation.data.customerName,
        guestPhone: validation.data.customerPhone,
        notes: validation.data.notes,
        stockReserved: true,
        sessionToken,
      });
    } catch (error) {
      await releaseStock(reserved.reserved);
      throw error;
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`canteen-${target.canteen._id}`).emit("order:created", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
        paymentMethod: "CASH",
      });
    }

    res.status(201).json({
      message: `Cash payment recorded. Token ${order.token ? `#${String(order.token).padStart(3, "0")}` : "—"}.`,
      order,
      tokenLabel: order.token ? `#${String(order.token).padStart(3, "0")}` : null,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record cash order" });
  }
};

export const listCashOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const requested = req.query.canteenId ? String(req.query.canteenId) : undefined;
    const scope = await canteenScopeFilter(req.user, requested);
    if (!scope) {
      res.status(403).json({ error: "You do not have access to that canteen." });
      return;
    }

    const filter: Record<string, unknown> = { ...scope, paymentMethod: "CASH" };
    if (req.query.sessionId) filter.session = req.query.sessionId;
    if (req.query.date) {
      const start = new Date(String(req.query.date));
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.createdAt = { $gte: start, $lt: end };
    }

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("createdBy", "name email");

    const paid = orders.filter((order) => order.paymentStatus === "PAID");
    res.status(200).json({
      orders,
      summary: {
        orders: orders.length,
        collected: paid.reduce((sum, order) => sum + order.totalAmount, 0),
        pending: orders.filter((order) => order.paymentStatus === "PENDING").length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load cash orders" });
  }
};

/** Collect cash for a guest/QR order that was placed with payment pending. */
export const markCashPaid = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (!order.canteen) {
      res.status(403).json({ error: "This order is not linked to a canteen." });
      return;
    }
    const canteen = await Canteen.findById(order.canteen);
    if (!canteen || !canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You cannot record payment for this order." });
      return;
    }
    if (order.paymentMethod !== "CASH") {
      res.status(400).json({ error: "Only cash orders can be marked as collected." });
      return;
    }
    if (order.paymentStatus === "PAID") {
      res.status(200).json({ message: "Cash was already recorded for this order.", order });
      return;
    }
    if (order.paymentStatus === "REFUNDED") {
      res.status(400).json({ error: "This order was refunded and cannot be collected again." });
      return;
    }

    order.paymentStatus = "PAID";
    order.paidAt = new Date();
    await order.save();

    res.status(200).json({ message: "Cash payment recorded.", order });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to record cash payment" });
  }
};

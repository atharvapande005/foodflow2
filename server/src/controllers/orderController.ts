import type { Response } from "express";
import { Order, type OrderStatus } from "../models/Order.js";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";
import { Canteen } from "../models/Canteen.js";
import { orderSchema, updateOrderStatusSchema } from "../utils/validation.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { canteenScopeFilter } from "../utils/canteenAccess.js";
import { isAdminRole, isOwnerRole } from "../utils/roles.js";
import {
  formatToken,
  prepareOrder,
  releaseStock,
  reserveStock,
} from "../utils/orderHelpers.js";
import { createOrderRecord, resolveSessionAndToken } from "../utils/orderCreation.js";
import { refundOnlineOrder, releaseStockOnce } from "../utils/paymentService.js";

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  // New orders can be completed directly. PREPARING/READY remain valid so
  // historical orders and the owner counter workflow keep working.
  PLACED: ["PREPARING", "COMPLETED", "CANCELLED"],
  PREPARING: ["READY", "COMPLETED", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function orderResponse(order: InstanceType<typeof Order>) {
  return {
    _id: order._id,
    id: order._id,
    orderNumber: order.orderNumber,
    token: order.token ?? null,
    tokenLabel: formatToken(order.token),
    session: order.session ?? null,
    canteen: order.canteen && typeof order.canteen === "object" ? order.canteen : order.canteen,
    items: order.items,
    totalAmount: order.totalAmount,
    status: order.status,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderSource: order.orderSource,
    estimatedReadyTime: order.estimatedReadyTime,
    createdAt: order.createdAt,
  };
}

async function canAccessOrder(
  req: AuthenticatedRequest,
  order: InstanceType<typeof Order>
): Promise<boolean> {
  if (!req.user) return false;
  if (isAdminRole(req.user.role)) return true;

  if (isOwnerRole(req.user.role)) {
    if (!order.canteen) return false;
    const canteen = await Canteen.findOne({ _id: order.canteen, ownerId: req.user.userId });
    return !!canteen;
  }

  if (!order.user) return false;
  const orderUserId =
    typeof order.user === "object" && order.user !== null && "_id" in order.user
      ? String((order.user as unknown as { _id: unknown })._id)
      : String(order.user);
  return orderUserId === req.user.userId;
}

async function canManageOrder(req: AuthenticatedRequest): Promise<boolean> {
  return !!req.user && (isAdminRole(req.user.role) || isOwnerRole(req.user.role));
}

/**
 * Student wallet order. Online orders are created through the payment routes so
 * the Razorpay order can be created and verified on the server.
 */
export const createOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = orderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const { items, notes, canteenId } = validation.data;
    const paymentMethod = validation.data.paymentMethod || "WALLET";

    if (paymentMethod === "ONLINE") {
      res.status(400).json({
        error: "Use the online checkout endpoint so the payment can be created and verified securely.",
      });
      return;
    }
    if (paymentMethod === "CASH") {
      res.status(400).json({ error: "Cash orders are recorded from the canteen counter." });
      return;
    }

    const prepared = await prepareOrder({ items, canteenId });
    if (!prepared.ok) {
      res.status(prepared.status).json({ error: prepared.error });
      return;
    }
    if (!prepared.canteen) {
      res.status(400).json({ error: "Select a canteen before placing an order." });
      return;
    }

    const totalAmount = prepared.totalAmount;
    const user = await User.findOneAndUpdate(
      { _id: req.user.userId, isActive: true, walletBalance: { $gte: totalAmount } },
      { $inc: { walletBalance: -totalAmount } },
      { new: true }
    );
    if (!user) {
      const current = await User.findById(req.user.userId).select("walletBalance");
      res.status(400).json({
        error: `Insufficient wallet balance. Required: ₹${totalAmount}, Available: ₹${current?.walletBalance ?? 0}`,
      });
      return;
    }

    const reserved = await reserveStock(prepared.lines);
    if (!reserved.ok) {
      await User.updateOne({ _id: user._id }, { $inc: { walletBalance: totalAmount } });
      res.status(400).json({ error: reserved.error });
      return;
    }

    let sessionToken: { sessionId: string; token: number } | null = null;
    try {
      sessionToken = await resolveSessionAndToken(prepared.canteen._id, req.user.userId);
    } catch (error) {
      await releaseStock(reserved.reserved);
      await User.updateOne({ _id: user._id }, { $inc: { walletBalance: totalAmount } });
      res.status(400).json({
        error: error instanceof Error ? error.message : "The canteen is not accepting orders.",
      });
      return;
    }

    let order: InstanceType<typeof Order>;
    try {
      order = await createOrderRecord({
        prepared,
        userId: user._id.toString(),
        studentId: user.studentId,
        source: "STUDENT",
        paymentMethod: "WALLET",
        paymentStatus: "PAID",
        notes,
        stockReserved: true,
        sessionToken,
      });
    } catch (error) {
      await releaseStock(reserved.reserved);
      await User.updateOne({ _id: user._id }, { $inc: { walletBalance: totalAmount } });
      throw error;
    }

    const walletBalance = user.walletBalance;
    await Transaction.create({
      user: user._id,
      type: "ORDER_PAYMENT",
      amount: -totalAmount,
      balanceAfter: walletBalance,
      description: `Payment for order ${order.orderNumber} at ${prepared.canteen.name}`,
      referenceId: order._id.toString(),
    }).catch((error) => console.error("[Wallet] Could not record payment transaction", error));

    const io = req.app.get("io");
    if (io) {
      io.emit("order:created", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        canteenId: prepared.canteen._id,
      });
      io.to(`canteen-${prepared.canteen._id}`).emit("order:created", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
      });
    }

    res.status(201).json({
      message: `Order placed. Your token is ${formatToken(order.token)}.`,
      order: orderResponse(order),
      walletBalance,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create order" });
  }
};

export const getMyOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const filter: Record<string, unknown> = { user: req.user.userId };
    if (req.query.canteenId) filter.canteen = req.query.canteenId;
    if (req.query.status && req.query.status !== "ALL") filter.status = req.query.status;
    if (req.query.sessionId) filter.session = req.query.sessionId;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate("canteen", "name code branding.logoUrl institution.collegeName");

    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch orders" });
  }
};

export const getAllOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !(await canManageOrder(req))) {
      res.status(403).json({ error: "Only canteen owners and administrators can view all orders." });
      return;
    }

    const { status, search, paymentMethod, paymentStatus, from, to } = req.query;
    const requestedCanteen = req.query.canteenId ? String(req.query.canteenId) : undefined;
    const scope = await canteenScopeFilter(req.user, requestedCanteen);
    if (!scope) {
      res.status(403).json({ error: "You do not have access to that canteen." });
      return;
    }

    const filter: Record<string, unknown> = { ...scope };
    if (status && status !== "ALL") filter.status = status;
    if (paymentMethod && paymentMethod !== "ALL") filter.paymentMethod = paymentMethod;
    if (paymentStatus && paymentStatus !== "ALL") filter.paymentStatus = paymentStatus;
    if (req.query.sessionId) filter.session = req.query.sessionId;

    const createdAt: Record<string, Date> = {};
    if (from) createdAt.$gte = new Date(String(from));
    if (to) createdAt.$lte = new Date(String(to));
    if (Object.keys(createdAt).length) filter.createdAt = createdAt;

    if (search) {
      filter.$or = [
        { orderNumber: { $regex: String(search), $options: "i" } },
        { guestName: { $regex: String(search), $options: "i" } },
        { guestPhone: { $regex: String(search), $options: "i" } },
      ];
      if (/^\d+$/.test(String(search))) {
        (filter.$or as Record<string, unknown>[]).push({ token: Number(search) });
      }
    }

    // College student IDs are administrative data: only administrators may
    // read them, and only through this authenticated order endpoint.
    const admin = isAdminRole(req.user.role);
    const ordersQuery = Order.find(filter).sort({ createdAt: -1 }).limit(200);
    if (admin) ordersQuery.select("+studentId");
    const orders = await ordersQuery
      .populate("user", admin ? "name email phone studentId" : "name email phone")
      .populate("canteen", "name code branding.logoUrl institution.collegeName");

    res.status(200).json({ orders });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch orders" });
  }
};

export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !(await canManageOrder(req))) {
      res.status(403).json({ error: "Only canteen owners and administrators can update orders." });
      return;
    }

    const validation = updateOrderStatusSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (!(await canAccessOrder(req, order))) {
      res.status(403).json({ error: "You do not have access to this order." });
      return;
    }

    const next = validation.data.status;
    const reason = validation.data.reason;

    if (order.status === next) {
      res.status(200).json({ message: "Order already has this status", order });
      return;
    }
    if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
      res.status(400).json({
        error: `An order cannot move from ${order.status} to ${next}.`,
      });
      return;
    }
    if (
      (next === "PREPARING" || next === "COMPLETED") &&
      order.paymentMethod === "ONLINE" &&
      order.paymentStatus !== "PAID"
    ) {
      res.status(400).json({ error: "Online payment has not been verified for this order." });
      return;
    }

    if (next === "PREPARING") order.acceptedAt = new Date();
    if (next === "READY") order.readyAt = new Date();
    if (next === "COMPLETED") order.completedAt = new Date();

    let refundWarning: string | null = null;

    if (next === "CANCELLED") {
      order.cancelledAt = new Date();
      if (reason) order.rejectionReason = reason.slice(0, 300);
      await releaseStockOnce(order);

      if (order.paymentStatus === "PAID") {
        if (order.paymentMethod === "WALLET" && order.user) {
          const user = await User.findByIdAndUpdate(
            order.user,
            { $inc: { walletBalance: order.totalAmount } },
            { new: true }
          );
          if (user) {
            await Transaction.create({
              user: user._id,
              type: "REFUND",
              amount: order.totalAmount,
              balanceAfter: user.walletBalance,
              description: `Refund for cancelled order ${order.orderNumber}`,
              referenceId: order._id.toString(),
            }).catch((error) => console.error("[Wallet] Could not record refund transaction", error));
          }
          order.paymentStatus = "REFUNDED";
          order.refundStatus = "PROCESSED";
          order.refundedAt = new Date();
        } else if (order.paymentMethod === "ONLINE") {
          const refund = await refundOnlineOrder(order, reason || "Order rejected by the canteen");
          if (!refund.ok) {
            refundWarning =
              refund.error ||
              "The online refund could not be confirmed. The order is cancelled and the refund is marked for manual follow-up.";
          }
        } else if (order.paymentMethod === "CASH") {
          // Cash is returned at the counter; record it as a completed manual refund.
          order.paymentStatus = "REFUNDED";
          order.refundStatus = "PROCESSED";
          order.refundedAt = new Date();
        }
      } else {
        order.paymentStatus = "FAILED";
      }

      order.status = "CANCELLED";
    } else {
      order.status = next;
    }

    await order.save();

    const admin = isAdminRole(req.user.role);
    const populatedQuery = Order.findById(order._id);
    if (admin) populatedQuery.select("+studentId");
    const populated = await populatedQuery
      .populate("user", admin ? "name email phone studentId" : "name email phone")
      .populate("canteen", "name code branding.logoUrl institution.collegeName");

    const io = req.app.get("io");
    if (io) {
      io.emit("order:updated", { orderId: order._id, status: order.status });
      io.to(`order-${order._id}`).emit("order:status", {
        status: order.status,
        paymentStatus: order.paymentStatus,
      });
      if (order.canteen) {
        io.to(`canteen-${order.canteen}`).emit("order:updated", {
          orderId: order._id,
          status: order.status,
        });
      }
    }

    res.status(200).json({
      message: refundWarning
        ? `Order cancelled. ${refundWarning}`
        : `Order moved to ${order.status}.`,
      warning: refundWarning || undefined,
      order: populated,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update order" });
  }
};

export const getOrderById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const admin = isAdminRole(req.user.role);
    const orderQuery = Order.findById(req.params.id);
    if (admin) orderQuery.select("+studentId");
    const order = await orderQuery
      .populate("user", admin ? "name email phone studentId" : "name email phone")
      .populate("canteen", "name code branding.logoUrl institution.collegeName");
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (!(await canAccessOrder(req, order))) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.status(200).json({ order });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch order" });
  }
};

async function revenueByMethod(scope: Record<string, unknown>, session?: string) {
  const match: Record<string, unknown> = { ...scope, paymentStatus: "PAID" };
  if (session) match.session = session;
  const rows = await Order.aggregate([
    { $match: match },
    { $group: { _id: "$paymentMethod", total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
  ]);
  const result = { ONLINE: 0, CASH: 0, WALLET: 0 } as Record<string, number>;
  for (const row of rows) result[row._id] = row.total;
  return result;
}

/** Dashboard summary for an owner, scoped to their canteens. */
export const getOwnerOrderSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const requested = req.query.canteenId ? String(req.query.canteenId) : undefined;
    const session = req.query.sessionId ? String(req.query.sessionId) : undefined;
    const scope = await canteenScopeFilter(req.user, requested);
    if (!scope) {
      res.status(403).json({ error: "You do not have access to that canteen." });
      return;
    }
    const scoped: Record<string, unknown> = { ...scope };
    if (session) scoped.session = session;

    const [total, placed, preparing, ready, completed, cancelled, revenue] = await Promise.all([
      Order.countDocuments(scoped),
      Order.countDocuments({ ...scoped, status: "PLACED" }),
      Order.countDocuments({ ...scoped, status: "PREPARING" }),
      Order.countDocuments({ ...scoped, status: "READY" }),
      Order.countDocuments({ ...scoped, status: "COMPLETED" }),
      Order.countDocuments({ ...scoped, status: "CANCELLED" }),
      revenueByMethod(scope, session),
    ]);

    const recentOrders = await Order.find(scoped)
      .sort({ createdAt: -1 })
      .limit(8)
      .populate("user", "name email")
      .populate("canteen", "name code");

    res.status(200).json({
      total,
      pending: placed + preparing,
      placed,
      preparing,
      ready,
      completed,
      cancelled,
      revenue: revenue.ONLINE + revenue.CASH + revenue.WALLET,
      onlineRevenue: revenue.ONLINE,
      cashRevenue: revenue.CASH,
      walletRevenue: revenue.WALLET,
      recentOrders,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load order summary" });
  }
};

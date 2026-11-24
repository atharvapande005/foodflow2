import type { Response } from "express";
import { Types } from "mongoose";
import { Order } from "../models/Order.js";
import { OperatingSession } from "../models/OperatingSession.js";
import { Canteen } from "../models/Canteen.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { canteenScopeFilter } from "../utils/canteenAccess.js";

function dateFilter(from?: string, to?: string): Record<string, Date> | null {
  const range: Record<string, Date> = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) range.$gte = start;
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      // A plain date means "include that whole day".
      if (/^\d{4}-\d{2}-\d{2}$/.test(to)) end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
  }
  return Object.keys(range).length ? range : null;
}

/**
 * Revenue reporting derived from permanent orders. Cash and online payments are
 * always reported separately. Nothing here deletes financial history.
 */
export const getRevenue = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const match: Record<string, unknown> = { ...scope };
    if (req.query.sessionId && Types.ObjectId.isValid(String(req.query.sessionId))) {
      match.session = new Types.ObjectId(String(req.query.sessionId));
    }
    const created = dateFilter(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    if (created) match.createdAt = created;

    const paidMatch = { ...match, paymentStatus: "PAID" };

    const [methodRows, dailyRows, sessionRows, topRows, totals] = await Promise.all([
      Order.aggregate([
        { $match: paidMatch },
        { $group: { _id: "$paymentMethod", total: { $sum: "$totalAmount" }, orders: { $sum: 1 } } },
      ]),
      Order.aggregate([
        { $match: paidMatch },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "+05:30" } },
            total: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
            cash: {
              $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$totalAmount", 0] },
            },
            online: {
              $sum: { $cond: [{ $eq: ["$paymentMethod", "ONLINE"] }, "$totalAmount", 0] },
            },
            wallet: {
              $sum: { $cond: [{ $eq: ["$paymentMethod", "WALLET"] }, "$totalAmount", 0] },
            },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 60 },
      ]),
      Order.aggregate([
        { $match: paidMatch },
        {
          $group: {
            _id: "$session",
            total: { $sum: "$totalAmount" },
            orders: { $sum: 1 },
            cash: { $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$totalAmount", 0] } },
            online: { $sum: { $cond: [{ $eq: ["$paymentMethod", "ONLINE"] }, "$totalAmount", 0] } },
            wallet: { $sum: { $cond: [{ $eq: ["$paymentMethod", "WALLET"] }, "$totalAmount", 0] } },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 40 },
      ]),
      Order.aggregate([
        { $match: paidMatch },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.name",
            quantity: { $sum: "$items.quantity" },
            revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
          },
        },
        { $sort: { quantity: -1 } },
        { $limit: 10 },
      ]),
      Order.aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
            cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
            pending: {
              $sum: {
                $cond: [{ $in: ["$status", ["PLACED", "PREPARING", "READY"]] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const byMethod: Record<string, { total: number; orders: number }> = {
      CASH: { total: 0, orders: 0 },
      ONLINE: { total: 0, orders: 0 },
      WALLET: { total: 0, orders: 0 },
    };
    for (const row of methodRows) {
      byMethod[row._id] = { total: row.total, orders: row.orders };
    }

    const counts = totals[0] || { totalOrders: 0, completed: 0, cancelled: 0, pending: 0 };

    res.status(200).json({
      revenue: {
        cash: byMethod.CASH.total,
        online: byMethod.ONLINE.total,
        wallet: byMethod.WALLET.total,
        total: byMethod.CASH.total + byMethod.ONLINE.total + byMethod.WALLET.total,
      },
      byMethod,
      counts,
      daily: dailyRows.map((row) => ({
        date: row._id,
        total: row.total,
        orders: row.orders,
        cash: row.cash,
        online: row.online,
        wallet: row.wallet,
      })),
      sessions: sessionRows.map((row) => ({
        sessionId: row._id,
        total: row.total,
        orders: row.orders,
        cash: row.cash,
        online: row.online,
        wallet: row.wallet,
      })),
      topItems: topRows.map((row) => ({
        name: row._id,
        quantity: row.quantity,
        revenue: row.revenue,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load revenue" });
  }
};

/** Operating sessions with their order counts. History is retained forever. */
export const getSessions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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

    const canteenFilter = (scope as { canteen?: unknown }).canteen ?? {};
    const sessions = await OperatingSession.find({ canteen: canteenFilter })
      .sort({ openedAt: -1 })
      .limit(50);

    const rows = await Order.aggregate([
      { $match: { ...scope, session: { $in: sessions.map((s) => s._id) } } },
      {
        $group: {
          _id: "$session",
          orders: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ["$status", "CANCELLED"] }, 1, 0] } },
          revenue: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "PAID"] }, "$totalAmount", 0] },
          },
        },
      },
    ]);
    const stats = new Map(rows.map((row) => [String(row._id), row]));

    res.status(200).json({
      sessions: sessions.map((session) => {
        const stat = stats.get(session._id.toString());
        return {
          _id: session._id,
          canteen: session.canteen,
          status: session.status,
          tokenCounter: session.tokenCounter,
          openedAt: session.openedAt,
          closedAt: session.closedAt,
          notes: session.notes,
          orders: stat?.orders || 0,
          completed: stat?.completed || 0,
          cancelled: stat?.cancelled || 0,
          revenue: stat?.revenue || 0,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load sessions" });
  }
};

/** Canteen-level rollup for the administrator platform view. */
export const getCanteenRevenue = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const scope = await canteenScopeFilter(req.user);
    if (!scope) {
      res.status(403).json({ error: "You do not have access to revenue." });
      return;
    }
    const match: Record<string, unknown> = { ...scope, paymentStatus: "PAID" };
    const created = dateFilter(
      req.query.from ? String(req.query.from) : undefined,
      req.query.to ? String(req.query.to) : undefined
    );
    if (created) match.createdAt = created;

    const rows = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$canteen",
          total: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$totalAmount", 0] } },
          online: { $sum: { $cond: [{ $eq: ["$paymentMethod", "ONLINE"] }, "$totalAmount", 0] } },
          wallet: { $sum: { $cond: [{ $eq: ["$paymentMethod", "WALLET"] }, "$totalAmount", 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const canteens = await Canteen.find({
      _id: { $in: rows.map((row) => row._id).filter(Boolean) },
    }).select("name code");

    const nameById = new Map(canteens.map((c) => [c._id.toString(), c]));

    res.status(200).json({
      canteens: rows.map((row) => ({
        canteenId: row._id,
        name: nameById.get(String(row._id))?.name || "Unknown canteen",
        code: nameById.get(String(row._id))?.code || "",
        total: row.total,
        orders: row.orders,
        cash: row.cash,
        online: row.online,
        wallet: row.wallet,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load canteen revenue" });
  }
};

import type { Response } from "express";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import { MenuItem } from "../models/MenuItem.js";
import { Canteen } from "../models/Canteen.js";
import { toUserJSON } from "../utils/serialize.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { accessibleCanteenIds } from "../utils/canteenAccess.js";
import { isAdminRole, isOwnerRole } from "../utils/roles.js";

/** Resolve a safe order filter from the authenticated role, never from a browser-supplied owner id. */
async function resolveOrderScope(
  req: AuthenticatedRequest
): Promise<{ filter: Record<string, unknown>; canteenIds: string[] | null }> {
  if (!req.user) return { filter: { _id: { $in: [] } }, canteenIds: [] };

  const requested = req.query.canteenId ? String(req.query.canteenId) : undefined;

  if (isAdminRole(req.user.role)) {
    if (requested) return { filter: { canteen: requested }, canteenIds: [requested] };
    return { filter: {}, canteenIds: null };
  }

  const ids = (await accessibleCanteenIds(req.user)) || [];
  if (requested) {
    if (!ids.some((id) => id.toString() === requested)) {
      return { filter: { _id: { $in: [] } }, canteenIds: [] };
    }
    return { filter: { canteen: requested }, canteenIds: [requested] };
  }

  return {
    filter: { canteen: { $in: ids } },
    canteenIds: ids.map((id) => id.toString()),
  };
}

async function menuScope(canteenIds: string[] | null): Promise<Record<string, unknown>> {
  if (canteenIds === null) return {};
  return { canteen: { $in: canteenIds } };
}

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { filter, canteenIds } = await resolveOrderScope(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalOrders,
      todayOrders,
      todayRevenue,
      pendingOrders,
      totalUsers,
      totalMenuItems,
      recentOrders,
      totalCanteens,
    ] = await Promise.all([
      Order.countDocuments(filter),
      Order.countDocuments({ ...filter, createdAt: { $gte: today } }),
      Order.aggregate([
        { $match: { ...filter, createdAt: { $gte: today }, paymentStatus: "PAID" } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.countDocuments({ ...filter, status: { $in: ["PLACED", "PREPARING"] } }),
      isAdminRole(req.user!.role)
        ? User.countDocuments({ isActive: true })
        : canteenIds && canteenIds.length > 0
          ? (await Order.distinct("user", filter)).length
          : 0,
      MenuItem.countDocuments(await menuScope(canteenIds)),
      Order.find(filter)
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("user", "name email")
        .populate("canteen", "name code"),
      isAdminRole(req.user!.role)
        ? Canteen.countDocuments()
        : canteenIds?.length || 0,
    ]);

    const revenue = todayRevenue.length > 0 ? todayRevenue[0].total : 0;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayRevenue = await Order.aggregate([
      { $match: { ...filter, createdAt: { $gte: yesterday, $lt: today }, paymentStatus: "PAID" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);
    const prevRevenue = yesterdayRevenue.length > 0 ? yesterdayRevenue[0].total : 0;
    const revenueDelta = prevRevenue > 0 ? (((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : "0";

    const hourlyOrders = await Order.aggregate([
      { $match: { ...filter, createdAt: { $gte: today } } },
      { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    const statusCounts = await Order.aggregate([
      { $match: { ...filter, createdAt: { $gte: today } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const statusMap: Record<string, number> = {};
    statusCounts.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    res.status(200).json({
      totalOrders,
      todayOrders,
      todayRevenue: revenue,
      revenueDelta: `${revenueDelta}%`,
      pendingOrders,
      totalUsers,
      totalMenuItems,
      totalCanteens,
      recentOrders,
      hourlyOrders,
      statusBreakdown: statusMap,
      scope: isAdminRole(req.user!.role) && !req.query.canteenId ? "platform" : "canteen",
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch analytics" });
  }
};

export const getSalesAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { filter, canteenIds } = await resolveOrderScope(req);
    const days = parseInt(req.query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const match = { ...filter, createdAt: { $gte: startDate } };

    const dailySales = await Order.aggregate([
      { $match: { ...match, paymentStatus: "PAID" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const topItems = await Order.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalQuantity: { $sum: "$items.quantity" },
          totalRevenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        },
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: 10 },
    ]);

    const paymentMethodStats = await Order.aggregate([
      { $match: match },
      { $group: { _id: "$paymentMethod", count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
    ]);

    res.status(200).json({
      dailySales,
      topItems,
      paymentMethodStats,
      period: days,
      canteenScope: canteenIds,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch sales analytics" });
  }
};

/** Platform-wide user statistics. Restricted to administrators by the route. */
export const getUserStats = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roleCounts = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 }, active: { $sum: { $cond: ["$isActive", 1, 0] } } } },
    ]);

    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(20);

    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalOwners = await User.countDocuments({ role: "CANTEEN_OPERATOR" });
    const totalCanteens = await Canteen.countDocuments();
    const activeCanteens = await Canteen.countDocuments({ isActive: true });

    res.status(200).json({
      roleCounts,
      recentUsers: recentUsers.map(toUserJSON),
      totalUsers,
      activeUsers,
      totalOwners,
      totalCanteens,
      activeCanteens,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch user stats" });
  }
};

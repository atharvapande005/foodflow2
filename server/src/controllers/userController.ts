import type { Response } from "express";
import { User } from "../models/User.js";
import { Canteen } from "../models/Canteen.js";
import { updateUserRoleSchema } from "../utils/validation.js";
import { toUserJSON } from "../utils/serialize.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { role, search } = req.query;
    const filter: Record<string, unknown> = {};

    if (role && role !== "ALL") filter.role = role;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);

    res.status(200).json({ users: users.map(toUserJSON) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch users" });
  }
};

export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = updateUserRoleSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const newRole = validation.data.role;

    if (req.user && req.user.userId === user._id.toString() && newRole !== "ADMIN") {
      res.status(400).json({ error: "You cannot change your own role away from administrator." });
      return;
    }

    if (user.role === "ADMIN" && newRole !== "ADMIN") {
      const adminCount = await User.countDocuments({ role: "ADMIN" });
      if (adminCount <= 1) {
        res.status(400).json({ error: "Cannot demote the only administrator." });
        return;
      }
    }

    const updated = await User.findByIdAndUpdate(
      user._id,
      { ...validation.data, role: newRole },
      { new: true }
    );

    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ message: "User updated", user: toUserJSON(updated) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update user" });
  }
};

/** Admin-only owner directory with canteen counts. */
export const getOwners = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const owners = await User.find({ role: "CANTEEN_OPERATOR" }).sort({ createdAt: -1 });
    const counts = await Canteen.aggregate([
      { $match: { ownerId: { $ne: null } } },
      { $group: { _id: "$ownerId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    res.status(200).json({
      owners: owners.map((owner) => ({
        ...toUserJSON(owner),
        canteenCount: countMap.get(owner._id.toString()) || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch owners" });
  }
};

export const toggleUserActive = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (req.user && req.user.userId === user._id.toString()) {
      res.status(400).json({ error: "You cannot deactivate your own account." });
      return;
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({ message: `User ${user.isActive ? "activated" : "deactivated"}`, user: toUserJSON(user) });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to toggle user" });
  }
};
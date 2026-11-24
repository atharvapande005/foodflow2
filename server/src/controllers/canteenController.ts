import type { Response } from "express";
import { Types } from "mongoose";
import { Canteen, DEFAULT_BRANDING, DEFAULT_SETTINGS } from "../models/Canteen.js";
import { MenuItem } from "../models/MenuItem.js";
import { OperatingSession } from "../models/OperatingSession.js";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { ensureOpenSession, getLatestSession, getOpenSession } from "../utils/orderHelpers.js";
import {
  canteenBrandingSchema,
  canteenCreateSchema,
  canteenUpdateSchema,
} from "../utils/validation.js";
import { canManageCanteen, canViewCanteen, accessibleCanteenIds } from "../utils/canteenAccess.js";
import { deleteLocalUpload } from "../utils/upload.js";
import { isAdminRole, isOwnerRole } from "../utils/roles.js";

const OWNER_PUBLIC_FIELDS = "name email phone avatar";

function flattenCanteenPayload(input: Record<string, unknown>, isAdmin: boolean): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  const nestedKeys = ["institution", "contact", "branding", "settings"];

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (nestedKeys.includes(key) && value && typeof value === "object" && !Array.isArray(value)) {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        if (childValue !== undefined) update[`${key}.${childKey}`] = childValue;
      }
      continue;
    }
    if (key === "ownerId" && !isAdmin) continue;
    update[key] = value;
  }
  return update;
}

export const listCanteens = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { search, college } = req.query;
    const filter: Record<string, unknown> = {};

    if (!isAdminRole(req.user.role)) {
      filter.$or = [{ isActive: true }, { ownerId: req.user.userId }];
    }
    if (search) {
      filter.$and = [
        {
          $or: [
            { name: { $regex: String(search), $options: "i" } },
            { code: { $regex: String(search), $options: "i" } },
            { description: { $regex: String(search), $options: "i" } },
            { "institution.collegeName": { $regex: String(search), $options: "i" } },
          ],
        },
      ];
    }
    if (college) filter["institution.collegeName"] = { $regex: String(college), $options: "i" };

    const canteens = await Canteen.find(filter)
      .sort({ isActive: -1, name: 1 })
      .populate("ownerId", OWNER_PUBLIC_FIELDS);

    res.status(200).json({ canteens });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch canteens" });
  }
};

/** Owner dashboard switcher. Admins receive every canteen. */
export const listMyCanteens = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const filter = isAdminRole(req.user.role) ? {} : { ownerId: req.user.userId };
    const canteens = await Canteen.find(filter)
      .sort({ createdAt: -1 })
      .populate("ownerId", OWNER_PUBLIC_FIELDS);

    res.status(200).json({ canteens });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch your canteens" });
  }
};

export const getCanteenById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const canteen = await Canteen.findById(req.params.id).populate("ownerId", OWNER_PUBLIC_FIELDS);
    if (!canteen || !canViewCanteen(req.user, canteen)) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }

    res.status(200).json({ canteen });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch canteen" });
  }
};

export const createCanteen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = canteenCreateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const data = validation.data;
    const isAdmin = isAdminRole(req.user.role);

    let ownerId: string | null = null;
    if (isAdmin) {
      ownerId = data.ownerId || null;
      if (ownerId) {
        const owner = await User.findById(ownerId);
        if (!owner || !isOwnerRole(owner.role)) {
          res.status(400).json({ error: "The selected account is not a canteen owner." });
          return;
        }
      }
    } else if (isOwnerRole(req.user.role)) {
      ownerId = req.user.userId;
    } else {
      res.status(403).json({ error: "Only canteen owners and administrators can create canteens." });
      return;
    }

    const code = data.code.trim().toUpperCase();
    const duplicate = await Canteen.findOne({ code });
    if (duplicate) {
      res.status(409).json({ error: "That canteen code is already in use." });
      return;
    }

    const canteen = await Canteen.create({
      ownerId,
      name: data.name.trim(),
      code,
      description: data.description || "",
      category: data.category || "Multi-cuisine",
      tagline: data.tagline || "",
      announcement: data.announcement || "",
      institution: { ...{
        collegeName: "",
        organizationName: "",
        logoUrl: null,
        location: "",
        campus: "",
        building: "",
        department: "",
      }, ...(data.institution || {}) },
      contact: { ...{ phone: "", email: "", alternatePhone: "", address: "" }, ...(data.contact || {}) },
      branding: { ...DEFAULT_BRANDING, ...(data.branding || {}) },
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      isActive: isAdmin ? data.isActive !== false : data.isActive !== false,
    });

    res.status(201).json({ message: "Canteen created", canteen });
  } catch (error) {
    if (error instanceof Error && error.message.includes("E11000")) {
      res.status(409).json({ error: "That canteen code is already in use." });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create canteen" });
  }
};

export const updateCanteen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to manage this canteen." });
      return;
    }

    const validation = canteenUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const isAdmin = isAdminRole(req.user.role);
    if (!isAdmin && validation.data.ownerId !== undefined) {
      res.status(403).json({ error: "Canteen ownership can only be changed by an administrator." });
      return;
    }

    if (validation.data.code) {
      const code = validation.data.code.trim().toUpperCase();
      const duplicate = await Canteen.findOne({ code, _id: { $ne: canteen._id } });
      if (duplicate) {
        res.status(409).json({ error: "That canteen code is already in use." });
        return;
      }
      validation.data.code = code;
    }

    if (isAdmin && validation.data.ownerId) {
      const owner = await User.findById(validation.data.ownerId);
      if (!owner || !isOwnerRole(owner.role)) {
        res.status(400).json({ error: "The selected account is not a canteen owner." });
        return;
      }
    }

    const update = flattenCanteenPayload(validation.data as Record<string, unknown>, isAdmin);
    const updated = await Canteen.findByIdAndUpdate(canteen._id, { $set: update }, { new: true, runValidators: true })
      .populate("ownerId", OWNER_PUBLIC_FIELDS);

    if (!updated) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }

    // Clean up replaced local images so uploads never become orphaned.
    if (update["branding.logoUrl"] !== undefined) {
      const oldLogo = canteen.branding?.logoUrl;
      if (oldLogo && oldLogo !== update["branding.logoUrl"]) deleteLocalUpload(oldLogo);
    }
    if (update["branding.backgroundUrl"] !== undefined) {
      const oldBackground = canteen.branding?.backgroundUrl;
      if (oldBackground && oldBackground !== update["branding.backgroundUrl"]) deleteLocalUpload(oldBackground);
    }

    res.status(200).json({ message: "Canteen updated", canteen: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update canteen" });
  }
};

export const updateBranding = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to manage this canteen." });
      return;
    }

    if (req.body?.reset === true) {
      const oldLogo = canteen.branding?.logoUrl;
      const oldBackground = canteen.branding?.backgroundUrl;
      canteen.branding = { ...DEFAULT_BRANDING };
      await canteen.save();
      if (oldLogo) deleteLocalUpload(oldLogo);
      if (oldBackground) deleteLocalUpload(oldBackground);
      res.status(200).json({ message: "Branding reset to defaults", branding: canteen.branding, canteen });
      return;
    }

    const validation = canteenBrandingSchema.partial().safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const oldLogo = canteen.branding?.logoUrl;
    const oldBackground = canteen.branding?.backgroundUrl;

    canteen.branding = {
      ...DEFAULT_BRANDING,
      ...canteen.branding,
      ...validation.data,
    } as typeof canteen.branding;
    await canteen.save();

    if (validation.data.logoUrl !== undefined && oldLogo && oldLogo !== validation.data.logoUrl) {
      deleteLocalUpload(oldLogo);
    }
    if (validation.data.backgroundUrl !== undefined && oldBackground && oldBackground !== validation.data.backgroundUrl) {
      deleteLocalUpload(oldBackground);
    }

    res.status(200).json({ message: "Branding saved", branding: canteen.branding, canteen });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update branding" });
  }
};

export const setCanteenActive = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to manage this canteen." });
      return;
    }

    canteen.isActive = Boolean(req.body?.isActive);
    await canteen.save();

    res.status(200).json({ message: `Canteen ${canteen.isActive ? "activated" : "deactivated"}`, canteen });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update canteen status" });
  }
};

export const deleteCanteen = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !isAdminRole(req.user.role)) {
      res.status(403).json({ error: "Only administrators can delete canteens." });
      return;
    }

    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }

    if (canteen.branding?.logoUrl) deleteLocalUpload(canteen.branding.logoUrl);
    if (canteen.branding?.backgroundUrl) deleteLocalUpload(canteen.branding.backgroundUrl);

    const items = await MenuItem.find({ canteen: canteen._id }).select("image");
    for (const item of items) {
      if (item.image) deleteLocalUpload(item.image);
    }

    await MenuItem.deleteMany({ canteen: canteen._id });
    await canteen.deleteOne();

    res.status(200).json({ message: "Canteen deleted. Historical orders were retained." });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete canteen" });
  }
};

/** Current (or most recent) operating session and its live counters. */
export const getCanteenSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to view this canteen session." });
      return;
    }

    const session = (await getOpenSession(canteen._id)) || (await getLatestSession(canteen._id));
    const ordersCount = session
      ? await Order.countDocuments({ canteen: canteen._id, session: session._id, status: { $ne: "CANCELLED" } })
      : 0;

    res.status(200).json({ session, ordersCount, canteen });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load session" });
  }
};

/**
 * Start a fresh operating session. Tokens start at #001 again, while all past
 * sessions and their orders remain permanently in the database.
 */
export const startCanteenSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to start this canteen." });
      return;
    }

    const alreadyOpen = await getOpenSession(canteen._id);
    if (alreadyOpen) {
      canteen.isActive = true;
      canteen.settings.acceptingOrders = true;
      await canteen.save();
      res.status(200).json({
        message: "Canteen is already open. The current token sequence continues.",
        session: alreadyOpen,
        canteen,
      });
      return;
    }

    // Reset daily preparation quantities for tracked items.
    const items = await MenuItem.find({ canteen: canteen._id }).select("defaultStock");
    for (const item of items) {
      if (typeof item.defaultStock === "number") {
        await MenuItem.updateOne({ _id: item._id }, { $set: { stock: item.defaultStock } });
      }
    }

    canteen.isActive = true;
    canteen.settings.acceptingOrders = true;
    await canteen.save();

    const session = await ensureOpenSession(canteen._id, req.user.userId);
    const io = req.app.get("io");
    if (io) io.emit("canteen:session", { canteenId: canteen._id, status: "OPEN", sessionId: session._id });

    res.status(201).json({ message: "Canteen opened. Token sequence reset to #001.", session, canteen });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start canteen" });
  }
};

/**
 * Close the operating session. Already paid/active orders are preserved and
 * can still be prepared, completed or refunded from the order queue.
 */
export const closeCanteenSession = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const canteen = await Canteen.findById(req.params.id);
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found" });
      return;
    }
    if (!canManageCanteen(req.user, canteen)) {
      res.status(403).json({ error: "You do not have permission to close this canteen." });
      return;
    }

    const open = await getOpenSession(canteen._id);
    if (open) {
      open.status = "CLOSED";
      open.closedAt = new Date();
      open.closedBy = new Types.ObjectId(req.user.userId);
      await open.save();
    }

    canteen.settings.acceptingOrders = false;
    await canteen.save();

    const io = req.app.get("io");
    if (io) io.emit("canteen:session", { canteenId: canteen._id, status: "CLOSED" });

    res.status(200).json({
      message: open ? "Canteen closed. Existing orders remain available." : "Canteen was already closed.",
      session: open,
      canteen,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to close canteen" });
  }
};

/** Convenience for owner onboarding: does the signed-in owner have any canteen yet? */
export const getMyCanteenSummary = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const ids = await accessibleCanteenIds(req.user);
    res.status(200).json({ count: ids === null ? await Canteen.countDocuments() : ids.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load summary" });
  }
};

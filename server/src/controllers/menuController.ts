import type { Response } from "express";
import { MenuItem } from "../models/MenuItem.js";
import { MenuCategory } from "../models/MenuCategory.js";
import { Canteen } from "../models/Canteen.js";
import { menuItemSchema, categoryCreateSchema, categoryRenameSchema, categoryDeleteSchema } from "../utils/validation.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { accessibleCanteenIds, canManageCanteen, findCanteenForUser } from "../utils/canteenAccess.js";
import { deleteLocalUpload } from "../utils/upload.js";
import { isAdminRole, isOwnerRole } from "../utils/roles.js";

async function scopedCanteenIds(req: AuthenticatedRequest): Promise<Awaited<ReturnType<typeof accessibleCanteenIds>>> {
  if (!req.user) return [];
  if (isAdminRole(req.user.role)) return null;
  if (isOwnerRole(req.user.role)) return accessibleCanteenIds(req.user);
  const canteens = await Canteen.find({ isActive: true }).select("_id");
  return canteens.map((c) => c._id);
}

async function buildMenuFilter(
  req: AuthenticatedRequest,
  management = false
): Promise<Record<string, unknown> | { error: string }> {
  if (!req.user) return { error: "Unauthorized" };

  const { category, available, search, canteenId, popular } = req.query;
  const filter: Record<string, unknown> = {};

  if (canteenId) {
    const canteen = await findCanteenForUser(req.user, String(canteenId), {
      requireManage: management,
    });
    if (!canteen) return { error: "Canteen not found or not accessible." };
    filter.canteen = canteen._id;
  } else {
    const ids = management && isAdminRole(req.user.role)
      ? null
      : management
        ? await accessibleCanteenIds(req.user)
        : await scopedCanteenIds(req);
    if (ids !== null && ids.length === 0 && !management) {
      // Backwards compatibility for records created before canteen scoping.
      filter.$or = [{ canteen: null }, { canteen: { $exists: false } }];
    } else if (ids !== null) {
      filter.canteen = { $in: ids };
    }
  }

  if (category && category !== "All") filter.category = category;
  if (available !== undefined) filter.available = available === "true";
  if (popular === "true") filter.popular = true;
  if (search) filter.name = { $regex: String(search), $options: "i" };

  return filter;
}

export const getMenuItems = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const filter = await buildMenuFilter(req);
    if ("error" in filter) {
      res.status(403).json({ error: filter.error });
      return;
    }

    const items = await MenuItem.find(filter).sort({ popular: -1, name: 1 });
    res.status(200).json({ items });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch menu" });
  }
};

export const getMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }

    if (item.canteen && req.user) {
      const canteen = await findCanteenForUser(req.user, item.canteen.toString());
      if (!canteen) {
        res.status(404).json({ error: "Menu item not found" });
        return;
      }
    }

    res.status(200).json({ item });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch item" });
  }
};

async function resolveTargetCanteen(
  req: AuthenticatedRequest,
  requestedId?: string | null
): Promise<{ id: string | null; error?: string; status?: number }> {
  if (!req.user) return { id: null, error: "Unauthorized", status: 401 };

  if (requestedId) {
    const canteen = await findCanteenForUser(req.user, requestedId, { requireManage: true });
    if (!canteen) return { id: null, error: "You cannot manage that canteen.", status: 403 };
    return { id: canteen._id.toString() };
  }

  if (isAdminRole(req.user.role)) {
    const first = await Canteen.findOne({ isActive: true }).sort({ createdAt: 1 }).select("_id");
    return { id: first ? first._id.toString() : null };
  }

  if (isOwnerRole(req.user.role)) {
    const owned = await Canteen.find({ ownerId: req.user.userId }).select("_id");
    if (owned.length === 0) {
      return { id: null, error: "Create a canteen before adding menu items.", status: 400 };
    }
    if (owned.length > 1) {
      return { id: null, error: "Select a canteen before adding menu items.", status: 400 };
    }
    return { id: owned[0]._id.toString() };
  }

  return { id: null, error: "Only owners and administrators can manage menus.", status: 403 };
}

async function canManageMenuRecord(req: AuthenticatedRequest, item: InstanceType<typeof MenuItem>): Promise<boolean> {
  if (!req.user) return false;
  if (!item.canteen) return isAdminRole(req.user.role);
  const canteen = await Canteen.findById(item.canteen);
  return !!canteen && canManageCanteen(req.user, canteen);
}

export const createMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = menuItemSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const target = await resolveTargetCanteen(req, validation.data.canteen || (req.query.canteenId as string));
    if (target.error) {
      res.status(target.status || 403).json({ error: target.error });
      return;
    }

    const item = await MenuItem.create({
      ...validation.data,
      canteen: target.id,
      defaultStock:
        validation.data.defaultStock !== undefined
          ? validation.data.defaultStock
          : typeof validation.data.stock === "number"
            ? validation.data.stock
            : null,
      stock:
        validation.data.stock !== undefined
          ? validation.data.stock
          : typeof validation.data.defaultStock === "number"
            ? validation.data.defaultStock
            : null,
    });
    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: target.id });

    res.status(201).json({ message: "Menu item created", item });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create item" });
  }
};

export const updateMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    if (!(await canManageMenuRecord(req, item))) {
      res.status(403).json({ error: "You cannot manage this menu item." });
      return;
    }

    const validation = menuItemSchema.partial().safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    if (validation.data.canteen) {
      const target = await resolveTargetCanteen(req, validation.data.canteen);
      if (target.error) {
        res.status(target.status || 403).json({ error: target.error });
        return;
      }
    }

    const oldImage = item.image;
    const updated = await MenuItem.findByIdAndUpdate(item._id, validation.data, { new: true, runValidators: true });

    // Remove a replaced local photo so uploads never become orphaned.
    if (validation.data.image !== undefined && oldImage && oldImage !== validation.data.image) {
      deleteLocalUpload(oldImage);
    }

    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: updated?.canteen?.toString() });

    res.status(200).json({ message: "Menu item updated", item: updated });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update item" });
  }
};

export const deleteMenuItem = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    if (!(await canManageMenuRecord(req, item))) {
      res.status(403).json({ error: "You cannot manage this menu item." });
      return;
    }

    await item.deleteOne();
    if (item.image) deleteLocalUpload(item.image);
    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: item.canteen?.toString() });

    res.status(200).json({ message: "Menu item deleted" });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete item" });
  }
};

export const getCategories = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const filter = await buildMenuFilter(req);
    if ("error" in filter) {
      res.status(403).json({ error: filter.error });
      return;
    }

    // Union of explicitly created categories and categories still present on items.
    const itemCategories = await MenuItem.distinct("category", filter);
    const scope: Record<string, unknown> = {};
    if (filter.canteen) scope.canteen = filter.canteen;
    const stored = Object.keys(scope).length ? await MenuCategory.find(scope).sort({ sortOrder: 1, name: 1 }) : [];

    const names = new Set<string>(stored.map((c) => c.name));
    for (const name of itemCategories) if (name) names.add(String(name));

    res.status(200).json({
      categories: [...names].sort((a, b) => a.localeCompare(b)),
      stored: stored.map((c) => ({ id: c._id.toString(), name: c.name, sortOrder: c.sortOrder })),
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch categories" });
  }
};

export const createCategory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = categoryCreateSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }
    const target = await resolveTargetCanteen(req, validation.data.canteenId);
    if (target.error || !target.id) {
      res.status(target.status || 403).json({ error: target.error || "Select a canteen first." });
      return;
    }

    const name = validation.data.name.trim();
    const existing = await MenuCategory.findOne({ canteen: target.id, name });
    if (existing) {
      res.status(200).json({ message: "Category already exists", category: existing });
      return;
    }

    const category = await MenuCategory.create({ canteen: target.id, name });
    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: target.id });
    res.status(201).json({ message: "Category created", category });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      res.status(409).json({ error: "That category already exists." });
      return;
    }
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create category" });
  }
};

export const renameCategory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const validation = categoryRenameSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }
    const target = await resolveTargetCanteen(req, validation.data.canteenId);
    if (target.error || !target.id) {
      res.status(target.status || 403).json({ error: target.error || "Select a canteen first." });
      return;
    }

    const oldName = String(req.params.name || "").trim();
    const newName = validation.data.name.trim();
    if (!oldName) {
      res.status(400).json({ error: "The current category name is required." });
      return;
    }

    await MenuCategory.updateOne(
      { canteen: target.id, name: oldName },
      { $set: { name: newName } },
      { upsert: true }
    );
    // Keep existing menu items in sync with the renamed category.
    const result = await MenuItem.updateMany(
      { canteen: target.id, category: oldName },
      { $set: { category: newName } }
    );

    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: target.id });
    res.status(200).json({
      message: `Category renamed. ${result.modifiedCount} item(s) updated.`,
      name: newName,
      updatedItems: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to rename category" });
  }
};

export const deleteCategory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const validation = categoryDeleteSchema.safeParse(req.body || {});
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }
    const target = await resolveTargetCanteen(req, validation.data.canteenId);
    if (target.error || !target.id) {
      res.status(target.status || 403).json({ error: target.error || "Select a canteen first." });
      return;
    }

    const name = String(req.params.name || "").trim();
    if (!name) {
      res.status(400).json({ error: "Category name is required." });
      return;
    }

    const reassignTo = validation.data.reassignTo?.trim();
    const itemsInCategory = await MenuItem.countDocuments({ canteen: target.id, category: name });
    if (itemsInCategory > 0 && !reassignTo) {
      res.status(409).json({
        error: `This category still has ${itemsInCategory} item(s). Choose another category to move them to, or delete/move the items first.`,
        itemCount: itemsInCategory,
      });
      return;
    }

    if (reassignTo) {
      await MenuItem.updateMany(
        { canteen: target.id, category: name },
        { $set: { category: reassignTo } }
      );
      await MenuCategory.updateOne(
        { canteen: target.id, name: reassignTo },
        { $setOnInsert: { sortOrder: 0 } },
        { upsert: true }
      );
    }

    await MenuCategory.deleteOne({ canteen: target.id, name });
    const io = req.app.get("io");
    if (io) io.emit("menu:updated", { canteenId: target.id });
    res.status(200).json({
      message: reassignTo
        ? `Category deleted. ${itemsInCategory} item(s) moved to ${reassignTo}.`
        : "Category deleted.",
      movedItems: itemsInCategory,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete category" });
  }
};

/** Inventory overview for the owner dashboard. */
export const getInventory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !isOwnerRole(req.user.role) && !isAdminRole(req.user.role)) {
      res.status(403).json({ error: "Only owners and administrators can view inventory." });
      return;
    }

    const filter = await buildMenuFilter(req, true);
    if ("error" in filter) {
      res.status(403).json({ error: filter.error });
      return;
    }

    const items = await MenuItem.find(filter).select("name category stock lowStockThreshold available image emoji canteen");
    const summary = {
      totalItems: items.length,
      availableItems: items.filter((i) => i.available).length,
      trackedItems: items.filter((i) => typeof i.stock === "number").length,
      lowStock: items.filter(
        (i) => typeof i.stock === "number" && (i.stock as number) <= (i.lowStockThreshold || 5)
      ).length,
      outOfStock: items.filter((i) => typeof i.stock === "number" && (i.stock as number) <= 0).length,
    };

    res.status(200).json({ items, summary });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch inventory" });
  }
};

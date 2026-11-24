import type { Response } from "express";
import type { Request } from "express";
import { Types } from "mongoose";
import { Canteen } from "../models/Canteen.js";
import { MenuItem } from "../models/MenuItem.js";
import { Order } from "../models/Order.js";
import { publicOrderSchema } from "../utils/validation.js";
import { prepareOrder, getLatestSession, getOpenSession, releaseStock, reserveStock } from "../utils/orderHelpers.js";
import { createOrderRecord, resolveSessionAndToken } from "../utils/orderCreation.js";

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function resolvePublicCanteen(code?: string, id?: string) {
  if (id && Types.ObjectId.isValid(id)) {
    const canteen = await Canteen.findOne({ _id: id, isActive: true });
    if (canteen) return canteen;
  }
  if (code) {
    return Canteen.findOne({
      code: code.trim().toUpperCase(),
      isActive: true,
    });
  }
  return null;
}

/** Public canteen + live menu for QR ordering. No account is required. */
export const getPublicCanteen = async (req: Request, res: Response): Promise<void> => {
  try {
    const canteen = await resolvePublicCanteen(
      firstParam(req.params.code),
      req.query.canteenId ? String(req.query.canteenId) : undefined
    );
    if (!canteen) {
      res.status(404).json({ error: "This canteen is not available. Ask the counter for a new QR code." });
      return;
    }

    const [items, session] = await Promise.all([
      MenuItem.find({ canteen: canteen._id, available: true }).sort({ popular: -1, name: 1 }),
      getOpenSession(canteen._id),
    ]);

    res.status(200).json({
      canteen: {
        _id: canteen._id,
        name: canteen.name,
        code: canteen.code,
        description: canteen.description,
        tagline: canteen.tagline,
        announcement: canteen.announcement,
        institution: canteen.institution,
        contact: canteen.contact,
        branding: canteen.branding,
        settings: {
          acceptingOrders: canteen.settings.acceptingOrders,
          openingTime: canteen.settings.openingTime,
          closingTime: canteen.settings.closingTime,
          preparationTime: canteen.settings.preparationTime,
          minOrderAmount: canteen.settings.minOrderAmount,
        },
        isActive: canteen.isActive,
      },
      items,
      session: session
        ? { _id: session._id, openedAt: session.openedAt, lastToken: session.tokenCounter }
        : null,
      acceptingOrders: canteen.isActive && canteen.settings.acceptingOrders,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load the canteen" });
  }
};

/**
 * Guest order from a QR code. Payment is collected at the counter, so the order
 * is created with a token immediately and the owner marks cash as collected.
 */
export const createPublicOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = publicOrderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const canteen = await resolvePublicCanteen(validation.data.canteenCode, validation.data.canteenId);
    if (!canteen) {
      res.status(404).json({ error: "This canteen is not available right now." });
      return;
    }

    const prepared = await prepareOrder({
      items: validation.data.items,
      canteenId: canteen._id.toString(),
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
      sessionToken = await resolveSessionAndToken(canteen._id, null);
    } catch (error) {
      await releaseStock(reserved.reserved);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "The canteen is not accepting orders right now.",
      });
      return;
    }

    let order: InstanceType<typeof Order>;
    try {
      order = await createOrderRecord({
        prepared,
        source: "GUEST",
        paymentMethod: "CASH",
        paymentStatus: "PENDING",
        guestName: validation.data.guestName,
        guestPhone: validation.data.guestPhone,
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
      io.to(`canteen-${canteen._id}`).emit("order:created", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
      });
    }

    res.status(201).json({
      message: `Order placed. Your token is ${order.token ? `#${String(order.token).padStart(3, "0")}` : "being prepared"}. Pay at the counter.`,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
        tokenLabel: order.token ? `#${String(order.token).padStart(3, "0")}` : null,
        items: order.items,
        totalAmount: order.totalAmount,
        status: order.status,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        guestName: order.guestName,
        estimatedReadyTime: order.estimatedReadyTime,
        createdAt: order.createdAt,
      },
      canteen: { _id: canteen._id, name: canteen.name, code: canteen.code },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to place the order" });
  }
};

/** Public order tracking. A phone number is required when one was supplied. */
export const trackPublicOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!Types.ObjectId.isValid(String(req.params.id))) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const order = await Order.findById(String(req.params.id)).populate(
      "canteen",
      "name code branding.logoUrl institution.collegeName contact.phone"
    );
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (order.user) {
      // Account orders are private; they are tracked through the signed-in app.
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const phone = req.query.phone ? String(req.query.phone).trim() : "";
    if (order.guestPhone && order.guestPhone !== phone) {
      res.status(403).json({ error: "Enter the phone number used for this order." });
      return;
    }

    res.status(200).json({
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
        tokenLabel: order.token ? `#${String(order.token).padStart(3, "0")}` : null,
        status: order.status,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        items: order.items,
        totalAmount: order.totalAmount,
        guestName: order.guestName,
        rejectionReason: order.rejectionReason,
        estimatedReadyTime: order.estimatedReadyTime,
        createdAt: order.createdAt,
        acceptedAt: order.acceptedAt,
        readyAt: order.readyAt,
        completedAt: order.completedAt,
        canteen: order.canteen,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to track the order" });
  }
};

/** Lightweight session strip used on the public QR page. */
export const getPublicSession = async (req: Request, res: Response): Promise<void> => {
  try {
    const canteen = await resolvePublicCanteen(
      firstParam(req.params.code),
      req.query.canteenId ? String(req.query.canteenId) : undefined
    );
    if (!canteen) {
      res.status(404).json({ error: "Canteen not found." });
      return;
    }
    const session = (await getOpenSession(canteen._id)) || (await getLatestSession(canteen._id));
    res.status(200).json({
      session: session
        ? {
            _id: session._id,
            status: session.status,
            openedAt: session.openedAt,
            closedAt: session.closedAt,
            lastToken: session.tokenCounter,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load session" });
  }
};

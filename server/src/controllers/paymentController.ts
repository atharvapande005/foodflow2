import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Order } from "../models/Order.js";
import { User } from "../models/User.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { onlineOrderSchema, verifyPaymentSchema } from "../utils/validation.js";
import { prepareOrder, releaseStock, reserveStock } from "../utils/orderHelpers.js";
import { createOrderRecord, resolveSessionAndToken } from "../utils/orderCreation.js";
import { isAdminRole } from "../utils/roles.js";
import {
  captureRazorpayPayment,
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  razorpayConfigured,
  RazorpayError,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../utils/razorpay.js";
import { failOnlineOrder, markOnlinePaymentPaid } from "../utils/paymentService.js";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function statusFor(error: unknown): number {
  return error instanceof RazorpayError ? error.status : 500;
}

function canUseOrder(req: AuthenticatedRequest, order: InstanceType<typeof Order>): boolean {
  if (!req.user) return false;
  if (isAdminRole(req.user.role)) return true;
  if (!order.user) return false;
  const userId =
    typeof order.user === "object" && order.user !== null && "_id" in order.user
      ? String((order.user as unknown as { _id: unknown })._id)
      : String(order.user);
  return userId === req.user.userId;
}

export const getPaymentConfig = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  res.status(200).json({
    configured: razorpayConfigured(),
    keyId: getRazorpayKeyId(),
    currency: "INR",
  });
};

/**
 * Step 1 of the online payment flow. Validates the cart against the database,
 * reserves stock, creates the FoodFlow order and then creates the matching
 * Razorpay order with a server-calculated amount.
 */
export const createOnlineOrder = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!razorpayConfigured()) {
      res.status(503).json({
        error:
          "Online payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the server, or pay with your wallet / at the counter.",
      });
      return;
    }

    const validation = onlineOrderSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const prepared = await prepareOrder({
      items: validation.data.items,
      canteenId: validation.data.canteenId,
    });
    if (!prepared.ok) {
      res.status(prepared.status).json({ error: prepared.error });
      return;
    }
    if (!prepared.canteen) {
      res.status(400).json({ error: "Select a canteen before paying." });
      return;
    }

    const reserved = await reserveStock(prepared.lines);
    if (!reserved.ok) {
      res.status(400).json({ error: reserved.error });
      return;
    }

    let sessionToken: Awaited<ReturnType<typeof resolveSessionAndToken>>;
    try {
      sessionToken = await resolveSessionAndToken(prepared.canteen._id, req.user.userId);
    } catch (error) {
      await releaseStock(reserved.reserved);
      res.status(400).json({ error: errorMessage(error, "The canteen is not accepting orders.") });
      return;
    }

    let order: InstanceType<typeof Order>;
    try {
      const student = await User.findById(req.user.userId).select("studentId");
      order = await createOrderRecord({
        prepared,
        userId: req.user.userId,
        studentId: student?.studentId,
        source: "STUDENT",
        paymentMethod: "ONLINE",
        paymentStatus: "PENDING",
        notes: validation.data.notes,
        stockReserved: true,
        sessionToken,
      });
    } catch (error) {
      await releaseStock(reserved.reserved);
      res.status(500).json({ error: errorMessage(error, "Could not create the order.") });
      return;
    }

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amount: order.totalAmount,
        receipt: order.orderNumber,
        notes: {
          orderId: order._id.toString(),
          canteenId: prepared.canteen._id.toString(),
        },
      });
    } catch (error) {
      await failOnlineOrder(order._id.toString(), "Payment could not be started");
      res.status(statusFor(error)).json({
        error: errorMessage(error, "The payment provider is unavailable. Please try again."),
      });
      return;
    }

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.status(201).json({
      message: "Payment order created",
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        token: order.token,
        totalAmount: order.totalAmount,
        paymentStatus: order.paymentStatus,
      },
      payment: {
        keyId: getRazorpayKeyId(),
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (error) {
    res.status(statusFor(error)).json({ error: errorMessage(error, "Failed to start online payment") });
  }
};

/**
 * Step 2. Verifies the Razorpay signature on the server, checks the provider's
 * amount/currency/order references and records the payment idempotently.
 */
export const verifyOnlinePayment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = verifyPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const order = await Order.findById(validation.data.orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (!canUseOrder(req, order)) {
      res.status(403).json({ error: "You cannot verify this payment." });
      return;
    }
    if (order.paymentMethod !== "ONLINE") {
      res.status(400).json({ error: "This order does not use online payment." });
      return;
    }
    if (order.paymentStatus === "PAID") {
      res.status(200).json({
        message: "Payment already verified.",
        duplicate: true,
        order,
        tokenLabel: order.token ? `#${String(order.token).padStart(3, "0")}` : null,
      });
      return;
    }
    if (!order.razorpayOrderId || order.razorpayOrderId !== validation.data.razorpayOrderId) {
      res.status(400).json({ error: "The payment does not match this order." });
      return;
    }

    if (!verifyPaymentSignature({
      razorpayOrderId: validation.data.razorpayOrderId,
      razorpayPaymentId: validation.data.razorpayPaymentId,
      signature: validation.data.razorpaySignature,
    })) {
      res.status(400).json({ error: "Payment signature verification failed." });
      return;
    }

    const expectedPaise = Math.round(order.totalAmount * 100);
    const [providerOrder, providerPayment] = await Promise.all([
      fetchRazorpayOrder(order.razorpayOrderId),
      fetchRazorpayPayment(validation.data.razorpayPaymentId),
    ]);

    if (providerOrder.amount !== expectedPaise || providerOrder.currency !== "INR") {
      res.status(400).json({ error: "The provider order amount does not match this order." });
      return;
    }
    if (providerPayment.order_id !== order.razorpayOrderId) {
      res.status(400).json({ error: "The payment belongs to a different provider order." });
      return;
    }
    if (providerPayment.amount !== expectedPaise || providerPayment.currency !== "INR") {
      res.status(400).json({ error: "The paid amount does not match this order." });
      return;
    }
    if (providerPayment.status === "authorized") {
      await captureRazorpayPayment(providerPayment.id, order.totalAmount);
    } else if (providerPayment.status !== "captured") {
      res.status(400).json({ error: `The payment is not complete (status: ${providerPayment.status}).` });
      return;
    }

    const result = await markOnlinePaymentPaid(
      order._id.toString(),
      providerPayment.id,
      validation.data.razorpaySignature
    );
    if (!result.ok) {
      res.status(result.status || 500).json({ error: result.error || "Could not record the payment." });
      return;
    }

    const paid = result.order || order;
    const io = req.app.get("io");
    if (io) {
      if (paid.user) {
        io.to(`user-${paid.user}`).emit("order:updated", { orderId: paid._id, status: paid.status, paymentStatus: "PAID" });
      }
      io.to(`order-${paid._id}`).emit("order:status", { status: paid.status, paymentStatus: "PAID" });
      if (paid.canteen) {
        io.to(`canteen-${paid.canteen}`).emit("order:created", {
          orderId: paid._id,
          orderNumber: paid.orderNumber,
          token: paid.token,
        });
      }
    }

    res.status(200).json({
      message: `Payment verified. Your token is ${paid.token ? `#${String(paid.token).padStart(3, "0")}` : "being prepared"}.`,
      duplicate: !!result.duplicate,
      order: paid,
      tokenLabel: paid.token ? `#${String(paid.token).padStart(3, "0")}` : null,
    });
  } catch (error) {
    res.status(statusFor(error)).json({ error: errorMessage(error, "Payment verification failed") });
  }
};

export const reportPaymentFailure = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const orderId = String(req.body?.orderId || "");
    if (!Types.ObjectId.isValid(orderId)) {
      res.status(400).json({ error: "A valid order id is required." });
      return;
    }
    const order = await Order.findById(orderId);
    if (!order) {
      res.status(404).json({ error: "Order not found." });
      return;
    }
    if (!canUseOrder(req, order)) {
      res.status(403).json({ error: "You cannot update this order." });
      return;
    }
    if (order.paymentStatus === "PAID") {
      res.status(409).json({ error: "This order has already been paid." });
      return;
    }

    const result = await failOnlineOrder(orderId, "Payment was cancelled or failed");
    res.status(200).json({ message: "Payment cancelled. Reserved stock was released.", order: result.order });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error, "Could not cancel the payment") });
  }
};

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };
    order?: { entity?: { id?: string; amount?: number; currency?: string } };
  };
}

/**
 * Razorpay webhook. Mounted with express.raw BEFORE express.json so the exact
 * bytes can be signature-verified. Processing is idempotent and agreement with
 * the local order is checked before any payment is recorded.
 */
export const razorpayWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

    if (!verifyWebhookSignature(raw, signature)) {
      res.status(400).json({ error: "Invalid webhook signature." });
      return;
    }

    const payload = JSON.parse(raw.toString("utf8")) as RazorpayWebhookPayload;
    const payment = payload.payload?.payment?.entity;
    if (!payment?.order_id) {
      res.status(200).json({ ok: true, ignored: "No payment entity in webhook." });
      return;
    }

    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (!order) {
      res.status(200).json({ ok: true, ignored: "Unknown provider order." });
      return;
    }

    if (payload.event === "payment.failed") {
      await failOnlineOrder(order._id.toString(), "Payment failed at the provider");
      res.status(200).json({ ok: true });
      return;
    }

    if (payload.event === "payment.captured" || payload.event === "order.paid") {
      const expectedPaise = Math.round(order.totalAmount * 100);
      if (
        typeof payment.amount === "number" &&
        payment.amount !== expectedPaise
      ) {
        res.status(200).json({ ok: true, ignored: "Amount mismatch; manual review required." });
        return;
      }
      if (payment.currency && payment.currency !== "INR") {
        res.status(200).json({ ok: true, ignored: "Currency mismatch; manual review required." });
        return;
      }
      await markOnlinePaymentPaid(order._id.toString(), payment.id || "webhook", null);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ok: true, ignored: payload.event || "unhandled event" });
  } catch (error) {
    console.error("[Razorpay] Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
};

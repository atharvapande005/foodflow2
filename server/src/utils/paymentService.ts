import { Order } from "../models/Order.js";
import { releaseOrderStock } from "./orderHelpers.js";
import { refundRazorpayPayment } from "./razorpay.js";

export interface PaymentResult {
  ok: boolean;
  order?: InstanceType<typeof Order>;
  duplicate?: boolean;
  refunded?: boolean;
  error?: string;
  status?: number;
}

/**
 * Release reserved stock exactly once for an order.
 * The stockReserved flag is the idempotency guard.
 */
export async function releaseStockOnce(order: InstanceType<typeof Order>): Promise<void> {
  if (!order.stockReserved) return;
  await releaseOrderStock(order.items);
  order.stockReserved = false;
}

/**
 * Mark an online order as paid. The update is atomic and guarded so two
 * concurrent verifications (browser + webhook) can never double-process.
 */
export async function markOnlinePaymentPaid(
  orderId: string,
  razorpayPaymentId: string,
  signature?: string | null
): Promise<PaymentResult> {
  const existing = await Order.findById(orderId);
  if (!existing) return { ok: false, status: 404, error: "Order not found." };

  if (existing.paymentStatus === "PAID") {
    return { ok: true, order: existing, duplicate: true };
  }

  if (existing.status === "CANCELLED") {
    // Payment captured after the order was already cancelled. Refund it so the
    // customer is never charged for a cancelled order.
    existing.razorpayPaymentId = razorpayPaymentId;
    if (signature) existing.razorpaySignature = signature;
    await existing.save();
    const refund = await refundOnlineOrder(existing, "Payment captured after cancellation");
    return refund.ok
      ? { ok: true, order: existing, refunded: true }
      : { ok: false, status: 502, error: refund.error, order: existing };
  }

  const updated = await Order.findOneAndUpdate(
    { _id: orderId, paymentStatus: { $ne: "PAID" } },
    {
      $set: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        razorpayPaymentId,
        razorpaySignature: signature || null,
        paymentProcessing: false,
      },
    },
    { new: true }
  );

  if (!updated) {
    const raced = await Order.findById(orderId);
    if (raced?.paymentStatus === "PAID") return { ok: true, order: raced, duplicate: true };
    return { ok: false, status: 409, error: "This payment could not be recorded." };
  }

  return { ok: true, order: updated };
}

/**
 * Mark an online order as failed/cancelled and return its reserved stock.
 * Safe to call repeatedly.
 */
export async function failOnlineOrder(
  orderId: string,
  reason: string
): Promise<PaymentResult> {
  const order = await Order.findById(orderId);
  if (!order) return { ok: false, status: 404, error: "Order not found." };
  if (order.paymentStatus === "PAID") {
    return { ok: false, status: 409, error: "This order is already paid.", order };
  }
  if (order.status === "CANCELLED") return { ok: true, order };

  await releaseStockOnce(order);
  order.status = "CANCELLED";
  order.paymentStatus = "FAILED";
  order.cancelledAt = new Date();
  order.rejectionReason = reason.slice(0, 300);
  await order.save();

  return { ok: true, order };
}

/**
 * Refund an online payment through Razorpay. Payment status only becomes
 * REFUNDED when the provider accepts the refund.
 */
export async function refundOnlineOrder(
  order: InstanceType<typeof Order>,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (order.paymentStatus === "REFUNDED") return { ok: true };
  if (!order.razorpayPaymentId) {
    order.refundStatus = "FAILED";
    await order.save();
    return { ok: false, error: "No online payment reference is stored for this order." };
  }

  try {
    const refund = await refundRazorpayPayment(order.razorpayPaymentId, order.totalAmount);
    order.refundId = refund.id;
    order.refundStatus = refund.status === "processed" ? "PROCESSED" : "PENDING";
    order.refundedAt = new Date();
    if (refund.status === "processed") {
      order.paymentStatus = "REFUNDED";
    }
    order.rejectionReason = order.rejectionReason || reason.slice(0, 300);
    await order.save();
    return { ok: true };
  } catch (error) {
    order.refundStatus = "FAILED";
    await order.save();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The payment provider rejected the refund.",
    };
  }
}

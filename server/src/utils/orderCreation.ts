import { Types } from "mongoose";
import { Order, type OrderStatus } from "../models/Order.js";
import type { PreparedOrder } from "./orderHelpers.js";
import { allocateToken, ensureOpenSession, generateOrderNumber } from "./orderHelpers.js";

function isDuplicateKeyError(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000;
}

export interface SessionToken {
  sessionId: string;
  token: number;
}

export async function resolveSessionAndToken(
  canteenId: Types.ObjectId | string,
  actorId?: string | null
): Promise<SessionToken> {
  const session = await ensureOpenSession(canteenId, actorId);
  const token = await allocateToken(session._id);
  return { sessionId: session._id.toString(), token };
}

export interface CreateOrderInput {
  prepared: PreparedOrder;
  userId?: string | null;
  createdBy?: string | null;
  source: "STUDENT" | "GUEST" | "COUNTER";
  paymentMethod: "WALLET" | "CASH" | "ONLINE";
  paymentStatus: "PENDING" | "PAID";
  status?: OrderStatus;
  guestName?: string;
  guestPhone?: string;
  studentId?: string | null;
  notes?: string;
  stockReserved?: boolean;
  razorpayOrderId?: string | null;
  sessionToken?: SessionToken | null;
}

/**
 * Create the permanent order record. The order number is retried on the rare
 * chance of a collision, and prices/totals always come from PreparedOrder,
 * which was built from the database.
 */
export async function createOrderRecord(
  input: CreateOrderInput
): Promise<InstanceType<typeof Order>> {
  const canteen = input.prepared.canteen;
  if (!canteen) throw new Error("An order must belong to a canteen.");

  const preparation = canteen.settings?.preparationTime || 15;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await Order.create({
        orderNumber: generateOrderNumber(),
        canteen: canteen._id,
        user: input.userId || null,
        createdBy: input.createdBy || null,
        guestName: input.guestName || undefined,
        guestPhone: input.guestPhone || undefined,
        studentId: input.studentId || null,
        orderSource: input.source,
        items: input.prepared.orderItems,
        totalAmount: input.prepared.totalAmount,
        status: input.status || "PLACED",
        paymentMethod: input.paymentMethod,
        paymentStatus: input.paymentStatus,
        stockReserved: input.stockReserved !== false,
        token: input.sessionToken?.token ?? null,
        session: input.sessionToken?.sessionId ?? null,
        notes: input.notes,
        acceptedAt: input.status === "PREPARING" ? new Date() : null,
        paidAt: input.paymentStatus === "PAID" ? new Date() : null,
        razorpayOrderId: input.razorpayOrderId || null,
        estimatedReadyTime: new Date(Date.now() + preparation * 60 * 1000),
      });
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Could not allocate an order number. Please retry.");
}

import { Schema, model, type Document, type Types } from "mongoose";

export type OrderStatus = "PLACED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
export type PaymentMethod = "WALLET" | "CASH" | "ONLINE";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";
export type OrderSource = "STUDENT" | "GUEST" | "COUNTER";

export interface IOrderItem {
  menuItem: Types.ObjectId;
  name: string;
  price: number;
  quantity: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  canteen?: Types.ObjectId | null;
  /** Null for guest and counter orders. */
  user?: Types.ObjectId | null;
  /** The owner/admin who recorded a counter order. */
  createdBy?: Types.ObjectId | null;
  guestName?: string;
  guestPhone?: string;
  /**
   * Snapshot of the student's college ID at order time. Hidden by default;
   * only administrative order queries explicitly select it.
   */
  studentId?: string | null;
  orderSource: OrderSource;
  items: IOrderItem[];
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  stockReserved: boolean;
  paymentProcessing: boolean;
  token?: number | null;
  session?: Types.ObjectId | null;
  notes?: string;
  rejectionReason?: string;
  estimatedReadyTime?: Date;
  acceptedAt?: Date | null;
  readyAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  paidAt?: Date | null;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  razorpaySignature?: string | null;
  refundId?: string | null;
  refundStatus?: "NONE" | "PENDING" | "PROCESSED" | "FAILED";
  refundedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    canteen: { type: Schema.Types.ObjectId, ref: "Canteen", default: null, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    guestName: { type: String, trim: true, maxlength: 80 },
    guestPhone: { type: String, trim: true, maxlength: 30 },
    studentId: { type: String, trim: true, maxlength: 40, default: null, select: false },
    orderSource: { type: String, enum: ["STUDENT", "GUEST", "COUNTER"], default: "STUDENT", index: true },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(v: IOrderItem[]) => v.length > 0, "Order must have at least one item"],
    },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"],
      default: "PLACED",
    },
    paymentMethod: { type: String, enum: ["WALLET", "CASH", "ONLINE"], default: "WALLET" },
    paymentStatus: { type: String, enum: ["PENDING", "PAID", "REFUNDED", "FAILED"], default: "PENDING" },
    stockReserved: { type: Boolean, default: false },
    paymentProcessing: { type: Boolean, default: false },
    token: { type: Number, default: null },
    session: { type: Schema.Types.ObjectId, ref: "OperatingSession", default: null, index: true },
    notes: { type: String, trim: true, maxlength: 500 },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
    estimatedReadyTime: { type: Date },
    acceptedAt: { type: Date, default: null },
    readyAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    razorpayOrderId: { type: String, default: null, index: true },
    razorpayPaymentId: { type: String, default: null },
    razorpaySignature: { type: String, default: null },
    refundId: { type: String, default: null },
    refundStatus: {
      type: String,
      enum: ["NONE", "PENDING", "PROCESSED", "FAILED"],
      default: "NONE",
    },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ canteen: 1, createdAt: -1 });
orderSchema.index({ canteen: 1, session: 1, token: 1 });
orderSchema.index({ canteen: 1, paymentMethod: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ guestPhone: 1, createdAt: -1 }, { sparse: true });

export const Order = model<IOrder>("Order", orderSchema);

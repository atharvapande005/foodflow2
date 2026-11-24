import { Schema, model, type Document, type Types } from "mongoose";

export type TransactionType = "TOPUP" | "ORDER_PAYMENT" | "REFUND" | "ADMIN_ADJUSTMENT";

export interface ITransaction extends Document {
  user: Types.ObjectId;
  type: TransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  referenceId?: string;
  createdAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["TOPUP", "ORDER_PAYMENT", "REFUND", "ADMIN_ADJUSTMENT"], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    referenceId: { type: String },
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });

export const Transaction = model<ITransaction>("Transaction", transactionSchema);

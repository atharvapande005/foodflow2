
import { Schema, model, type Document, type Types } from "mongoose";

export type WalletTopupStatus = "PENDING" | "PAID" | "FAILED";

export interface IWalletTopup extends Document {
    user: Types.ObjectId;
    amount: number;
    currency: string;
    razorpayOrderId: string;
    razorpayPaymentId?: string;
    status: WalletTopupStatus;
    createdAt: Date;
    updatedAt: Date;
}

const walletTopupSchema = new Schema<IWalletTopup>(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 10,
            max: 10000,
        },
        currency: {
            type: String,
            required: true,
            enum: ["INR"],
            default: "INR",
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
        },
        razorpayPaymentId: {
            type: String,
            unique: true,
            sparse: true,
        },
        status: {
            type: String,
            enum: ["PENDING", "PAID", "FAILED"],
            default: "PENDING",
            required: true,
        },
    },
    { timestamps: true }
);

walletTopupSchema.index({ user: 1, createdAt: -1 });

export const WalletTopup = model<IWalletTopup>(
    "WalletTopup",
    walletTopupSchema
);

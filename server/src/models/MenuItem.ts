import { Schema, model, type Document, type Types } from "mongoose";

export interface IMenuItem extends Document {
  canteen?: Types.ObjectId | null;
  name: string;
  description: string;
  category: string;
  price: number;
  emoji: string;
  image?: string;
  available: boolean;
  popular: boolean;
  preparationTime: number;
  /** Daily preparation quantity used to reset stock when a new operating session starts. */
  defaultStock?: number | null;
  /** Remaining quantity for the current operating session. null means unlimited / not tracked. */
  stock?: number | null;
  lowStockThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

const menuItemSchema = new Schema<IMenuItem>(
  {
    canteen: { type: Schema.Types.ObjectId, ref: "Canteen", default: null, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    category: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    emoji: { type: String, default: "🍽️" },
    image: { type: String },
    available: { type: Boolean, default: true },
    popular: { type: Boolean, default: false },
    preparationTime: { type: Number, default: 10 },
    defaultStock: { type: Number, default: null, min: 0 },
    // null means "not tracked / unlimited"; a number is the remaining quantity
    stock: { type: Number, default: null, min: 0 },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ category: 1 });
menuItemSchema.index({ available: 1 });
menuItemSchema.index({ canteen: 1, available: 1, category: 1 });

export const MenuItem = model<IMenuItem>("MenuItem", menuItemSchema);

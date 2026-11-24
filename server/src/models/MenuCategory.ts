import { Schema, model, type Document, type Types } from "mongoose";

/**
 * Categories are stored per canteen so an owner can create a category before
 * adding items to it, rename it, or delete it without affecting other canteens.
 * MenuItem.category remains a string for backwards compatibility.
 */
export interface IMenuCategory extends Document {
  canteen: Types.ObjectId;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const menuCategorySchema = new Schema<IMenuCategory>(
  {
    canteen: { type: Schema.Types.ObjectId, ref: "Canteen", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuCategorySchema.index({ canteen: 1, name: 1 }, { unique: true });

export const MenuCategory = model<IMenuCategory>("MenuCategory", menuCategorySchema);

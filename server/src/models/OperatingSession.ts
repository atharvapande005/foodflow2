import { Schema, model, type Document, type Types } from "mongoose";

export type OperatingSessionStatus = "OPEN" | "CLOSED";

/**
 * One canteen can have at most one OPEN session (enforced by a partial unique index).
 * Tokens are allocated from tokenCounter and only reset when a new session opens.
 * Closed sessions stay in the database permanently for reporting and audit.
 */
export interface IOperatingSession extends Document {
  canteen: Types.ObjectId;
  status: OperatingSessionStatus;
  tokenCounter: number;
  openedAt: Date;
  closedAt?: Date | null;
  openedBy?: Types.ObjectId | null;
  closedBy?: Types.ObjectId | null;
  summaryArchivedAt?: Date | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const operatingSessionSchema = new Schema<IOperatingSession>(
  {
    canteen: { type: Schema.Types.ObjectId, ref: "Canteen", required: true, index: true },
    status: { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN", index: true },
    tokenCounter: { type: Number, default: 0, min: 0 },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    openedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    summaryArchivedAt: { type: Date, default: null },
    notes: { type: String, default: "", maxlength: 400 },
  },
  { timestamps: true }
);

// Only OPEN sessions are indexed here so the partial unique index can enforce
// "at most one open session per canteen" without conflicting with closed history.
operatingSessionSchema.index(
  { canteen: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "OPEN" } }
);
operatingSessionSchema.index({ canteen: 1, openedAt: -1 });

export const OperatingSession = model<IOperatingSession>("OperatingSession", operatingSessionSchema);

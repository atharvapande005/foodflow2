import { Schema, model, type Document, type Types } from "mongoose";

export type UserRole = "STUDENT" | "FACULTY" | "STAFF" | "ADMIN" | "CANTEEN_OPERATOR";
export type AccountType = "STUDENT" | "EMPLOYEE";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  accountType?: AccountType;
  studentId?: string;
  employeeId?: string;
  phone?: string;
  avatar?: string;
  walletBalance: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["STUDENT", "FACULTY", "STAFF", "ADMIN", "CANTEEN_OPERATOR"],
      default: "STUDENT",
    },
    accountType: { type: String, enum: ["STUDENT", "EMPLOYEE"], default: "STUDENT" },
    studentId: { type: String, trim: true, maxlength: 40 },
    employeeId: { type: String, trim: true, maxlength: 40 },
    phone: { type: String, trim: true },
    avatar: { type: String },
    walletBalance: { type: Number, default: 0.0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ studentId: 1 }, { sparse: true });
userSchema.index({ employeeId: 1 }, { sparse: true });

export const User = model<IUser>("User", userSchema);

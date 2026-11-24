import { Schema, model, type Document, type Types } from "mongoose";

export interface CanteenBranding {
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  backgroundOpacity: number;
  backgroundPosition: string;
  backgroundSize: string;
  overlayColor: string;
  overlayOpacity: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  buttonColor: string;
  logoScale: number;
}

export interface CanteenInstitution {
  collegeName: string;
  organizationName: string;
  logoUrl?: string | null;
  location: string;
  campus: string;
  building: string;
  department: string;
}

export interface CanteenContact {
  phone: string;
  email: string;
  alternatePhone: string;
  address: string;
}

export interface CanteenSettings {
  acceptingOrders: boolean;
  openingTime: string;
  closingTime: string;
  operatingDays: string[];
  preparationTime: number;
  preOpeningMinutes: number;
  minOrderAmount: number;
  contactVisible: boolean;
  dailySummaryHours: number;
}

export interface ICanteen extends Document {
  ownerId?: Types.ObjectId | null;
  name: string;
  code: string;
  description: string;
  category: string;
  tagline: string;
  announcement: string;
  institution: CanteenInstitution;
  contact: CanteenContact;
  branding: CanteenBranding;
  settings: CanteenSettings;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Warm FoodFlow defaults: brown, beige, cream and orange.
 * These are only defaults. Each canteen stores and renders its own independent values.
 */
export const DEFAULT_BRANDING: CanteenBranding = {
  logoUrl: null,
  backgroundUrl: null,
  backgroundOpacity: 0.4,
  backgroundPosition: "center",
  backgroundSize: "cover",
  overlayColor: "#302820",
  overlayOpacity: 0.3,
  primaryColor: "#70452B",
  secondaryColor: "#493021",
  accentColor: "#D98236",
  buttonColor: "#D98236",
  logoScale: 1,
};

export const DEFAULT_SETTINGS: CanteenSettings = {
  acceptingOrders: true,
  openingTime: "08:00",
  closingTime: "21:00",
  operatingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
  preparationTime: 15,
  preOpeningMinutes: 15,
  minOrderAmount: 0,
  contactVisible: true,
  dailySummaryHours: 20,
};

const opacity = {
  type: Number,
  min: 0,
  max: 1,
};

const canteenSchema = new Schema<ICanteen>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    name: { type: String, required: true, trim: true, maxlength: 90 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 24 },
    description: { type: String, default: "", maxlength: 1200 },
    category: { type: String, default: "Multi-cuisine", trim: true },
    tagline: { type: String, default: "", maxlength: 140 },
    announcement: { type: String, default: "", maxlength: 300 },
    institution: {
      collegeName: { type: String, default: "", trim: true },
      organizationName: { type: String, default: "", trim: true },
      logoUrl: { type: String, default: null },
      location: { type: String, default: "", trim: true },
      campus: { type: String, default: "", trim: true },
      building: { type: String, default: "", trim: true },
      department: { type: String, default: "", trim: true },
    },
    contact: {
      phone: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true, lowercase: true },
      alternatePhone: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
    },
    branding: {
      logoUrl: { type: String, default: null },
      backgroundUrl: { type: String, default: null },
      backgroundOpacity: { ...opacity, default: DEFAULT_BRANDING.backgroundOpacity },
      backgroundPosition: {
        type: String,
        enum: ["center", "top", "bottom", "left", "right", "center top", "center bottom"],
        default: DEFAULT_BRANDING.backgroundPosition,
      },
      backgroundSize: {
        type: String,
        enum: ["cover", "contain", "auto"],
        default: DEFAULT_BRANDING.backgroundSize,
      },
      overlayColor: { type: String, default: DEFAULT_BRANDING.overlayColor },
      overlayOpacity: { ...opacity, default: DEFAULT_BRANDING.overlayOpacity },
      primaryColor: { type: String, default: DEFAULT_BRANDING.primaryColor },
      secondaryColor: { type: String, default: DEFAULT_BRANDING.secondaryColor },
      accentColor: { type: String, default: DEFAULT_BRANDING.accentColor },
      buttonColor: { type: String, default: DEFAULT_BRANDING.buttonColor },
      logoScale: { type: Number, min: 0.5, max: 2, default: 1 },
    },
    settings: {
      acceptingOrders: { type: Boolean, default: true },
      openingTime: { type: String, default: DEFAULT_SETTINGS.openingTime },
      closingTime: { type: String, default: DEFAULT_SETTINGS.closingTime },
      operatingDays: { type: [String], default: DEFAULT_SETTINGS.operatingDays },
      preparationTime: { type: Number, min: 1, max: 240, default: DEFAULT_SETTINGS.preparationTime },
      preOpeningMinutes: { type: Number, min: 0, max: 240, default: DEFAULT_SETTINGS.preOpeningMinutes },
      minOrderAmount: { type: Number, min: 0, default: 0 },
      contactVisible: { type: Boolean, default: true },
      dailySummaryHours: { type: Number, min: 1, max: 72, default: DEFAULT_SETTINGS.dailySummaryHours },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

canteenSchema.index({ ownerId: 1, isActive: 1 });
canteenSchema.index({ name: "text", description: "text", "institution.collegeName": "text" });

export const Canteen = model<ICanteen>("Canteen", canteenSchema);

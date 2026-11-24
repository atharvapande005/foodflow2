import { Schema, model, type Document } from "mongoose";

/** A single platform-wide settings document (key: "platform"). */
export interface IPlatformSettings extends Document {
  key: string;
  logoUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const platformSettingsSchema = new Schema<IPlatformSettings>(
  {
    key: { type: String, required: true, unique: true, default: "platform" },
    logoUrl: { type: String, default: null },
  },
  { timestamps: true }
);

export const PlatformSettings = model<IPlatformSettings>("PlatformSettings", platformSettingsSchema);

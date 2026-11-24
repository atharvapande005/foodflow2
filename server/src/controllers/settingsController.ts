import type { Request, Response } from "express";
import { PlatformSettings } from "../models/PlatformSettings.js";
import { platformSettingsSchema } from "../utils/validation.js";
import { deleteLocalUpload } from "../utils/upload.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

const SINGLETON_KEY = "platform";

/**
 * Public read so the sidebar can render the configured logo before any
 * administrative request. Only the logo URL is exposed.
 */
export const getPlatformSettings = async (_req: Request, res: Response): Promise<void> => {
  try {
    const settings = await PlatformSettings.findOne({ key: SINGLETON_KEY });
    res.status(200).json({ settings: { logoUrl: settings?.logoUrl ?? null } });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to load settings" });
  }
};

/** Admin-only. An empty logoUrl removes the custom logo and restores the default. */
export const updatePlatformSettings = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    const validation = platformSettingsSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const previous = await PlatformSettings.findOne({ key: SINGLETON_KEY });
    const logoUrl = validation.data.logoUrl || null;

    const settings = await PlatformSettings.findOneAndUpdate(
      { key: SINGLETON_KEY },
      { $set: { logoUrl } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (previous?.logoUrl && previous.logoUrl !== logoUrl) {
      deleteLocalUpload(previous.logoUrl);
    }

    res.status(200).json({
      message: logoUrl ? "Platform logo updated" : "Default platform logo restored",
      settings: { logoUrl: settings.logoUrl ?? null },
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to save settings" });
  }
};

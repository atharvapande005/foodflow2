import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { uploadKindSchema } from "../utils/validation.js";
import { isAdminRole, isManagerRole } from "../utils/roles.js";
import { deleteLocalUpload } from "../utils/upload.js";

function discardUpload(req: AuthenticatedRequest): void {
  if (req.file) deleteLocalUpload(`/uploads/${req.file.filename}`);
}

/**
 * Receives a single image field named "image" and returns a stable URL.
 * Files are streamed to disk (never stored as base64 in MongoDB).
 */
export const uploadSingleImage = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      discardUpload(req);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "No image file received. Use the 'image' field." });
      return;
    }

    const kindCheck = uploadKindSchema.safeParse(req.query.kind || "canteen");
    if (!kindCheck.success) {
      discardUpload(req);
      res.status(400).json({ error: "Invalid upload type." });
      return;
    }

    // Any signed-in user may set an avatar; everything else is management content.
    if (kindCheck.data !== "avatar" && !isManagerRole(req.user.role)) {
      discardUpload(req);
      res.status(403).json({ error: "Only canteen owners and administrators can upload canteen images." });
      return;
    }
    // The platform sidebar logo is a platform-wide setting, so only admins may change it.
    if (kindCheck.data === "platform" && !isAdminRole(req.user.role)) {
      discardUpload(req);
      res.status(403).json({ error: "Only administrators can change the platform logo." });
      return;
    }

    const url = `/uploads/${req.file.filename}`;
    res.status(201).json({
      message: "Image uploaded",
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  } catch (error) {
    discardUpload(req);
    res.status(500).json({ error: error instanceof Error ? error.message : "Upload failed" });
  }
};

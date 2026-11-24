import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads");

const ALLOWED_MIME = new Map<string, string>([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/avif", ".avif"],
]);

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const kind = String((req.query.kind as string) || (req.body?.kind as string) || "image")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 24) || "image";
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname).toLowerCase();
    cb(null, `${kind}-${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

export const uploadImage = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error("Unsupported image type. Use JPEG, PNG, WebP, GIF or AVIF."));
      return;
    }
    cb(null, true);
  },
});

/** Remove a previously uploaded local file. Remote URLs are left untouched. */
export function deleteLocalUpload(url?: string | null): void {
  if (!url || !url.startsWith("/uploads/")) return;
  const filename = path.basename(url);
  const target = path.join(UPLOAD_DIR, filename);
  if (!target.startsWith(UPLOAD_DIR)) return;
  fs.promises.unlink(target).catch(() => undefined);
}

/** Resolve a local upload path for static serving. */
export function uploadsStaticPath(): string {
  return UPLOAD_DIR;
}

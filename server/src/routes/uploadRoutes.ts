import { Router } from "express";
import { authenticate } from "../middleware/authMiddleware.js";
import { uploadImage } from "../utils/upload.js";
import { uploadSingleImage } from "../controllers/uploadController.js";

const router = Router();

router.post("/image", authenticate, uploadImage.single("image"), uploadSingleImage);

export default router;

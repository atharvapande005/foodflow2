import { Router } from "express";
import {
  createPublicOrder,
  getPublicCanteen,
  getPublicSession,
  trackPublicOrder,
} from "../controllers/publicController.js";

const router = Router();

router.get("/canteens/:code", getPublicCanteen);
router.get("/canteens/:code/session", getPublicSession);
router.post("/orders", createPublicOrder);
router.get("/orders/:id", trackPublicOrder);

export default router;

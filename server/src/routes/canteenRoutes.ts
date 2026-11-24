import { Router } from "express";
import {
  listCanteens,
  listMyCanteens,
  getMyCanteenSummary,
  getCanteenById,
  createCanteen,
  updateCanteen,
  updateBranding,
  setCanteenActive,
  getCanteenSession,
  startCanteenSession,
  closeCanteenSession,
  deleteCanteen,
} from "../controllers/canteenController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authenticate, listCanteens);
router.get("/mine", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), listMyCanteens);
router.get("/summary", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), getMyCanteenSummary);
router.post("/", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), createCanteen);
router.get("/:id/session", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), getCanteenSession);
router.post("/:id/session/start", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), startCanteenSession);
router.post("/:id/session/close", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), closeCanteenSession);
router.get("/:id", authenticate, getCanteenById);
router.put("/:id", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), updateCanteen);
router.patch("/:id/branding", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), updateBranding);
router.patch("/:id/status", authenticate, authorize(["CANTEEN_OPERATOR", "ADMIN"]), setCanteenActive);
router.delete("/:id", authenticate, authorize(["ADMIN"]), deleteCanteen);

export default router;

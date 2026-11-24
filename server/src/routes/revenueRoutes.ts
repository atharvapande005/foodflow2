import { Router } from "express";
import { getCanteenRevenue, getRevenue, getSessions } from "../controllers/revenueController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]));

router.get("/", getRevenue);
router.get("/sessions", getSessions);
router.get("/canteens", getCanteenRevenue);

export default router;

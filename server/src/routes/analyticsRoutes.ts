import { Router } from "express";
import { getDashboardStats, getSalesAnalytics, getUserStats } from "../controllers/analyticsController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/dashboard", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), getDashboardStats);
router.get("/sales", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), getSalesAnalytics);
router.get("/users", authenticate, authorize(["ADMIN"]), getUserStats);

export default router;

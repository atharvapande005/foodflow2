import { Router } from "express";
import {
  createOrder,
  getMyOrders,
  getAllOrders,
  updateOrderStatus,
  getOrderById,
  getOwnerOrderSummary,
} from "../controllers/orderController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authenticate, createOrder);
router.get("/my", authenticate, getMyOrders);
router.get("/summary", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), getOwnerOrderSummary);
router.get("/", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), getAllOrders);
router.get("/:id", authenticate, getOrderById);
router.patch("/:id/status", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), updateOrderStatus);

export default router;

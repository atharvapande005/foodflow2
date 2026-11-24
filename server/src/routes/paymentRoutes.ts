import { Router } from "express";
import {
  createOnlineOrder,
  getPaymentConfig,
  reportPaymentFailure,
  verifyOnlinePayment,
} from "../controllers/paymentController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/config", authenticate, getPaymentConfig);
router.post("/online/order", authenticate, createOnlineOrder);
router.post("/verify", authenticate, verifyOnlinePayment);
router.post("/failed", authenticate, reportPaymentFailure);

export default router;

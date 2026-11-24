import { Router } from "express";
import {
    getBalance,
    createWalletTopupOrder,
    verifyWalletTopup,
    getTransactionHistory,
} from "../controllers/walletController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/balance", authenticate, getBalance);
router.post("/topup/order", authenticate, createWalletTopupOrder);
router.post("/topup/verify", authenticate, verifyWalletTopup);
router.get("/transactions", authenticate, getTransactionHistory);

export default router;
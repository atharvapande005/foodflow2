import { Router } from "express";
import { getBalance, topupWallet, getTransactionHistory } from "../controllers/walletController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/balance", authenticate, getBalance);
router.post("/topup", authenticate, topupWallet);
router.get("/transactions", authenticate, getTransactionHistory);

export default router;

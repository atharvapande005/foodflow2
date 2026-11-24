import type { Response } from "express";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";
import { topupSchema } from "../utils/validation.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";

export const getBalance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await User.findById(req.user.userId).select("walletBalance");
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.status(200).json({ walletBalance: user.walletBalance });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch balance" });
  }
};

export const topupWallet = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = topupSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const { amount } = validation.data;
    const user = await User.findById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    user.walletBalance += amount;
    await user.save();

    const transaction = await Transaction.create({
      user: user._id,
      type: "TOPUP",
      amount,
      balanceAfter: user.walletBalance,
      description: `Wallet top-up of ₹${amount}`,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user-${user._id}`).emit("wallet:updated", { balance: user.walletBalance });
    }

    res.status(200).json({
      message: `₹${amount} added to wallet`,
      walletBalance: user.walletBalance,
      transaction,
    });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Top-up failed" });
  }
};

export const getTransactionHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const transactions = await Transaction.find({ user: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ transactions });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch transactions" });
  }
};

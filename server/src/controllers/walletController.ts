import type { Response } from "express";
import mongoose, { Types } from "mongoose";
import { User } from "../models/User.js";
import { Transaction } from "../models/Transaction.js";
import { WalletTopup } from "../models/WalletTopup.js";
import {
  createWalletTopupSchema,
  verifyWalletTopupSchema,
} from "../utils/validation.js";
import type { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import {
  createRazorpayOrder,
  fetchRazorpayOrder,
  fetchRazorpayPayment,
  getRazorpayKeyId,
  razorpayConfigured,
  RazorpayError,
  verifyPaymentSignature,
  captureRazorpayPayment,
} from "../utils/razorpay.js";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function errorStatus(error: unknown): number {
  return error instanceof RazorpayError ? error.status : 500;
}

function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export const getBalance = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
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
    res.status(500).json({
      error: errorMessage(error, "Failed to fetch balance"),
    });
  }
};

/**
 * Creates a server-side Razorpay order for wallet recharge.
 * No wallet balance is changed in this endpoint.
 */
export const createWalletTopupOrder = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!razorpayConfigured()) {
      res.status(503).json({ error: "Wallet recharge is currently unavailable." });
      return;
    }

    const validation = createWalletTopupSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const user = await User.findById(req.user.userId).select("_id isActive");

    if (!user || !user.isActive) {
      res.status(403).json({ error: "Your account is unavailable." });
      return;
    }

    // Round to 2 decimal places so rupee amounts don't suffer from floating-point drift.
    const amount = Number(validation.data.amount.toFixed(2));

    // Create the payment order using the validated server-side amount.
    const razorpayOrder = await createRazorpayOrder({
      amount,
      receipt: `wallet_${new Types.ObjectId().toString()}`,
      notes: {
        userId: user._id.toString(),
        purpose: "WALLET_TOPUP",
      },
    });

    // Store the expected amount and owner on the server.
    const topup = await WalletTopup.create({
      user: user._id,
      amount,
      currency: "INR",
      razorpayOrderId: razorpayOrder.id,
      status: "PENDING",
    });

    res.status(201).json({
      message: "Wallet recharge order created.",
      topupId: topup._id,
      payment: {
        keyId: getRazorpayKeyId(),
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
    });
  } catch (error) {
    res.status(errorStatus(error)).json({
      error: errorMessage(error, "Could not create wallet recharge order."),
    });
  }
};

/**
 * Verifies Razorpay payment with the provider and credits the wallet
 * exactly once using a MongoDB transaction.
 */
export const verifyWalletTopup = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
  let session: mongoose.ClientSession | null = null;

  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const validation = verifyWalletTopupSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({ errors: validation.error.format() });
      return;
    }

    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = validation.data;

    // The recharge must belong to the currently authenticated user.
    const topup = await WalletTopup.findOne({
      razorpayOrderId,
      user: req.user.userId,
    });

    if (!topup) {
      res.status(404).json({ error: "Wallet recharge order not found." });
      return;
    }

    // Repeated verification must never credit the wallet again.
    if (topup.status === "PAID") {
      res.status(200).json({
        message: "This wallet recharge has already been credited.",
        duplicate: true,
      });
      return;
    }

    if (topup.status !== "PENDING") {
      res.status(409).json({ error: "This recharge is not pending." });
      return;
    }

    if (
      !verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        signature: razorpaySignature,
      })
    ) {
      res.status(400).json({ error: "Payment signature verification failed." });
      return;
    }

    // Independently retrieve the order and payment from Razorpay.
    const [providerOrder, initialPayment] = await Promise.all([
      fetchRazorpayOrder(razorpayOrderId),
      fetchRazorpayPayment(razorpayPaymentId),
    ]);

    const expectedPaise = toPaise(topup.amount);

    if (
      providerOrder.amount !== expectedPaise ||
      providerOrder.currency !== "INR"
    ) {
      res.status(400).json({ error: "Razorpay order amount or currency mismatch." });
      return;
    }

    if (
      initialPayment.order_id !== razorpayOrderId ||
      initialPayment.amount !== expectedPaise ||
      initialPayment.currency !== "INR"
    ) {
      res.status(400).json({
        error: "Razorpay payment details do not match this recharge.",
      });
      return;
    }

    // Capture an authorized payment, then fetch it again to confirm capture.
    if (initialPayment.status === "authorized") {
      await captureRazorpayPayment(razorpayPaymentId, topup.amount);
    } else if (
      initialPayment.status !== "captured" ||
      initialPayment.captured !== true
    ) {
      res.status(400).json({
        error: "Payment has not been captured successfully.",
      });
      return;
    }

    const confirmedPayment = await fetchRazorpayPayment(razorpayPaymentId);

    if (
      confirmedPayment.status !== "captured" ||
      confirmedPayment.captured !== true ||
      confirmedPayment.order_id !== razorpayOrderId ||
      confirmedPayment.amount !== expectedPaise ||
      confirmedPayment.currency !== "INR"
    ) {
      res.status(400).json({
        error: "Razorpay could not confirm a captured payment.",
      });
      return;
    }

    session = await mongoose.startSession();

    let balanceAfter: number | null = null;

    await session.withTransaction(async () => {
      // Only one request can change this recharge from PENDING to PAID.
      const claimedTopup = await WalletTopup.findOneAndUpdate(
        {
          _id: topup._id,
          user: req.user!.userId,
          status: "PENDING",
          razorpayPaymentId: { $exists: false },
        },
        {
          $set: {
            status: "PAID",
            razorpayPaymentId,
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!claimedTopup) {
        const current = await WalletTopup.findById(topup._id).session(session);

        if (current?.status === "PAID") {
          return;
        }

        throw new Error("Could not claim this wallet recharge.");
      }

      const updatedUser = await User.findByIdAndUpdate(
        req.user!.userId,
        {
          $inc: { walletBalance: topup.amount },
        },
        {
          new: true,
          session,
          runValidators: true,
        }
      ).select("walletBalance");

      if (!updatedUser) {
        throw new Error("User not found while crediting wallet.");
      }

      balanceAfter = updatedUser.walletBalance;

      await Transaction.create(
        [
          {
            user: updatedUser._id,
            type: "TOPUP",
            amount: topup.amount,
            balanceAfter,
            description: `Razorpay wallet recharge of ₹${topup.amount}`,
            referenceId: razorpayPaymentId,
          },
        ],
        { session }
      );
    });

    // If another request already credited this payment, do not emit a new credit.
    if (balanceAfter === null) {
      res.status(200).json({
        message: "This wallet recharge has already been processed.",
        duplicate: true,
      });
      return;
    }

    const io = req.app.get("io");

    if (io) {
      io.to(`user-${req.user.userId}`).emit("wallet:updated", {
        balance: balanceAfter,
      });
    }

    res.status(200).json({
      message: "Wallet recharged successfully.",
      duplicate: false,
      walletBalance: balanceAfter,
    });
  } catch (error) {
    console.error("[Wallet] Recharge verification error:", error);

    res.status(errorStatus(error)).json({
      error: errorMessage(error, "Wallet recharge verification failed."),
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
};

export const getTransactionHistory = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<void> => {
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
    res.status(500).json({
      error: errorMessage(error, "Failed to fetch transactions"),
    });
  }
};
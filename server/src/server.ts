import express from "express";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import { connectDB, disconnectDB } from "./config/db.js";
import { seedIfEmpty } from "./seedIfEmpty.js";
import authRoutes from "./routes/authRoutes.js";
import menuRoutes from "./routes/menuRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import canteenRoutes from "./routes/canteenRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import cashRoutes from "./routes/cashRoutes.js";
import publicRoutes from "./routes/publicRoutes.js";
import revenueRoutes from "./routes/revenueRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import { razorpayWebhook } from "./controllers/paymentController.js";
import { uploadsStaticPath } from "./utils/upload.js";
dotenv.config();

const app = express();
const server = createServer(app);
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());

// Razorpay signs the exact raw request body, so this must be registered before
// the JSON parser. The handler verifies the signature before trusting anything.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  razorpayWebhook
);

app.use(express.json());

io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on("join:user", (userId: string) => {
    socket.join(`user-${userId}`);
  });

  socket.on("join:order", (orderId: string) => {
    socket.join(`order-${orderId}`);
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/canteens", canteenRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/cash", cashRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/revenue", revenueRoutes);
app.use("/api/settings", settingsRoutes);

app.use(
  "/uploads",
  express.static(uploadsStaticPath(), {
    fallthrough: true,
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  })
);

app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    service: "food-flow-backend",
    timestamp: new Date().toISOString(),
  });
});

// Central error handler for upload validation and unexpected API failures.
app.use((err: Error & { code?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Image is too large. Maximum size is 5 MB." });
    return;
  }
  if (err?.message?.toLowerCase().includes("unsupported image")) {
    res.status(400).json({ error: err.message });
    return;
  }
  console.error("[API] Unhandled error:", err);
  res.status(500).json({ error: "Unexpected server error." });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*splat", (req: Request, res: Response) => {
    if (req.path.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const startServer = async () => {
  if (process.env.NODE_ENV !== "test") {
    await connectDB();
    await seedIfEmpty();
  }
  server.listen(PORT, () => {
    console.log(`[Food-Flow API] Server running on port ${PORT}`);
  });
};

const shutdown = async (signal: string) => {
  console.log(`\n[Food-Flow API] Received ${signal}, shutting down...`);
  io.close();
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  // Safety net in case connections hang
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startServer();

export { app, io };

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
import rateLimit from "express-rate-limit";
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
import { getJwtSecret, verifyToken } from "./utils/auth.js";
import { Order } from "./models/Order.js";
import { User } from "./models/User.js";
import { findCanteenForUser } from "./utils/canteenAccess.js";
import { isAdminRole, isManagerRole } from "./utils/roles.js";
dotenv.config();

const app = express();
const server = createServer(app);
const PORT: number = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;


const isProduction = process.env.NODE_ENV === "production";
// Stop at startup if the signing secret is missing or weak.
getJwtSecret();

// Behind a hosting proxy (Render) the real visitor IP is needed for rate limiting.
if (process.env.TRUST_PROXY || isProduction) app.set("trust proxy", Number(process.env.TRUST_PROXY || 1));

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

// Development accepts any origin. Production accepts only CLIENT_URL and the server's own address.
const isAllowedOrigin = (origin: string | undefined, host: string | undefined): boolean => {
  if (!origin) return true;
  if (!isProduction) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
};

const io = new SocketIOServer(server, {
  cors: {
    origin: isProduction ? allowedOrigins : true,
    methods: ["GET", "POST"],
  },
});

app.set("io", io);

app.use(helmet());
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin as string | undefined;
    callback(null, { origin: isAllowedOrigin(origin, req.headers.host), credentials: true });
  })
);
app.use(compression());

const limiter = (windowMinutes: number, limit: number, message: string, skipSuccessful = false) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessful,
    message: { error: message },
  });

// Slow down password guessing, fake sign-ups and guest-order spam.
// A whole campus Wi-Fi can share one public IP address, so these limits are
// generous: they stop scripts, not students.
app.use("/api/auth/login", limiter(15, 50, "Too many failed login attempts. Please wait 15 minutes and try again.", true));
app.use("/api/auth/register", limiter(60, 100, "Too many sign-ups from this network. Please try again later."));
app.post("/api/public/orders", limiter(10, 60, "Too many orders from this network. Please wait a few minutes."));
app.use("/api/payments/online/order", limiter(10, 150, "Too many payment attempts. Please wait a few minutes."));
app.use("/api/wallet/topup", limiter(10, 100, "Too many top-up attempts. Please wait a few minutes."));
app.use("/api/uploads", limiter(60, 100, "Too many uploads. Please try again later."));

// Razorpay signs the exact raw request body, so this must be registered before
// the JSON parser. The handler verifies the signature before trusting anything.
app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  razorpayWebhook
);

app.use(express.json());

// Realtime connections must be signed in and can only join rooms they may see.
io.use(async (socket, next) => {
  try {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return next(new Error("Authentication required"));
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select("role isActive");
    if (!user || !user.isActive) return next(new Error("Account not available"));
    socket.data.userId = user._id.toString();
    socket.data.role = user.role;
    next();
  } catch {
    next(new Error("Invalid or expired token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.userId as string;
  const role = socket.data.role as string;
  // Everyone gets their own private room automatically.
  socket.join(`user-${userId}`);

  socket.on("join:user", (requested: string) => {
    if (requested === userId) socket.join(`user-${userId}`);
  });

  socket.on("join:order", async (orderId: string) => {
    try {
      if (!/^[a-f\d]{24}$/i.test(String(orderId))) return;
      const order = await Order.findById(orderId).select("user canteen");
      if (!order) return;
      let allowed = (!!order.user && order.user.toString() === userId) || isAdminRole(role);
      if (!allowed && isManagerRole(role) && order.canteen) {
        allowed = !!(await findCanteenForUser({ userId, role: role as never }, order.canteen.toString(), { requireManage: true }));
      }
      if (allowed) socket.join(`order-${orderId}`);
    } catch {
      // ignore bad requests
    }
  });

  socket.on("join:canteen", async (canteenId: string) => {
    try {
      if (!isManagerRole(role) || !/^[a-f\d]{24}$/i.test(String(canteenId))) return;
      const canteen = await findCanteenForUser({ userId, role: role as never }, String(canteenId), { requireManage: true });
      if (canteen) socket.join(`canteen-${canteenId}`);
    } catch {
      // ignore bad requests
    }
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

import { Router } from "express";
import { createCashOrder, listCashOrders, markCashPaid } from "../controllers/cashController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]));

router.get("/orders", listCashOrders);
router.post("/orders", createCashOrder);
router.patch("/orders/:id/paid", markCashPaid);

export default router;

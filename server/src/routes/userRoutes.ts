import { Router } from "express";
import { getAllUsers, updateUser, toggleUserActive, getOwners } from "../controllers/userController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authenticate, authorize(["ADMIN"]), getAllUsers);
router.get("/owners", authenticate, authorize(["ADMIN"]), getOwners);
router.put("/:id", authenticate, authorize(["ADMIN"]), updateUser);
router.patch("/:id/toggle-active", authenticate, authorize(["ADMIN"]), toggleUserActive);

export default router;

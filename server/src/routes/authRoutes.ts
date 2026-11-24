import { Router } from "express";
import { register, registerOwner, login, getProfile, updateProfile } from "../controllers/authController.js";
import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/register/owner", registerOwner);
router.post("/login", login);
router.get("/me", authenticate, getProfile);
router.patch("/me", authenticate, updateProfile);

export default router;

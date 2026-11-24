import { Router } from "express";
import {
  getMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  getInventory,
} from "../controllers/menuController.js";
import { authenticate, authorize } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authenticate, getMenuItems);
router.get("/categories", authenticate, getCategories);
router.post("/categories", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), createCategory);
router.patch("/categories/:name", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), renameCategory);
router.delete("/categories/:name", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), deleteCategory);
router.get("/inventory", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), getInventory);
router.get("/:id", authenticate, getMenuItem);
router.post("/", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), createMenuItem);
router.put("/:id", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), updateMenuItem);
router.delete("/:id", authenticate, authorize(["ADMIN", "CANTEEN_OPERATOR"]), deleteMenuItem);

export default router;

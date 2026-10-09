import express from "express";
import { authenticate } from "../controllers/profileController.js";
import { createItem, getItems, getItem, updateItem, deleteItem, getItemDeletions } from "../controllers/itemController.js";

const router = express.Router();
// The application JSON parser runs before routes; register this handler after
// the item router to keep parser errors JSON without changing auth responses.
export function itemRequestError(error, req, res, next) {
  if (req.path !== "/api/items" && !req.path.startsWith("/api/items/")) return next(error);
  if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
    return res.status(error.type === "entity.too.large" ? 413 : 400)
      .json({ success: false, message: "Invalid item request body." });
  }
  return res.status(503).json({ success: false, message: "Item service unavailable. Try again." });
}
router.use(authenticate);
router.post("/", createItem);
router.get("/", getItems);
router.get("/deletions", getItemDeletions);
router.get("/:clientItemId", getItem);
router.patch("/:clientItemId", updateItem);
router.delete("/:clientItemId", deleteItem);
export default router;

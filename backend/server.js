import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import itemRoutes, { itemRequestError } from "./routes/itemRoutes.js";
import { prepareItemIndexes, prepareDeletedItemIndexes } from "./services/itemIndexes.js";
import { startCleanupScheduler } from "./services/cleanupScheduler.js";
import { prepareIdentityIndexes } from "./services/identityMigration.js";

dotenv.config();

const app = express();

// Allow frontend requests
app.use(cors());

// Read JSON request body
app.use(express.json());

// Backend test
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Notiva backend is running",
  });
});

// Auth API
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use(itemRequestError);

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    await prepareIdentityIndexes();
    await prepareItemIndexes();
    await prepareDeletedItemIndexes();
    startCleanupScheduler();
    console.log("MongoDB connected");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error.message);
  });

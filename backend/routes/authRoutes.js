import express from "express";

import {
  registerUser,
  loginUser,
  registerOrganization,
} from "../controllers/authController.js";

import { authenticate, getProfile, updateProfile, changePassword, joinOrganization } from "../controllers/profileController.js";
const router = express.Router();

router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.patch("/change-password", authenticate, changePassword);
router.post("/join-organization", authenticate, joinOrganization);

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginUser);

// POST /api/auth/organization-register
router.post("/organization-register", registerOrganization);

export default router;

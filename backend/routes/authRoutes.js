import express from "express";

import {
  registerUser,
  loginUser,
  registerOrganization,
} from "../controllers/authController.js";

const router = express.Router();

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginUser);

// POST /api/auth/organization-register
router.post("/organization-register", registerOrganization);

export default router;

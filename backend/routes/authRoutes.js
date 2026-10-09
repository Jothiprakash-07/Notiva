import express from "express";

import {
  registerUser,
  notivaIdSuggestion,
  loginUser,
  registerOrganization,
} from "../controllers/authController.js";

import { authenticate, getProfile, updateProfile, changePassword, joinOrganization, leaveOrganization } from "../controllers/profileController.js";
const router = express.Router();
import { setNotivaId, notivaIdAvailability, sendRecoveryEmailOtp, verifyRecoveryEmail, forgotPassword, verifyResetOtp, resetPassword, recoveryRateLimit } from "../controllers/recoveryController.js";

router.post("/notiva-id/suggestion", recoveryRateLimit, notivaIdSuggestion);
router.get("/registration/notiva-id/availability", recoveryRateLimit, notivaIdAvailability);
router.get("/notiva-id/availability", authenticate, recoveryRateLimit, notivaIdAvailability);
router.post("/set-notiva-id", authenticate, setNotivaId);
router.post("/send-recovery-email-otp", authenticate, recoveryRateLimit, sendRecoveryEmailOtp);
router.post("/verify-recovery-email", authenticate, recoveryRateLimit, verifyRecoveryEmail);
router.post("/forgot-password", recoveryRateLimit, forgotPassword);
router.post("/verify-reset-otp", recoveryRateLimit, verifyResetOtp);
router.post("/reset-password", recoveryRateLimit, resetPassword);

router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);
router.patch("/change-password", authenticate, changePassword);
router.post("/join-organization", authenticate, joinOrganization);
router.post("/leave-organization", authenticate, leaveOrganization);

// POST /api/auth/register
router.post("/register", registerUser);

// POST /api/auth/login
router.post("/login", loginUser);

// POST /api/auth/organization-register
router.post("/organization-register", registerOrganization);

export default router;

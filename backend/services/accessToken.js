import jwt from "jsonwebtoken";

export const tokenVersion = user => user.tokenVersion ?? 0;

export function createAccessToken(user, sessionId) {
  if (!sessionId) throw new Error("A session is required to issue access tokens.");
  return jwt.sign({ userId: user._id, email: user.email, role: user.role,
    sessionId, tokenVersion: tokenVersion(user) }, process.env.JWT_SECRET,
  { algorithm: "HS256", expiresIn: "15m" });
}

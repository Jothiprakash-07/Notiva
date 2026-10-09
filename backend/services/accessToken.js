import jwt from "jsonwebtoken";

export const tokenVersion = user => user.tokenVersion ?? 0;

export function createAccessToken(user) {
  return jwt.sign({ userId: user._id, email: user.email, role: user.role,
    tokenVersion: tokenVersion(user) }, process.env.JWT_SECRET,
  { algorithm: "HS256", expiresIn: "7d" });
}

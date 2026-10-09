import { randomBytes } from "node:crypto";
import User from "../models/user.js";
import { normalizeNotivaId, NOTIVA_ID_COLLATION } from "./identity.js";

export function findNotivaId(value, excludeUserId) {
  return User.findOne({ notivaId: normalizeNotivaId(value),
    ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {}) }, null,
  { collation: NOTIVA_ID_COLLATION });
}

export const identityRandom = { suffix: () => randomBytes(3).toString("hex") };
export function generateNotivaId(fullName) {
  const base = fullName.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 23).replace(/-+$/g, "") || "user";
  return `${base}-${identityRandom.suffix()}`;
}

export const isNotivaDuplicate = error => error?.code === 11000 &&
  (error.keyPattern?.notivaId || error.keyValue?.notivaId !== undefined ||
    /notivaId/i.test(error.message || ""));

export async function suggestNotivaId(fullName) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateNotivaId(fullName);
    if (!(await findNotivaId(candidate))) return candidate;
  }
  throw new Error("Unable to suggest an available identity.");
}

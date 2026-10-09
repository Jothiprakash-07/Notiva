import { Buffer } from "node:buffer";
export const normalize = value => typeof value === "string" ? value.trim().toLowerCase() : "";
const reserved = new Set(["admin", "support", "system", "notiva", "root"]);
export const validNotivaId = value => typeof value === "string" && value === value.trim() && /^[a-z0-9_.-]{4,30}$/i.test(value) && !reserved.has(value.toLowerCase());
export const validEmail = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(value);
export const validPassword = value => typeof value === "string" && value.length >= 6 && Buffer.byteLength(value) <= 72;
export const validMobile = value => typeof value === "string" && /^\+?[\d ()-]{7,25}$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ""));
export const maskEmail = email => { const [name, domain] = email.split("@"); return `${name.slice(0, 2)}***@${domain}`; };

export const NOTIVA_ID_COLLATION = { locale: "en", strength: 2 };
export const normalizeNotivaId = normalize;
export const notivaIdTaken = "This Notiva ID is already taken. Please choose another one.";
export const notivaIdFormat = "Use 4–30 letters, numbers, hyphens, underscores or periods for your Notiva ID.";

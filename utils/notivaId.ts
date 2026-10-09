const reserved = new Set(["admin", "support", "system", "notiva", "root"]);
export function isValidNotivaId(value: string) {
  return value === value.trim() && /^[a-z0-9_.-]{4,30}$/i.test(value) && !reserved.has(value.toLowerCase());
}

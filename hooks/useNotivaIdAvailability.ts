import { useEffect, useState } from "react";
import { checkNotivaId } from "../services/notivaIdentityService";
import { isValidNotivaId } from "../utils/notivaId";

export const ID_FORMAT = "Use 4–30 letters, numbers, hyphens, underscores or periods. Reserved names are unavailable.";
export const ID_TAKEN = "This Notiva ID is already taken. Please choose another one.";

export function useNotivaIdAvailability(value: string, token?: string) {
  const [result, setResult] = useState({ value: "", message: "" });
  useEffect(() => {
    if (!isValidNotivaId(value.trim())) return;
    let active = true;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 15000);
      checkNotivaId(value.trim(), controller.signal, token)
        .then(available => { if (active) setResult({ value, message: available ? "Notiva ID is available" : ID_TAKEN }); })
        .catch(() => { if (active) setResult({ value, message: "Unable to check availability. Saving will check again." }); })
        .finally(() => clearTimeout(timeout));
    }, 400);
    return () => { active = false; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [value, token]);
  if (!value) return "";
  if (!isValidNotivaId(value.trim())) return ID_FORMAT;
  return result.value === value ? result.message : "Checking availability…";
}

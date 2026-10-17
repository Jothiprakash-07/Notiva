import { authenticatedFetch } from "./sessionTransport";
import { API_BASE_URL } from "./apiConfig";
import type { AuthUser } from "../types/auth";

type Result = { message?: string; user?: AuthUser; maskedEmail?: string; resetToken?: string; retryAfter?: number };
const safeMessages = new Set([
  "This Notiva ID is already taken. Please choose another one.",
  "Use 4–30 letters, numbers, hyphens, underscores or periods for your Notiva ID.",
  "The verification code is invalid or has expired.", "The password reset authorization is invalid or has expired.",
  "Use matching passwords of at least 6 characters and at most 72 bytes.",
  "Please wait 60 seconds before requesting another code.", "Please wait before trying again.",
  "Add a valid recovery email first.",
]);
export async function recoveryRequest(path: string, body: object = {}, token?: string): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/${path}`, { method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }, token);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 ? "Your session has expired. Please sign in again."
        : safeMessages.has(data.message) ? data.message : response.status === 429 ? "Please wait before trying again." : "Unable to complete this request. Please try again.";
      throw new RecoveryError(message);
    }
    return data;
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError("Unable to connect. Please try again.");
  } finally { clearTimeout(timer); }
}
class RecoveryError extends Error {}

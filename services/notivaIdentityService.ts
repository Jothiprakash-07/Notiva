import { authenticatedFetch } from "./sessionTransport";
import { API_BASE_URL } from "./apiConfig";

async function identityRequest(path: string, signal: AbortSignal, token?: string, body?: object) {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/auth/${path}`, {
    method: body ? "POST" : "GET", signal,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, token);
  if (!response.ok) throw new Error(response.status === 429 ? "Please wait before checking again." : "Unable to check Notiva ID. Please try again.");
  return response.json();
}

export async function suggestNotivaId(fullName: string, signal: AbortSignal): Promise<string> {
  const result = await identityRequest("notiva-id/suggestion", signal, undefined, { fullName });
  if (typeof result.suggestedNotivaId !== "string") throw new Error("Unable to generate a Notiva ID.");
  return result.suggestedNotivaId;
}

export async function checkNotivaId(value: string, signal: AbortSignal, token?: string): Promise<boolean> {
  const path = token ? "notiva-id/availability" : "registration/notiva-id/availability";
  const result = await identityRequest(`${path}?value=${encodeURIComponent(value)}`, signal, token);
  if (typeof result.available !== "boolean") throw new Error("Unable to check Notiva ID.");
  return result.available;
}

import type { AuthSession } from "../types/auth";
import { API_BASE_URL } from "./apiConfig";

type Binding = { current: () => AuthSession | null; replace: (token: string, next: AuthSession) => Promise<boolean>;
  invalidate: (token: string) => Promise<void> };
let binding: Binding | undefined;
const renewals = new Map<string, Promise<AuthSession | null>>();
export function bindSessionTransport(next: Binding) {
  binding = next;
  return () => { if (binding === next) binding = undefined; };
}
async function renew(session: AuthSession): Promise<AuthSession | null> {
  const existing = renewals.get(session.token);
  if (existing) return existing;
  const owner = binding;
  const operation = (async () => {
    if (!owner || owner.current()?.token !== session.token || !session.refreshToken || !session.sessionId) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, { method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: session.user.id,
          sessionId: session.sessionId, refreshToken: session.refreshToken }) });
      if (response.status === 401) { await owner.invalidate(session.token); return null; }
      if (!response.ok) throw new Error("Session service unavailable");
      const next: AuthSession = await response.json();
      if (!next.token || !next.refreshToken || next.sessionId !== session.sessionId || next.user?.id !== session.user.id) throw new Error("Invalid renewal response");
      return await owner.replace(session.token, next) ? next : null;
    } finally { clearTimeout(timer); }
  })();
  renewals.set(session.token, operation);
  try { return await operation; } finally { renewals.delete(session.token); }
}
export async function authenticatedFetch(url: string, init: RequestInit, token?: string): Promise<Response> {
  // Public recovery calls and isolated service users retain their normal transport.
  if (!token) return fetch(url, init);
  const owner = binding, original = owner?.current();
  const send = async (value: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetch(url, { ...init, signal: init.signal || controller.signal,
      headers: { ...init.headers, Authorization: `Bearer ${value}` } }); }
    finally { clearTimeout(timer); }
  };
  let activeToken = token;
  if (original?.token === token && original.refreshToken && original.accessExpiresAt && Date.parse(original.accessExpiresAt) <= Date.now() + 30000) {
    const renewed = await renew(original);
    if (!renewed) throw new Error("Session ended");
    activeToken = renewed.token;
  }
  let response = await send(activeToken);
  if (response.status !== 401 || !owner || !original || original.token !== token) return response;
  const current = owner.current();
  if (!current || current.user.id !== original.user.id || current.sessionId !== original.sessionId) return response;
  if (current.token !== activeToken) {
    response = await send(current.token);
    activeToken = current.token;
  } else if (current.refreshToken) {
    const renewed = await renew(current);
    if (!renewed) return response;
    activeToken = renewed.token;
    response = await send(activeToken);
  }
  if (response.status === 401) await owner.invalidate(activeToken);
  return response;
}
export async function revokeRemoteSession(session: AuthSession) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // A valid refresh secret can revoke its own session even after access expiry.
    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ userId: session.user.id, sessionId: session.sessionId, refreshToken: session.refreshToken }) });
  } catch { /* Offline logout is local and immediate. The server slot expires or can be replaced. */ }
  finally { clearTimeout(timer); }
}

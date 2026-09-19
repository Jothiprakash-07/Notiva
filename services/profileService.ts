import type { AuthUser } from "../types/auth";
import { API_BASE_URL } from "./apiConfig";

// Same default host as the existing login screen; configurable for deployed builds.
export type OrganizationDetails = {
  organizationName: string; organizationCode: string; email: string;
  mobileNumber: string; address: string;
};
export type ProfileResult = { user: AuthUser; organization?: OrganizationDetails | null };
export class ProfileError extends Error {
  constructor(message: string, public errors: Record<string, string> = {}) { super(message); }
}
async function request<T>(token: string, path: string, method = "GET", body?: object): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/${path}`, {
      method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok) throw new ProfileError(result.message || "Request failed.", result.errors);
    return result;
  } catch (error) {
    if (error instanceof ProfileError) throw error;
    throw new ProfileError("Cannot reach the account service. Check your connection and try again.");
  } finally { clearTimeout(timer); }
}
export const getProfile = (token: string) => request<ProfileResult>(token, "profile");
export const saveProfile = (token: string, values: Pick<AuthUser, "fullName" | "email" | "mobileNumber" | "department">) => request<ProfileResult>(token, "profile", "PATCH", values);
export const changePassword = (token: string, currentPassword: string, newPassword: string) => request<{ message: string }>(token, "change-password", "PATCH", { currentPassword, newPassword });
export const joinOrganization = (token: string, organizationCode: string) => request<ProfileResult>(token, "join-organization", "POST", { organizationCode });

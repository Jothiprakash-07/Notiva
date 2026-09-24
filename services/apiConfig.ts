// Keep account requests on the same server as login and registration.
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || "http://192.168.43.159:5000").replace(/\/$/, "");

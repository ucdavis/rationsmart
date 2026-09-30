// Auth + profile endpoints.
// Split out of src/lib/api.ts (audit B-17); import from "@/lib/api".

import { api } from "./client";
import type { Country, RegisterData } from "./models";

// ─── Auth ─────────────────────────────────────────────────────────────────────
// All auth-tier endpoints are PUBLIC (no Bearer header required) except where
// noted. The `login` response carries the JWT used by every animal/* and
// most admin/* endpoint below.

// v1 login shape. `country` is anyType server-side (Country object, plain
// string or null). `token` is an object on v1 and a bare string on legacy;
// the proxy moves the JWT into the httpOnly cookie and returns the object
// with `access_token` stripped and `in_cookie: true`.
export interface LoginUser {
  id?: string;
  name?: string;
  email_id?: string;
  country?: string | { name?: string; id?: string; country_code?: string } | null;
  country_id?: string;
  country_code?: string;
  is_admin?: boolean;
  preferred_language?: string;
  [key: string]: unknown;
}
export interface LoginToken {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  in_cookie?: boolean;
}
export interface LoginResponse {
  success?: boolean;
  message?: string;
  requires_pin_reset?: boolean;
  user?: LoginUser | null;
  token?: LoginToken | string | null;
}

// GET /v1/auth/user/{email_id} — only the fields the client reads.
export interface UserProfileInfo {
  is_admin?: boolean;
  preferred_language?: string;
  registered_language?: string;
}

export const login = (email_id: string, pin: string) =>
  api.post<LoginResponse>("/v1/auth/login", { email_id, pin });

export const register = (data: RegisterData) => api.post("/v1/auth/register", data);

// POST /v1/auth/forgot-pin — { email_id }
export const resetPin = (email_id: string) => api.post("/v1/auth/forgot-pin", { email_id });

// POST /v1/auth/set-new-pin — { email_id, old_pin (4 digits), new_pin (6 digits) }
// Used when login returns requires_pin_reset=true. Migrates a legacy
// 4-digit PIN to a 6-digit one. Public endpoint (no JWT required because
// the user has not finished authenticating yet).
export const setNewPin = (email_id: string, old_pin: string, new_pin: string) =>
  api.post("/v1/auth/set-new-pin", { email_id, old_pin, new_pin });

// POST /v1/auth/change-pin — { email_id, current_pin (4-6), new_pin (6) }
// User-initiated change from the profile screen.
export const changePin = (email_id: string, current_pin: string, new_pin: string) =>
  api.post("/v1/auth/change-pin", { email_id, current_pin, new_pin });

// POST /v1/auth/verify-email — { token } — email verification flow
export const verifyEmail = (token: string) => api.post("/v1/auth/verify-email", { token });

// POST /v1/auth/resend-verification — { email_id }
export const resendVerification = (email_id: string) =>
  api.post("/v1/auth/resend-verification", { email_id });

export const getCountries = () => api.get<Country[]>("/v1/auth/countries");

// GET /v1/auth/user/{email_id} — public — returns UserProfileInfoResponse
export const getUserProfile = (email_id: string) =>
  api.get<UserProfileInfo | null>(`/v1/auth/user/${encodeURIComponent(email_id)}`);

// PUT /v1/auth/user/{email_id} — public — { name, country_id, preferred_language? }
// preferred_language is optional; when the user changes their language from
// the Profile screen we include it here so the choice PERSISTS across
// sessions. The backend updates the user record's language; the next login
// reads that value straight back. There is no separate "registered
// language" baseline — one field, one source of truth.
export const updateUserProfile = (
  email_id: string,
  data: { name: string; country_id: string; preferred_language?: string }
) => api.put(`/v1/auth/user/${encodeURIComponent(email_id)}`, data);

// POST /v1/auth/user-delete-account — JWT auth; body { pin } (6-digit)
// user identity comes from the JWT, no more user_id query param.
export const deleteAccount = (pin: string) => api.post("/v1/auth/user-delete-account", { pin });

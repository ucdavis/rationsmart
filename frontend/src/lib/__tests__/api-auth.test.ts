import { describe, it, expect, beforeEach, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
  interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
}));

vi.mock("axios", () => ({
  default: { create: () => mockApi },
}));

import {
  login,
  register,
  resetPin,
  setNewPin,
  changePin,
  verifyEmail,
  resendVerification,
  getCountries,
  getUserProfile,
  updateUserProfile,
  deleteAccount,
} from "@/lib/api";

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  mockApi.patch.mockReset();
});

describe("login", () => {
  it("POSTs {email_id, pin} to /v1/auth/login and passes the response through", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { success: true, token: "t" } });
    const res = await login("a@b.com", "123456");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/login", {
      email_id: "a@b.com",
      pin: "123456",
    });
    expect(res.data).toEqual({ success: true, token: "t" });
  });
});

describe("register", () => {
  it("POSTs the RegisterData object verbatim to /v1/auth/register", async () => {
    const data = { name: "A", email_id: "a@b.com", pin: "123456", country_id: "1" };
    mockApi.post.mockResolvedValueOnce({ data: { ok: true } });
    await register(data);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/register", data);
  });

  it("forwards the optional language field when provided", async () => {
    const data = { name: "A", email_id: "a@b.com", pin: "123456", country_id: "1", language: "hi" };
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await register(data);
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/register", data);
  });
});

describe("resetPin", () => {
  it("POSTs {email_id} to /v1/auth/forgot-pin", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await resetPin("a@b.com");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/forgot-pin", { email_id: "a@b.com" });
  });
});

describe("setNewPin", () => {
  it("POSTs {email_id, old_pin, new_pin} to /v1/auth/set-new-pin", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await setNewPin("a@b.com", "1234", "654321");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/set-new-pin", {
      email_id: "a@b.com",
      old_pin: "1234",
      new_pin: "654321",
    });
  });
});

describe("changePin", () => {
  it("POSTs {email_id, current_pin, new_pin} to /v1/auth/change-pin", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await changePin("a@b.com", "123456", "654321");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/change-pin", {
      email_id: "a@b.com",
      current_pin: "123456",
      new_pin: "654321",
    });
  });
});

describe("verifyEmail", () => {
  it("POSTs {token} to /v1/auth/verify-email", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await verifyEmail("tok-abc");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/verify-email", { token: "tok-abc" });
  });
});

describe("resendVerification", () => {
  it("POSTs {email_id} to /v1/auth/resend-verification", async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    await resendVerification("a@b.com");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/resend-verification", {
      email_id: "a@b.com",
    });
  });
});

describe("getCountries", () => {
  it("GETs /v1/auth/countries with no params and passes the response through", async () => {
    const countries = [{ id: "1", name: "India", code: "IN" }];
    mockApi.get.mockResolvedValueOnce({ data: countries });
    const res = await getCountries();
    expect(mockApi.get).toHaveBeenCalledWith("/v1/auth/countries");
    expect(res.data).toEqual(countries);
  });
});

describe("getUserProfile", () => {
  it("GETs /v1/auth/user/{email} with the email URI-encoded", async () => {
    mockApi.get.mockResolvedValueOnce({ data: { is_admin: false } });
    await getUserProfile("a+test@b.com");
    expect(mockApi.get).toHaveBeenCalledWith("/v1/auth/user/a%2Btest%40b.com");
  });
});

describe("updateUserProfile", () => {
  it("PUTs {name, country_id} to /v1/auth/user/{email}", async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await updateUserProfile("a@b.com", { name: "A", country_id: "1" });
    expect(mockApi.put).toHaveBeenCalledWith("/v1/auth/user/a%40b.com", {
      name: "A",
      country_id: "1",
    });
  });

  it("forwards preferred_language only when the caller includes it", async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    await updateUserProfile("a@b.com", { name: "A", country_id: "1", preferred_language: "vi" });
    expect(mockApi.put).toHaveBeenCalledWith("/v1/auth/user/a%40b.com", {
      name: "A",
      country_id: "1",
      preferred_language: "vi",
    });
  });
});

describe("deleteAccount", () => {
  // Current v1 implementation sends the PIN in the JSON body (JWT supplies
  // user identity) — NOT as query params. This differs from the legacy
  // shape documented in CLAUDE.md §7 (`POST /auth/user-delete-account?user_id=&pin=`),
  // which predates the v1 migration.
  it("POSTs {pin} in the request body — no query params, no user_id", async () => {
    mockApi.post.mockResolvedValueOnce({ data: { success: true } });
    await deleteAccount("654321");
    expect(mockApi.post).toHaveBeenCalledWith("/v1/auth/user-delete-account", { pin: "654321" });
    expect(mockApi.post.mock.calls[0]).toHaveLength(2);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const { back, getAdminUsers, toggleUserStatus } = vi.hoisted(() => ({
  back: vi.fn(),
  getAdminUsers: vi.fn(),
  toggleUserStatus: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, getAdminUsers, toggleUserStatus };
});

import AdminUsersPage from "@/app/(main)/admin/users/page";
import { useStore, type User } from "@/lib/store";

const seedAdmin = (over: Partial<User> = {}): User => ({
  id: "admin-1",
  name: "Admin User",
  email: "admin@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: true,
  token: "jwt",
  registered_language: "en",
  preferred_language: "en",
  ...over,
});

interface MockAdminUser {
  id: string;
  name: string;
  email_id: string;
  country?: string;
  is_active: boolean;
  is_admin?: boolean;
}

const mkUser = (over: Partial<MockAdminUser> = {}): MockAdminUser => ({
  id: "u-1",
  name: "Jane Doe",
  email_id: "jane@x.com",
  country: "India",
  is_active: true,
  is_admin: false,
  ...over,
});

beforeEach(() => {
  back.mockClear();
  getAdminUsers.mockReset();
  toggleUserStatus.mockReset();
  useStore.setState({
    user: seedAdmin(),
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

describe("Admin Users — pagination (fetch-until-exhausted)", () => {
  it("keeps fetching sequential pages until a short page is returned, and concatenates every user", async () => {
    // Backend caps page_size at 100. First page comes back completely full
    // (100 rows) with total_count = 150, so the page.tsx loop must fetch
    // page 2 as well. Page 2 comes back short (50 < 100) so the loop stops.
    const page1 = Array.from({ length: 100 }, (_, i) =>
      mkUser({ id: `p1-${i}`, name: `User ${i}`, email_id: `u${i}@x.com` })
    );
    const page2 = Array.from({ length: 50 }, (_, i) =>
      mkUser({ id: `p2-${i}`, name: `User2 ${i}`, email_id: `u2-${i}@x.com` })
    );

    getAdminUsers.mockResolvedValueOnce({
      data: { users: page1, total_count: 150, total_pages: 2, page: 1, page_size: 100 },
    });
    getAdminUsers.mockResolvedValueOnce({
      data: { users: page2, total_count: 150, total_pages: 2, page: 2, page_size: 100 },
    });

    render(<AdminUsersPage />);

    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledTimes(2));

    // Sequential calls: admin_user_id, page, page_size(=100), country="", status="", search=""
    expect(getAdminUsers).toHaveBeenNthCalledWith(1, "admin-1", 1, 100, "", "", "");
    expect(getAdminUsers).toHaveBeenNthCalledWith(2, "admin-1", 2, 100, "", "", "");

    // Every user from BOTH pages is rendered — proves the lists were concatenated.
    await waitFor(() => expect(screen.getByText("User 0")).toBeInTheDocument());
    expect(screen.getByText("User 99")).toBeInTheDocument();
    expect(screen.getByText("User2 0")).toBeInTheDocument();
    expect(screen.getByText("User2 49")).toBeInTheDocument();
  });

  it("stops after the first page when it comes back short, without an extra request", async () => {
    const list = [mkUser({ id: "a" }), mkUser({ id: "b", name: "Bob", email_id: "bob@x.com" })];
    getAdminUsers.mockResolvedValueOnce({
      data: { users: list, total_count: 2, total_pages: 1 },
    });

    render(<AdminUsersPage />);

    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(getAdminUsers).toHaveBeenCalledTimes(1);
  });
});

describe("Admin Users — total count chip", () => {
  it("renders formatTotalUsers(total_count) in the stats card", async () => {
    const list = [mkUser({ id: "a" }), mkUser({ id: "b", name: "Bob", email_id: "bob@x.com" })];
    getAdminUsers.mockResolvedValueOnce({
      data: { users: list, total_count: 2, total_pages: 1 },
    });

    render(<AdminUsersPage />);

    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());
    expect(screen.getByText("Total Users")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("reflects total_count from the LAST page's response, not just users.length of page 1", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => mkUser({ id: `p1-${i}`, email_id: `p1-${i}@x.com` }));
    const page2 = [mkUser({ id: "last", name: "Last User", email_id: "last@x.com" })];
    getAdminUsers.mockResolvedValueOnce({ data: { users: page1, total_count: 101, total_pages: 2 } });
    getAdminUsers.mockResolvedValueOnce({ data: { users: page2, total_count: 101, total_pages: 2 } });

    render(<AdminUsersPage />);

    await waitFor(() => expect(screen.getByText("Last User")).toBeInTheDocument());
    expect(screen.getByText("101")).toBeInTheDocument();
  });
});

describe("Admin Users — search box / status filter pills (documented gap)", () => {
  // CLAUDE.md §5 describes a search box (name/email) and status filter pills
  // (All / Active / Inactive) on this page. The `search` and `statusFilter`
  // React state in src/app/(main)/admin/users/page.tsx exist and ARE wired
  // into the getAdminUsers() call (`load(q = search, s = statusFilter)`),
  // but there is NO input, button, or pill in the rendered JSX that ever
  // calls setSearch / setStatusFilter — grep confirms zero <input> elements
  // and the only <button>s on the page are the status-toggle badge and the
  // detail-sheet controls. So today, search/status are permanently "" and
  // this functionality is unreachable from the UI. These tests pin down
  // that current (likely unintended) behavior rather than assert a UI that
  // doesn't exist.
  it("renders no search textbox and no All/Active/Inactive filter pills", async () => {
    getAdminUsers.mockResolvedValueOnce({
      data: { users: [mkUser()], total_count: 1, total_pages: 1 },
    });

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^All$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Active$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Inactive$/i })).toBeNull();
  });

  it("always requests with empty country/status/search — filtering can't be triggered from this UI", async () => {
    getAdminUsers.mockResolvedValueOnce({
      data: { users: [mkUser()], total_count: 1, total_pages: 1 },
    });

    render(<AdminUsersPage />);
    await waitFor(() => expect(getAdminUsers).toHaveBeenCalledWith("admin-1", 1, 100, "", "", ""));
  });
});

describe("Admin Users — activate/deactivate toggle", () => {
  it("tapping the status badge calls toggleUserStatus(user_id, admin_user_id, !is_active) and flips the badge text", async () => {
    getAdminUsers.mockResolvedValueOnce({
      data: { users: [mkUser({ id: "u-1", is_active: true })], total_count: 1, total_pages: 1 },
    });
    toggleUserStatus.mockResolvedValueOnce({ data: {} });

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());

    const badge = screen.getByRole("button", { name: "ACTIVE" });
    fireEvent.click(badge);

    await waitFor(() => expect(toggleUserStatus).toHaveBeenCalledWith("u-1", "admin-1", false));
    // Optimistic local flip on success — no refetch, the row updates in place.
    await waitFor(() => expect(screen.getByRole("button", { name: "INACTIVE" })).toBeInTheDocument());
    expect(getAdminUsers).toHaveBeenCalledTimes(1);

    expect(useStore.getState().snackbar).toEqual(
      expect.objectContaining({ type: "success", message: "User deactivated" })
    );
  });

  it("tapping an inactive user's badge activates them", async () => {
    getAdminUsers.mockResolvedValueOnce({
      data: { users: [mkUser({ id: "u-2", name: "Ivy Inactive", is_active: false })], total_count: 1, total_pages: 1 },
    });
    toggleUserStatus.mockResolvedValueOnce({ data: {} });

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("Ivy Inactive")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "INACTIVE" }));

    await waitFor(() => expect(toggleUserStatus).toHaveBeenCalledWith("u-2", "admin-1", true));
    await waitFor(() => expect(screen.getByRole("button", { name: "ACTIVE" })).toBeInTheDocument());
    expect(useStore.getState().snackbar).toEqual(
      expect.objectContaining({ type: "success", message: "User activated" })
    );
  });

  it("shows an error snackbar and leaves the badge unchanged when toggleUserStatus rejects", async () => {
    getAdminUsers.mockResolvedValueOnce({
      data: { users: [mkUser({ id: "u-1", is_active: true })], total_count: 1, total_pages: 1 },
    });
    toggleUserStatus.mockRejectedValueOnce(new Error("Toggle rejected by server"));

    render(<AdminUsersPage />);
    await waitFor(() => expect(screen.getByText("Jane Doe")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "ACTIVE" }));

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Toggle rejected by server");
    });
    // Badge stays ACTIVE — the optimistic update only happens after success.
    expect(screen.getByRole("button", { name: "ACTIVE" })).toBeInTheDocument();
  });
});

describe("Admin Users — initial load error path", () => {
  it("shows an error snackbar, stops the loading skeleton, and falls back to the empty state", async () => {
    getAdminUsers.mockRejectedValueOnce(new Error("Network fail"));

    render(<AdminUsersPage />);

    await waitFor(() => {
      const snap = useStore.getState().snackbar;
      expect(snap?.type).toBe("error");
      expect(snap?.message).toBe("Could not load users");
    });

    await waitFor(() => expect(screen.getByText("No users found")).toBeInTheDocument());
    // Total stays at its initial 0 — formatTotalUsers(0) === "0"
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

// UI-label translation (src/lib/i18n-ui.ts) — the "hi" dictionary
// lazy-loads via dynamic import(), so findBy waits for it to resolve.
describe("Admin Users — i18n (Hindi)", () => {
  it("renders the toolbar title, stats label, and empty-state text in Hindi when preferred_language is 'hi'", async () => {
    useStore.setState({ user: seedAdmin({ preferred_language: "hi" }) });
    getAdminUsers.mockResolvedValueOnce({ data: { users: [], total_count: 0, total_pages: 1 } });

    render(<AdminUsersPage />);

    await screen.findByText("कोई उपयोगकर्ता नहीं मिला"); // No users found
    expect(screen.getByText("उपयोगकर्ता प्रबंधन")).toBeInTheDocument(); // User Management (toolbar title)
    expect(screen.getByText("कुल उपयोगकर्ता")).toBeInTheDocument(); // Total Users
    expect(screen.queryByText("No users found")).not.toBeInTheDocument();
  });
});

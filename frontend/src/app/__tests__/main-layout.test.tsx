import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
}));

import MainLayout from "@/app/(main)/layout";
import { useStore, type User } from "@/lib/store";

const seedUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@dg.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: false,
  token: "jwt",
  registered_language: "hi",
  preferred_language: "hi",
  ...over,
});

beforeEach(() => {
  replace.mockClear();
  useStore.setState({
    user: null,
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
  });
});

// §10.1 of CLAUDE.md — the (main) layout MUST gate the `!user` redirect
// behind useStore.persist.hasHydrated(), not just `user` alone. Otherwise
// every hard refresh bounces an authenticated session to /welcome because
// Zustand's persisted `user` hasn't been read back from localStorage yet
// on the very first client render.
describe("(main) layout — persist hydration gate (CLAUDE.md §10.1)", () => {
  it("does NOT redirect before hydration completes, even when user is null", () => {
    vi.spyOn(useStore.persist, "hasHydrated").mockReturnValue(false);
    vi.spyOn(useStore.persist, "onFinishHydration").mockImplementation(() => () => {});

    render(
      <MainLayout>
        <div>protected content</div>
      </MainLayout>
    );

    expect(replace).not.toHaveBeenCalled();
    // Spinner branch renders — children are NOT mounted yet.
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("redirects to /welcome once hydration finishes and there is still no user", async () => {
    let fireHydrated: (() => void) | undefined;
    vi.spyOn(useStore.persist, "hasHydrated").mockReturnValue(false);
    vi.spyOn(useStore.persist, "onFinishHydration").mockImplementation((cb: () => void) => {
      fireHydrated = cb;
      return () => {};
    });

    render(
      <MainLayout>
        <div>protected content</div>
      </MainLayout>
    );

    expect(replace).not.toHaveBeenCalled();

    // Simulate the persist middleware finishing rehydration with no
    // persisted user (fresh browser / logged-out session).
    fireHydrated?.();

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/welcome"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("renders children and does NOT redirect when hydrated with a user already set", async () => {
    vi.spyOn(useStore.persist, "hasHydrated").mockReturnValue(true);
    vi.spyOn(useStore.persist, "onFinishHydration").mockImplementation(() => () => {});
    useStore.setState({ user: seedUser() });

    render(
      <MainLayout>
        <div>protected content</div>
      </MainLayout>
    );

    await waitFor(() => expect(screen.getByText("protected content")).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the spinner (not children) while hydrated=true but user has not loaded yet", () => {
    // hydrated flips true synchronously on mount via hasHydrated(), but if
    // the persisted blob truly has no user, the component should stay on
    // the spinner branch (it renders `!hydrated || !user`) until the
    // redirect effect fires.
    vi.spyOn(useStore.persist, "hasHydrated").mockReturnValue(true);
    vi.spyOn(useStore.persist, "onFinishHydration").mockImplementation(() => () => {});
    useStore.setState({ user: null });

    render(
      <MainLayout>
        <div>protected content</div>
      </MainLayout>
    );

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });
});

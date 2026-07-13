import { describe, it, expect, beforeEach } from "vitest";
import { useStore, type User } from "@/lib/store";

// Helper — a fully-populated User object used across tests.
const makeUser = (over: Partial<User> = {}): User => ({
  id: "u-1",
  name: "Aiyappa",
  email: "aiyappa@digitalgreen.org",
  country: "India",
  country_id: "1",
  country_code: "IN",
  currency: "INR",
  pin: "123456",
  is_admin: false,
  token: "jwt-abc",
  registered_language: "hi",
  preferred_language: "hi",
  ...over,
});

// Reset store to its documented initial state before every test.
beforeEach(() => {
  useStore.setState({
    user: null,
    cattleInfo: null,
    feedSelectionType: "recommendation",
    feedSelections: [],
    reportData: null,
    dietLimits: {},
    snackbar: null,
    lastUiLanguage: "en",
  });
});

describe("store initial state", () => {
  it("has the documented defaults", () => {
    const s = useStore.getState();
    expect(s.user).toBeNull();
    expect(s.cattleInfo).toBeNull();
    expect(s.feedSelectionType).toBe("recommendation");
    expect(s.feedSelections).toEqual([]);
    expect(s.reportData).toBeNull();
    expect(s.dietLimits).toEqual({});
    expect(s.snackbar).toBeNull();
    expect(s.lastUiLanguage).toBe("en");
  });
});

describe("setUser", () => {
  it("stores the user in state", () => {
    useStore.getState().setUser(makeUser());
    expect(useStore.getState().user?.id).toBe("u-1");
    expect(useStore.getState().user?.name).toBe("Aiyappa");
  });

  it("side-effects: writes user_id to localStorage", () => {
    useStore.getState().setUser(makeUser({ id: "abc-123" }));
    expect(window.localStorage.getItem("user_id")).toBe("abc-123");
  });

  // lastUiLanguage mirrors the signed-in user's preferred_language — see
  // the "survives logout" test below for why this field exists at all.
  it("mirrors preferred_language onto lastUiLanguage", () => {
    useStore.getState().setUser(makeUser({ preferred_language: "vi" }));
    expect(useStore.getState().lastUiLanguage).toBe("vi");
  });

  it("falls back to 'en' for lastUiLanguage when preferred_language is falsy", () => {
    useStore.getState().setUser(makeUser({ preferred_language: "" as never }));
    expect(useStore.getState().lastUiLanguage).toBe("en");
  });
});

describe("setToken", () => {
  it("updates the JWT on the current user", () => {
    useStore.getState().setUser(makeUser({ token: "old-token" }));
    useStore.getState().setToken("new-token");
    expect(useStore.getState().user?.token).toBe("new-token");
  });

  it("accepts null to clear the token", () => {
    useStore.getState().setUser(makeUser());
    useStore.getState().setToken(null);
    expect(useStore.getState().user?.token).toBeNull();
  });

  it("is a no-op when no user is signed in", () => {
    useStore.getState().setToken("orphan-token");
    expect(useStore.getState().user).toBeNull();
  });
});

describe("logout", () => {
  it("clears the full session tree", () => {
    const s = useStore.getState();
    s.setUser(makeUser());
    s.setCattleInfo({} as never);
    s.setFeedSelectionType("evaluation");
    s.setFeedSelections([{ id: "row-1" } as never]);
    s.setReportData({ mode: "recommendation" } as never);
    s.setDietLimits({ ash: 10 } as never);

    s.logout();

    const after = useStore.getState();
    expect(after.user).toBeNull();
    expect(after.cattleInfo).toBeNull();
    expect(after.feedSelectionType).toBe("recommendation");
    expect(after.feedSelections).toEqual([]);
    expect(after.reportData).toBeNull();
    expect(after.dietLimits).toEqual({});
  });

  it("removes the localStorage user_id side effect", () => {
    window.localStorage.setItem("user_id", "u-1");
    useStore.getState().logout();
    expect(window.localStorage.getItem("user_id")).toBeNull();
  });

  // The whole point of lastUiLanguage: pre-login screens (Welcome/Login/
  // Register/etc.) need SOMETHING to read a language from once `user` is
  // null post-logout. Deliberately NOT cleared by logout() — user
  // reported the auth flow reverting to English every time they logged
  // out, because useT() previously had nothing to fall back to but "en".
  it("does NOT clear lastUiLanguage — the auth flow must stay in the last-used language after logout", () => {
    useStore.getState().setUser(makeUser({ preferred_language: "hi" }));
    expect(useStore.getState().lastUiLanguage).toBe("hi");

    useStore.getState().logout();

    expect(useStore.getState().user).toBeNull();
    expect(useStore.getState().lastUiLanguage).toBe("hi");
  });
});

describe("setCattleInfo", () => {
  it("stores the info object", () => {
    const info = { simulation_name: "run-1", country: "India" } as never;
    useStore.getState().setCattleInfo(info);
    expect(useStore.getState().cattleInfo).toEqual(info);
  });
});

describe("setFeedSelectionType", () => {
  it.each(["recommendation", "evaluation"] as const)("accepts %s", (mode) => {
    useStore.getState().setFeedSelectionType(mode);
    expect(useStore.getState().feedSelectionType).toBe(mode);
  });
});

describe("setFeedSelections", () => {
  it("replaces the array", () => {
    useStore.getState().setFeedSelections([{ id: "a" } as never]);
    expect(useStore.getState().feedSelections).toHaveLength(1);
    useStore.getState().setFeedSelections([]);
    expect(useStore.getState().feedSelections).toEqual([]);
  });
});

describe("setReportData", () => {
  it("stores the report", () => {
    const data = { mode: "evaluation" } as never;
    useStore.getState().setReportData(data);
    expect(useStore.getState().reportData).toEqual(data);
  });
});

describe("setDietLimits", () => {
  it("stores partial limits", () => {
    useStore.getState().setDietLimits({ ash: 10 } as never);
    expect(useStore.getState().dietLimits).toEqual({ ash: 10 });
  });
  it("replaces (does NOT merge) existing limits", () => {
    useStore.getState().setDietLimits({ ash: 10 } as never);
    useStore.getState().setDietLimits({ ee: 7 } as never);
    expect(useStore.getState().dietLimits).toEqual({ ee: 7 });
  });
});

describe("snackbar", () => {
  it("showSnackbar with default type 'info'", () => {
    useStore.getState().showSnackbar("Saved");
    expect(useStore.getState().snackbar).toEqual({
      message: "Saved",
      type: "info",
      visible: true,
    });
  });

  it.each(["success", "error", "info"] as const)(
    "showSnackbar honours explicit type %s",
    (type) => {
      useStore.getState().showSnackbar("m", type);
      expect(useStore.getState().snackbar?.type).toBe(type);
    }
  );

  it("hideSnackbar flips visible false but keeps the message", () => {
    useStore.getState().showSnackbar("bye", "success");
    useStore.getState().hideSnackbar();
    expect(useStore.getState().snackbar).toEqual({
      message: "bye",
      type: "success",
      visible: false,
    });
  });

  it("hideSnackbar when nothing is showing is safe", () => {
    useStore.getState().hideSnackbar();
    expect(useStore.getState().snackbar).toBeNull();
  });
});

describe("persist integration", () => {
  it("hydrates the persisted user on write", () => {
    useStore.getState().setUser(makeUser({ name: "Bob" }));
    const raw = window.localStorage.getItem("rationsmart-storage");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.user.name).toBe("Bob");
  });

  it("persist only partializes documented fields (no reportData / snackbar)", () => {
    useStore.getState().setUser(makeUser());
    useStore.getState().setReportData({ mode: "evaluation" } as never);
    useStore.getState().showSnackbar("hi");
    const raw = window.localStorage.getItem("rationsmart-storage");
    const parsed = JSON.parse(raw as string);
    expect(parsed.state.reportData).toBeUndefined();
    expect(parsed.state.snackbar).toBeUndefined();
    // But user + feedSelections + cattleInfo etc. ARE persisted
    expect(parsed.state.user).toBeDefined();
    expect(parsed.state.feedSelectionType).toBeDefined();
  });
});

describe("registered_language field (i18n V2)", () => {
  it("both fields co-exist on the User type", () => {
    useStore.getState().setUser(makeUser({
      registered_language: "hi",
      preferred_language: "vi",
    }));
    const u = useStore.getState().user!;
    expect(u.registered_language).toBe("hi");
    expect(u.preferred_language).toBe("vi");
  });

  it("registered_language is optional (legacy persisted users)", () => {
    // Simulates a user who was logged in before the field was added.
    useStore.getState().setUser(
      { ...makeUser(), registered_language: undefined } as User
    );
    expect(useStore.getState().user?.registered_language).toBeUndefined();
    expect(useStore.getState().user?.preferred_language).toBeDefined();
  });
});

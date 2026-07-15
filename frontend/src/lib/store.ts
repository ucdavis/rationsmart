import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CattleInfo,
  FeedItem,
  EvaluationResponse,
  RecommendationResponse,
  DietLimits,
} from "./api";
import { setTokenProvider, setLangProvider, setUnauthorizedHandler } from "./api";

export type { CattleInfo, FeedItem, DietLimits };

export interface User {
  id: string;
  name: string;
  email: string;
  country: string;
  country_id: string;
  country_code: string;
  currency: string;
  pin: string;             // 6-digit on the v1 backend; 4-digit accepted for legacy login only
  is_admin: boolean;
  // v1 testing-branch addition: JWT issued by POST /v1/auth/login.
  // Every animal/* and admin/* request gets this as `Authorization: Bearer <token>`.
  // setTokenProvider() below wires the api.ts axios instance to read the
  // latest token on every request.
  token: string | null;
  // i18n V2 — language fields. Two separate concepts; do not conflate.
  //
  // registered_language — set ONCE at registration and stored on the
  // backend's user record. Never updated after register. Acts as the
  // baseline that every fresh login restores. Source of truth.
  //
  // preferred_language — the CURRENTLY EFFECTIVE language for this
  // session. Read as ?lang= on every animal/* request and used for label
  // lookup. Mutated by the Profile dropdown (session-only, never sent to
  // backend). On every login the frontend hard-resets this to
  // registered_language so logout/login always returns the user to the
  // language they chose at registration.
  //
  // registered_language is OPTIONAL on the type because users who were
  // logged in BEFORE this field was introduced have a persisted user
  // blob in localStorage that doesn't contain it. They'll pick up the
  // value the next time they log in. Until then, reads should fall back
  // to preferred_language.
  registered_language?: string;
  preferred_language: string;
}

interface SnackbarState {
  message: string;
  type: "success" | "error" | "info";
  visible: boolean;
}

interface AppState {
  user: User | null;
  cattleInfo: CattleInfo | null;
  feedSelectionType: "recommendation" | "evaluation";
  feedSelections: FeedItem[];
  reportData: EvaluationResponse | RecommendationResponse | null;
  dietLimits: Partial<DietLimits>;
  snackbar: SnackbarState | null;
  // UI-label i18n — mirrors the most recent user.preferred_language so
  // pre-login screens (Welcome/Login/Register/Forgot PIN/etc.) can still
  // render in the right language after logout, when `user` is null and
  // there's nothing else to read a language from. Set alongside setUser,
  // deliberately NOT cleared by logout() — this is a device-level "last
  // language used" memory, not tied to any one account's session.
  lastUiLanguage: string;

  // Actions
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  // Accepts null so callers like the report page "New Case" button can
  // fully wipe the previous simulation (including simulation_language)
  // and land on Cattle Info in a clean state.
  setCattleInfo: (info: CattleInfo | null) => void;
  setFeedSelectionType: (type: "recommendation" | "evaluation") => void;
  setFeedSelections: (items: FeedItem[]) => void;
  setReportData: (data: EvaluationResponse | RecommendationResponse) => void;
  setDietLimits: (limits: Partial<DietLimits>) => void;
  showSnackbar: (message: string, type?: "success" | "error" | "info") => void;
  hideSnackbar: () => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      cattleInfo: null,
      feedSelectionType: "recommendation",
      feedSelections: [],
      reportData: null,
      dietLimits: {},
      snackbar: null,
      lastUiLanguage: "en",

      setUser: (user) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("user_id", String(user.id));
        }
        set({ user, lastUiLanguage: user.preferred_language || "en" });
      },

      setToken: (token: string | null) =>
        set((state) =>
          state.user ? { user: { ...state.user, token } } : state
        ),

      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("user_id");
        }
        set({
          user: null,
          cattleInfo: null,
          feedSelections: [],
          reportData: null,
          feedSelectionType: "recommendation",
          dietLimits: {},
        });
      },

      setCattleInfo: (info) => set({ cattleInfo: info }),

      setFeedSelectionType: (type) => set({ feedSelectionType: type }),

      setFeedSelections: (items) => {
        // Diagnostic — trace who wipes feedSelections. User has been
        // reporting rows disappearing after nav + language change.
        // Fires when the incoming list is empty, OR when every row is
        // effectively blank (no feed_uuid / feed_type_name / category_name).
        if (typeof window !== "undefined") {
          const empty = items.length === 0;
          const allBlank = !empty && items.every(
            (r) => !r.feed_uuid && !r.feed_type_name && !r.category_name
          );
          if (empty || allBlank) {
            console.warn(
              `[store] setFeedSelections(${empty ? "[]" : "all-blank"}) — items:`,
              JSON.stringify(items.map((i) => ({
                fu: i.feed_uuid, ft: i.feed_type_name, cn: i.category_name,
              }))),
              "\nstack:",
              new Error().stack?.split("\n").slice(1, 10).join("\n")
            );
          }
        }
        set({ feedSelections: items });
      },

      setReportData: (data) => set({ reportData: data }),

      setDietLimits: (limits) => set({ dietLimits: limits }),

      showSnackbar: (message, type = "info") =>
        set({ snackbar: { message, type, visible: true } }),

      hideSnackbar: () =>
        set((state) =>
          state.snackbar
            ? { snackbar: { ...state.snackbar, visible: false } }
            : { snackbar: null }
        ),
    }),
    {
      name: "rationsmart-storage",
      partialize: (state) => ({
        user: state.user,
        feedSelectionType: state.feedSelectionType,
        cattleInfo: state.cattleInfo,
        feedSelections: state.feedSelections,
        dietLimits: state.dietLimits,
        lastUiLanguage: state.lastUiLanguage,
        // reportData used to be session-only (excluded here) on the
        // assumption the user would always view it in the same tab
        // session it was generated in. In practice: generate a report →
        // the app gets backgrounded/the tab gets reclaimed by the OS
        // under memory pressure (common on mobile right after a
        // several-second diet-optimization request) → the next render
        // is a fresh page load with reportData back at its null default
        // → "No Report, generate one from Feed Selection" even though a
        // report WAS just generated seconds ago. Persisting it means a
        // reload lands back on the report just produced instead of
        // losing it. "New Case" / Reset already explicitly null it out
        // when the user is starting over, so this doesn't risk showing
        // a report tied to a since-abandoned simulation.
        reportData: state.reportData,
      }),
      // NOTE: skipHydration was enabled here in an earlier commit to
      // silence React #418/#423 hydration mismatches caused by persist
      // reading localStorage synchronously on the client's first render.
      // It also broke real persistence — after every hard refresh the
      // login prompt came back because the store sat at initial state
      // for so long the splash's 2s timer fired with user=null and
      // redirected to /welcome. The mismatch warnings are recoverable
      // (React just client-renders the root) and harmless in practice,
      // so default hydration behavior is fine.
    }
  )
);

// v1 testing-branch: hand the axios interceptor in api.ts a function that
// can read the latest JWT from the store on every request. Done as a
// callback (not an import in api.ts) so we don't introduce a circular
// dependency between api.ts and store.ts.
setTokenProvider(() => useStore.getState().user?.token ?? null);
// i18n V2 — wire the active language to api.ts so every feed-related
// helper can spread ?lang= via langParam() without reaching into the store.
// Priority (top wins):
//   1. cattleInfo.simulation_language   ← per-simulation override
//   2. user.preferred_language          ← profile default
//   3. "en"                             ← pre-login / brand-new user
setLangProvider(() => {
  const s = useStore.getState();
  return (
    s.cattleInfo?.simulation_language ??
    s.user?.preferred_language ??
    "en"
  );
});

// v1: when ANY authenticated call comes back 401 (Token expired /
// invalid), wipe the session + redirect to /login. Guarded so many
// in-flight requests don't stack repeated redirects.
let redirectingOn401 = false;
setUnauthorizedHandler(() => {
  if (redirectingOn401) return;
  redirectingOn401 = true;
  try {
    // Reuse the store's logout to clear ALL session state, including
    // cattleInfo / feedSelections / reportData / dietLimits.
    useStore.getState().logout();
    // Also surface a snackbar so the user sees WHY they got bounced.
    useStore.getState().showSnackbar("Session expired — please log in again", "info");
  } catch {
    // best-effort — never let cleanup errors block the redirect
  }
  if (typeof window !== "undefined") {
    // Full navigation (not router.push) because we're outside the React
    // tree here and the current route may be an auth-gated one.
    window.location.href = "/login";
  }
});

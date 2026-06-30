import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CattleInfo,
  FeedItem,
  EvaluationResponse,
  RecommendationResponse,
  DietLimits,
} from "./api";
import { setTokenProvider, setLangProvider } from "./api";

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
  registered_language: string;
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

  // Actions
  setUser: (user: User) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
  setCattleInfo: (info: CattleInfo) => void;
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

      setUser: (user) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("user_id", String(user.id));
        }
        set({ user });
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

      setFeedSelections: (items) => set({ feedSelections: items }),

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
// Resolves to "en" before login.
setLangProvider(() => useStore.getState().user?.preferred_language ?? "en");

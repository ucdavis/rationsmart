import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CattleInfo,
  FeedItem,
  EvaluationResponse,
  RecommendationResponse,
  DietLimits,
} from "./api";

export type { CattleInfo, FeedItem, DietLimits };

export interface User {
  id: string;
  name: string;
  email: string;
  country: string;
  country_id: string;
  country_code: string;
  currency: string;
  pin: string;
  is_admin: boolean;
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

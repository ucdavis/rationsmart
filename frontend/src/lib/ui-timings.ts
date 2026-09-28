// UI timing values shared across screens (audit D-11). Kept in one place so
// the feel of the app can be tuned without hunting through components.

/** Snackbar auto-dismiss, then removal after its slide-out animation. */
export const SNACKBAR_VISIBLE_MS = 2800;
export const SNACKBAR_REMOVE_MS = 3100;
/** Slide-out duration when the user dismisses a snackbar by hand. */
export const SNACKBAR_EXIT_MS = 220;

/** Brief "working…" beat on instant actions (Reset form, template open) so
 *  the button visibly reacts before the confirmation snackbar. */
export const ACTION_FEEDBACK_MS = 500;

/** Debounce for the feed search box. */
export const SEARCH_DEBOUNCE_MS = 250;
/** Wait for a smooth scroll before focusing the search box (iOS keyboard). */
export const FOCUS_AFTER_SCROLL_MS = 300;
/** Let a newly filled feed card render before scrolling it into view. */
export const SCROLL_AFTER_RENDER_MS = 100;

/** Delay before the install banner appears after leaving the splash. */
export const INSTALL_PROMPT_DELAY_MS = 1500;

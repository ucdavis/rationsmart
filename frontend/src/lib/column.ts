// Geometry of the centred mobile column (root layout `.app-column`, 480 px
// max). Overlays, sheets and dialogs use these so they cover the column, not
// the whole desktop viewport (CLAUDE.md §9 NavDrawer / GeneratingReportDialog).

/** Left edge of the centred column. */
export const COLUMN_LEFT = "max(0px, calc((100vw - 480px) / 2))";

/** Width of the centred column. */
export const COLUMN_WIDTH = "min(100vw, 480px)";

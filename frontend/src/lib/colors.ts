// Colour tokens (audit D-12). Names are the Android resource names from
// app/src/main/res/values/colors.xml (camelCased) so a value can be traced
// back to the Android app — CLAUDE.md §12: don't invent new colours. Prefer
// these over hex literals in new code; tailwind.config.ts exposes the core
// ones as classes too.
export const COLORS = {
  // ── Android palette ─────────────────────────────────────────────────────
  darkAquamarineGreen: "#064E3B",
  darkSilver: "#6D6D6D",
  raisinBlack: "#231F20",
  white: "#FFFFFF",
  americanDiamond: "#F1F5F9",
  carminePink: "#E44A4A",
  lightCarminePink: "#EF6464",
  authenticWhite: "#F8FAF9",
  brightGrayNew: "#E4F7EF",
  brightGray: "#EBEAEA",
  redRyb: "#FC2E20",
  spanishGray: "#999999",
  honeydew: "#F0FDF4",
  crayolaGreen: "#1CA069",
  goGreen: "#05BC6D",
  greenOnyx: "#069460",
  laSalleGreen: "#087F23",
  deepForest: "#1B5E20",
  darkGreenTurquoise: "#10B981",
  lightGrayNew: "#D3D3D3",
  gainsboro: "#DCE0E4",
  silverSand: "#C2C2C2",
  vividGamboge: "#FF9800",
  fireOrange: "#FF7800",
  hotOrange: "#FF6D00",
  trinidad: "#E65100",
  darkYellow: "#FFB300",
  mustard: "#FFDB58",
  mustardYellow: "#E3B505",
  sazerac: "#FFF3E0",
  aestheticWhite: "#FFFAF2",
  tobago: "#3E2723",
  sageBreeze: "#C8E6C9",
  mintWhisper: "#E8F5E9",
  peachyPink: "#FEC5BB",
  ultramarine: "#1E40AF",
  azure: "#007BFF",
  mirrorBlue: "#2563EB",
  celticBlue: "#296CD3",
  water: "#E3F2FD",
  ghostWhite: "#F6F9FD",
  // Android's 15 %-alpha tints (#26RRGGBB in colors.xml).
  goGreen15: "rgba(5,188,109,0.15)",
  vividGamboge15: "rgba(255,152,0,0.15)",
  celticBlue15: "rgba(41,108,211,0.15)",
  ultramarine15: "rgba(30,64,175,0.15)",

  // ── Web-only values (no Android resource) ────────────────────────────────
  // Checked against the Android layouts on 2026-09-30 (audit D-12). Values
  // that had an Android equivalent for the same element were replaced
  // (toolbar/auth titles → darkAquamarineGreen, switch track off →
  // lightGrayNew per bg_track.xml, select placeholder → darkSilver, drag
  // handles → goGreen15 per bg_bottom_sheet_pin.xml, Evaluation chip →
  // vividGamboge / vividGamboge15 per FeedReportPagingAdapter). What is left
  // has no one-to-one Android element:
  /** The PWA's light hairline dividers, input borders and shimmer blocks. */
  webDivider: "#E2E8F0",
  /** Disabled Custom Diet Limits pill fill (web-only control state). */
  webBorder: "#E8EBEE",
  /** Feed Library Sync "running" / warning text — a web-only admin feature. */
  webAmberText: "#B4690E",
} as const;

/** Admin screens' sage → mint background (Android bg_admin). */
export const ADMIN_BACKGROUND = `linear-gradient(135deg, ${COLORS.sageBreeze} 0%, ${COLORS.mintWhisper} 100%)`;

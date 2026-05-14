"use client";

// Admin section layout — paints the sage→mint gradient at the body
// level so it extends into the system status / gesture areas and into
// any left/right safe-area-inset zone on curved-display phones. The
// individual admin pages still set the same gradient on their own root
// (so they render correctly in the browser tab too), but in standalone
// PWA mode the layout backdrop covers everything outside the centred
// column.

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          background: "linear-gradient(135deg, #C8E6C9 0%, #E8F5E9 100%)",
          pointerEvents: "none",
          zIndex: -1,
        }}
      />
      {children}
    </>
  );
}

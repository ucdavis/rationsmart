"use client";

import { IcHamburger, IcBack, IcForward } from "@/components/Icons";

interface ToolbarProps {
  type: "home" | "back";
  title: string;
  onMenuOpen?: () => void;
  onBack?: () => void;
  showForward?: boolean;
  onForward?: () => void;
  rightContent?: React.ReactNode;
}

export default function Toolbar({
  type,
  title,
  onMenuOpen,
  onBack,
  showForward,
  onForward,
  rightContent,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center px-3 gap-3"
      style={{
        // Transparent so the page's bg / gradient extends through the toolbar
        // (matches Android — no visible band between toolbar and content).
        backgroundColor: "transparent",
        position: "sticky",
        top: 0,
        zIndex: 40,
        // Push the toolbar below the status bar when the PWA is launched
        // in standalone mode (iOS apple-mobile-web-app-capable +
        // viewport-fit=cover, Android display=standalone). Without this
        // the back/menu button and the title sit underneath the status
        // bar — visible mainly on admin screens because their gradient
        // bleeds into the unsafe area and makes the missing inset obvious.
        paddingTop: "max(12px, env(safe-area-inset-top))",
        paddingBottom: 12,
      }}
    >
      {/* Left button */}
      {type === "home" ? (
        <button
          onClick={onMenuOpen}
          className="flex items-center justify-center rounded-xl bg-white p-2.5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)", minWidth: 40, minHeight: 40 }}
          aria-label="Open menu"
        >
          <IcHamburger size={20} color="#064E3B" />
        </button>
      ) : (
        <button
          onClick={onBack}
          className="flex items-center justify-center rounded-xl bg-white p-2.5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)", minWidth: 40, minHeight: 40 }}
          aria-label="Go back"
        >
          <IcBack size={20} color="#064E3B" />
        </button>
      )}

      {/* Title */}
      <h1
        className="flex-1 text-center"
        style={{
          color: "#042F23",
          fontFamily: "Nunito, sans-serif",
          fontSize: 16,
          fontWeight: 700,
          margin: 0,
          letterSpacing: 0,
        }}
      >
        {title}
      </h1>

      {/* Right button */}
      {rightContent ? (
        rightContent
      ) : showForward ? (
        <button
          onClick={onForward}
          className="flex items-center justify-center rounded-xl bg-white p-2.5"
          style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.1)", minWidth: 40, minHeight: 40 }}
          aria-label="Forward"
        >
          <IcForward size={20} color="#064E3B" />
        </button>
      ) : (
        <div style={{ width: 40 }} />
      )}
    </div>
  );
}

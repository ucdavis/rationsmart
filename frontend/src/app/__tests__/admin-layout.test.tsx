import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import AdminLayout from "@/app/(main)/admin/layout";

// CLAUDE.md §10.6 — admin routes swap <meta name="theme-color"> to sage
// on mount and MUST restore it on unmount, or leaving the admin section
// permanently tints the Android PWA's status bar. Root layout normally
// supplies this meta tag; simulate it directly since layouts render in
// isolation under vitest (no parent <head>).
function seedThemeColorMeta(initial = "#FFFFFF") {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", initial);
  document.head.appendChild(meta);
  return meta;
}

afterEach(() => {
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

describe("Admin layout — theme-color swap (CLAUDE.md §10.6)", () => {
  it("swaps theme-color to the admin sage value on mount", () => {
    const meta = seedThemeColorMeta("#FFFFFF");
    render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    );
    expect(meta.getAttribute("content")).toBe("#C8E6C9");
  });

  it("restores the default theme-color on unmount", () => {
    const meta = seedThemeColorMeta("#FFFFFF");
    const { unmount } = render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    );
    expect(meta.getAttribute("content")).toBe("#C8E6C9");
    unmount();
    expect(meta.getAttribute("content")).toBe("#FFFFFF");
  });

  it("does nothing (no throw) when no theme-color meta tag exists", () => {
    expect(() =>
      render(
        <AdminLayout>
          <div>admin content</div>
        </AdminLayout>
      )
    ).not.toThrow();
  });

  it("renders children alongside the background gradient", () => {
    seedThemeColorMeta();
    const { getByText, container } = render(
      <AdminLayout>
        <div>admin content</div>
      </AdminLayout>
    );
    expect(getByText("admin content")).toBeInTheDocument();
    const gradientDiv = container.querySelector('[aria-hidden="true"]');
    expect(gradientDiv).not.toBeNull();
    expect(gradientDiv).toHaveStyle({ position: "absolute" });
  });
});

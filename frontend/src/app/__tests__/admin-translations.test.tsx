import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
}));

import AdminTranslationsRedirect from "@/app/(main)/admin/translations/page";

beforeEach(() => {
  replace.mockClear();
});

// 2026-07-15 — /admin/translations was merged into /admin/languages
// (Option 3 "control room" — see admin_language_api_and_ui_design.md).
// This route is kept only as a redirect for back-compat with old
// bookmarks/links, same pattern as admin/country-languages before it.
describe("Admin translations route (back-compat redirect)", () => {
  it("redirects to /admin/languages on mount", async () => {
    const { container } = render(<AdminTranslationsRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/languages"));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });
});

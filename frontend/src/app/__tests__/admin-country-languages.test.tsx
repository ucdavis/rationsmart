import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
}));

import AdminCountryLanguagesRedirect from "@/app/(main)/admin/country-languages/page";

beforeEach(() => {
  replace.mockClear();
});

// CLAUDE.md §18.5 — /admin/country-languages was merged into
// /admin/languages on 2026-06-29; this route is kept only as a redirect
// for back-compat with old bookmarks/links.
describe("Admin country-languages route (back-compat redirect)", () => {
  it("redirects to /admin/languages on mount", async () => {
    const { container } = render(<AdminCountryLanguagesRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/languages"));
    expect(replace).toHaveBeenCalledTimes(1);
    // Renders nothing itself.
    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

import AdminLanguagesRedirect from "@/app/(main)/admin/languages/page";

// /admin/languages was the pre-2026-07-20 Language Catalog. Its features live
// on /admin/country-language, so the route only redirects (audit B-18).
describe("Admin languages route (legacy redirect)", () => {
  it("redirects to /admin/country-language", async () => {
    render(<AdminLanguagesRedirect />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/country-language"));
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import SplashGuard from "@/components/SplashGuard";

// SplashGuard reads usePathname() + useRouter().replace(), and branches on
// performance.getEntriesByType("navigation")[0]?.type plus document.referrer.
// Its useEffect deps are intentionally [] (CLAUDE.md §10.3) — we must not
// assume re-renders after a pathname prop change re-run the effect; each
// test mounts a fresh instance instead.

const { replaceMock, pathnameRef } = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  pathnameRef: { current: "/cattle-info" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
  usePathname: () => pathnameRef.current,
}));

function mockNavigationType(type: string | undefined) {
  vi.spyOn(window.performance, "getEntriesByType").mockReturnValue(
    type === undefined ? [] : ([{ type }] as unknown as PerformanceEntryList)
  );
}

function setReferrer(url: string) {
  Object.defineProperty(document, "referrer", { value: url, configurable: true });
}

beforeEach(() => {
  replaceMock.mockClear();
  pathnameRef.current = "/cattle-info";
  setReferrer("");
});

describe("SplashGuard", () => {
  it("never redirects on a public path, even with a cold-launch nav type", () => {
    pathnameRef.current = "/welcome";
    mockNavigationType("navigate");
    setReferrer(""); // no referrer = cold launch signal
    render(<SplashGuard />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it.each(["/login", "/register", "/forgot-pin", "/set-new-pin", "/verify-email", "/terms", "/help"])(
    "never redirects on public path %s",
    (path) => {
      pathnameRef.current = path;
      mockNavigationType("navigate");
      render(<SplashGuard />);
      expect(replaceMock).not.toHaveBeenCalled();
    }
  );

  it("never redirects on the splash route itself (\"/\")", () => {
    pathnameRef.current = "/";
    mockNavigationType("navigate");
    render(<SplashGuard />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects a cold-launch 'navigate' entry on a non-public path to \"/\"", () => {
    pathnameRef.current = "/cattle-info";
    mockNavigationType("navigate");
    setReferrer(""); // not same-origin -> cold launch (PWA icon tap / typed URL)
    render(<SplashGuard />);
    expect(replaceMock).toHaveBeenCalledWith("/");
  });

  it("does NOT redirect on a 'reload' navigation type", () => {
    pathnameRef.current = "/cattle-info";
    mockNavigationType("reload");
    render(<SplashGuard />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect on a 'back_forward' navigation type", () => {
    pathnameRef.current = "/cattle-info";
    mockNavigationType("back_forward");
    render(<SplashGuard />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("does NOT redirect on an in-app same-origin 'navigate' (link click within the app)", () => {
    pathnameRef.current = "/cattle-info";
    mockNavigationType("navigate");
    setReferrer(window.location.origin + "/report");
    render(<SplashGuard />);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("renders nothing (null) in all cases", () => {
    pathnameRef.current = "/cattle-info";
    mockNavigationType("navigate");
    const { container } = render(<SplashGuard />);
    expect(container).toBeEmptyDOMElement();
  });
});

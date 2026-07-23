import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import BottomNav from "@/components/ui/BottomNav";

// BottomNav is a stub (§9 in CLAUDE.md) — navigation is via NavDrawer
// instead. It's kept only so legacy imports don't explode. One smoke
// test is enough; don't over-test a no-op.
describe("BottomNav", () => {
  it("renders without crashing and produces no visible output", () => {
    const { container } = render(<BottomNav />);
    expect(container).toBeEmptyDOMElement();
  });
});

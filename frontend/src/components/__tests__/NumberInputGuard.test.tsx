import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import NumberInputGuard from "@/components/NumberInputGuard";

// §10.4 in CLAUDE.md: browsers increment/decrement a focused
// <input type="number"> on every wheel tick. NumberInputGuard listens
// at the document level with `passive: false` and preventDefault()s
// wheel events when the focused element is a numeric input.
describe("NumberInputGuard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders no visible output", () => {
    const { container } = render(<NumberInputGuard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("preventDefaults a wheel event fired on a focused number input", () => {
    render(<NumberInputGuard />);

    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    document.body.removeChild(input);
  });

  it("does NOT preventDefault a wheel event when the number input is not focused", () => {
    render(<NumberInputGuard />);

    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);
    // Deliberately not focused.

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(input);
  });

  it("does NOT preventDefault a wheel event on a non-number input target", () => {
    render(<NumberInputGuard />);

    const input = document.createElement("input");
    input.type = "text";
    document.body.appendChild(input);
    input.focus();
    expect(document.activeElement).toBe(input);

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(input);
  });

  it("does NOT preventDefault a wheel event fired on a plain div", () => {
    render(<NumberInputGuard />);

    const div = document.createElement("div");
    document.body.appendChild(div);

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    div.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(div);
  });

  it("removes the document listener on unmount", () => {
    const { unmount } = render(<NumberInputGuard />);

    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);
    input.focus();

    unmount();

    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    document.body.removeChild(input);
  });
});

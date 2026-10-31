import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import Snackbar from "@/components/ui/Snackbar";
import { useStore } from "@/lib/store";

beforeEach(() => {
  useStore.setState({ snackbar: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Snackbar", () => {
  it("renders nothing when snackbar state is null", () => {
    const { container } = render(<Snackbar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when snackbar.visible is false", () => {
    useStore.setState({ snackbar: { message: "hi", type: "info", visible: false } });
    const { container } = render(<Snackbar />);
    expect(container).toBeEmptyDOMElement();
  });

  it("SUCCESS variant: dark_aquamarine_green bg (#064E3B) / white text", () => {
    useStore.setState({ snackbar: { message: "Saved!", type: "success", visible: true } });
    const { container } = render(<Snackbar />);
    expect(screen.getByText("Saved!")).toBeInTheDocument();
    const bar = container.firstChild as HTMLElement;
    expect(bar).toHaveStyle({ backgroundColor: "#064E3B", color: "#FFFFFF" });
  });

  it("ERROR variant: mustard bg (#FFDB58) / raisin_black text (#231F20)", () => {
    useStore.setState({ snackbar: { message: "Something broke", type: "error", visible: true } });
    const { container } = render(<Snackbar />);
    expect(screen.getByText("Something broke")).toBeInTheDocument();
    const bar = container.firstChild as HTMLElement;
    expect(bar).toHaveStyle({ backgroundColor: "#FFDB58", color: "#231F20" });
  });

  it("INFO variant: azure bg (#007BFF) / white text", () => {
    useStore.setState({ snackbar: { message: "FYI", type: "info", visible: true } });
    const { container } = render(<Snackbar />);
    expect(screen.getByText("FYI")).toBeInTheDocument();
    const bar = container.firstChild as HTMLElement;
    expect(bar).toHaveStyle({ backgroundColor: "#007BFF", color: "#FFFFFF" });
  });

  it("renders a Dismiss button", () => {
    useStore.setState({ snackbar: { message: "hi", type: "info", visible: true } });
    render(<Snackbar />);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
  });

  it("clicking Dismiss calls hideSnackbar after the 220ms exit animation", () => {
    vi.useFakeTimers();
    useStore.setState({ snackbar: { message: "hi", type: "info", visible: true } });
    render(<Snackbar />);

    act(() => {
      screen.getByRole("button", { name: "Dismiss" }).click();
    });
    // Still visible in store immediately after click (exit animation running).
    expect(useStore.getState().snackbar?.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(220);
    });
    expect(useStore.getState().snackbar?.visible).toBe(false);
  });

  it("auto-dismiss: applies the exit class at 2800ms, then hides via hideSnackbar at 3100ms", () => {
    vi.useFakeTimers();
    useStore.setState({ snackbar: { message: "auto", type: "success", visible: true } });
    const { container } = render(<Snackbar />);

    // Before 2800ms: still in the "enter" state.
    expect((container.firstChild as HTMLElement).className).toContain("snackbar-enter");

    act(() => {
      vi.advanceTimersByTime(2800);
    });
    expect((container.firstChild as HTMLElement).className).toContain("snackbar-exit");
    // hideSnackbar has not fired yet — message/visible untouched in the store.
    expect(useStore.getState().snackbar?.visible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(300); // total 3100ms
    });
    expect(useStore.getState().snackbar?.visible).toBe(false);
    expect(useStore.getState().snackbar?.message).toBe("auto"); // hideSnackbar keeps the message
    expect(container).toBeEmptyDOMElement();
  });

  it("preserves the message text through the exit-class swap (no re-fetch of content)", () => {
    vi.useFakeTimers();
    useStore.setState({ snackbar: { message: "Keep me visible", type: "info", visible: true } });
    render(<Snackbar />);
    act(() => {
      vi.advanceTimersByTime(2800);
    });
    expect(screen.getByText("Keep me visible")).toBeInTheDocument();
  });
});

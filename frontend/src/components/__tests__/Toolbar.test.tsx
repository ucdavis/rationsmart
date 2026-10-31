import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Toolbar from "@/components/Toolbar";
import RequiredAsterisk from "@/components/RequiredAsterisk";

describe("Toolbar", () => {
  it("renders the title", () => {
    render(<Toolbar type="back" title="Your Profile" onBack={() => {}} />);
    expect(screen.getByRole("heading", { name: "Your Profile" })).toBeInTheDocument();
  });

  it("type='home' renders the menu button and fires onMenuOpen", () => {
    const onMenuOpen = vi.fn();
    render(<Toolbar type="home" title="Home" onMenuOpen={onMenuOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(onMenuOpen).toHaveBeenCalledOnce();
  });

  it("type='back' renders the back button and fires onBack", () => {
    const onBack = vi.fn();
    render(<Toolbar type="back" title="Feedback" onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("showForward=true renders the Forward button and fires onForward", () => {
    const onForward = vi.fn();
    render(
      <Toolbar type="home" title="X" onMenuOpen={() => {}} showForward onForward={onForward} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(onForward).toHaveBeenCalledOnce();
  });

  it("no rightContent + no showForward renders a spacer div (title stays centered)", () => {
    render(<Toolbar type="back" title="Only Back" onBack={() => {}} />);
    // Only 1 button — no forward, no rightContent
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("rightContent takes precedence over showForward", () => {
    render(
      <Toolbar
        type="back"
        title="X"
        onBack={() => {}}
        showForward
        rightContent={<button aria-label="Custom">Custom</button>}
      />
    );
    // The custom button should be present; Forward is hidden.
    expect(screen.getByRole("button", { name: "Custom" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Forward" })).toBeNull();
  });
});

describe("RequiredAsterisk", () => {
  it("renders a space + red asterisk", () => {
    const { container } = render(<RequiredAsterisk />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe(" *");
    expect(span).toHaveStyle({ color: "rgb(252, 46, 32)" });
  });
});

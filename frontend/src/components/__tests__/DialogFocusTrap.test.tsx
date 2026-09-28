import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import DialogFocusTrap from "@/components/DialogFocusTrap";

function Page({ open }: { open: boolean }) {
  return (
    <>
      <DialogFocusTrap />
      <button>outside</button>
      {open && (
        <div role="dialog" aria-modal="true">
          <button>first</button>
          <button>last</button>
        </div>
      )}
    </>
  );
}

describe("DialogFocusTrap (audit B-30)", () => {
  it("wraps Tab from the last control back to the first inside the open dialog", () => {
    const { getByText } = render(<Page open />);
    getByText("last").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(getByText("first")).toHaveFocus();
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    const { getByText } = render(<Page open />);
    getByText("first").focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(getByText("last")).toHaveFocus();
  });

  it("pulls focus that is outside the dialog back into it", () => {
    const { getByText } = render(<Page open />);
    getByText("outside").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(getByText("first")).toHaveFocus();
  });

  it("does nothing when no dialog is open", () => {
    const { getByText } = render(<Page open={false} />);
    getByText("outside").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(getByText("outside")).toHaveFocus();
  });
});

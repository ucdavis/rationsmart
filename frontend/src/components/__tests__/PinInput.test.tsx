import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PinInput from "@/components/ui/PinInput";

describe("PinInput", () => {
  it("renders 6 boxes by default", () => {
    const { container } = render(<PinInput value="" onChange={() => {}} />);
    expect(container.querySelectorAll("input")).toHaveLength(6);
  });

  it("renders 4 boxes when length=4 (legacy migration path)", () => {
    const { container } = render(<PinInput value="" onChange={() => {}} length={4} />);
    expect(container.querySelectorAll("input")).toHaveLength(4);
  });

  it("all boxes use type=password (hidden PIN entry)", () => {
    const { container } = render(<PinInput value="" onChange={() => {}} />);
    container.querySelectorAll("input").forEach((el) => {
      expect(el).toHaveAttribute("type", "password");
    });
  });

  it("reveal=true switches every box to type=text (eye toggle on)", () => {
    const { container } = render(<PinInput value="" onChange={() => {}} reveal />);
    container.querySelectorAll("input").forEach((el) => {
      expect(el).toHaveAttribute("type", "text");
    });
  });

  it("splits the controlled value across boxes", () => {
    const { container } = render(<PinInput value="12345" onChange={() => {}} />);
    const inputs = container.querySelectorAll("input");
    expect((inputs[0] as HTMLInputElement).value).toBe("1");
    expect((inputs[1] as HTMLInputElement).value).toBe("2");
    expect((inputs[4] as HTMLInputElement).value).toBe("5");
    expect((inputs[5] as HTMLInputElement).value).toBe("");
  });

  it("typing a digit fires onChange with the aggregate", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<PinInput value="" onChange={onChange} />);
    const first = container.querySelector("input") as HTMLInputElement;
    await user.type(first, "3");
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("rejects non-digit input (no onChange fired)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<PinInput value="" onChange={onChange} />);
    const first = container.querySelector("input") as HTMLInputElement;
    await user.type(first, "a");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled=true blocks typing", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<PinInput value="" onChange={onChange} disabled />);
    const first = container.querySelector("input") as HTMLInputElement;
    expect(first).toBeDisabled();
    await user.type(first, "5");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("firing 6 digits calls onComplete with the full value", () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    const { container, rerender } = render(
      <PinInput value="" onChange={onChange} onComplete={onComplete} />
    );
    // Simulate typing digit-by-digit; the parent re-renders with the
    // new accumulated value (mirrors the real Register / Login flow).
    let acc = "";
    for (let i = 0; i < 6; i++) {
      const target = container.querySelectorAll("input")[i] as HTMLInputElement;
      fireEvent.change(target, { target: { value: String(i + 1) } });
      acc = (acc + String(i + 1)).slice(0, 6);
      rerender(<PinInput value={acc} onChange={onChange} onComplete={onComplete} />);
    }
    expect(onComplete).toHaveBeenCalledWith("123456");
  });

  it("pasting a 6-digit string populates all boxes", () => {
    const onChange = vi.fn();
    const { container } = render(<PinInput value="" onChange={onChange} />);
    const first = container.querySelector("input") as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => "654321" },
    });
    expect(onChange).toHaveBeenCalledWith("654321");
  });

  it("paste strips non-digits before applying (matches Android)", () => {
    const onChange = vi.fn();
    const { container } = render(<PinInput value="" onChange={onChange} />);
    const first = container.querySelector("input") as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => "1a2b3c-4-5-6" },
    });
    expect(onChange).toHaveBeenCalledWith("123456");
  });

  it("paste clamps to `length` digits", () => {
    const onChange = vi.fn();
    const { container } = render(<PinInput value="" onChange={onChange} />);
    const first = container.querySelector("input") as HTMLInputElement;
    fireEvent.paste(first, {
      clipboardData: { getData: () => "1234567890" },
    });
    expect(onChange).toHaveBeenCalledWith("123456");
  });

  it("Backspace on empty cell moves focus and clears the previous", () => {
    const onChange = vi.fn();
    const { container } = render(<PinInput value="12" onChange={onChange} />);
    const third = container.querySelectorAll("input")[2] as HTMLInputElement;
    third.focus();
    fireEvent.keyDown(third, { key: "Backspace" });
    // Third box was already empty, so it clears the previous.
    expect(onChange).toHaveBeenCalledWith("1");
  });
});

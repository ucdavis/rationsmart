import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import InputField from "@/components/InputField";

describe("InputField", () => {
  it("renders the label when provided", () => {
    render(<InputField label="Simulation Name" value="" onChange={() => {}} />);
    expect(screen.getByText("Simulation Name")).toBeInTheDocument();
  });

  it("renders no label paragraph when label is omitted", () => {
    const { container } = render(<InputField value="" onChange={() => {}} />);
    expect(container.querySelector("p")).toBeNull();
  });

  it("reflects the controlled value", () => {
    render(<InputField label="Name" value="Aiyappa" onChange={() => {}} />);
    expect(screen.getByDisplayValue("Aiyappa")).toBeInTheDocument();
  });

  it("fires onChange when the user types", () => {
    const onChange = vi.fn();
    render(<InputField label="Name" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "X" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("passes through arbitrary input attributes (placeholder, disabled, type)", () => {
    render(
      <InputField
        label="Body Weight"
        value=""
        onChange={() => {}}
        placeholder="Enter weight"
        disabled
        type="number"
      />
    );
    const input = screen.getByPlaceholderText("Enter weight");
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute("type", "number");
  });

  it("merges a custom className onto the input", () => {
    render(<InputField label="Name" value="" onChange={() => {}} className="custom-cls" />);
    expect(screen.getByRole("textbox")).toHaveClass("custom-cls");
  });

  it("merges a custom containerClassName onto the wrapper", () => {
    const { container } = render(
      <InputField label="Name" value="" onChange={() => {}} containerClassName="my-wrap" />
    );
    expect(container.firstChild).toHaveClass("my-wrap");
  });
});

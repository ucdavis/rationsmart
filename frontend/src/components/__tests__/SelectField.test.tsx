import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SelectField from "@/components/SelectField";

// SelectField is the LEGACY native <select> wrapper (CLAUDE.md §10.7 —
// CustomSelect is preferred for new dropdowns, but this is still used
// by pre-login screens like /register's Country selector).
describe("SelectField", () => {
  const options = [
    { value: "in", label: "India" },
    { value: "vn", label: "Vietnam" },
  ];

  it("renders the label when provided", () => {
    render(<SelectField label="Country" options={options} value="" onChange={() => {}} />);
    expect(screen.getByText("Country")).toBeInTheDocument();
  });

  it("renders a disabled placeholder option plus every option", () => {
    render(<SelectField options={options} value="" onChange={() => {}} placeholder="Select..." />);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => ({ value: o.value, label: o.text }));
    expect(opts).toEqual([
      { value: "", label: "Select..." },
      { value: "in", label: "India" },
      { value: "vn", label: "Vietnam" },
    ]);
    expect(select.options[0].disabled).toBe(true);
  });

  it("reflects the selected value", () => {
    render(<SelectField options={options} value="vn" onChange={() => {}} />);
    expect(screen.getByRole("combobox")).toHaveValue("vn");
  });

  it("fires onChange with the new value on selection", () => {
    const onChange = vi.fn();
    render(<SelectField options={options} value="in" onChange={onChange} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "vn" } });
    expect(onChange).toHaveBeenCalledWith("vn");
  });

  it("disabled=true disables the select", () => {
    render(<SelectField options={options} value="" onChange={() => {}} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("uses a custom placeholder string", () => {
    render(
      <SelectField options={options} value="" onChange={() => {}} placeholder="Choose a country" />
    );
    expect(screen.getByText("Choose a country")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CustomSelect, { type CustomSelectOption } from "@/components/CustomSelect";

const OPTIONS: CustomSelectOption[] = [
  { value: "forage", label: "Forage" },
  { value: "concentrate", label: "Concentrate" },
  { value: "mineral", label: "Mineral" },
];

describe("CustomSelect", () => {
  it("renders the placeholder in the trigger when no value is selected", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole("button", { name: "Select" })).toBeInTheDocument();
  });

  it("renders a custom placeholder string", () => {
    render(
      <CustomSelect value="" onChange={() => {}} options={OPTIONS} placeholder="Select feed type" />
    );
    expect(screen.getByRole("button", { name: "Select feed type" })).toBeInTheDocument();
  });

  it("renders the matching option's label in the trigger when a value is set", () => {
    render(<CustomSelect value="concentrate" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole("button", { name: "Concentrate" })).toBeInTheDocument();
  });

  it("does not show the options popup before it's clicked", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    expect(screen.queryByText("Forage")).not.toBeInTheDocument();
  });

  it("clicking the trigger opens the popup and lists every option", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText("Forage")).toBeInTheDocument();
    expect(screen.getByText("Concentrate")).toBeInTheDocument();
    expect(screen.getByText("Mineral")).toBeInTheDocument();
  });

  it("clicking the trigger again closes the popup (toggle)", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    const trigger = screen.getByRole("button", { name: "Select" });
    fireEvent.click(trigger);
    expect(screen.getByText("Forage")).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByText("Forage")).not.toBeInTheDocument();
  });

  it("selecting an option fires onChange with its value and closes the popup", () => {
    const onChange = vi.fn();
    render(<CustomSelect value="" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.click(screen.getByText("Concentrate"));
    expect(onChange).toHaveBeenCalledWith("concentrate");
    expect(screen.queryByText("Forage")).not.toBeInTheDocument();
  });

  it("disabled=true prevents opening the popup", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} disabled />);
    const trigger = screen.getByRole("button", { name: "Select" });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    expect(screen.queryByText("Forage")).not.toBeInTheDocument();
  });

  it("renders no popup when options list is empty, even after clicking", () => {
    render(<CustomSelect value="" onChange={() => {}} options={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    // No option rows to find; just assert no stray popup container renders.
    expect(screen.queryByRole("button", { name: "Forage" })).not.toBeInTheDocument();
  });

  it("hides the chevron when showChevron=false", () => {
    const { container } = render(
      <CustomSelect value="" onChange={() => {}} options={OPTIONS} showChevron={false} />
    );
    expect(container.querySelector("svg")).toBeNull();
  });

  it("shows the chevron by default", () => {
    const { container } = render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("transparentTrigger=true renders the trigger button with a transparent background", () => {
    render(
      <CustomSelect value="" onChange={() => {}} options={OPTIONS} transparentTrigger />
    );
    const trigger = screen.getByRole("button", { name: "Select" });
    expect(trigger).toHaveStyle({ background: "transparent" });
  });

  it("transparentTrigger=false (default) leaves background unset", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    const trigger = screen.getByRole("button", { name: "Select" });
    expect(trigger.style.background).toBe("");
  });

  it("zebra-stripes the popup rows: index 0 white, odd rows bright_gray_new (#E4F7EF)", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    const forage = screen.getByText("Forage"); // index 0
    const concentrate = screen.getByText("Concentrate"); // index 1 (odd)
    const mineral = screen.getByText("Mineral"); // index 2 (even, also last)
    expect(forage).toHaveStyle({ backgroundColor: "#FFFFFF" });
    expect(concentrate).toHaveStyle({ backgroundColor: "#E4F7EF" });
    expect(mineral).toHaveStyle({ backgroundColor: "#FFFFFF" });
  });

  it("rounds only the top corners of the first row and bottom corners of the last row", () => {
    render(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText("Forage")).toHaveStyle({ borderRadius: "10px 10px 0 0" });
    expect(screen.getByText("Concentrate")).toHaveStyle({ borderRadius: "0" });
    expect(screen.getByText("Mineral")).toHaveStyle({ borderRadius: "0 0 10px 10px" });
  });

  it("a single-option list gets fully rounded corners (idx 0 === last)", () => {
    render(
      <CustomSelect value="" onChange={() => {}} options={[{ value: "only", label: "Only" }]} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText("Only")).toHaveStyle({ borderRadius: "10px" });
  });

  // Opt-in `loading` prop: same trigger markup, just non-interactive
  // with hidden text and no chevron — used by callers (e.g. cattle-info)
  // who shimmer their own wrapper around the SAME element instead of
  // swapping in separate skeleton markup.
  describe("loading prop", () => {
    it("disables the trigger and hides its label text, without changing the rendered structure", () => {
      const onChange = vi.fn();
      render(<CustomSelect value="forage" onChange={onChange} options={OPTIONS} loading />);
      const trigger = screen.getByRole("button", { name: "Forage" });
      expect(trigger).toBeDisabled();
      // jsdom normalizes "transparent" to its rgba equivalent in computed style.
      expect(trigger).toHaveStyle({ color: "rgba(0, 0, 0, 0)" });
    });

    it("does not open the popup on click while loading", () => {
      const onChange = vi.fn();
      render(<CustomSelect value="" onChange={onChange} options={OPTIONS} loading />);
      fireEvent.click(screen.getByRole("button", { name: "Select" }));
      expect(screen.queryByText("Concentrate")).not.toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("hides the chevron while loading", () => {
      const { container, rerender } = render(
        <CustomSelect value="" onChange={() => {}} options={OPTIONS} loading />
      );
      expect(container.querySelector("svg")).not.toBeInTheDocument();
      rerender(<CustomSelect value="" onChange={() => {}} options={OPTIONS} />);
      expect(container.querySelector("svg")).toBeInTheDocument();
    });
  });
});

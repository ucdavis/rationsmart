import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RequiredAsterisk from "@/components/RequiredAsterisk";

describe("RequiredAsterisk", () => {
  it("renders a space + red asterisk in a span", () => {
    const { container } = render(<RequiredAsterisk />);
    const span = container.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe(" *");
  });

  it("uses the red_ryb design token (#FC2E20)", () => {
    const { container } = render(<RequiredAsterisk />);
    const span = container.querySelector("span");
    expect(span).toHaveStyle({ color: "rgb(252, 46, 32)" });
  });
});

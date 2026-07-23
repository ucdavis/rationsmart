import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SectionCard from "@/components/SectionCard";

describe("SectionCard", () => {
  it("renders the title and children", () => {
    render(
      <SectionCard title="Animal Characteristics" iconEmoji="🐄">
        <div>child content</div>
      </SectionCard>
    );
    expect(screen.getByText("Animal Characteristics")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("title header uses the dark_aquamarine_green color", () => {
    render(
      <SectionCard title="Milk Production">
        <div />
      </SectionCard>
    );
    expect(screen.getByText("Milk Production")).toHaveStyle({ color: "rgb(6, 78, 59)" });
  });

  it("renders iconEmoji inside the icon pill when no iconSvg is given", () => {
    render(
      <SectionCard title="Environment" iconEmoji="🌡️">
        <div />
      </SectionCard>
    );
    expect(screen.getByText("🌡️")).toBeInTheDocument();
  });

  it("prefers iconSvg over iconEmoji when both are given", () => {
    render(
      <SectionCard
        title="Reproductive Data"
        iconEmoji="🥚"
        iconSvg={<svg data-testid="custom-icon" />}
      >
        <div />
      </SectionCard>
    );
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
    expect(screen.queryByText("🥚")).not.toBeInTheDocument();
  });

  it("renders topRightContent when provided", () => {
    render(
      <SectionCard title="Simulation Details" topRightContent={<button>History</button>}>
        <div />
      </SectionCard>
    );
    expect(screen.getByRole("button", { name: "History" })).toBeInTheDocument();
  });

  it("omits topRightContent wrapper when not provided", () => {
    const { container } = render(
      <SectionCard title="No Extras">
        <div>child</div>
      </SectionCard>
    );
    // Header row should only contain the icon+title group, no trailing wrapper div.
    const headerRow = container.querySelector(".flex.items-center.justify-between");
    expect(headerRow?.children.length).toBe(1);
  });

  it("applies a custom cornerRadius", () => {
    const { container } = render(
      <SectionCard title="Custom Radius" cornerRadius={8}>
        <div />
      </SectionCard>
    );
    expect(container.firstChild).toHaveStyle({ borderRadius: "8px" });
  });

  it("defaults cornerRadius to 20 when omitted", () => {
    const { container } = render(
      <SectionCard title="Default Radius">
        <div />
      </SectionCard>
    );
    expect(container.firstChild).toHaveStyle({ borderRadius: "20px" });
  });
});

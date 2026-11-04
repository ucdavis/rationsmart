import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import UserLimitsCard from "@/components/report/UserLimitsCard";
import type { UserLimits } from "@/lib/api-client/models";

const t = (s: string) => s;

const soy = {
  feed_id: "c5624c59",
  feed_name: "Soybean meal - Seed - Cake stage - Wet season",
  display_name: "Soybean meal (localized)",
  min_kg_asfed: null,
  max_kg_asfed: 2,
  result_kg_asfed: 1.88,
};
const fat = {
  key: "ee_max",
  label: "Fat Content",
  display_label: "Fat Content (localized)",
  direction: "max" as const,
  value: 3,
  default: 7,
  unit: "% DM",
};

const cells = (name: string) =>
  within(screen.getByRole("table", { name }))
    .getAllByRole("cell")
    .map((c) => c.textContent);

describe("UserLimitsCard", () => {
  it("shows both tables, the localized names and the footnote", () => {
    render(<UserLimitsCard userLimits={{ inclusion_limits: [soy], diet_limits: [fat] }} t={t} />);
    expect(screen.getByText("Limits You Set")).toBeInTheDocument();
    expect(cells("Feed inclusion limits")).toEqual([
      "Soybean meal (localized)",
      "—",
      "2.00",
      "1.88",
    ]);
    expect(cells("Custom Diet Limits")).toEqual(["Fat Content (localized)", "≤ 3", "≤ 7", "% DM"]);
    expect(
      screen.getByText("These limits were set by the user and shape the diet above.")
    ).toBeInTheDocument();
  });

  it("shows only the table that has rows", () => {
    render(<UserLimitsCard userLimits={{ diet_limits: [fat] }} t={t} />);
    expect(screen.getByRole("table", { name: "Custom Diet Limits" })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Feed inclusion limits" })).toBeNull();
  });

  it.each<[string, UserLimits | null | undefined]>([
    ["absent", undefined],
    ["null", null],
    ["empty lists", { inclusion_limits: [], diet_limits: [] }],
  ])("renders nothing when user_limits is %s", (_, userLimits) => {
    const { container } = render(<UserLimitsCard userLimits={userLimits} t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows — for null amounts (no diet found) and falls back to the English names", () => {
    render(
      <UserLimitsCard
        userLimits={{
          inclusion_limits: [
            { ...soy, display_name: null, min_kg_asfed: 0.5, result_kg_asfed: null },
          ],
          diet_limits: [{ ...fat, display_label: null, default: null }],
        }}
        t={t}
      />
    );
    expect(cells("Feed inclusion limits")).toEqual([soy.feed_name, "0.50", "2.00", "—"]);
    expect(cells("Custom Diet Limits")).toEqual(["Fat Content", "≤ 3", "—", "% DM"]);
  });

  it("uses ≥ for a min limit (ndf_for_min)", () => {
    render(
      <UserLimitsCard
        userLimits={{
          diet_limits: [
            {
              key: "ndf_for_min",
              label: "Forage NDF",
              direction: "min",
              value: 19,
              default: 15,
              unit: "% DM",
            },
          ],
        }}
        t={t}
      />
    );
    expect(cells("Custom Diet Limits")).toEqual(["Forage NDF", "≥ 19", "≥ 15", "% DM"]);
  });
});

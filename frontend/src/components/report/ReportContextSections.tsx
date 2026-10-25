"use client";

// Report details, animal characteristics and state-driven sections; split out of report/page.tsx (audit B-17).
import { SCard, LabelValue } from "@/components/report/parts";
import { IcAnimalCharacteristics } from "@/components/Icons";
import { COLORS } from "@/lib/colors";

import type { CattleInfo } from "@/lib/api-client/models";
import type { ReportContext } from "@/components/report/parts";

export interface ReportContextSectionsProps {
  cattleInfo: CattleInfo;
  reportCtx: ReportContext;
  t: (source: string) => string;
}

export default function ReportContextSections({
  cattleInfo,
  reportCtx,
  t,
}: ReportContextSectionsProps) {
  return (
    <SCard
      title={t("Animal Characteristics")}
      icon={<IcAnimalCharacteristics size={24} color={COLORS.darkAquamarineGreen} />}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <LabelValue label={t("Breed")} value={cattleInfo.breed || t("N/A")} />
        <LabelValue label={t("Body Weight")} value={`${cattleInfo.body_weight} ${t("Kg")}`} />
        <LabelValue
          label={t("Body Condition Score")}
          value={`${cattleInfo.body_condition_score}`}
        />
        <LabelValue
          label={t("Daily BW Gain")}
          value={`${cattleInfo.body_weight_gain} ${t("kg/day")}`}
        />
        <LabelValue label={t("Parity")} value={`${cattleInfo.parity}`} />
        <LabelValue label={t("Days in Milk")} value={`${cattleInfo.days_in_milk} ${t("Days")}`} />
        <LabelValue
          label={t("Days of Pregnancy")}
          value={`${cattleInfo.days_of_pregnancy} ${t("Days")}`}
        />
        <LabelValue
          label={t("Temperature")}
          value={`${cattleInfo.average_temperature} ${t("°C")}`}
        />
        <LabelValue
          label={t("Distance")}
          value={
            cattleInfo.grazing
              ? `${Number(cattleInfo.distance ?? 0).toFixed(2)} ${t("km")}`
              : `0.00 ${t("km")}`
          }
        />
        <LabelValue
          label={t("Topography")}
          value={cattleInfo.grazing ? cattleInfo.topography || t("N/A") : t("Not Selected")}
        />
        {/* Y3 §2.3 — milk rows only for Lactating Cow. Other states
                  don't capture milk values on the form, so showing them
                  here would just print "0 Liter" / "0 %". */}
        {reportCtx.showMilkProductionSection && (
          <>
            <LabelValue
              label={t("Milk Production")}
              value={`${cattleInfo.milk_production} ${t("Liter")}`}
            />
            <LabelValue
              label={t("Milk Protein %")}
              value={`${cattleInfo.milk_protein_percent} %`}
            />
            <div className="col-span-2">
              <LabelValue label={t("Milk Fat %")} value={`${cattleInfo.milk_fat_percent} %`} />
            </div>
          </>
        )}
      </div>
    </SCard>
  );
}

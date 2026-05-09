"use client";

interface SectionCardProps {
  iconEmoji?: string;
  iconSvg?: React.ReactNode;
  title: string;
  topRightContent?: React.ReactNode;
  children: React.ReactNode;
}

export default function SectionCard({
  iconEmoji,
  iconSvg,
  title,
  topRightContent,
  children,
}: SectionCardProps) {
  return (
    <div
      className="mx-3 my-2.5 pb-5 rounded-2xl bg-white"
      style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}
    >
      {/* Section Header */}
      <div className="flex items-center justify-between px-3 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          {/* Icon card */}
          <div
            className="rounded-xl p-1.5 flex items-center justify-center"
            style={{ backgroundColor: "#F0FDF4", minWidth: 36, minHeight: 36 }}
          >
            {iconSvg ? (
              iconSvg
            ) : (
              <span style={{ fontSize: 18 }}>{iconEmoji}</span>
            )}
          </div>
          <span
            className="text-base font-bold"
            style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
          >
            {title}
          </span>
        </div>
        {topRightContent && <div>{topRightContent}</div>}
      </div>

      {/* Children */}
      <div>{children}</div>
    </div>
  );
}

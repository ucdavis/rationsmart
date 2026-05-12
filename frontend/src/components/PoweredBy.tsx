"use client";

export default function PoweredBy() {
  return (
    <div className="flex flex-col items-center py-3">
      <span className="text-xs" style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif", letterSpacing: "0.05em" }}>
        POWERED BY
      </span>
      <span
        className="text-sm"
        style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif" }}
      >
        DigitalGreen
      </span>
    </div>
  );
}

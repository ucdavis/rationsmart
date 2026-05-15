"use client";

// Mirrors Android dialog_generating_report.xml — a centred, non-cancellable
// dialog with a green-tinted ic_generating_report icon, "Generating your
// report" title, and a circular indeterminate progress indicator. Shown
// while feedVM.feedRecommendationReport / feedEvaluationReport is in
// flight after the user taps Generate / Get Evaluation on Feed Selection.
export default function GeneratingReportDialog() {
  return (
    <div
      className="fixed top-0 h-full z-[110] flex items-center justify-center px-6"
      style={{
        left: "max(0px, calc((100vw - 480px) / 2))",
        width: "min(100vw, 480px)",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-xs flex flex-col items-center"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: "30px 12px 20px" }}
      >
        {/* Double-card icon — outer go_green_15 pill, inner white pill, ic_generating_report inside */}
        <div
          className="flex items-center justify-center"
          style={{ backgroundColor: "rgba(5,188,109,0.15)", borderRadius: 60, padding: 10 }}
        >
          <div
            className="flex items-center justify-center"
            style={{ backgroundColor: "#FFFFFF", borderRadius: 60, padding: 10 }}
          >
            {/* ic_generating_report.xml — Material Symbols "feed" icon
                (a list-with-pen glyph). Single filled path, viewport 960x960. */}
            <svg width="36" height="36" viewBox="0 0 960 960" fill="#064E3B">
              <path d="M216,784q-45,-45 -70.5,-104T120,558q0,-63 24,-124.5T222,318q60,-60 169.5,-91T675,201q26,1 48,11t39,27q17,17 27,39.5t11,48.5q2,82 -4.5,151.5t-21,125.5q-14.5,56 -37,99.5T684,778q-53,53 -112.5,77.5T450,880q-65,0 -127,-25.5T216,784ZM328,768q29,17 59.5,24.5T450,800q46,0 91,-18.5t86,-59.5q18,-18 36.5,-50.5t32,-85Q709,534 716,459.5t2,-177.5q-49,-2 -110.5,-1.5T485,290q-61,9 -116,29t-90,55q-45,45 -62,89t-17,85q0,59 22.5,103.5T262,714q42,-80 111,-153.5T534,440q-72,63 -125.5,142.5T328,768Z" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <p
          className="font-bold mt-5 text-center"
          style={{ color: "#064E3B", fontFamily: "Nunito, sans-serif", fontSize: 20 }}
        >
          Generating your report
        </p>

        {/* Indeterminate circular progress — dark_aquamarine_green stroke
            on go_green_15 track, matching Android cpi_generating. */}
        <svg className="animate-spin mt-5" width="40" height="40" viewBox="0 0 50 50" fill="none">
          <circle cx="25" cy="25" r="20" stroke="rgba(5,188,109,0.15)" strokeWidth="4" />
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke="#064E3B"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray="90 200"
          />
        </svg>
      </div>
    </div>
  );
}

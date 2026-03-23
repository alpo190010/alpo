"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const PLANS = [
  {
    name: "Pro",
    price: "$49/mo",
    features: [
      "Full 10-section reports with AI fix suggestions",
      "AI-generated title & description rewrites",
      "Up to 10 products",
      "Competitor comparison unlocked",
    ],
    cta: "Start Free Trial — Pro",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$149/mo",
    features: [
      "Everything in Pro, plus:",
      "Weekly monitoring & email alerts",
      "Unlimited products & multiple stores",
      "White-label PDF reports",
      "Team seats & priority support",
    ],
    cta: "Start Free Trial — Agency",
    highlight: false,
  },
];

function ReportContent() {
  const params = useSearchParams();
  const url = params.get("url") || "";
  const feature = params.get("feature") || "";

  return (
    <>
      {/* ═══ NAV ═══ */}
      <nav className="w-full h-16" style={{ background: "#F8F7F4", borderBottom: "1px solid #E5E7EB" }}>
        <div className="max-w-2xl mx-auto px-4 h-full flex items-center">
          <a href="/" className="text-lg font-bold tracking-[-0.02em]" style={{ color: "#111111" }} aria-label="PageScore home">
            PageScore
          </a>
        </div>
      </nav>

      <main className="min-h-screen flex flex-col items-center px-4 pt-12 sm:pt-24" style={{ background: "#F8F7F4" }}>
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: "#111111", letterSpacing: "-0.02em" }}>
              {feature === "rewrites" ? "Unlock AI Rewrites" : "Unlock Your Full Report"}
            </h1>
            <p className="text-sm mb-2" style={{ color: "#6B6B6B" }}>
              {feature === "rewrites"
                ? "Get AI-optimized product copy for:"
                : "Deep-dive analysis for:"}
            </p>
            <p className="font-[family-name:var(--font-mono)] text-sm break-all" style={{ color: "#2563EB" }}>
              {url || "No URL provided"}
            </p>
          </div>

          {/* Plan selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="flex flex-col relative"
                style={{
                  padding: "clamp(20px, 3vw, 24px)",
                  borderRadius: "12px",
                  border: plan.highlight ? "1.5px solid #BFDBFE" : "1.5px solid #E5E7EB",
                  background: plan.highlight ? "#EFF6FF" : "#FFFFFF",
                }}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: "#2563EB" }}
                  >
                    Recommended
                  </div>
                )}
                <h3 className="font-bold text-lg mb-1" style={{ color: "#111111" }}>{plan.name}</h3>
                <div className="text-2xl font-bold mb-3" style={{ color: "#111111" }}>{plan.price}</div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm flex gap-2" style={{ color: "#6B6B6B" }}>
                      <span className="shrink-0" style={{ color: "#2563EB" }}>&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  className="block text-center px-6 py-3 rounded-lg font-bold transition hover:opacity-90"
                  style={{
                    backgroundColor: plan.highlight ? "#2563EB" : "#FFFFFF",
                    color: plan.highlight ? "#FFFFFF" : "#111111",
                    border: plan.highlight ? "none" : "1.5px solid #E5E7EB",
                  }}
                  aria-label={`${plan.cta} at ${plan.price}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-xs mb-4" style={{ color: "#9E9E9E" }}>
            Cancel anytime. Reports delivered to your email within 5 minutes.
          </p>
        </div>
      </main>
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ color: "#9E9E9E", background: "#F8F7F4" }}>Loading...</div>}>
      <ReportContent />
    </Suspense>
  );
}

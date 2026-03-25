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
      <nav className="w-full h-16 bg-[var(--bg)] border-b border-[var(--border)]" aria-label="Main navigation">
        <div className="max-w-2xl mx-auto px-4 h-full flex items-center">
          <a href="/" className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)]" aria-label="alpo.ai home">
            alpo.ai
          </a>
        </div>
      </nav>

      <main className="min-h-screen flex flex-col items-center px-4 pt-12 sm:pt-24 bg-[var(--bg)]">
        <div className="max-w-2xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-4 text-[var(--text-primary)] tracking-[-0.02em]">
              {feature === "rewrites" ? "Unlock AI Rewrites" : "Unlock Your Full Report"}
            </h1>
            <p className="text-sm mb-2 text-[var(--text-secondary)]">
              {feature === "rewrites"
                ? "Get AI-optimized product copy for:"
                : "Deep-dive analysis for:"}
            </p>
            <p className="font-[family-name:var(--font-mono)] text-sm break-all text-[var(--brand)]">
              {url || "No URL provided"}
            </p>
          </div>

          {/* Plan selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col relative p-[clamp(20px,3vw,24px)] rounded-xl border-[1.5px] ${
                  plan.highlight
                    ? "border-[var(--brand-border)] bg-[var(--brand-light)]"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-bold text-white bg-[var(--brand)]">
                    Recommended
                  </div>
                )}
                <h3 className="font-bold text-lg mb-1 text-[var(--text-primary)]">{plan.name}</h3>
                <div className="text-2xl font-bold mb-3 text-[var(--text-primary)]">{plan.price}</div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm flex gap-2 text-[var(--text-secondary)]">
                      <span className="shrink-0 text-[var(--brand)]">&#10003;</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="#"
                  className={`block text-center px-6 py-3 rounded-lg font-bold transition-opacity hover:opacity-90 polish-focus-ring ${
                    plan.highlight
                      ? "bg-[var(--brand)] text-white"
                      : "bg-[var(--surface)] text-[var(--text-primary)] border-[1.5px] border-[var(--border)]"
                  }`}
                  aria-label={`${plan.cta} at ${plan.price}`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>

          <p className="text-center text-xs mb-4 text-[var(--text-tertiary)]">
            Cancel anytime. Reports delivered to your email within 5 minutes.
          </p>
        </div>
      </main>
    </>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--text-tertiary)] bg-[var(--bg)]">Loading...</div>}>
      <ReportContent />
    </Suspense>
  );
}

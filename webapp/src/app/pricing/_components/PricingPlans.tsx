"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle,
  Sparkle,
  RocketLaunch,
  Lightning,
  Star,
  CheckCircle as CheckCircleIcon,
} from "@phosphor-icons/react";
import PricingActions from "./PricingActions";

type Billing = "monthly" | "annual";

/** Map the user's persisted plan_tier to the card key used in TIERS. */
function cardKeyForPlanTier(
  planTier: string | undefined,
): "free" | "starter" | "pro-waitlist" | null {
  if (planTier === "free") return "free";
  if (planTier === "starter") return "starter";
  if (planTier === "pro") return "pro-waitlist";
  return null;
}

interface PricingTier {
  key: "free" | "starter" | "pro-waitlist";
  name: string;
  description: string;
  scanPill: string;
  priceMonthly: number;
  priceAnnualTotal: number; // total billed annually
  features: string[];
  icon: React.ReactNode;
  ctaLabel: string;
  highlighted?: boolean;
  comingSoon?: boolean;
}

const ANNUAL_DISCOUNT = 0.2; // 20 % off when billed annually
const annualTotal = (monthly: number) =>
  Math.round(monthly * 12 * (1 - ANNUAL_DISCOUNT));

const TIERS: PricingTier[] = [
  {
    key: "free",
    name: "Free",
    description: "See exactly where you're losing revenue.",
    scanPill: "3 scans per month",
    priceMonthly: 0,
    priceAnnualTotal: 0,
    features: [
      "3 scans per calendar month",
      "Full 18-dimension scoring",
      "Revenue leak estimates",
      "Score breakdown per dimension",
    ],
    icon: <Sparkle size={24} weight="regular" />,
    ctaLabel: "Start Free",
  },
  {
    key: "starter",
    name: "Starter",
    description: "Unlimited scans and the fixes to close every leak.",
    scanPill: "Unlimited scans",
    priceMonthly: 29,
    priceAnnualTotal: annualTotal(29),
    features: [
      "Unlimited scans",
      "Full fix recommendations",
      "All 18 dimensions",
      "Revenue leak estimates",
      "Email support",
    ],
    icon: <Lightning size={24} weight="fill" />,
    ctaLabel: "Upgrade to Starter",
    highlighted: true,
  },
  {
    key: "pro-waitlist",
    name: "Pro",
    description: "Everything in Starter, plus AI that does the fixing for you.",
    scanPill: "Unlimited + AI credits",
    priceMonthly: 99,
    priceAnnualTotal: annualTotal(99),
    features: [
      "Everything in Starter",
      "AI-powered auto-fix",
      "Store monitoring",
      "Competitor insights",
      "Priority support",
    ],
    icon: <RocketLaunch size={24} weight="regular" />,
    ctaLabel: "Join Waitlist",
    comingSoon: true,
  },
];

export default function PricingPlans() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const { data: session, status } = useSession();
  const currentCardKey =
    status === "authenticated"
      ? cardKeyForPlanTier(session?.user?.plan_tier)
      : null;

  return (
    <section className="pb-16 sm:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        {/* Monthly ↔ Annual toggle */}
        <div className="flex justify-center mb-10">
          <div
            role="tablist"
            aria-label="Billing cadence"
            className="inline-flex items-center p-1 rounded-full border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] text-sm font-semibold"
          >
            <button
              role="tab"
              type="button"
              aria-selected={billing === "monthly"}
              onClick={() => setBilling("monthly")}
              className={`px-5 py-2 rounded-full transition-colors ${
                billing === "monthly"
                  ? "bg-[var(--brand)] text-[var(--paper)] shadow-[var(--shadow-brand-sm)]"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              }`}
            >
              Monthly
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={billing === "annual"}
              onClick={() => setBilling("annual")}
              className={`px-5 py-2 rounded-full transition-colors inline-flex items-center gap-2 ${
                billing === "annual"
                  ? "bg-[var(--brand)] text-[var(--paper)] shadow-[var(--shadow-brand-sm)]"
                  : "text-[var(--on-surface-variant)] hover:text-[var(--on-surface)]"
              }`}
            >
              Annual
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  billing === "annual"
                    ? "bg-[var(--paper)] text-[var(--brand)]"
                    : "bg-[var(--success-light)] text-[var(--success-text)]"
                }`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Tier grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {TIERS.map((tier) => {
            const isFree = tier.priceMonthly === 0;
            const showAnnual = billing === "annual" && !isFree;
            const displayMonthly = showAnnual
              ? Math.round(tier.priceAnnualTotal / 12)
              : tier.priceMonthly;
            const isCurrent = tier.key === currentCardKey;

            return (
              <div
                key={tier.key}
                aria-current={isCurrent ? "true" : undefined}
                className={`relative flex flex-col rounded-2xl border bg-[var(--surface-container-lowest)] p-6 sm:p-8 transition-all ${
                  isCurrent
                    ? "border-[var(--ok)] shadow-[var(--shadow-brand-md)] ring-2 ring-[var(--ok)]/30"
                    : tier.highlighted
                    ? "border-[var(--brand)] shadow-[var(--shadow-brand-md)] ring-2 ring-[var(--brand)]/20"
                    : tier.comingSoon
                    ? "border-[var(--outline-variant)] opacity-85"
                    : "border-[var(--outline-variant)]"
                }`}
              >
                {/* Badge: Current plan takes priority over Most popular / Coming Soon */}
                {isCurrent ? (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1"
                    style={{ background: "var(--ok)", color: "var(--paper)" }}
                  >
                    <CheckCircleIcon size={12} weight="fill" />
                    Your plan
                  </div>
                ) : tier.highlighted ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-[var(--brand)] text-[var(--paper)] inline-flex items-center gap-1">
                    <Star size={12} weight="fill" />
                    Most popular
                  </div>
                ) : tier.comingSoon ? (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold bg-[var(--surface-container-high)] text-[var(--on-surface-variant)]">
                    Coming Soon
                  </div>
                ) : null}

                {/* Icon + Name */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: tier.highlighted
                        ? "var(--brand-light)"
                        : "var(--surface-container-high)",
                      color: tier.highlighted
                        ? "var(--brand)"
                        : "var(--on-surface-variant)",
                    }}
                  >
                    {tier.icon}
                  </div>
                  <h3 className="font-display text-lg font-extrabold text-[var(--on-surface)]">
                    {tier.name}
                  </h3>
                </div>

                {/* Price */}
                <div className="mb-4">
                  {isFree ? (
                    <div className="font-display text-4xl font-extrabold text-[var(--on-surface)]">
                      $0
                      <span className="text-base font-semibold text-[var(--on-surface-variant)]">
                        {" "}
                        / forever
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="font-display text-4xl font-extrabold text-[var(--on-surface)]">
                        ${displayMonthly}
                        <span className="text-base font-semibold text-[var(--on-surface-variant)]">
                          {" "}
                          / month
                        </span>
                      </div>
                      {showAnnual && (
                        <div className="text-xs text-[var(--on-surface-variant)] mt-1">
                          Billed ${tier.priceAnnualTotal} / year
                        </div>
                      )}
                    </>
                  )}
                </div>

                <p className="text-sm text-[var(--on-surface-variant)] mb-6">
                  {tier.description}
                </p>

                {/* Scan count highlight */}
                <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl bg-[var(--surface-container-low)]">
                  <Lightning size={16} weight="fill" color="var(--brand)" />
                  <span className="text-sm font-semibold text-[var(--on-surface)]">
                    {tier.scanPill}
                  </span>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-8 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle
                        size={18}
                        weight="fill"
                        color="var(--success)"
                        className="shrink-0 mt-0.5"
                      />
                      <span className="text-sm text-[var(--on-surface)]">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <PricingActions
                  tier={{
                    key: tier.key,
                    ctaLabel: tier.ctaLabel,
                    billing,
                    isCurrent,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

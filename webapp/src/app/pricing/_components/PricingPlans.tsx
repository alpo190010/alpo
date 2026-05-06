"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle,
  Sparkle,
  Lightning,
  Star,
  CheckCircle as CheckCircleIcon,
  Wrench,
} from "@phosphor-icons/react";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import PricingActions from "./PricingActions";

/** Map the user's persisted plan_tier to the card key. */
function cardKeyForPlanTier(
  planTier: string | undefined,
): "free" | "insights" | "fixes" | null {
  if (planTier === "free") return "free";
  if (planTier === "insights") return "insights";
  if (planTier === "fixes") return "fixes";
  return null;
}

interface PricingTier {
  key: "free" | "insights" | "fixes";
  name: string;
  description: string;
  scanPill: string;
  /** USD per year (or 0 for free). */
  price: number;
  features: string[];
  icon: React.ReactNode;
  ctaLabel: string;
  highlighted?: boolean;
}

const TIERS: PricingTier[] = [
  {
    key: "free",
    name: "Free",
    description: "See your scores. Upgrade when you want the why or the how.",
    scanPill: "3 scans per month",
    price: 0,
    features: [
      "3 scans per calendar month",
      "Per-dimension scores (all 18)",
      "Revenue-leak estimates",
      "Diagnosis & fixes locked",
    ],
    icon: <Sparkle size={24} weight="regular" />,
    ctaLabel: "Start Free",
  },
  {
    key: "insights",
    name: "Insights",
    description:
      "Learn exactly what's working and what's broken on every product page.",
    scanPill: "Unlimited scans, one store",
    price: 79,
    features: [
      "Everything in Free",
      "Detailed diagnosis per dimension",
      "What's working / what's missing prose",
      "Unlimited scans, one store",
      "1-year access — no auto-renewal",
      "Email support",
    ],
    icon: <Lightning size={24} weight="fill" />,
    ctaLabel: "Get Insights",
    highlighted: true,
  },
  {
    key: "fixes",
    name: "Fixes",
    description:
      "Everything in Insights, plus the step-by-step playbook and code to repair each issue.",
    scanPill: "Unlimited scans, one store",
    price: 149,
    features: [
      "Everything in Insights",
      "Step-by-step fix recommendations",
      "Copy-paste code snippets per fix",
      "1-year access — no auto-renewal",
      "Priority email support",
    ],
    icon: <Wrench size={24} weight="fill" />,
    ctaLabel: "Get Fixes",
  },
];

export default function PricingPlans() {
  // Plans are now per-store, so there's no single "current tier" at the
  // pricing-page level — the "Get Insights / Fixes" CTAs always route the
  // user to /dashboard where they choose which store to upgrade.
  const currentCardKey: string | null = null;

  return (
    <section className="pb-16 sm:pb-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        {/* Tier grid — 3 cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {TIERS.map((tier) => {
            const isFree = tier.price === 0;
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
                      : "border-[var(--outline-variant)]"
                }`}
              >
                {/* Badge: Current plan takes priority over Most popular */}
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
                    <div className="font-display text-4xl font-extrabold text-[var(--on-surface)]">
                      ${tier.price}
                      <span className="text-base font-semibold text-[var(--on-surface-variant)]">
                        {" "}
                        / year
                      </span>
                    </div>
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

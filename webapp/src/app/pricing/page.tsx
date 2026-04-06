"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  CheckCircle,
  XCircle,
  RocketLaunch,
  Crown,
  Buildings,
  Sparkle,
  Lightning,
} from "@phosphor-icons/react";
import { useState } from "react";
import dynamic from "next/dynamic";
const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });
import Footer from "@/components/Footer";

/* ══════════════════════════════════════════════════════════════
   LemonSqueezy env vars — same as PaywallModal
   ══════════════════════════════════════════════════════════════ */
const LS_STORE_URL = process.env.NEXT_PUBLIC_LS_STORE_URL ?? "";
const LS_VARIANT_STARTER = process.env.NEXT_PUBLIC_LS_VARIANT_STARTER ?? "";
const LS_VARIANT_GROWTH = process.env.NEXT_PUBLIC_LS_VARIANT_GROWTH ?? "";
const LS_VARIANT_PRO = process.env.NEXT_PUBLIC_LS_VARIANT_PRO ?? "";

function buildCheckoutUrl(variant: string, userId: string): string {
  if (!LS_STORE_URL || !variant) return "";
  return `${LS_STORE_URL}/checkout/buy/${variant}?checkout[custom][user_id]=${userId}`;
}

/* ══════════════════════════════════════════════════════════════
   Tier definitions — matches PLAN_TIERS in api/app/plans.py
   ══════════════════════════════════════════════════════════════ */
interface PricingTier {
  key: string;
  name: string;
  price: number;
  scans: number;
  description: string;
  features: { text: string; included: boolean }[];
  variant: string;
  icon: React.ReactNode;
  popular?: boolean;
  ctaLabel: string;
}

const PRICING_TIERS: PricingTier[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    scans: 3,
    description: "Try alpo.ai with basic scan results",
    features: [
      { text: "3 scans per month", included: true },
      { text: "Score overview only", included: true },
      { text: "Fix recommendations", included: false },
      { text: "Detailed report breakdowns", included: false },
    ],
    variant: "",
    icon: <Sparkle size={24} weight="regular" />,
    ctaLabel: "Get Started",
  },
  {
    key: "starter",
    name: "Starter",
    price: 29,
    scans: 10,
    description: "Full reports for growing stores",
    features: [
      { text: "10 scans per month", included: true },
      { text: "7 key dimension fixes", included: true },
      { text: "Fix recommendations", included: true },
      { text: "Detailed report breakdowns", included: true },
    ],
    variant: LS_VARIANT_STARTER,
    icon: <RocketLaunch size={24} weight="regular" />,
    ctaLabel: "Subscribe",
  },
  {
    key: "growth",
    name: "Growth",
    price: 79,
    scans: 30,
    description: "More scans for scaling brands",
    features: [
      { text: "30 scans per month", included: true },
      { text: "All 18 dimension fixes", included: true },
      { text: "Fix recommendations", included: true },
      { text: "Detailed report breakdowns", included: true },
    ],
    variant: LS_VARIANT_GROWTH,
    icon: <Crown size={24} weight="regular" />,
    popular: true,
    ctaLabel: "Subscribe",
  },
  {
    key: "pro",
    name: "Pro",
    price: 149,
    scans: 100,
    description: "Maximum scans for power users",
    features: [
      { text: "100 scans per month", included: true },
      { text: "All 18 dimension fixes", included: true },
      { text: "Fix recommendations", included: true },
      { text: "Detailed report breakdowns", included: true },
    ],
    variant: LS_VARIANT_PRO,
    icon: <Buildings size={24} weight="regular" />,
    ctaLabel: "Subscribe",
  },
];

/* ══════════════════════════════════════════════════════════════
   /pricing page
   ══════════════════════════════════════════════════════════════ */
export default function PricingPage() {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [checkoutClicked, setCheckoutClicked] = useState(false);

  return (
    <>
      <main id="main-content" className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <h1
              className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[var(--on-surface)] mb-4 leading-[1.1]"
            >
              Simple, transparent pricing
            </h1>
            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto">
              Find your conversion leaks. Fix what matters. Choose the plan that
              fits your store.
            </p>
          </div>
        </section>

        {/* ── Tier Grid ── */}
        <section className="pb-16 sm:pb-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
              {PRICING_TIERS.map((tier) => {
                const isPaid = tier.price > 0;
                const checkoutUrl = isPaid
                  ? buildCheckoutUrl(tier.variant, userId)
                  : "";
                const isSignedIn = !!session?.user;

                return (
                  <div
                    key={tier.key}
                    className={`relative flex flex-col rounded-2xl border bg-[var(--surface-container-lowest)] p-6 sm:p-8 transition-all ${
                      tier.popular
                        ? "border-[var(--brand)] shadow-lg ring-2 ring-[var(--brand)]/20"
                        : "border-[var(--outline-variant)]"
                    }`}
                  >
                    {/* Popular badge */}
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold text-white primary-gradient">
                        Popular
                      </div>
                    )}

                    {/* Icon + Name */}
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: tier.popular
                            ? "var(--brand-light)"
                            : "var(--surface-container-high)",
                          color: tier.popular
                            ? "var(--brand)"
                            : "var(--on-surface-variant)",
                        }}
                      >
                        {tier.icon}
                      </div>
                      <h3 className="text-lg font-bold text-[var(--on-surface)]">
                        {tier.name}
                      </h3>
                    </div>

                    {/* Price */}
                    <div className="mb-2">
                      <span
                        className="font-display text-3xl sm:text-4xl font-extrabold text-[var(--on-surface)]"
                      >
                        ${tier.price}
                      </span>
                      <span className="text-sm text-[var(--on-surface-variant)]">
                        /mo
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-[var(--on-surface-variant)] mb-6">
                      {tier.description}
                    </p>

                    {/* Scan count highlight */}
                    <div className="flex items-center gap-2 mb-6 px-3 py-2 rounded-xl bg-[var(--surface-container-low)]">
                      <Lightning
                        size={16}
                        weight="fill"
                        color="var(--brand)"
                      />
                      <span className="text-sm font-semibold text-[var(--on-surface)]">
                        {tier.scans} scans per month
                      </span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8 flex-1">
                      {tier.features.map((feature) => (
                        <li
                          key={feature.text}
                          className="flex items-start gap-2"
                        >
                          {feature.included ? (
                            <CheckCircle
                              size={18}
                              weight="fill"
                              color="var(--success)"
                              className="shrink-0 mt-0.5"
                            />
                          ) : (
                            <XCircle
                              size={18}
                              weight="regular"
                              className="shrink-0 mt-0.5"
                              color="var(--outline)"
                            />
                          )}
                          <span
                            className={`text-sm ${feature.included ? "text-[var(--on-surface)]" : "text-[var(--outline)]"}`}
                          >
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    {!isPaid ? (
                      /* Free tier — link to homepage */
                      <Link
                        href="/"
                        className="block w-full text-center px-8 py-3 rounded-full font-bold transition-all hover:scale-[1.02] active:scale-95 border border-[var(--outline-variant)] text-[var(--on-surface)] bg-[var(--surface-container-low)]"
                      >
                        {tier.ctaLabel}
                      </Link>
                    ) : isSignedIn && checkoutUrl ? (
                      /* Signed-in paid tier — guarded checkout button */
                      <button
                        type="button"
                        disabled={checkoutClicked}
                        onClick={() => {
                          setCheckoutClicked(true);
                          window.open(checkoutUrl, "_blank");
                          setTimeout(() => setCheckoutClicked(false), 2000);
                        }}
                        className={`block w-full text-center px-8 py-3 rounded-full font-bold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed polish-focus-ring ${
                          tier.popular
                            ? "primary-gradient text-white"
                            : "border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand-light)]"
                        }`}
                      >
                        {tier.ctaLabel}
                      </button>
                    ) : (
                      /* Not signed in — prompt sign-in first */
                      <button
                        type="button"
                        onClick={() => setAuthModalOpen(true)}
                        className={`cursor-pointer w-full text-center px-8 py-3 rounded-full font-bold transition-all hover:scale-[1.02] active:scale-95 polish-focus-ring ${
                          tier.popular
                            ? "primary-gradient text-white"
                            : "border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand-light)]"
                        }`}
                      >
                        Sign in to subscribe
                      </button>
                    )}
                  </div>
                );
              })}
            </div>


          </div>
        </section>

        {/* ── FAQ / Trust ── */}
        <section className="py-16 sm:py-20 bg-[var(--surface-container-low)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 text-center">
            <h2
              className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-4"
            >
              No hidden fees. Cancel anytime.
            </h2>
            <p className="text-[var(--on-surface-variant)] mb-8 text-lg">
              All plans are billed monthly via LemonSqueezy. You can cancel,
              upgrade, or downgrade your subscription at any time from your
              dashboard.
            </p>
            <Link
              href="/"
              className="inline-block primary-gradient text-white px-10 py-4 rounded-full font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all"
            >
              Try Free — No Signup Required
            </Link>
          </div>
        </section>

        {/* ── Footer ── */}
        <Footer />

        {/* AuthModal for unauthenticated tier sign-in */}
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          callbackUrl="/pricing"
        />
      </main>
    </>
  );
}

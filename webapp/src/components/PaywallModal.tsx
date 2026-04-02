"use client";

import { useState, useEffect, useRef } from "react";
import {
  XIcon,
  LockKeyIcon,
  CrownIcon,
  RocketLaunchIcon,
  BuildingsIcon,
} from "@phosphor-icons/react";
import { captureEvent } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   PaywallModal — Upgrade prompt for free-tier users
   Two sections:
     (a) "Get This Report — $9.99" — one-time single-report purchase
     (b) "Or Subscribe" — Starter / Growth / Pro tier checkout links
   Checkout URLs go to LemonSqueezy with custom fields for userId + url.
   ══════════════════════════════════════════════════════════════ */

const LS_STORE_URL = process.env.NEXT_PUBLIC_LS_STORE_URL ?? "";
const LS_VARIANT_SINGLE = process.env.NEXT_PUBLIC_LS_VARIANT_SINGLE_REPORT ?? "";
const LS_VARIANT_STARTER = process.env.NEXT_PUBLIC_LS_VARIANT_STARTER ?? "";
const LS_VARIANT_GROWTH = process.env.NEXT_PUBLIC_LS_VARIANT_GROWTH ?? "";
const LS_VARIANT_PRO = process.env.NEXT_PUBLIC_LS_VARIANT_PRO ?? "";

interface SubscriptionTier {
  key: string;
  name: string;
  price: string;
  period: string;
  description: string;
  variant: string;
  icon: React.ReactNode;
}

const TIERS: SubscriptionTier[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$29",
    period: "/mo",
    description: "10 scans per month with full reports",
    variant: LS_VARIANT_STARTER,
    icon: <RocketLaunchIcon size={20} weight="regular" />,
  },
  {
    key: "growth",
    name: "Growth",
    price: "$79",
    period: "/mo",
    description: "30 scans per month with full reports",
    variant: LS_VARIANT_GROWTH,
    icon: <CrownIcon size={20} weight="regular" />,
  },
  {
    key: "pro",
    name: "Pro",
    price: "$149",
    period: "/mo",
    description: "100 scans per month with full reports",
    variant: LS_VARIANT_PRO,
    icon: <BuildingsIcon size={20} weight="regular" />,
  },
];

function buildCheckoutUrl(
  variant: string,
  userId: string,
  analyzedUrl: string,
): string {
  if (!LS_STORE_URL || !variant) return "";
  return `${LS_STORE_URL}/checkout/buy/${variant}?checkout[custom][user_id]=${userId}&checkout[custom][url]=${encodeURIComponent(analyzedUrl)}`;
}

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  analyzedUrl: string;
  leakKey: string | null;
}

export default function PaywallModal({
  isOpen,
  onClose,
  userId,
  analyzedUrl,
  leakKey,
}: PaywallModalProps) {
  const [modalClosing, setModalClosing] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus save/restore
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [isOpen]);

  // Escape key + focus trap
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalClosing(true);
        setTimeout(() => {
          setModalClosing(false);
          onCloseRef.current();
        }, 200);
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  function handleClose() {
    setModalClosing(true);
    setTimeout(() => {
      setModalClosing(false);
      onClose();
    }, 200);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  const singleReportUrl = buildCheckoutUrl(LS_VARIANT_SINGLE, userId, analyzedUrl);
  const hasSingleReport = !!singleReportUrl;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
      style={{
        backgroundColor: "var(--overlay-backdrop)",
        backdropFilter: "blur(4px)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Upgrade to unlock full report"
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${modalClosing ? "modal-content-exit" : "modal-content-enter"}`}
        style={{ boxShadow: "var(--shadow-modal)", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div
          className="h-1 w-full"
          style={{ background: "var(--gradient-primary)" }}
        />
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] z-10"
          aria-label="Close"
        >
          <XIcon size={16} weight="bold" />
        </button>

        <div className="p-6 sm:p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
              <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
              Unlock Full Report
            </h3>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Get detailed fixes, actionable recommendations, and step-by-step
              guides to boost your conversion rate.
            </p>
          </div>

          {/* ── Section A: Single Report ── */}
          {hasSingleReport ? (
            <a
              href={singleReportUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                captureEvent("paywall_single_report_clicked", {
                  userId,
                  url: analyzedUrl,
                  leakKey,
                })
              }
              className="cursor-pointer block w-full px-6 py-4 rounded-2xl text-center font-semibold text-white polish-hover-lift transition-all"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand), var(--primary-dim))",
              }}
            >
              <span className="text-base">Get This Report</span>
              <span className="block text-2xl font-extrabold mt-0.5">$9.99</span>
              <span className="block text-xs text-white/70 mt-1">
                One-time purchase • Instant access
              </span>
            </a>
          ) : (
            <div className="w-full px-6 py-4 rounded-2xl text-center bg-[var(--surface-container)] opacity-50">
              <span className="text-sm text-[var(--text-tertiary)]">
                Single report purchase coming soon
              </span>
            </div>
          )}

          {/* ── Divider ── */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-[var(--border)]" />
            <span className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
              Or Subscribe
            </span>
            <div className="flex-1 h-px bg-[var(--border)]" />
          </div>

          {/* ── Section B: Subscription Tiers ── */}
          <div className="space-y-3">
            {TIERS.map((tier) => {
              const checkoutUrl = buildCheckoutUrl(
                tier.variant,
                userId,
                analyzedUrl,
              );
              const available = !!checkoutUrl;

              return available ? (
                <a
                  key={tier.key}
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    captureEvent("paywall_subscription_clicked", {
                      tier: tier.key,
                      price: tier.price,
                      userId,
                      url: analyzedUrl,
                      leakKey,
                    })
                  }
                  className="cursor-pointer flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-all group"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-container-high)] flex items-center justify-center text-[var(--on-surface-variant)] group-hover:text-[var(--brand)] transition-colors shrink-0">
                    {tier.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {tier.name}
                      </span>
                      <span className="text-lg font-extrabold text-[var(--brand)]">
                        {tier.price}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {tier.period}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">
                      {tier.description}
                    </p>
                  </div>
                </a>
              ) : (
                <div
                  key={tier.key}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border)] opacity-50"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--surface-container-high)] flex items-center justify-center text-[var(--on-surface-variant)] shrink-0">
                    {tier.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-[var(--text-primary)]">
                        {tier.name}
                      </span>
                      <span className="text-lg font-extrabold text-[var(--text-tertiary)]">
                        {tier.price}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {tier.period}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Coming soon
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-center mt-5 text-[var(--text-tertiary)]">
            Secure checkout via LemonSqueezy. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}

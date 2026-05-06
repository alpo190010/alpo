"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  LockKeyIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import Modal, { ModalTitle, ModalDescription } from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import {
  isPaddleConfigured,
  openInsightsCheckout,
  openFixesCheckout,
  openFixesUpgradeCheckout,
  PADDLE_PRICE_FIXES_UPGRADE,
} from "@/lib/paddle";
import { waitForPaidStoreThenReload } from "@/lib/paddleSuccess";
import { useShareView } from "@/lib/shareViewContext";
import { meetsRequirement, type PlanTier } from "@/lib/tier";

const AuthModal = dynamic(() => import("@/components/AuthModal"), { ssr: false });

/**
 * Reusable paywall wrapper for tier-gated content.
 *
 * DOM-safe gating: locked viewers NEVER see the real ``children`` in the
 * DOM. Instead, a synthetic ``placeholder`` (or a generic skeleton) is
 * rendered blurred with the upgrade CTA on top. The strict gate is
 * server-side stripping; this component just makes sure no smuggled
 * children leak past it.
 *
 *   - When the current tier meets the requirement, renders ``children``
 *     unchanged. Zero visual cost.
 *   - When the current tier does NOT meet the requirement, renders the
 *     ``placeholder`` (or default skeleton) blurred with a single
 *     "Unlock" CTA layered on top. Clicking opens an in-place plan
 *     picker modal that triggers Paddle checkout directly when
 *     ``storeDomain`` is provided.
 */
interface BlurredPlaceholderProps {
  /** Tier required to unlock the children — "insights" or "fixes". */
  requiredTier: PlanTier;
  /** Caller's current tier ("free" | "insights" | "fixes" | null). */
  currentTier?: string | null;
  /**
   * Domain of the store the upgrade should attach to. When provided,
   * the modal's plan buttons trigger Paddle inline checkout bound to
   * this domain. Without it, plan buttons fall through to /dashboard.
   */
  storeDomain?: string | null;
  /** Heading on the upgrade overlay (defaults to a tier-specific string). */
  title?: string;
  /** Subhead on the upgrade overlay. */
  subtitle?: string;
  /** Override for the overlay button label. Defaults to "Unlock". */
  cta?: string;
  /**
   * Synthetic content rendered blurred under the overlay when locked.
   * Should NEVER include real premium data — this is a visual hint of
   * the locked content's shape. Defaults to a generic skeleton.
   */
  placeholder?: React.ReactNode;
  /** Real content rendered when unlocked. NOT rendered when locked. */
  children: React.ReactNode;
}

export default function BlurredPlaceholder({
  requiredTier,
  currentTier,
  storeDomain,
  title,
  subtitle,
  cta,
  placeholder,
  children,
}: BlurredPlaceholderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const shareView = useShareView();

  if (meetsRequirement(currentTier, requiredTier)) {
    return <>{children}</>;
  }

  // In share mode the viewer is not the owner — they cannot upgrade
  // the owner's plan. Swap the CTA copy to recruit them as a new
  // customer and bypass the Paddle modal entirely (no SDK loaded).
  const heading = shareView.isShared
    ? "Get your own store analyzed"
    : title ??
      (requiredTier === "insights"
        ? "Unlock detailed analysis"
        : "Unlock the full fix");
  const sub = shareView.isShared
    ? "Sign up to run this analysis on your own Shopify store."
    : subtitle ??
      (requiredTier === "insights"
        ? "See exactly what's working and what's missing on every product page."
        : "Step-by-step instructions and copy-paste code to repair each issue.");
  const ctaLabel = shareView.isShared
    ? "Get started"
    : cta ?? "Unlock";

  const handleClick = () => {
    if (shareView.isShared) {
      const qs = storeDomain
        ? `?from=share&domain=${encodeURIComponent(storeDomain)}`
        : "?from=share";
      router.push(`/signup${qs}`);
      return;
    }
    setModalOpen(true);
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="select-none pointer-events-none"
        style={{ filter: "blur(8px)", opacity: 0.55 }}
      >
        {placeholder ?? <DefaultSkeleton />}
      </div>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <button
          type="button"
          onClick={handleClick}
          aria-label={ctaLabel}
          className="group rounded-[14px] border px-5 py-5 flex items-center gap-4 transition-[background,border-color,box-shadow,transform] duration-150 ease-[var(--ease-out-quart)] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)]/30 cursor-pointer text-left"
          style={{
            background: "var(--paper)",
            borderColor: "var(--rule-2)",
            boxShadow: "var(--shadow-subtle)",
          }}
        >
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "var(--bg-elev)",
              color: "var(--ink-2)",
            }}
          >
            <LockKeyIcon size={18} weight="bold" />
          </span>
          <div className="flex-1 min-w-0">
            <div
              className="font-display font-bold text-[15px] leading-tight"
              style={{ color: "var(--ink)" }}
            >
              {heading}
            </div>
            <p
              className="text-[12.5px] leading-[1.5] mt-1"
              style={{ color: "var(--ink-3)" }}
            >
              {sub}
            </p>
          </div>
          <span
            className="shrink-0 inline-flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-full transition-transform duration-150 group-hover:translate-x-0.5"
            style={{
              background: "var(--ink)",
              color: "var(--paper)",
            }}
            aria-hidden="true"
          >
            {ctaLabel}
            <ArrowRightIcon size={14} weight="bold" />
          </span>
        </button>
      </div>
      {!shareView.isShared && (
        <UnlockModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          requiredTier={requiredTier}
          currentTier={currentTier}
          storeDomain={storeDomain}
        />
      )}
    </div>
  );
}

/* ── UnlockModal ──────────────────────────────────────────────
   In-place plan picker. Shows Insights + Fixes when the
   required tier is "insights" (Fixes also unlocks Insights
   content, so listing it lets users skip a tier). Shows only
   Fixes when the required tier is "fixes". Each Choose button
   opens Paddle's inline checkout bound to ``storeDomain``.
   ─────────────────────────────────────────────────────────── */

interface UnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredTier: PlanTier;
  /** Caller's current per-store tier; drives the upgrade variant. */
  currentTier?: string | null;
  storeDomain?: string | null;
}

interface PlanOption {
  key: "insights" | "fixes";
  name: string;
  price: string;
  blurb: string;
  bullets: string[];
  highlight: boolean;
}

/** Display label for the Insights→Fixes upgrade SKU. The Paddle dashboard
 *  is the source of truth for the actual amount; this string is just what
 *  we render on the CTA. Update when the SKU price changes. */
const UPGRADE_PRICE_LABEL = "$70";

/** Bullets surfaced under "You'll add" in the upgrade view. */
const UPGRADE_ADDITIONS = [
  "Step-by-step fix recommendations",
  "Copy-paste code per fix",
];

/** Bullets surfaced under "You have" in the upgrade view. */
const INSIGHTS_INCLUDED = [
  "Per-check diagnostic prose",
  "Severity-ranked issue list",
];

const PLAN_OPTIONS: Record<"insights" | "fixes", PlanOption> = {
  insights: {
    key: "insights",
    name: "Insights",
    price: "$79 / year",
    blurb: "See exactly what's broken — and why it's losing you sales.",
    bullets: [
      "Per-check diagnostic prose",
      "Severity-ranked issue list",
      "1-year access, no auto-renewal",
    ],
    highlight: false,
  },
  fixes: {
    key: "fixes",
    name: "Fixes",
    price: "$149 / year",
    blurb:
      "Everything in Insights — plus step-by-step fix instructions and copy-paste code.",
    bullets: [
      "Everything in Insights",
      "Step-by-step fix recommendations",
      "Copy-paste code per fix",
    ],
    highlight: true,
  },
};

function UnlockModal({
  open,
  onOpenChange,
  requiredTier,
  currentTier,
  storeDomain,
}: UnlockModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [authOpen, setAuthOpen] = useState(false);
  const [busy, setBusy] = useState<"insights" | "fixes" | "upgrade" | null>(
    null,
  );

  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const isAnonymous = status === "unauthenticated";

  // Insights customer hitting a Fixes-gated panel: show the delta-priced
  // upgrade view instead of the generic plan picker.
  const isUpgrade = currentTier === "insights" && requiredTier === "fixes";

  // Show Insights + Fixes when the gated content is the insights tier
  // (fixes also unlocks it). Fixes-only paywall lists only Fixes.
  const tiers: PlanOption[] =
    requiredTier === "insights"
      ? [PLAN_OPTIONS.insights, PLAN_OPTIONS.fixes]
      : [PLAN_OPTIONS.fixes];

  const handleChoose = async (tier: "insights" | "fixes") => {
    if (isAnonymous) {
      onOpenChange(false);
      setAuthOpen(true);
      return;
    }
    const userId = session?.user?.id;
    if (!userId) return;

    if (!storeDomain || !isPaddleConfigured()) {
      onOpenChange(false);
      router.push("/dashboard");
      return;
    }

    // Close our modal BEFORE opening Paddle's overlay — otherwise Radix's
    // Dialog stacks above the Paddle iframe and the payment buttons
    // become unclickable.
    setBusy(tier);
    onOpenChange(false);
    try {
      const open = tier === "insights" ? openInsightsCheckout : openFixesCheckout;
      await open({
        userId,
        storeDomain,
        email: session?.user?.email ?? undefined,
        // Paddle's ``checkout.completed`` fires before the webhook that
        // records the new tier lands on our API. Polling /user/plan until
        // the new tier is visible avoids the "reloads but still locked"
        // race; on timeout we reload anyway so the user is never stranded.
        onSuccess: () => {
          void waitForPaidStoreThenReload(storeDomain, tier);
        },
      });
    } finally {
      setBusy(null);
    }
  };

  const handleUpgrade = async () => {
    setUpgradeError(null);
    if (isAnonymous) {
      onOpenChange(false);
      setAuthOpen(true);
      return;
    }
    const userId = session?.user?.id;
    if (!userId) return;

    if (!storeDomain || !isPaddleConfigured()) {
      onOpenChange(false);
      router.push("/dashboard");
      return;
    }

    // Inline check before we close the modal — otherwise a missing upgrade
    // SKU silently no-ops at the SDK boundary and the user sees nothing.
    if (!PADDLE_PRICE_FIXES_UPGRADE) {
      setUpgradeError(
        "The upgrade isn't available right now. Please contact support.",
      );
      return;
    }

    setBusy("upgrade");
    onOpenChange(false);
    try {
      const opened = await openFixesUpgradeCheckout({
        userId,
        storeDomain,
        email: session?.user?.email ?? undefined,
        onSuccess: () => {
          void waitForPaidStoreThenReload(storeDomain, "fixes");
        },
      });
      if (!opened) {
        // Paddle SDK failed to load or open — reopen our modal with an error
        // so the user isn't stranded staring at the underlying page.
        setUpgradeError(
          "We couldn't open the checkout. Please refresh and try again.",
        );
        onOpenChange(true);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        ariaLabel={isUpgrade ? "Upgrade to Fixes" : "Choose a plan to unlock"}
        size="2xl"
      >
        {isUpgrade ? (
          <UpgradeBody
            storeDomain={storeDomain}
            busy={busy === "upgrade"}
            errorMessage={upgradeError}
            onUpgrade={handleUpgrade}
          />
        ) : (
          <div className="p-7 sm:p-8">
            <ModalTitle className="font-display text-lg font-bold text-[var(--ink)] mb-1">
              Unlock the report for{" "}
              {storeDomain ? (
                <span className="font-mono text-[var(--ink-2)]">
                  {storeDomain}
                </span>
              ) : (
                "this store"
              )}
            </ModalTitle>
            <ModalDescription className="text-sm text-[var(--ink-3)] mb-5">
              One-time purchase, 1-year access. No auto-renewal. Plan applies to
              this store only.
            </ModalDescription>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tiers.map((t) => (
                <div
                  key={t.key}
                  className="rounded-2xl border p-5 flex flex-col gap-3"
                  style={{
                    background: "var(--paper)",
                    borderColor: t.highlight ? "var(--ink)" : "var(--rule-2)",
                    boxShadow: t.highlight
                      ? "var(--shadow-brand-sm)"
                      : "var(--shadow-subtle)",
                  }}
                >
                  <div className="flex items-baseline justify-between">
                    <h3
                      className="font-display text-base font-extrabold"
                      style={{ color: "var(--ink)" }}
                    >
                      {t.name}
                    </h3>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: "var(--ink-2)" }}
                    >
                      {t.price}
                    </span>
                  </div>
                  <p
                    className="text-[13px] leading-[1.5]"
                    style={{ color: "var(--ink-3)" }}
                  >
                    {t.blurb}
                  </p>
                  <ul
                    className="text-[13px] flex flex-col gap-1.5 list-none p-0 m-0"
                    style={{ color: "var(--ink-2)" }}
                  >
                    {t.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <CheckCircleIcon
                          size={14}
                          weight="fill"
                          color="var(--success-text)"
                          className="mt-0.5 shrink-0"
                        />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant={t.highlight ? "primary" : "secondary"}
                    size="md"
                    shape="pill"
                    className="mt-1"
                    disabled={busy === t.key}
                    onClick={() => handleChoose(t.key)}
                  >
                    {busy === t.key ? "Opening checkout…" : `Choose ${t.name}`}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode="signup"
        heading="Sign up to continue"
        subheading="Create your account, then pick a plan for this store."
        callbackUrl={pathname ?? "/"}
      />
    </>
  );
}

/* ── UpgradeBody ──────────────────────────────────────────────
   Single-card variant rendered inside UnlockModal when an Insights
   customer hits a Fixes-gated panel. Surfaces the value-add only
   (no Insights re-pitch) and uses the delta-priced upgrade SKU.
   ─────────────────────────────────────────────────────────── */
interface UpgradeBodyProps {
  storeDomain?: string | null;
  busy: boolean;
  errorMessage?: string | null;
  onUpgrade: () => void;
}

function UpgradeBody({
  storeDomain,
  busy,
  errorMessage,
  onUpgrade,
}: UpgradeBodyProps) {
  return (
    <div className="p-7 sm:p-8">
      <ModalTitle className="font-display text-lg font-bold text-[var(--ink)] mb-1">
        Upgrade to Fixes
      </ModalTitle>
      <ModalDescription className="text-sm text-[var(--ink-3)] mb-5">
        Pay only the difference. Your Insights window for{" "}
        {storeDomain ? (
          <span className="font-mono text-[var(--ink-2)]">{storeDomain}</span>
        ) : (
          "this store"
        )}{" "}
        stays the same — no extra renewal.
      </ModalDescription>

      <div
        className="rounded-2xl border p-5 sm:p-6 flex flex-col gap-5"
        style={{
          background: "var(--paper)",
          borderColor: "var(--ink)",
          boxShadow: "var(--shadow-brand-sm)",
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="flex flex-col gap-2">
            <div
              className="text-[11px] font-mono font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--ink-3)" }}
            >
              You have
            </div>
            <h3
              className="font-display text-base font-extrabold"
              style={{ color: "var(--ink-2)" }}
            >
              Insights
            </h3>
            <ul
              className="text-[13px] flex flex-col gap-1.5 list-none p-0 m-0"
              style={{ color: "var(--ink-2)" }}
            >
              {INSIGHTS_INCLUDED.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircleIcon
                    size={14}
                    weight="fill"
                    color="var(--ink-3)"
                    className="mt-0.5 shrink-0"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            className="flex flex-col gap-2 sm:pl-5 sm:border-l"
            style={{ borderColor: "var(--rule-2)" }}
          >
            <div
              className="text-[11px] font-mono font-bold uppercase tracking-[0.08em]"
              style={{ color: "var(--ink)" }}
            >
              You'll add
            </div>
            <h3
              className="font-display text-base font-extrabold"
              style={{ color: "var(--ink)" }}
            >
              Fixes
            </h3>
            <ul
              className="text-[13px] flex flex-col gap-1.5 list-none p-0 m-0"
              style={{ color: "var(--ink-2)" }}
            >
              {UPGRADE_ADDITIONS.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <CheckCircleIcon
                    size={14}
                    weight="fill"
                    color="var(--success-text)"
                    className="mt-0.5 shrink-0"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="rounded-lg px-3.5 py-2.5 text-[12.5px] leading-[1.45]"
            style={{
              background: "var(--error-bg)",
              color: "var(--error-text)",
              border: "1px solid var(--error-text)",
            }}
          >
            {errorMessage}
          </div>
        )}

        <Button
          type="button"
          variant="primary"
          size="md"
          shape="pill"
          disabled={busy}
          onClick={onUpgrade}
        >
          {busy ? "Opening checkout…" : `Upgrade — ${UPGRADE_PRICE_LABEL}`}
        </Button>
      </div>
    </div>
  );
}

/* ── DefaultSkeleton ──────────────────────────────────────────
   Imitation of the locked diagnostic surface. Renders mock rows
   in their natural red (failing) / green (passing) colors so the
   blurred-behind preview makes the value of the unlock visible.
   No real labels, details, or remediation prose are placed in
   this DOM — only generic gray text bars.
   ─────────────────────────────────────────────────────────── */
function DefaultSkeleton() {
  // Mix of severities and pass/fail states, tuned to look like a
  // typical dimension's "what's missing / what's working" pair.
  const rows: { tone: "fail" | "pass"; severity?: "Critical" | "Major" | "Minor"; widthPct: number }[] = [
    { tone: "fail", severity: "Critical", widthPct: 78 },
    { tone: "fail", severity: "Major", widthPct: 64 },
    { tone: "fail", severity: "Major", widthPct: 71 },
    { tone: "fail", severity: "Minor", widthPct: 58 },
    { tone: "pass", widthPct: 66 },
    { tone: "pass", widthPct: 52 },
  ];

  return (
    <div className="flex flex-col gap-3.5" aria-hidden>
      {/* Severity-chips imitation */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: "All", n: 8 },
          { label: "Critical", n: 1 },
          { label: "Major", n: 4 },
          { label: "Minor", n: 3 },
        ].map((chip, i) => (
          <span
            key={chip.label}
            className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
            style={{
              background: i === 0 ? "var(--ink)" : "transparent",
              color: i === 0 ? "var(--paper)" : "var(--ink-2)",
              border: `1px solid ${i === 0 ? "var(--ink)" : "var(--rule-2)"}`,
            }}
          >
            {chip.label} <span className="tabular-nums opacity-80">{chip.n}</span>
          </span>
        ))}
      </div>

      {/* Check-row imitations */}
      <ul
        className="rounded-[14px] border list-none m-0 p-0 overflow-hidden"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
        }}
      >
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-start gap-3 px-4 py-3"
            style={{
              borderBottom:
                i < rows.length - 1 ? "1px solid var(--rule-2)" : "none",
            }}
          >
            <span className="shrink-0 mt-0.5">
              {row.tone === "pass" ? (
                <CheckCircleIcon
                  size={18}
                  weight="fill"
                  color="var(--success-text)"
                />
              ) : (
                <XCircleIcon
                  size={18}
                  weight="fill"
                  color="var(--error-text)"
                />
              )}
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div
                className="rounded h-3.5"
                style={{
                  background: "var(--bg-elev)",
                  width: `${row.widthPct}%`,
                }}
              />
              <div
                className="rounded h-3"
                style={{
                  background: "var(--bg-elev)",
                  width: `${Math.max(40, row.widthPct - 14)}%`,
                }}
              />
            </div>
            {row.severity && (
              <span
                className="shrink-0 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md"
                style={{
                  background:
                    row.severity === "Critical"
                      ? "var(--error-text)"
                      : row.severity === "Major"
                      ? "var(--warning-text)"
                      : "var(--ink-3)",
                  color: "var(--paper)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {row.severity}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

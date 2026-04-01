"use client";

import { useState, useEffect, useRef } from "react";
import { XIcon, PlusSquareIcon, CheckCircleIcon, LightningIcon } from "@phosphor-icons/react";
import { type LeakCard, captureEvent } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   EmailModal — Email capture with form / queued / pricing / sent
   Triggers: issue card click or competitor CTA "Beat X" button
   When onStepChange is omitted (ProductListings), only form+queued
   render — queued shows the simple confirmation. When provided
   (analyze page), queued shows the "Skip the wait" upsell and
   pricing/sent steps become reachable.
   ══════════════════════════════════════════════════════════════ */

const ONE_TIME_OPTIONS = [
  { price: "$2.99", label: "Basic" },
  { price: "$4.99", label: "Standard" },
  { price: "$9.99", label: "Full" },
];
const SUBSCRIPTION_OPTIONS = [
  { price: "$19/mo", label: "Starter" },
  { price: "$49/mo", label: "Growth" },
  { price: "$199/mo", label: "Agency" },
];

type EmailStep = "form" | "queued" | "pricing" | "sent";

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeak: string | null;
  competitorCTAName: string | null;
  leaks: LeakCard[];
  email: string;
  onEmailChange: (email: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  emailSubmitting: boolean;
  emailError: string;
  emailStep: EmailStep | null;
  /** URL of the page being analyzed (for analytics) */
  url?: string;
  /** Score of the current result (for analytics) */
  score?: number;
  /** Step change handler — enables pricing/sent flow (analyze page only) */
  onStepChange?: (step: EmailStep) => void;
}

export default function EmailModal({
  isOpen, onClose, selectedLeak, competitorCTAName, leaks,
  email, onEmailChange, onSubmit, emailSubmitting, emailError,
  emailStep, url, score, onStepChange,
}: EmailModalProps) {
  const [modalClosing, setModalClosing] = useState(false);
  const [prioritySending, setPrioritySending] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Reset prioritySending when modal reopens
  useEffect(() => {
    if (isOpen) setPrioritySending(false);
  }, [isOpen]);

  // Focus save/restore — runs once on open, once on close
  useEffect(() => {
    if (!isOpen) return;
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [isOpen]);

  // Escape key + focus trap — re-binds when step changes (focusable elements differ per step)
  useEffect(() => {
    if (!isOpen || !emailStep) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setModalClosing(true);
        setTimeout(() => { setModalClosing(false); onCloseRef.current(); }, 200);
        return;
      }
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
  }, [isOpen, emailStep]);

  if (!isOpen || !emailStep) return null;

  function handleClose() {
    setModalClosing(true);
    setTimeout(() => { setModalClosing(false); onClose(); }, 200);
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) handleClose();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"}`}
      style={{ backgroundColor: "var(--overlay-backdrop)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Get detailed fix"
    >
      <div
        ref={modalRef}
        className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${modalClosing ? "modal-content-exit" : "modal-content-enter"}`}
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        <div className="h-1 w-full" style={{ background: "var(--gradient-primary)" }} />
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <XIcon size={16} weight="bold" />
        </button>

        <div className="p-6 sm:p-8">
          {/* ── Form step ── */}
          {emailStep === "form" && (
            <div key="form-step">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                  <PlusSquareIcon size={28} weight="regular" color="var(--brand)" />
                </div>
                <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                  {competitorCTAName
                    ? <>Get a Detailed Plan to Beat &ldquo;<span className="inline-block max-w-[160px] sm:max-w-[200px] truncate align-bottom">{competitorCTAName}</span>&rdquo;</>
                    : <>Get the Fix for &ldquo;{leaks.find(l => l.key === selectedLeak)?.category}&rdquo;</>}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {competitorCTAName
                    ? <>We&apos;ll send you a step-by-step plan to outrank {competitorCTAName} across all categories.</>
                    : <>Enter your email and we&apos;ll send you detailed, actionable fixes for all {leaks.length} issues found on your page.</>}
                </p>
              </div>
              <form onSubmit={onSubmit}>
                <div className="mb-3">
                  <input
                    id="modal-email-input" type="email" required placeholder="your@email.com"
                    value={email} onChange={(e) => onEmailChange(e.target.value)}
                    aria-label="Your email address" autoFocus
                    className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
                  />
                </div>
                <button
                  type="submit" disabled={emailSubmitting}
                  className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                  style={{ background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
                >
                  {emailSubmitting ? "Submitting..." : "Send Me the Fixes →"}
                </button>
                {emailError && <p className="text-sm mt-3 text-center text-[var(--error)] font-medium" role="alert">{emailError}</p>}
              </form>
              <p className="text-xs text-center mt-4 text-[var(--text-tertiary)]">No spam. Just your fixes.</p>
            </div>
          )}

          {/* ── Queued step — simple when no onStepChange, upsell when provided ── */}
          {emailStep === "queued" && (
            <div className="text-center modal-step-enter" key="queued-step">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">You&apos;re in the Queue!</h3>

              {onStepChange ? (
                <>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                    Your detailed report will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>.
                  </p>
                  <div className="p-5 rounded-2xl border-2 border-dashed mb-4" style={{ borderColor: "var(--brand-border)", background: "linear-gradient(135deg, var(--brand-light), var(--surface-brand-tint))" }}>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <LightningIcon size={18} weight="fill" color="var(--brand)" />
                      <span className="text-sm font-bold text-[var(--brand)]">Skip the wait</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">Get your full report <strong className="text-[var(--text-primary)]">instantly</strong>.</p>
                    <button
                      type="button"
                      disabled={prioritySending}
                      onClick={() => {
                        if (prioritySending) return;
                        setPrioritySending(true);
                        captureEvent("priority_report_clicked", { url, score, email });
                        fetch("/api/send-report-now", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email, url, score, summary: leaks.map(l => `${l.category}: ${l.problem}`).join("\n"), tips: leaks.map(l => l.tip), categories: leaks.reduce((acc, l) => ({ ...acc, [l.key]: l.catScore }), {} as Record<string, number>) }),
                        }).catch(() => {});
                        onStepChange("pricing");
                      }}
                      className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                      style={{ background: prioritySending ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}
                    >
                      {prioritySending ? "Sending..." : "Get Priority Report — Instant"}
                    </button>
                    <p className="text-xs text-center mt-2 text-[var(--text-tertiary)]">Full report • Sent to your email now</p>
                  </div>
                  <button type="button" onClick={handleClose} className="cursor-pointer text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2">
                    I&apos;ll wait for the free report →
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                    Your detailed report with step-by-step fixes will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>. We&apos;ll email you when it&apos;s ready.
                  </p>
                  <button type="button" onClick={handleClose} className="w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring" style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}>
                    Got it
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Pricing step — vote grid for willingness-to-pay ── */}
          {emailStep === "pricing" && (
            <div className="modal-step-enter" key="pricing-step">
              <div className="text-center mb-5">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                  <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
                </div>
                <h3 className="text-lg font-bold mb-1 text-[var(--text-primary)]">Your fixes are on the way!</h3>
                <p className="text-sm text-[var(--text-secondary)]">Check your inbox in a few minutes.</p>
              </div>
              <div className="border-t border-[var(--border)] pt-5">
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Quick question to help us build better:</p>
                <p className="text-xs text-[var(--text-secondary)] mb-4">How much would you pay for a full report with AI-written fixes?</p>
                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">One-time report</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {ONE_TIME_OPTIONS.map((opt) => (
                    <button key={opt.price} type="button" onClick={() => { captureEvent("pricing_vote", { type: "one_time", price: opt.price, url, email }); onStepChange?.("sent"); }} className="cursor-pointer p-3 rounded-xl border border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-all text-center">
                      <div className="text-lg font-bold text-[var(--text-primary)]">{opt.price}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{opt.label}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Monthly monitoring</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {SUBSCRIPTION_OPTIONS.map((opt) => (
                    <button key={opt.price} type="button" onClick={() => { captureEvent("pricing_vote", { type: "subscription", price: opt.price, url, email }); onStepChange?.("sent"); }} className="cursor-pointer p-3 rounded-xl border border-[var(--border)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-all text-center">
                      <div className="text-lg font-bold text-[var(--text-primary)]">{opt.price}</div>
                      <div className="text-xs text-[var(--text-tertiary)]">{opt.label}</div>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => { captureEvent("pricing_vote", { type: "skip", url, email }); onStepChange?.("sent"); }} className="cursor-pointer w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors py-2">
                  I wouldn&apos;t pay for this
                </button>
              </div>
            </div>
          )}

          {/* ── Sent step — thank-you ── */}
          {emailStep === "sent" && (
            <div className="text-center modal-step-enter" key="sent-step">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">Thank you!</h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-4">
                Your report has been sent. We&apos;re building premium features based on your feedback.
              </p>
              <button type="button" onClick={handleClose} className="cursor-pointer px-6 py-2.5 rounded-xl text-sm font-semibold text-white polish-hover-lift" style={{ background: "linear-gradient(135deg, var(--brand), var(--primary-dim))" }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

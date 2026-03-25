"use client";

import { useState } from "react";
import { type LeakCard, captureEvent } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   EmailModal — Email capture with form + queued steps
   Triggers: issue card click or competitor CTA "Beat X" button
   ══════════════════════════════════════════════════════════════ */

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
  emailStep: "form" | "queued" | null;
  /** URL of the page being analyzed (for analytics) */
  url?: string;
  /** Score of the current result (for analytics) */
  score?: number;
}

export default function EmailModal({
  isOpen,
  onClose,
  selectedLeak,
  competitorCTAName,
  leaks,
  email,
  onEmailChange,
  onSubmit,
  emailSubmitting,
  emailError,
  emailStep,
  url,
  score,
}: EmailModalProps) {
  const [modalClosing, setModalClosing] = useState(false);

  if (!isOpen || !emailStep) return null;

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

  return (
    <div
      className={`cursor-pointer fixed inset-0 z-50 flex items-center justify-center p-4 ${
        modalClosing ? "modal-backdrop-exit" : "modal-backdrop-enter"
      }`}
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Get detailed fix"
    >
      <div
        className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${
          modalClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
        style={{ boxShadow: "0 24px 80px rgba(0,0,0,0.2)" }}
      >
        {/* Top accent */}
        <div className="h-1 w-full bg-gradient-to-r from-[var(--brand)] to-violet-800" />

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>

        <div className="p-6 sm:p-8">
          {emailStep === "form" && (
            <div key="form-step">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 12h6m-3-3v6m-7 4h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" stroke="var(--brand)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                  {competitorCTAName
                    ? <>Get a Detailed Plan to Beat &ldquo;{competitorCTAName}&rdquo;</>
                    : <>Get the Fix for &ldquo;{leaks.find(l => l.key === selectedLeak)?.category}&rdquo;</>
                  }
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {competitorCTAName
                    ? <>We&apos;ll send you a step-by-step plan to outrank {competitorCTAName} across all categories.</>
                    : <>Enter your email and we&apos;ll send you detailed, actionable fixes for all {leaks.length} issues found on your page.</>
                  }
                </p>
              </div>

              <form onSubmit={onSubmit}>
                <div className="mb-3">
                  <input
                    id="modal-email-input"
                    type="email"
                    required
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    aria-label="Your email address"
                    autoFocus
                    className="w-full px-4 py-3.5 text-base rounded-xl outline-none border-[1.5px] border-[var(--border)] text-[var(--text-primary)] bg-[var(--bg)] polish-focus-ring"
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailSubmitting}
                  className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring disabled:opacity-50"
                  style={{
                    background: emailSubmitting ? "var(--text-tertiary)" : "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                    boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)",
                  }}
                >
                  {emailSubmitting ? "Submitting..." : "Send Me the Fixes →"}
                </button>
                {emailError && (
                  <p className="text-sm mt-3 text-center text-[var(--error)] font-medium" role="alert">{emailError}</p>
                )}
              </form>

              <p className="text-xs text-center mt-4 text-[var(--text-tertiary)]">
                No spam. Just your fixes.
              </p>
            </div>
          )}

          {emailStep === "queued" && (
            <div className="text-center modal-step-enter" key="queued-step">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--success-light)] border border-[var(--success-border)]">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                You&apos;re in the Queue!
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                Due to high demand, your detailed report with step-by-step fixes will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>.
              </p>

              {/* Priority upsell */}
              <div
                className="p-5 rounded-2xl border-2 border-dashed mb-4"
                style={{
                  borderColor: "var(--brand-border)",
                  background: "linear-gradient(135deg, var(--brand-light), var(--secondary-container))",
                }}
              >
                <div className="flex items-center justify-center gap-2 mb-2">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M13 10V3L4 14h7v7l9-11h-7z" fill="var(--brand)"/>
                  </svg>
                  <span className="text-sm font-bold text-[var(--brand)]">Skip the wait</span>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Get your full report with expert suggestions <strong className="text-[var(--text-primary)]">instantly</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    captureEvent("priority_report_clicked", { url, score, email });
                    // TODO: integrate Stripe checkout
                    alert("Stripe checkout coming soon!");
                  }}
                  className="cursor-pointer w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
                  style={{
                    background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                    boxShadow: "0 4px 14px rgba(124, 58, 237, 0.25)",
                  }}
                >
                  Get Priority Report — $0.99
                </button>
                <p className="text-xs text-center mt-2 text-[var(--text-tertiary)]">
                  Full report with actionable suggestions • Instant delivery
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="cursor-pointer text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors mt-2"
              >
                I&apos;ll wait for the free report →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { XIcon, PlusSquareIcon, CheckCircleIcon } from "@phosphor-icons/react";
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
      style={{ backgroundColor: "var(--overlay-backdrop)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Get detailed fix"
    >
      <div
        className={`relative w-full max-w-md bg-[var(--surface)] rounded-3xl overflow-hidden ${
          modalClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
        style={{ boxShadow: "var(--shadow-modal)" }}
      >
        {/* Top accent */}
        <div className="h-1 w-full" style={{ background: "var(--gradient-primary)" }} />

        {/* Close button */}
        <button
          type="button"
          onClick={handleClose}
          className="cursor-pointer absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[var(--bg)] transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          aria-label="Close"
        >
          <XIcon size={16} weight="bold" />
        </button>

        <div className="p-6 sm:p-8">
          {emailStep === "form" && (
            <div key="form-step">
              <div className="text-center mb-6">
                <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
                  <PlusSquareIcon size={28} weight="regular" color="var(--brand)" />
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
                <CheckCircleIcon size={28} weight="regular" color="var(--success)" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-[var(--text-primary)]">
                You&apos;re in the Queue!
              </h3>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                Your detailed report with step-by-step fixes will arrive within <strong className="text-[var(--text-primary)]">48 hours</strong>. We&apos;ll email you when it&apos;s ready.
              </p>

              <button
                type="button"
                onClick={handleClose}
                className="w-full px-6 py-3.5 rounded-xl text-base font-semibold text-white polish-hover-lift polish-focus-ring"
                style={{
                  background: "linear-gradient(135deg, var(--brand), var(--primary-dim))",
                }}
              >
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

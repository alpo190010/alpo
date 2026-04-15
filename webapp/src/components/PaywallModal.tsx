"use client";

import { XIcon, LockKeyIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import Modal, { ModalTitle, ModalClose } from "@/components/ui/Modal";

/* ══════════════════════════════════════════════════════════════
   PaywallModal — Sign-up prompt (Phase 1 shell)
   Phase 2 will add sign-up / paywall gate CTA here.
   ══════════════════════════════════════════════════════════════ */

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PaywallModal({ isOpen, onClose }: PaywallModalProps) {
  return (
    <Modal
      open={isOpen}
      onOpenChange={(v) => !v && onClose()}
      ariaLabel="Sign up to unlock full report"
      className="max-h-[90vh] overflow-y-auto"
    >
      <div
        className="h-1 w-full"
        style={{ background: "var(--gradient-primary)" }}
      />
      <ModalClose>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          shape="pill"
          className="absolute top-4 right-4 w-11 h-11 hover:bg-[var(--bg)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] z-10"
          aria-label="Close"
        >
          <XIcon size={18} weight="bold" />
        </Button>
      </ModalClose>

      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center bg-[var(--brand-light)] border border-[var(--brand-border)]">
            <LockKeyIcon size={28} weight="regular" color="var(--brand)" />
          </div>
          <ModalTitle asChild>
            <h3 className="font-display text-xl font-bold mb-2 text-[var(--text-primary)]">
              Sign up to get full access
            </h3>
          </ModalTitle>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Get detailed fixes, actionable recommendations, and step-by-step guides to boost your conversion rate.
          </p>
        </div>

        {/* Phase 2 will add sign-up / paywall gate CTA here */}
      </div>
    </Modal>
  );
}

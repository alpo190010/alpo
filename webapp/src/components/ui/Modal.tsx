"use client";

import { forwardRef, type ReactNode, type ComponentPropsWithoutRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";

/* ── Size tokens ── */

type ModalSize = "sm" | "md" | "lg";

const sizes: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
};

/* ── Props ── */

export interface ModalProps {
  /** Controlled open state */
  open: boolean;
  /** Called when the modal wants to change open state (escape, overlay click, close button) */
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  /** Accessible label for screen readers (used when no visible ModalTitle) */
  ariaLabel?: string;
  /** Additional className applied to the content panel */
  className?: string;
  /** Max width token — default 'md' (max-w-md) */
  size?: ModalSize;
}

/* ── Modal (default export) ── */

const Modal = forwardRef<HTMLDivElement, ModalProps>(
  (
    {
      open,
      onOpenChange,
      children,
      ariaLabel,
      className = "",
      size = "md",
    },
    ref,
  ) => {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="ModalOverlay fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              backgroundColor: "var(--overlay-backdrop)",
              backdropFilter: "blur(4px)",
            }}
          >
            <Dialog.Content
              ref={ref}
              className={`ModalContent relative w-full ${sizes[size]} bg-[var(--surface)] rounded-2xl overflow-hidden ${className}`}
              style={{ boxShadow: "var(--shadow-modal)" }}
              aria-label={ariaLabel}
              aria-describedby={undefined}
            >
              {children}
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);

Modal.displayName = "Modal";

/* ── Compound sub-components ── */

const ModalTitle = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<typeof Dialog.Title>
>((props, ref) => <Dialog.Title ref={ref} {...props} />);

ModalTitle.displayName = "ModalTitle";

const ModalDescription = forwardRef<
  HTMLParagraphElement,
  ComponentPropsWithoutRef<typeof Dialog.Description>
>((props, ref) => <Dialog.Description ref={ref} {...props} />);

ModalDescription.displayName = "ModalDescription";

const ModalClose = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Dialog.Close>
>((props, ref) => <Dialog.Close ref={ref} asChild {...props} />);

ModalClose.displayName = "ModalClose";

export default Modal;
export { ModalTitle, ModalDescription, ModalClose };
export type { ModalSize };

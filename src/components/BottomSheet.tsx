"use client";

import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";

/* ══════════════════════════════════════════════════════════════
   BottomSheet — Slide-up overlay for mobile viewports
   z-40 (below EmailModal z-50)
   Swipe-to-dismiss, scroll containment, body scroll lock
   ══════════════════════════════════════════════════════════════ */

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

/** Minimum downward drag (px) to trigger dismiss */
const DISMISS_THRESHOLD = 100;

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
}: BottomSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const [dragY, setDragY] = useState(0);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // ── Body scroll lock ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // ── Close sequence: play exit animation, then call onClose ─
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  function handleAnimationEnd() {
    if (isClosing) {
      setIsClosing(false);
      setDragY(0);
      onClose();
    }
  }

  // ── Backdrop click ────────────────────────────────────────
  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) triggerClose();
  }

  // ── Touch / swipe-to-dismiss ──────────────────────────────
  function handleTouchStart(e: React.TouchEvent) {
    const scrollTop = contentRef.current?.scrollTop ?? 0;
    // Only allow drag-dismiss when content is scrolled to top
    if (scrollTop > 0) return;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!isDragging.current) return;
    const deltaY = e.touches[0].clientY - touchStartY.current;
    // Only track downward drags
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  }

  function handleTouchEnd() {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragY > DISMISS_THRESHOLD) {
      triggerClose();
    }
    setDragY(0);
  }

  if (!isOpen && !isClosing) return null;

  const sheetTransform =
    dragY > 0 && !isClosing
      ? { transform: `translateY(${dragY}px)`, transition: "none" }
      : undefined;

  return (
    <div
      className={`fixed inset-0 z-40 flex items-end ${
        isClosing ? "sheet-backdrop-exit" : "sheet-backdrop-enter"
      }`}
      style={{ backgroundColor: "var(--overlay-backdrop)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Bottom sheet"}
    >
      <div
        ref={sheetRef}
        className={`relative w-full max-h-[90vh] flex flex-col rounded-t-2xl ${
          isClosing ? "sheet-exit" : "sheet-enter"
        }`}
        style={{
          backgroundColor: "var(--surface-container-lowest)",
          ...sheetTransform,
        }}
        onAnimationEnd={handleAnimationEnd}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* ── Drag handle ── */}
        <div className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--outline-variant)" }}
          />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pb-2">
          {title ? (
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--on-surface)" }}
            >
              {title}
            </h2>
          ) : (
            <span />
          )}
          <button
            onClick={triggerClose}
            className="p-2 rounded-full transition-colors"
            style={{ color: "var(--on-surface-variant)" }}
            aria-label="Close"
          >
            <XIcon size={20} weight="bold" />
          </button>
        </div>

        {/* ── Scrollable content ── */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto px-2 pb-6"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

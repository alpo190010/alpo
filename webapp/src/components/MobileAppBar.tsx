"use client";

import type { ReactNode } from "react";
import { List, CaretLeft } from "@phosphor-icons/react";
import Button from "./ui/Button";
import { useSidebar } from "@/lib/sidebarStore";

export interface MobileAppBarProps {
  /** When provided, renders a Back button to the right of the menu trigger. */
  onBack?: () => void;
  /** Optional title / subtitle shown next to the navigation controls. */
  title?: ReactNode;
  /** Optional right-aligned slot for contextual actions. */
  right?: ReactNode;
  /** Extra classes appended to the header element. */
  className?: string;
}

/**
 * MobileAppBar
 *
 * Sticky, in-flow top chrome for mobile views. Holds the sidebar menu trigger
 * and optional contextual controls (back, title, actions). Hidden on `md:` and above.
 *
 * Replaces the old floating hamburger button from Sidebar.tsx — the trigger now
 * lives inside layout so it can't overlay page content.
 */
export default function MobileAppBar({
  onBack,
  title,
  right,
  className = "",
}: MobileAppBarProps) {
  const { setOpen } = useSidebar();

  return (
    <header
      className={`sticky top-0 z-20 md:hidden flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] bg-[var(--surface)] ${className}`}
    >
      <Button
        variant="secondary"
        size="icon"
        shape="rounded"
        onClick={() => setOpen(true)}
        className="shadow-[var(--shadow-subtle)]"
        aria-label="Open navigation menu"
      >
        <List size={20} weight="bold" color="var(--on-surface)" />
      </Button>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium text-[var(--ink-2)] hover:text-[var(--ink)] hover:bg-[var(--bg-elev)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40"
          aria-label="Go back"
        >
          <CaretLeft size={16} weight="bold" />
          <span>Back</span>
        </button>
      )}

      {title && (
        <span
          className="ml-1 text-sm font-medium truncate"
          style={{ color: "var(--ink-3)" }}
        >
          {title}
        </span>
      )}

      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </header>
  );
}

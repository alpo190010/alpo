"use client";

import { useEffect } from "react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import Link from "next/link";
import Button from "@/components/ui/Button";

interface ErrorCardProps {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  message: string;
  secondaryLabel?: string;
  secondaryHref?: string;
}

export default function ErrorCard({
  error,
  reset,
  title,
  message,
  secondaryLabel = "Go Home",
  secondaryHref = "/",
}: ErrorCardProps) {
  useEffect(() => {
    console.error(title, error);
  }, [error, title]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 anim-phase-enter">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--error-light)] flex items-center justify-center">
          <WarningCircleIcon size={28} weight="regular" color="var(--error)" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">{title}</h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed break-words">{message}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm polish-focus-ring"
          >
            Try Again
          </Button>
          <Button asChild variant="secondary" shape="pill">
            <Link href={secondaryHref}>{secondaryLabel}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

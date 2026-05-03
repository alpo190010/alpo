"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Button from "@/components/ui/Button";
import {
  isPaddleConfigured,
  openInsightsCheckout,
  openFixesCheckout,
} from "@/lib/paddle";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

/* -- Props -- */
interface PricingActionsProps {
  tier: {
    key: "free" | "insights" | "fixes";
    ctaLabel: string;
    /** True when this card matches the authenticated user's current plan. */
    isCurrent: boolean;
  };
}

function CurrentPlanLabel() {
  return (
    <div
      className="w-full text-center py-3 text-sm font-semibold rounded-full border"
      style={{
        background: "var(--surface-container-low)",
        color: "var(--on-surface-variant)",
        borderColor: "var(--outline-variant)",
      }}
      role="status"
    >
      Current plan
    </div>
  );
}

export default function PricingActions({ tier }: PricingActionsProps) {
  const { data: session } = useSession();
  const isSignedIn = !!session?.user;

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // ── Free tier: link to scan ──
  if (tier.key === "free") {
    if (tier.isCurrent) return <CurrentPlanLabel />;
    return (
      <Button
        asChild
        variant="secondary"
        size="md"
        shape="pill"
        className="w-full text-center"
      >
        <Link href="/">{tier.ctaLabel}</Link>
      </Button>
    );
  }

  // ── Paid tier (Insights or Fixes): Paddle inline checkout ──
  if (tier.isCurrent) return <CurrentPlanLabel />;

  const configured = isPaddleConfigured();
  const variant = tier.key === "insights" ? "primary" : "primary";

  const onClick = async () => {
    if (!isSignedIn) {
      setAuthModalOpen(true);
      return;
    }
    const userId = session?.user?.id;
    if (!userId) return;
    setCheckoutBusy(true);
    try {
      const open =
        tier.key === "insights" ? openInsightsCheckout : openFixesCheckout;
      const opened = await open({
        userId,
        email: session?.user?.email ?? undefined,
      });
      if (!opened) {
        console.error(
          `Paddle checkout failed to open for ${tier.key} — env vars missing or SDK failed to load`,
        );
      }
    } finally {
      setCheckoutBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="md"
        shape="pill"
        className="w-full"
        onClick={onClick}
        disabled={!configured || checkoutBusy}
        aria-busy={checkoutBusy}
        aria-disabled={!configured}
      >
        {checkoutBusy ? "Opening…" : tier.ctaLabel}
      </Button>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signup"
        heading="Create your account to continue"
        subheading="You'll land on the checkout right after signup."
        callbackUrl="/pricing"
      />
    </>
  );
}

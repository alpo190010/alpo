"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { isPaddleConfigured } from "@/lib/paddle";

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
  const router = useRouter();
  const { data: session } = useSession();
  const isSignedIn = !!session?.user;

  const [authModalOpen, setAuthModalOpen] = useState(false);

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

  // ── Paid tier (Insights or Fixes) ──
  // Plans are now per-store. The pricing page can't bind a checkout
  // because it has no store in scope, so route the user to /dashboard
  // where they pick which store to upgrade.
  const configured = isPaddleConfigured();

  const onClick = () => {
    if (!isSignedIn) {
      setAuthModalOpen(true);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="md"
        shape="pill"
        className="w-full"
        onClick={onClick}
        disabled={!configured}
        aria-disabled={!configured}
      >
        {tier.ctaLabel}
      </Button>
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signup"
        heading="Create your account to continue"
        subheading="You'll pick which store to upgrade right after signup."
        callbackUrl="/dashboard"
      />
    </>
  );
}

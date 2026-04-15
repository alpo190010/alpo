"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Button from "@/components/ui/Button";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

/* -- Props -- */
interface PricingActionsProps {
  tier: {
    key: string;
    ctaLabel: string;
  };
}

/**
 * Client island for a single pricing tier CTA.
 * Free tier: static link to homepage.
 * Pro waitlist: auth-gated confirmation (Phase 3 wires to backend).
 */
export default function PricingActions({ tier }: PricingActionsProps) {
  const { data: session } = useSession();
  const isSignedIn = !!session?.user;

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [waitlistConfirmed, setWaitlistConfirmed] = useState(false);

  return (
    <>
      {tier.key === "free" ? (
        /* Free tier -- link to homepage (per D-03) */
        <Button
          asChild
          variant="secondary"
          size="md"
          shape="pill"
          className="w-full text-center"
        >
          <Link href="/">{tier.ctaLabel}</Link>
        </Button>
      ) : waitlistConfirmed ? (
        /* Authenticated user confirmed waitlist -- show inline message */
        <p className="text-sm text-center font-semibold py-3 text-[var(--success)]">
          You&apos;re on the list! We&apos;ll let you know when Pro launches.
        </p>
      ) : (
        /* Pro waitlist -- auth gate (per D-07) */
        <Button
          type="button"
          variant="secondary"
          size="md"
          shape="pill"
          onClick={() => {
            if (!isSignedIn) {
              setAuthModalOpen(true);
              return;
            }
            // Phase 3: replace with POST /user/waitlist
            setWaitlistConfirmed(true);
          }}
          className="w-full px-8 border border-[var(--outline-variant)] text-[var(--on-surface-variant)]"
        >
          {tier.ctaLabel}
        </Button>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        callbackUrl="/pricing"
      />
    </>
  );
}

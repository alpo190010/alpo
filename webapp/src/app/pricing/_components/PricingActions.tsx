"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Button from "@/components/ui/Button";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

/* ── LemonSqueezy env vars ── */
const LS_STORE_URL = process.env.NEXT_PUBLIC_LS_STORE_URL ?? "";
const LS_VARIANT_STARTER = process.env.NEXT_PUBLIC_LS_VARIANT_STARTER ?? "";
const LS_VARIANT_GROWTH = process.env.NEXT_PUBLIC_LS_VARIANT_GROWTH ?? "";
const LS_VARIANT_PRO = process.env.NEXT_PUBLIC_LS_VARIANT_PRO ?? "";

const VARIANT_MAP: Record<string, string> = {
  starter: LS_VARIANT_STARTER,
  growth: LS_VARIANT_GROWTH,
  pro: LS_VARIANT_PRO,
};

function buildCheckoutUrl(variant: string, userId: string): string {
  if (!LS_STORE_URL || !variant) return "";
  return `${LS_STORE_URL}/checkout/buy/${variant}?checkout[custom][user_id]=${userId}`;
}

/* ── Props ── */
interface PricingActionsProps {
  tier: {
    key: string;
    price: number;
    popular?: boolean;
    ctaLabel: string;
  };
}

/**
 * Client island for a single pricing tier CTA.
 * Handles session check, checkout redirect, and auth modal.
 */
export default function PricingActions({ tier }: PricingActionsProps) {
  const { data: session } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const isSignedIn = !!session?.user;

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [checkoutClicked, setCheckoutClicked] = useState(false);

  const isPaid = tier.price > 0;
  const variant = VARIANT_MAP[tier.key] ?? "";
  const checkoutUrl = isPaid ? buildCheckoutUrl(variant, userId) : "";

  return (
    <>
      {!isPaid ? (
        /* Free tier — link to homepage */
        <Button
          asChild
          variant="secondary"
          size="md"
          shape="pill"
          className="w-full text-center"
        >
          <Link href="/">{tier.ctaLabel}</Link>
        </Button>
      ) : isSignedIn && checkoutUrl ? (
        /* Signed-in paid tier — guarded checkout button */
        <Button
          type="button"
          variant={tier.popular ? "primary" : "secondary"}
          size="md"
          shape="pill"
          disabled={checkoutClicked}
          onClick={() => {
            setCheckoutClicked(true);
            window.open(checkoutUrl, "_blank");
            setTimeout(() => setCheckoutClicked(false), 2000);
          }}
          className={`w-full px-8 ${
            tier.popular
              ? ""
              : "border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand-light)]"
          }`}
        >
          {tier.ctaLabel}
        </Button>
      ) : (
        /* Not signed in — prompt sign-in first */
        <Button
          type="button"
          variant={tier.popular ? "primary" : "secondary"}
          size="md"
          shape="pill"
          onClick={() => setAuthModalOpen(true)}
          className={`w-full px-8 ${
            tier.popular
              ? ""
              : "border border-[var(--brand)] text-[var(--brand)] hover:bg-[var(--brand-light)]"
          }`}
        >
          Sign in to subscribe
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

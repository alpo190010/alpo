"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";
import { isPaddleConfigured, openStarterCheckout } from "@/lib/paddle";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

/* -- Props -- */
interface PricingActionsProps {
  tier: {
    key: "free" | "starter" | "pro-waitlist";
    ctaLabel: string;
    billing: "monthly" | "annual";
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
  const [waitlistConfirmed, setWaitlistConfirmed] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // On mount: check /user/plan for existing waitlist status
  useEffect(() => {
    if (tier.key !== "pro-waitlist" || !isSignedIn) return;
    authFetch(`${API_URL}/user/plan`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.proWaitlist) setWaitlistConfirmed(true);
      })
      .catch(() => {});
  }, [tier.key, isSignedIn]);

  // Auto-enroll when redirected back with ?waitlist=1 after signup
  useEffect(() => {
    if (tier.key !== "pro-waitlist" || !isSignedIn) return;
    if (searchParams.get("waitlist") !== "1") return;
    authFetch(`${API_URL}/user/waitlist`, { method: "POST" })
      .then((r) => {
        if (r.ok) {
          setWaitlistConfirmed(true);
          router.replace(pathname, { scroll: false });
        }
      })
      .catch(() => {});
  }, [isSignedIn, searchParams, pathname, router, tier.key]);

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

  // ── Starter: Paddle inline checkout ──
  if (tier.key === "starter") {
    if (tier.isCurrent) return <CurrentPlanLabel />;

    const configured = isPaddleConfigured();

    const onClick = async () => {
      if (!isSignedIn) {
        setAuthModalOpen(true);
        return;
      }
      const userId = session?.user?.id;
      if (!userId) return;
      setCheckoutBusy(true);
      try {
        const opened = await openStarterCheckout({
          billing: tier.billing,
          userId,
          email: session?.user?.email ?? undefined,
        });
        if (!opened) {
          console.error("Paddle checkout failed to open — env vars missing or SDK failed to load");
        }
      } finally {
        setCheckoutBusy(false);
      }
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
          heading="Create your account to upgrade"
          subheading="You'll land on the Starter checkout right after signup."
          callbackUrl="/pricing"
        />
      </>
    );
  }

  // ── Pro waitlist ──
  if (tier.isCurrent) return <CurrentPlanLabel />;

  if (waitlistConfirmed) {
    return (
      <p
        role="status"
        className="text-sm text-center font-semibold py-3 text-[var(--success)] animate-[fade-in_300ms_ease-out]"
      >
        You&apos;re on the list! We&apos;ll let you know when Pro launches.
      </p>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="md"
        shape="pill"
        disabled={joining}
        aria-busy={joining}
        onClick={() => {
          if (!isSignedIn) {
            setAuthModalOpen(true);
            return;
          }
          setJoining(true);
          setJoinError(false);
          authFetch(`${API_URL}/user/waitlist`, { method: "POST" })
            .then((r) => {
              if (r.ok) setWaitlistConfirmed(true);
              else setJoinError(true);
            })
            .catch(() => setJoinError(true))
            .finally(() => setJoining(false));
        }}
        className={`w-full px-8 border border-[var(--outline-variant)] text-[var(--on-surface-variant)] ${joining ? "opacity-50" : ""}`}
      >
        {tier.ctaLabel}
      </Button>
      {joinError && (
        <p className="text-xs text-center mt-2 text-[var(--error-base)]">
          Something went wrong. Please try again.
        </p>
      )}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        callbackUrl="/pricing?waitlist=1"
      />
    </>
  );
}

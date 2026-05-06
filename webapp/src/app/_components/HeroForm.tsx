"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { isValidUrl, isProductPageUrl, extractDomain } from "@/lib/analysis/helpers";
import UrlInput from "@/components/ui/UrlInput";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

export default function HeroForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);

  // Reset stuck submitting state when navigation bounces back to /
  useEffect(() => {
    if (submitting && pathname === "/") {
      setSubmitting(false);
    }
  }, [pathname, submitting]);

  // If user authenticates via the modal, continue to their intended destination.
  useEffect(() => {
    if (status === "authenticated" && pendingDestination) {
      router.push(pendingDestination);
      setPendingDestination(null);
    }
  }, [status, pendingDestination, router]);

  const handleUrlChange = useCallback(
    (next: string) => {
      setUrl(next);
      if (error) setError("");
    },
    [error],
  );

  const runScan = useCallback(
    async (value: string) => {
      if (submitting) return;
      const validUrl = isValidUrl(value);
      if (!validUrl) {
        setError(
          "Please enter a valid URL (e.g. yourstore.com or yourstore.com/products/...)",
        );
        return;
      }

      const destination = isProductPageUrl(validUrl)
        ? `/analyze?url=${encodeURIComponent(validUrl)}`
        : `/scan/${encodeURIComponent(extractDomain(validUrl) || validUrl)}`;

      if (status !== "authenticated") {
        // Require sign-in before running any scan. Remember where to go next.
        setPendingDestination(destination);
        setAuthModalOpen(true);
        return;
      }

      setSubmitting(true);
      router.push(destination);
    },
    [submitting, router, status],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      runScan(url);
    },
    [runScan, url],
  );

  return (
    <>
      <form id="hero-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <UrlInput
          id="url-input"
          variant="hero"
          value={url}
          onValueChange={handleUrlChange}
          onSubmit={runScan}
          placeholder="Paste your store or product page URL..."
          ctaLabel="Scan Free"
          ctaTrailing={<ArrowRightIcon size={16} weight="bold" />}
          submitting={submitting}
          maxLength={2048}
          errorId={error ? "url-error" : undefined}
        />
      </form>

      {error && (
        <div className="max-w-2xl mx-auto mt-4">
          <div
            id="url-error"
            className="p-4 rounded-xl text-sm border-l-4 bg-[var(--error-light)] border-l-[var(--error)] border border-[var(--error-border-light)]"
            role="alert"
          >
            <span className="text-[var(--error)] font-medium">{error}</span>
          </div>
        </div>
      )}

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialMode="signup"
        heading="Sign up to run your first scan"
        subheading="It's free — scan as many stores as you like."
      />
    </>
  );
}

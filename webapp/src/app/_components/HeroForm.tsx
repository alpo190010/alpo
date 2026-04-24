"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { isValidUrl, isProductPageUrl, extractDomain } from "@/lib/analysis/helpers";
import UrlInput from "@/components/ui/UrlInput";
import Button from "@/components/ui/Button";
import Modal, { ModalTitle, ModalDescription } from "@/components/ui/Modal";
import { authFetch } from "@/lib/auth-fetch";
import { API_URL } from "@/lib/api";

const AuthModal = dynamic(() => import("@/components/AuthModal"), {
  ssr: false,
});

interface QuotaModalState {
  targetDomain: string;
  used: number;
  quota: number;
}

export default function HeroForm() {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const [quotaModal, setQuotaModal] = useState<QuotaModalState | null>(null);

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

      // Pre-flight store-quota check: surface the "limit reached" modal here
      // instead of letting the destination page catch the 403 after navigation.
      // On any error, fall through — the server will still gate at the API.
      const targetDomain = (extractDomain(validUrl) || validUrl).toLowerCase();
      try {
        const res = await authFetch(`${API_URL}/user/stores`);
        if (res.ok) {
          const payload = (await res.json()) as {
            stores: Array<{ domain: string }>;
            quota: number;
            used: number;
          };
          const alreadyTracked = payload.stores.some(
            (s) => s.domain.toLowerCase() === targetDomain,
          );
          if (!alreadyTracked && payload.used >= payload.quota) {
            setQuotaModal({
              targetDomain,
              used: payload.used,
              quota: payload.quota,
            });
            setSubmitting(false);
            return;
          }
        }
      } catch {
        // Ignore — navigation proceeds and the destination page handles 403s.
      }

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
          ctaLabel="Analyze Free"
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
        subheading="It's free — 3 scans per month on the free plan."
      />

      <Modal
        open={quotaModal !== null}
        onOpenChange={(open) => {
          if (!open) setQuotaModal(null);
        }}
        ariaLabel="Store limit reached"
        size="sm"
      >
        <div className="p-6">
          <ModalTitle className="font-display text-lg font-bold text-[var(--on-surface)] mb-2">
            Store limit reached
          </ModalTitle>
          <ModalDescription className="text-sm text-[var(--on-surface-variant)] mb-5">
            You&apos;re already tracking {quotaModal?.used} of {quotaModal?.quota}{" "}
            allowed{" "}
            {quotaModal && quotaModal.quota === 1 ? "store" : "stores"}. Delete a
            store from your dashboard to make room for{" "}
            <strong className="text-[var(--on-surface)]">
              {quotaModal?.targetDomain}
            </strong>
            .
          </ModalDescription>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              shape="pill"
              onClick={() => setQuotaModal(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              shape="pill"
              onClick={() => {
                setQuotaModal(null);
                router.push("/dashboard");
              }}
            >
              Manage My Stores
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

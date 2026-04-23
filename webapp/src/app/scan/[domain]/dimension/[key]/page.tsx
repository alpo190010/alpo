"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react";
import StoreHealthDetail from "@/components/StoreHealthDetail";
import Button from "@/components/ui/Button";
import MobileAppBar from "@/components/MobileAppBar";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { type StoreAnalysisData } from "@/lib/analysis";

/* ═══════════════════════════════════════════════════════════════
   /scan/[domain]/dimension/[key] — Single store-wide dimension
   detail page. Replaces the (previously empty) mobile experience
   when tapping a dimension card on the listings page.
   ═══════════════════════════════════════════════════════════════ */

type LoadPhase = "loading" | "ready" | "missing" | "error";

function DimensionDetailLoader() {
  const params = useParams<{ domain: string; key: string }>();
  const router = useRouter();

  const rawDomain = params.domain ?? "";
  const domain = decodeURIComponent(rawDomain);
  const dimensionKey = decodeURIComponent(params.key ?? "");

  const [phase, setPhase] = useState<LoadPhase>("loading");
  const [storeAnalysis, setStoreAnalysis] = useState<StoreAnalysisData | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!domain || !dimensionKey) return;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await authFetch(
          `${API_URL}/store/${encodeURIComponent(domain)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          router.replace(`/scan/${encodeURIComponent(domain)}`);
          return;
        }
        const data = await res.json();
        const sa: StoreAnalysisData | null = data.storeAnalysis ?? null;
        if (!sa) {
          // Cached store exists but no store-wide scan yet → bounce back
          // so the listings page can auto-populate StoreAnalysis.
          router.replace(`/scan/${encodeURIComponent(domain)}`);
          return;
        }
        setStoreAnalysis(sa);
        setPhase("ready");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load dimension.",
        );
        setPhase("error");
      }
    })();

    return () => controller.abort();
  }, [domain, dimensionKey, router]);

  const handleBack = useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(`/scan/${encodeURIComponent(domain)}`);
  }, [router, domain]);

  if (phase === "loading") {
    return (
      <div className="h-full bg-[var(--bg)] flex items-center justify-center px-6">
        <div
          className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]"
          style={{ boxShadow: "var(--shadow-subtle)" }}
        >
          <div
            className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent"
            style={{ animation: "spin 0.8s linear infinite" }}
            aria-hidden="true"
          />
          <span className="text-sm font-medium text-[var(--text-secondary)]">
            Loading dimension…
          </span>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="h-full bg-[var(--bg)] flex flex-col items-center justify-center px-6 text-center">
        <div
          className="w-14 h-14 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-4"
          style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}
        >
          <WarningCircleIcon size={24} weight="regular" color="var(--error)" />
        </div>
        <h2 className="font-display text-xl font-bold text-[var(--on-surface)] mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed break-words">
          {errorMessage}
        </p>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => router.push(`/scan/${encodeURIComponent(domain)}`)}
        >
          Back to {domain}
        </Button>
      </div>
    );
  }

  // phase === "ready" — storeAnalysis is non-null
  return (
    <div className="h-full bg-[var(--bg)] flex flex-col">
      <MobileAppBar onBack={handleBack} />

      <main className="flex-1 overflow-y-auto" aria-label="Dimension detail">
        <StoreHealthDetail
          key={dimensionKey}
          dimensionKey={dimensionKey}
          storeAnalysis={storeAnalysis as StoreAnalysisData}
        />
      </main>
    </div>
  );
}

export default function DimensionDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-[var(--bg)] flex items-center justify-center px-6">
          <div
            className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]"
            style={{ boxShadow: "var(--shadow-subtle)" }}
          >
            <div
              className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent"
              style={{ animation: "spin 0.8s linear infinite" }}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-[var(--text-secondary)]">
              Loading…
            </span>
          </div>
        </div>
      }
    >
      <DimensionDetailLoader />
    </Suspense>
  );
}

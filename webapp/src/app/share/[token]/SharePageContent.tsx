"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import ProductListings from "@/components/ProductListings";
import { API_URL } from "@/lib/api";
import {
  type FreeResult,
  type StoreAnalysisData,
  parseAnalysisResponse,
} from "@/lib/analysis";
import { ShareViewProvider } from "@/lib/shareViewContext";
import type { PlanTier } from "@/lib/tier";

/* ══════════════════════════════════════════════════════════════
   /share/[token] — public, unauthenticated read of a shared store
   report. Calls GET /share/{token} with PLAIN fetch (no
   Authorization header) so the public endpoint stays public.
   Renders the same ProductListings tree as /scan/[domain] but
   inside <ShareViewProvider> so paywall components swap their
   "Unlock" CTA for "Get your own store analyzed".
   ══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: SharePayload }
  | { kind: "error"; errorCode: string; message: string };

interface SharePayload {
  storeName: string;
  domain: string;
  shareTier: PlanTier;
  products: Product[];
  initialAnalyses: Map<string, FreeResult> | undefined;
  storeAnalysis: StoreAnalysisData | null;
  productCount: number | null;
  currentPage: number;
  totalPages: number | null;
  canPaginate: boolean;
}

const ERROR_COPY: Record<
  string,
  { title: string; body: string; cta?: { label: string; href: string } }
> = {
  share_not_found: {
    title: "This share link is invalid",
    body: "We couldn't find a share for this link. The owner may have deleted it, or the URL was copied incorrectly.",
    cta: { label: "Analyze your own store", href: "/" },
  },
  share_revoked: {
    title: "This share link was revoked",
    body: "The owner has revoked this link. Reach out to them for a new one — or run your own analysis below.",
    cta: { label: "Analyze your own store", href: "/" },
  },
  share_tier_lapsed: {
    title: "This link is no longer active",
    body: "The owner's plan ended, so the gated parts of this report can no longer be shown. Run your own analysis to see how your store compares.",
    cta: { label: "Get your own report", href: "/signup?from=share" },
  },
  store_not_found: {
    title: "Store unavailable",
    body: "The store this link pointed to is no longer available.",
    cta: { label: "Analyze a different store", href: "/" },
  },
  generic: {
    title: "Couldn't load this report",
    body: "Something went wrong loading this share. Please try again in a moment.",
  },
};

export default function SharePageContent({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // PLAIN fetch — never use authFetch on a public endpoint, the
        // viewer's session must not bleed into a public response.
        const resp = await fetch(
          `${API_URL}/share/${encodeURIComponent(token)}`,
          { method: "GET" },
        );
        if (cancelled) return;

        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as {
            errorCode?: string;
            error?: string;
          };
          const code = body.errorCode ?? "generic";
          const copy = ERROR_COPY[code] ?? ERROR_COPY.generic;
          setState({
            kind: "error",
            errorCode: code,
            message: body.error ?? copy.body,
          });
          return;
        }

        const data = await resp.json();
        const products: Product[] = data.products ?? [];
        const analyses: Record<string, Record<string, unknown>> =
          data.analyses ?? {};

        // Build the (slug → FreeResult) map ProductListings expects.
        const analysesMap = new Map<string, FreeResult>();
        for (const product of products) {
          const entry = analyses[product.url];
          if (entry) {
            analysesMap.set(
              product.slug,
              parseAnalysisResponse(entry as Record<string, unknown>),
            );
          }
        }

        setState({
          kind: "ok",
          data: {
            storeName: data.store?.name || data.store?.domain || "",
            domain: data.store?.domain || "",
            shareTier: (data.share?.shareTier as PlanTier) || "free",
            products,
            initialAnalyses: analysesMap.size > 0 ? analysesMap : undefined,
            storeAnalysis: data.storeAnalysis ?? null,
            productCount:
              typeof data.productCount === "number" ? data.productCount : null,
            currentPage:
              typeof data.currentPage === "number" ? data.currentPage : 1,
            totalPages:
              typeof data.totalPages === "number" ? data.totalPages : null,
            canPaginate: Boolean(data.canPaginate),
          },
        });
      } catch {
        if (cancelled) return;
        setState({
          kind: "error",
          errorCode: "generic",
          message: ERROR_COPY.generic.body,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.kind === "loading") {
    return <SharePageLoading />;
  }

  if (state.kind === "error") {
    return <SharePageError errorCode={state.errorCode} message={state.message} />;
  }

  const { data } = state;
  return (
    <ShareViewProvider value={{ isShared: true, shareTier: data.shareTier }}>
      <ShareBanner domain={data.domain} />
      <div className="flex-1 min-h-0">
        <ProductListings
          products={data.products}
          storeName={data.storeName}
          domain={data.domain}
          initialAnalyses={data.initialAnalyses}
          storeAnalysis={data.storeAnalysis}
          productCount={data.productCount}
          currentPage={data.currentPage}
          totalPages={data.totalPages}
          canPaginate={data.canPaginate}
        />
      </div>
    </ShareViewProvider>
  );
}

/* ── Loading state ─────────────────────────────────────────────── */

function SharePageLoading() {
  return (
    <div className="h-full flex items-center justify-center px-6 py-12">
      <div
        className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full border"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
          boxShadow: "var(--shadow-subtle)",
        }}
      >
        <span
          className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent"
          style={{ animation: "spin 0.8s linear infinite" }}
          aria-hidden="true"
        />
        <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
          Loading shared report…
        </span>
      </div>
    </div>
  );
}

/* ── Error state ───────────────────────────────────────────────── */

function SharePageError({
  errorCode,
  message,
}: {
  errorCode: string;
  message: string;
}) {
  const copy = ERROR_COPY[errorCode] ?? ERROR_COPY.generic;
  return (
    <div className="h-full flex items-center justify-center px-6 py-12">
      <div
        className="max-w-md w-full rounded-2xl border p-7 sm:p-8 text-center flex flex-col items-center gap-4"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
          boxShadow: "var(--shadow-subtle)",
        }}
      >
        <span
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: "var(--bg-elev)", color: "var(--ink-2)" }}
        >
          <WarningCircleIcon size={24} weight="bold" />
        </span>
        <h1
          className="font-display text-xl font-bold"
          style={{ color: "var(--ink)" }}
        >
          {copy.title}
        </h1>
        <p className="text-sm leading-[1.55]" style={{ color: "var(--ink-3)" }}>
          {message || copy.body}
        </p>
        {copy.cta && (
          <Link href={copy.cta.href} className="mt-1">
            <Button type="button" variant="primary" size="md" shape="pill">
              {copy.cta.label}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Top banner shown on every shared view ─────────────────────── */

function ShareBanner({ domain }: { domain: string }) {
  return (
    <div
      className="px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 text-[12.5px]"
      style={{
        background: "var(--bg-elev)",
        borderColor: "var(--rule-2)",
        color: "var(--ink-3)",
      }}
    >
      <span>
        You're viewing a shared report for{" "}
        <span className="font-mono" style={{ color: "var(--ink-2)" }}>
          {domain}
        </span>
        .
      </span>
      <Link
        href="/signup?from=share"
        className="inline-flex items-center gap-1.5 font-semibold transition-colors hover:underline"
        style={{ color: "var(--ink)" }}
      >
        Analyze your own store
        <ArrowRightIcon size={12} weight="bold" />
      </Link>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon, PackageIcon } from "@phosphor-icons/react";
import ProductListings from "@/components/ProductListings";
import { API_URL } from "@/lib/api";
import { authFetch } from "@/lib/auth-fetch";
import { type FreeResult, type StoreAnalysisData, parseAnalysisResponse } from "@/lib/analysis";

/* ═══════════════════════════════════════════════════════════════
   /scan/[domain] — Product discovery + split-view analysis
   URL arrives as domain only (e.g. /scan/example.com).
   Discovers products via the FastAPI discover-products endpoint, then renders
   the ProductListings split-view.
   ═══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

type ScanPhase = "discovering" | "ready" | "error" | "empty";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ScanPageContent() {
  const params = useParams<{ domain: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const initialSku = searchParams.get("sku") || "";
  const rawDomain = params.domain ?? "";
  const domain = decodeURIComponent(rawDomain);

  const handleSkuChange = useCallback(
    (sku: string | null) => {
      const newUrl = sku ? `${pathname}?sku=${encodeURIComponent(sku)}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router],
  );

  const [phase, setPhase] = useState<ScanPhase>("discovering");
  const [products, setProducts] = useState<Product[]>([]);
  const [storeName, setStoreName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [initialAnalyses, setInitialAnalyses] = useState<
    Map<string, FreeResult> | undefined
  >(undefined);
  const [storeAnalysis, setStoreAnalysis] = useState<StoreAnalysisData | null>(null);

  const discoverProducts = useCallback(async () => {
    setPhase("discovering");
    setErrorMessage("");

    const url = `https://${domain}`;

    /* ── Cache-first: check DB via /api/store before hitting discover-products ── */
    try {
      const [cacheRes] = await Promise.all([
        authFetch(`${API_URL}/store/${encodeURIComponent(domain)}`),
        delay(600), // D009: minimum 600ms in discovering phase
      ]);

      if (cacheRes.ok) {
        const data = await cacheRes.json();
        const cachedProducts: Product[] = data.products ?? [];
        const analyses: Record<string, Record<string, unknown>> =
          data.analyses ?? {};

        if (cachedProducts.length > 0) {
          const analysesMap = new Map<string, FreeResult>();
          for (const product of cachedProducts) {
            const dbEntry = analyses[product.url];
            if (dbEntry) {
              analysesMap.set(
                product.slug,
                parseAnalysisResponse(dbEntry as Record<string, unknown>),
              );
            }
          }

          setProducts(cachedProducts);
          setStoreName(data.store?.name || domain);
          if (analysesMap.size > 0) setInitialAnalyses(analysesMap);
          if (data.storeAnalysis) setStoreAnalysis(data.storeAnalysis);
          setPhase("ready");
          return;
        }
      }
      // 404 or empty products → fall through to discover-products
    } catch {
      // Cache check failed (network error, etc.) — fall through to discover-products
    }

    /* ── Fallback: discover products via API ── */
    try {
      const res = await fetch(`${API_URL}/discover-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (data.isProductPage) {
        const productPath = new URL(url).pathname;
        const slug = productPath.split("/").filter(Boolean).pop() || "product";
        setProducts([{ url, slug, image: "" }]);
        setStoreName(data.storeName || domain);
        setPhase("ready");
      } else if (data.products?.length > 0) {
        setProducts(data.products);
        setStoreName(data.storeName || domain);
        setStoreAnalysis(data.storeAnalysis ?? null);
        setPhase("ready");
      } else {
        setProducts([]);
        setPhase("empty");
      }
    } catch {
      setErrorMessage("Failed to discover products. Please try again.");
      setPhase("error");
    }
  }, [domain]);

  // Discover products once session resolves (works for both auth and anon)
  useEffect(() => {
    if (status === "loading") return;
    if (domain) discoverProducts();
  }, [status, domain, discoverProducts]);

  /* ── Session loading — show spinner while auth resolves ── */
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="flex flex-col items-center justify-center min-h-screen px-6">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "var(--shadow-subtle)" }}>
            <div className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Loading…</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Discovering state ── */
  if (phase === "discovering") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="flex flex-col items-center justify-center min-h-screen px-6">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "var(--shadow-subtle)" }}>
            <div className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Finding products on {domain}…</span>
          </div>
        </div>
      </div>
    );
  }

  /* ── Error / Empty state ── */
  if (phase === "error" || phase === "empty") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-4" style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}>
            {phase === "error" ? (
              <WarningCircleIcon size={24} weight="regular" color="var(--error)" />
            ) : (
              <PackageIcon size={24} weight="regular" color="var(--on-surface-variant)" />
            )}
          </div>
          <h2 className="text-xl font-bold text-[var(--on-surface)] mb-2" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
            {phase === "error" ? "Something went wrong" : "No products found"}
          </h2>
          <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed">
            {phase === "error" ? errorMessage : `We couldn't find any products on ${domain}. Try a different store URL.`}
          </p>
          <div className="flex gap-3">
            {phase === "error" && (
              <button type="button" onClick={discoverProducts} className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--brand)] hover:opacity-90 active:scale-95 transition-all">
                Retry
              </button>
            )}
            <button type="button" onClick={() => router.push("/")} className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-[var(--on-surface)] bg-[var(--surface-container-low)] border border-[var(--border)] hover:bg-[var(--surface-container)] transition-all">
              Try Another URL
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Ready — ProductListings split-view ── */
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="min-h-screen">
        <ProductListings products={products} storeName={storeName} domain={domain} initialSku={initialSku} onSkuChange={handleSkuChange} initialAnalyses={initialAnalyses} storeAnalysis={storeAnalysis} />
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "var(--shadow-subtle)" }}>
            <div className="w-4 h-4 rounded-full border-2 border-[var(--brand)] border-t-transparent" style={{ animation: "spin 0.8s linear infinite" }} />
            <span className="text-sm font-medium text-[var(--text-secondary)]">Loading…</span>
          </div>
        </div>
      }
    >
      <ScanPageContent />
    </Suspense>
  );
}

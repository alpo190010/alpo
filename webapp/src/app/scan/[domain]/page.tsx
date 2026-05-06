"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { WarningCircleIcon, PackageIcon } from "@phosphor-icons/react";
import Button from "@/components/ui/Button";
import ProductListings from "@/components/ProductListings";
import ScanSkeleton from "@/components/ScanSkeleton";
import MobileAppBar from "@/components/MobileAppBar";
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
      const params = new URLSearchParams(searchParams.toString());
      if (sku) params.set("sku", sku);
      else params.delete("sku");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /* ── Mobile deep-link: ?sku= → /scan/{domain}/product/{slug} (one-shot) ── */
  useEffect(() => {
    if (!initialSku) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    router.replace(
      `/scan/${encodeURIComponent(domain)}/product/${encodeURIComponent(initialSku)}`,
    );
  }, [initialSku, domain, router]);

  const [phase, setPhase] = useState<ScanPhase>("discovering");
  const [products, setProducts] = useState<Product[]>([]);
  const [storeName, setStoreName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [initialAnalyses, setInitialAnalyses] = useState<
    Map<string, FreeResult> | undefined
  >(undefined);
  const [storeAnalysis, setStoreAnalysis] = useState<StoreAnalysisData | null>(null);
  const [rescanningStore, setRescanningStore] = useState(false);
  const [takingLong, setTakingLong] = useState(false);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [canPaginate, setCanPaginate] = useState<boolean>(false);

  const handleRescanStore = useCallback(async () => {
    if (rescanningStore) return;
    setRescanningStore(true);
    try {
      const res = await authFetch(
        `${API_URL}/store/${encodeURIComponent(domain)}/rescan`,
        { method: "POST", timeoutMs: 90_000 },
      );
      if (!res.ok) {
        console.warn("Store rescan failed:", res.status);
        return;
      }
      const data = (await res.json()) as StoreAnalysisData;
      setStoreAnalysis(data);
      router.refresh();
    } catch (err) {
      console.warn("Store rescan error:", err);
    } finally {
      setRescanningStore(false);
    }
  }, [domain, rescanningStore, router]);

  // Show "taking longer" feedback after 10s in discovering phase
  useEffect(() => {
    if (phase !== "discovering") {
      setTakingLong(false);
      return;
    }
    const timer = setTimeout(() => setTakingLong(true), 10_000);
    return () => clearTimeout(timer);
  }, [phase]);

  const discoverProducts = useCallback(async (signal?: AbortSignal) => {
    setPhase("discovering");
    setErrorMessage("");

    const url = `https://${domain}`;

    /* ── Cache-first: check DB via /api/store before hitting discover-products ── */
    try {
      const [cacheRes] = await Promise.all([
        authFetch(`${API_URL}/store/${encodeURIComponent(domain)}`, { signal }),
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
          setProductCount(
            typeof data.productCount === "number" ? data.productCount : null,
          );
          setCurrentPage(typeof data.currentPage === "number" ? data.currentPage : 1);
          setTotalPages(
            typeof data.totalPages === "number" ? data.totalPages : null,
          );
          setCanPaginate(Boolean(data.canPaginate));
          setPhase("ready");
          return;
        }
      }
      // 404 or empty products → fall through to discover-products
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Cache check failed (network error, etc.) — fall through to discover-products
    }

    /* ── Fallback: discover products via API ── */
    try {
      const res = await authFetch(`${API_URL}/discover-products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal,
        timeoutMs: 90_000,
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
        if (data.storeAnalysis) setStoreAnalysis(data.storeAnalysis);
        setProductCount(
          typeof data.productCount === "number" ? data.productCount : null,
        );
        setCurrentPage(typeof data.currentPage === "number" ? data.currentPage : 1);
        setTotalPages(
          typeof data.totalPages === "number" ? data.totalPages : null,
        );
        setCanPaginate(Boolean(data.canPaginate));
        setPhase("ready");
      } else {
        setProducts([]);
        setPhase("empty");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErrorMessage("Failed to discover products. Please try again.");
      setPhase("error");
    }
  }, [domain]);

  // Discover products once session resolves (works for both auth and anon)
  useEffect(() => {
    if (status === "loading") return;
    if (!domain) return;

    const controller = new AbortController();

    // 90 s safety timeout — transition to error if discovery hangs.
    // Scans legitimately take 40–60 s when PSI is slow; this is the
    // outer ceiling that must be ≥ authFetch's per-call timeout.
    const timeout = setTimeout(() => {
      controller.abort();
      setPhase("error");
      setErrorMessage(
        "Discovery is taking too long. The site may be unreachable.",
      );
    }, 90_000);

    discoverProducts(controller.signal).finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [status, domain, discoverProducts]);

  // Auto-populate store-wide analysis when the cache has products but no analysis yet.
  // Without this, users who land via the cache-first path (e.g. after a prior anonymous
  // scan created Store/products but no StoreAnalysis row) see "Store-wide scan unavailable"
  // until they manually click Rescan. The ref guarantees we fire at most once per mount —
  // if the response fails to set storeAnalysis (non-2xx, malformed JSON, abort, gated free
  // tier), we don't loop.
  const autoRescanFiredRef = useRef(false);
  useEffect(() => {
    if (phase !== "ready") return;
    if (status !== "authenticated") return;
    if (storeAnalysis) return;
    if (rescanningStore) return;
    if (products.length === 0) return;
    if (autoRescanFiredRef.current) return;
    autoRescanFiredRef.current = true;
    handleRescanStore();
  }, [
    phase,
    status,
    storeAnalysis,
    rescanningStore,
    products.length,
    handleRescanStore,
  ]);

  /* ── PSI background-fill poll: when storeAnalysis arrives with
       signals.pageSpeed.psiPending=true, the server is still fetching
       PageSpeed Insights. Poll GET /store/{domain} every 5s until the
       flag clears, the page unmounts, or 120s elapses. The cap matches
       the backend's 90s PSI timeout plus a small buffer for the Google
       round-trip and our DB write. ── */
  const psiPending = Boolean(
    (storeAnalysis?.signals as { pageSpeed?: { psiPending?: boolean } } | undefined)
      ?.pageSpeed?.psiPending,
  );
  useEffect(() => {
    if (!psiPending) return;
    if (status !== "authenticated") return;
    if (!domain) return;

    let cancelled = false;
    const startedAt = Date.now();
    const POLL_INTERVAL_MS = 5_000;
    const MAX_POLL_MS = 120_000;

    async function pollOnce() {
      if (cancelled) return;
      if (Date.now() - startedAt > MAX_POLL_MS) return;
      try {
        const res = await authFetch(
          `${API_URL}/store/${encodeURIComponent(domain)}`,
        );
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { storeAnalysis?: StoreAnalysisData };
          if (cancelled) return;
          if (data.storeAnalysis) {
            const stillPending = Boolean(
              (data.storeAnalysis.signals as
                | { pageSpeed?: { psiPending?: boolean } }
                | undefined)?.pageSpeed?.psiPending,
            );
            setStoreAnalysis(data.storeAnalysis);
            if (!stillPending) return;
          }
        }
      } catch {
        // Swallow — next tick will retry
      }
      if (!cancelled && Date.now() - startedAt + POLL_INTERVAL_MS <= MAX_POLL_MS) {
        timer = setTimeout(pollOnce, POLL_INTERVAL_MS);
      }
    }

    let timer = setTimeout(pollOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [psiPending, domain, status]);

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

  /* ── All non-loading phases share a single return so the aria-live region persists across transitions ── */
  return (
    <div className="h-full bg-[var(--bg)] flex flex-col">
      {/* Screen-reader announcements for phase transitions */}
      <div aria-live="polite" className="sr-only">
        {phase === "discovering" ? `Discovering products…${takingLong ? " This is taking longer than expected." : ""}` : phase === "error" ? "An error occurred." : phase === "empty" ? "No products found." : phase === "ready" ? "Products loaded." : ""}
      </div>

      <MobileAppBar title={domain} />

      {/* ── Discovering state ── */}
      {phase === "discovering" && (
        <ScanSkeleton domain={domain} takingLong={takingLong} />
      )}

      {/* ── Error / Empty state ── */}
      {(phase === "error" || phase === "empty") && (
        <div className="flex flex-col items-center justify-center h-full px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-4" style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}>
            {phase === "error" ? (
              <WarningCircleIcon size={24} weight="regular" color="var(--error)" />
            ) : (
              <PackageIcon size={24} weight="regular" color="var(--on-surface-variant)" />
            )}
          </div>
          <h2 className="font-display text-xl font-bold text-[var(--on-surface)] mb-2">
            {phase === "error" ? "Something went wrong" : "No products found"}
          </h2>
          <p className="text-sm text-[var(--on-surface-variant)] max-w-sm mb-5 leading-relaxed break-words">
            {phase === "error" ? errorMessage : `We couldn't find any products on ${domain}. Try a different store URL.`}
          </p>
          <div className="flex gap-3">
            {phase === "error" && (
              <Button type="button" variant="primary" size="sm" disabled={false} onClick={() => discoverProducts()}>
                Retry
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" onClick={() => router.push("/")}>
              Try Another URL
            </Button>
          </div>
        </div>
      )}

      {/* ── Ready — ProductListings with sidebar tabs + Hero + split-view ── */}
      {phase === "ready" && (
        <div className="flex-1 min-h-0">
          <ProductListings
            products={products}
            storeName={storeName}
            domain={domain}
            initialSku={initialSku}
            onSkuChange={handleSkuChange}
            initialAnalyses={initialAnalyses}
            storeAnalysis={storeAnalysis}
            onRescanStore={handleRescanStore}
            rescanningStore={rescanningStore}
            onStoreAnalysisUpdate={setStoreAnalysis}
            productCount={productCount}
            currentPage={currentPage}
            totalPages={totalPages}
            canPaginate={canPaginate}
          />
        </div>
      )}
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full bg-[var(--bg)] flex flex-col items-center justify-center px-6">
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

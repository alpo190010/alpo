"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import ProductListings from "@/components/ProductListings";

/* ═══════════════════════════════════════════════════════════════
   /scan/[domain] — Product discovery + split-view analysis
   URL arrives as domain only (e.g. /scan/example.com).
   Discovers products via /api/discover-products, then renders
   the ProductListings split-view.
   ═══════════════════════════════════════════════════════════════ */

interface Product {
  url: string;
  slug: string;
  image?: string;
}

type ScanPhase = "discovering" | "ready" | "error" | "empty";

function ScanPageContent() {
  const params = useParams<{ domain: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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

  const discoverProducts = useCallback(async () => {
    setPhase("discovering");
    setErrorMessage("");

    const url = `https://${domain}`;

    try {
      const res = await fetch("/api/discover-products", {
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

  useEffect(() => {
    if (domain) discoverProducts();
  }, [domain, discoverProducts]);

  /* ── Discovering state ── */
  if (phase === "discovering") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
          <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
            <div className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
            <button type="button" onClick={() => router.push("/")} className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm">
              Scan Another
            </button>
          </div>
        </nav>
        <div className="pt-[72px] flex flex-col items-center justify-center min-h-screen px-6">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
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
        <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
          <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
            <div className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
            <button type="button" onClick={() => router.push("/")} className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm">
              Scan Another
            </button>
          </div>
        </nav>
        <div className="pt-[72px] flex flex-col items-center justify-center min-h-screen px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[var(--surface-container-low)] border border-[var(--border)] flex items-center justify-center mb-4" style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {phase === "error" ? (
                <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" stroke="var(--on-surface-variant)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
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
      <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
          <button type="button" onClick={() => router.push("/")} className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm">
            Scan Another
          </button>
        </div>
      </nav>
      <div className="pt-[72px] min-h-screen">
        <ProductListings products={products} storeName={storeName} domain={domain} initialSku={initialSku} onSkuChange={handleSkuChange} />
      </div>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-6">
          <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-[var(--surface)] border border-[var(--border)]" style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
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

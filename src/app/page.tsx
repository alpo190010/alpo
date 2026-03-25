"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isValidUrl, isProductPageUrl, extractDomain, CATEGORY_SVG, CATEGORY_LABELS, CATEGORY_REVENUE_IMPACT, scoreColorText } from "@/lib/analysis";

/* ── Sample scan data (Gymshark Arrival Shorts) ── */
const SAMPLE_SCAN = {
  url: "gymshark.com/products/arrival-5-shorts",
  brand: "Gymshark",
  score: 52,
  summary: "Missing reviews, structured data, and cross-sell recommendations",
  categories: {
    pageSpeed: 45, images: 55, socialProof: 15, checkout: 40, mobileCta: 50,
    title: 65, aiDiscoverability: 20, structuredData: 15, pricing: 40,
    description: 50, shipping: 55, crossSell: 15, cartRecovery: 45, trust: 30,
    merchantFeed: 40, socialCommerce: 25, sizeGuide: 40, variantUx: 45,
    accessibility: 40, contentFreshness: 50,
  },
  tips: [
    "Add review count and star rating visible above the fold",
    "Implement Product schema.org JSON-LD markup",
    "Add 'Frequently Bought Together' cross-sell section",
    "Include trust badges: free returns, secure checkout",
    "Add estimated delivery date on product page",
  ],
};

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (error) setError("");
  }, [error]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const validUrl = isValidUrl(url);
    if (!validUrl) {
      setError("Please enter a valid URL (e.g. yourstore.com or yourstore.com/products/...)");
      return;
    }
    setSubmitting(true);
    if (isProductPageUrl(validUrl)) {
      router.push(`/analyze?url=${encodeURIComponent(validUrl)}`);
    } else {
      const domain = extractDomain(validUrl) || validUrl;
      router.push(`/scan/${encodeURIComponent(domain)}`);
    }
  }, [url, submitting, router]);

  const sorted = Object.entries(SAMPLE_SCAN.categories).sort((a, b) => a[1] - b[1]);

  return (
    <>
      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 bg-violet-50/80 backdrop-blur-xl shadow-xl shadow-violet-900/5" aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-black tracking-tighter text-violet-700" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
          <button
            type="button"
            onClick={() => document.getElementById("url-input")?.focus()}
            className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold shadow-lg shadow-violet-600/20 hover:scale-105 active:scale-95 transition-all text-sm"
          >
            Scan Your Page
          </button>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="relative pt-32 sm:pt-40 pb-12 sm:pb-16 overflow-hidden anim-phase-enter">
          <div className="absolute top-0 right-0 -z-10 w-1/2 h-full bg-gradient-to-l from-violet-200/30 to-transparent blur-3xl opacity-50 pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10 text-center">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[var(--on-surface)] mb-8 leading-[1.1]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              Your product page is{" "}
              <br className="hidden md:block" />
              leaking <span className="text-[var(--error)]">revenue</span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto mb-12">
              PageLeaks scans 20 conversion dimensions and shows you exactly where you lose sales. See for yourself.
            </p>

            {/* URL Input */}
            <form id="hero-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row p-2 bg-[var(--surface-container-lowest)] rounded-full shadow-[0_20px_40px_rgba(124,58,237,0.06)] border border-[var(--outline-variant)]/15 focus-within:border-[var(--brand)]/40 transition-all duration-300">
                <div className="hidden sm:flex items-center pl-6 pr-2 text-[var(--outline)]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <input
                  id="url-input"
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder="Paste your store or product page URL..."
                  value={url}
                  onChange={handleUrlChange}
                  aria-label="Product page URL"
                  className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-base sm:text-lg placeholder:text-[var(--outline)]/60 px-4 py-3 sm:py-0 text-[var(--on-surface)]"
                  aria-describedby={error ? "url-error" : undefined}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="cursor-pointer primary-gradient text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full font-bold flex items-center justify-center gap-2 hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {submitting ? "Loading..." : "Analyze Free"}
                  {!submitting && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  )}
                </button>
              </div>
            </form>

            {error && (
              <div className="max-w-2xl mx-auto mt-4">
                <div id="url-error" className="p-4 rounded-xl text-sm border-l-4 bg-red-50 border-l-[var(--error)] border border-red-200" role="alert">
                  <span className="text-[var(--error)] font-medium">{error}</span>
                </div>
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-8 text-[var(--outline)] text-sm font-medium">
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                Free, No Signup
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z"/></svg>
                20 Dimensions Scored
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                Results in 30 Seconds
              </span>
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════
            LIVE DEMO: Real Gymshark Scan
           ══════════════════════════════════════════════════════ */}
        <section className="py-12 sm:py-20 bg-[var(--surface-container-low)] anim-phase-enter" style={{ animationDelay: "100ms" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="text-center mb-8 sm:mb-12">
              <p className="text-sm font-bold text-[var(--brand)] uppercase tracking-wider mb-2">Live Example</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                We scanned <span className="text-[var(--brand)]">Gymshark</span>. Here&apos;s what we found.
              </h2>
              <p className="text-[var(--on-surface-variant)] mt-3 text-lg">Even billion-dollar brands have conversion leaks. Imagine what yours has.</p>
            </div>

            {/* Score + Summary */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-6">
              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] rounded-3xl p-8 text-center flex flex-col items-center justify-center" style={{ animation: "fade-in-up 400ms ease-out both" }}>
                <p className="text-xs font-bold text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">Overall Score</p>
                <div className="text-7xl font-extrabold" style={{ color: "var(--warning-text)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                  {SAMPLE_SCAN.score}<span className="text-2xl text-[var(--on-surface-variant)]">/100</span>
                </div>
                <p className="text-sm text-[var(--on-surface-variant)] mt-2 font-medium">{SAMPLE_SCAN.brand} Arrival 5&quot; Shorts</p>
                <div className="mt-3 px-3 py-1 rounded-full bg-[var(--warning-light)] text-[var(--warning-text)] text-xs font-bold">
                  Needs Improvement
                </div>
              </div>

              <div className="md:col-span-4 rounded-3xl p-8 text-white flex flex-col justify-between" style={{ background: "linear-gradient(135deg, #DC2626, #991B1B)", animation: "fade-in-up 400ms ease-out 80ms both" }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Estimated Monthly Loss</p>
                  <div className="text-4xl sm:text-5xl font-extrabold" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                    -$2,800
                  </div>
                  <p className="text-sm opacity-70 mt-1">Based on ~10K monthly visitors</p>
                </div>
                <p className="text-sm opacity-80 mt-4">3 critical dimensions scoring below 20/100</p>
              </div>

              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] rounded-3xl p-8" style={{ animation: "fade-in-up 400ms ease-out 160ms both" }}>
                <p className="text-xs font-bold text-[var(--on-surface-variant)] uppercase tracking-wider mb-3">Top Fixes</p>
                <div className="space-y-3">
                  {SAMPLE_SCAN.tips.slice(0, 4).map((tip, i) => (
                    <div key={i} className="flex gap-2 text-sm">
                      <span className="text-[var(--error)] font-bold mt-0.5">{i + 1}.</span>
                      <span className="text-[var(--on-surface-variant)]">{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* All 20 dimension scores */}
            <div className="bg-[var(--surface-container-lowest)] rounded-3xl p-6 sm:p-8" style={{ animation: "fade-in-up 400ms ease-out 240ms both" }}>
              <div className="flex justify-between items-center mb-5">
                <p className="text-sm font-bold text-[var(--on-surface-variant)] uppercase tracking-wider">All 20 Dimensions</p>
                <p className="text-xs text-[var(--on-surface-variant)]">Sorted by severity</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {sorted.map(([key, val]) => {
                  const score = val as number;
                  const pct = score;
                  const barColor = score >= 70 ? "var(--success)" : score >= 40 ? "var(--warning)" : "var(--error)";
                  return (
                    <div key={key} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--surface-container-low)] transition-colors">
                      <div className="w-8 h-8 rounded-lg bg-[var(--surface-container-high)] flex items-center justify-center text-[var(--on-surface-variant)] shrink-0">
                        {CATEGORY_SVG[key] || CATEGORY_SVG.title}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold text-[var(--on-surface)] truncate">{CATEGORY_LABELS[key] || key}</span>
                          <span className="text-xs font-bold ml-2" style={{ color: scoreColorText(score) }}>{score}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--surface-container-high)] rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: barColor }} />
                        </div>
                        <span className="text-[10px] text-[var(--on-surface-variant)]">{CATEGORY_REVENUE_IMPACT[key]} impact</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CTA after demo */}
            <div className="text-center mt-8">
              <button
                type="button"
                onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="cursor-pointer primary-gradient text-white px-10 py-4 rounded-full font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-lg shadow-violet-600/20"
              >
                Scan Your Page Free →
              </button>
              <p className="text-sm text-[var(--on-surface-variant)] mt-3">See how your page compares to {SAMPLE_SCAN.brand}</p>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-16 sm:py-24 bg-[var(--surface-base)] anim-phase-enter" style={{ animationDelay: "200ms" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Three Steps. Zero Guesswork.</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16 relative">
              {[
                { num: "01", title: "Paste Your URL", desc: "Product page, store homepage, or any sales page. No code, no signup." },
                { num: "02", title: "Get 20 Scores", desc: "AI analyzes page speed, images, reviews, pricing, mobile UX, AI discoverability, and 14 more dimensions." },
                { num: "03", title: "Fix What Matters", desc: "Prioritized by revenue impact. Fix the red ones first. See the money come back." },
              ].map((s, i) => (
                <div key={s.num} className="relative" style={{ animation: `fade-in-up 500ms ease-out ${i * 120 + 100}ms both` }}>
                  <div className="text-[8rem] font-black text-[var(--brand)]/5 absolute -top-16 sm:-top-20 -left-2 sm:-left-4 pointer-events-none select-none" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>{s.num}</div>
                  <div className="relative z-10">
                    <h4 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[var(--on-surface)]">{s.title}</h4>
                    <p className="text-[var(--on-surface-variant)] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 sm:py-24 px-4 sm:px-8 anim-phase-enter" style={{ animationDelay: "300ms" }}>
          <div className="max-w-7xl mx-auto primary-gradient rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-24 text-center text-white relative overflow-hidden shadow-2xl">
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-white/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-6 sm:mb-8 tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                If {SAMPLE_SCAN.brand} leaks revenue,<br className="hidden sm:block" /> so does your page.
              </h2>
              <p className="text-lg sm:text-xl text-violet-100 mb-10 sm:mb-12 max-w-xl mx-auto">Find your 20 conversion leaks in 30 seconds. Free. No signup.</p>
              <button type="button" onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="cursor-pointer bg-white text-violet-600 px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg hover:bg-violet-50 transition-all hover:scale-105 active:scale-95">
                Scan Your Page Now
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-violet-50 border-t border-violet-100 w-full">
          <div className="flex flex-col md:flex-row justify-between items-center w-full px-4 sm:px-8 py-10 sm:py-12 gap-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <div className="text-lg font-bold text-violet-800" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
              <p className="text-slate-500 text-xs tracking-wide uppercase">© 2025 PageLeaks. All rights reserved.</p>
            </div>
            <div className="flex gap-6 sm:gap-8 text-xs tracking-wide uppercase">
              <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Privacy Policy</a>
              <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Terms of Service</a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

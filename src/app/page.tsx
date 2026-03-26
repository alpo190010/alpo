"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  LinkIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  LightningIcon,
  ClockIcon,
} from "@phosphor-icons/react";
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
      <nav className="fixed top-0 w-full z-50 backdrop-blur-xl" style={{ background: "color-mix(in srgb, var(--nav-bg) 80%, transparent)", boxShadow: "var(--nav-shadow)" }} aria-label="Main navigation">
        <div className="flex justify-between items-center w-full px-4 sm:px-8 py-4 max-w-screen-2xl mx-auto">
          <div className="text-2xl font-black tracking-tighter" style={{ color: "var(--nav-logo)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>alpo</div>
          <button
            type="button"
            onClick={() => document.getElementById("url-input")?.focus()}
            className="cursor-pointer primary-gradient text-white px-6 py-2 rounded-full font-bold hover:scale-105 active:scale-95 transition-all text-sm"
          >
            Scan Your Page
          </button>
        </div>
      </nav>

      <main id="main-content" className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="relative pt-32 sm:pt-40 pb-12 sm:pb-16 overflow-hidden anim-phase-enter">

          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10 text-center">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[var(--on-surface)] mb-8 leading-[1.1]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              Your product page is{" "}
              <br className="hidden md:block" />
              leaking <span className="text-[var(--error)]">revenue</span>
            </h1>

            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto mb-12">
              alpo.ai scans 20 conversion dimensions and shows you exactly where you lose sales. See for yourself.
            </p>

            {/* URL Input */}
            <form id="hero-form" onSubmit={handleSubmit} className="max-w-2xl mx-auto">
              <div className="flex flex-col sm:flex-row p-2 bg-[var(--surface-container-lowest)] rounded-full shadow-[var(--shadow-subtle)] border border-[var(--outline-variant)]/15 focus-within:border-[var(--brand)]/40 transition-all duration-300">
                <div className="hidden sm:flex items-center pl-6 pr-2 text-[var(--outline)]">
                  <LinkIcon size={20} weight="regular" />
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
                  className="cursor-pointer primary-gradient text-white px-8 sm:px-10 py-3.5 sm:py-4 rounded-full font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                >
                  {submitting ? "Loading..." : "Analyze Free"}
                  {!submitting && (
                    <ArrowRightIcon size={16} weight="bold" />
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
                <ShieldCheckIcon size={16} weight="fill" color="var(--brand)" />
                Free, No Signup
              </span>
              <span className="flex items-center gap-2">
                <LightningIcon size={16} weight="fill" color="var(--brand)" />
                20 Dimensions Scored
              </span>
              <span className="flex items-center gap-2">
                <ClockIcon size={16} weight="fill" color="var(--brand)" />
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

              <div className="md:col-span-4 rounded-3xl p-8 text-white flex flex-col justify-between" style={{ background: "var(--gradient-error)", animation: "fade-in-up 400ms ease-out 80ms both" }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Estimated Monthly Loss for This Product</p>
                  <div className="text-4xl sm:text-5xl font-extrabold" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                    -$2,800
                  </div>
                  <p className="text-sm opacity-70 mt-1">Based on ~10K monthly visitors to this listing</p>
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
                className="cursor-pointer primary-gradient text-white px-10 py-4 rounded-full font-bold text-lg hover:scale-105 active:scale-95 transition-all"
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
                    <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[var(--on-surface)]">{s.title}</h3>
                    <p className="text-[var(--on-surface-variant)] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 sm:py-24 px-4 sm:px-8 anim-phase-enter" style={{ animationDelay: "300ms" }}>
          <div className="max-w-7xl mx-auto primary-gradient rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 md:p-24 text-center text-white relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-6 sm:mb-8 tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
                If {SAMPLE_SCAN.brand} leaks revenue,<br className="hidden sm:block" /> so does your page.
              </h2>
              <p className="text-lg sm:text-xl mb-10 sm:mb-12 max-w-xl mx-auto" style={{ color: "var(--brand-on-dark)" }}>Find your 20 conversion leaks in 30 seconds. Free. No signup.</p>
              <button type="button" onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="cursor-pointer bg-white px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg transition-all hover:scale-105 active:scale-95" style={{ color: "var(--primary)" }}>
                Scan Your Page Now
              </button>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer style={{ background: "var(--nav-bg)", borderTop: "1px solid var(--outline-variant)" }} className="w-full">
          <div className="flex flex-col md:flex-row justify-between items-center w-full px-4 sm:px-8 py-10 sm:py-12 gap-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <div className="text-lg font-bold" style={{ color: "var(--primary-dim)", fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>alpo</div>
              <p className="text-slate-500 text-xs tracking-wide uppercase">© {new Date().getFullYear()} alpo.ai. All rights reserved.</p>
            </div>
            <div className="flex gap-6 sm:gap-8 text-xs tracking-wide uppercase">
              <span className="text-slate-500">Privacy Policy</span>
              <span className="text-slate-500">Terms of Service</span>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}


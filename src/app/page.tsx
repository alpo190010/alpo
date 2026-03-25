"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isValidUrl, isProductPageUrl, extractDomain } from "@/lib/analysis";

/* ── Category SVG icons ── */
const CATEGORY_SVG: Record<string, React.ReactNode> = {
  title: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 4v3h5.5v12h3V7H19V4H5z"/></svg>,
  pricing: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>,
  socialProof: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>,
  cta: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>,
  trust: <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>,
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
      // Product URL → straight to analysis
      router.push(`/analyze?url=${encodeURIComponent(validUrl)}`);
    } else {
      // Domain/collection → product listings
      const domain = extractDomain(validUrl) || validUrl;
      router.push(`/scan/${encodeURIComponent(domain)}`);
    }
  }, [url, submitting, router]);

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
            Start Analysis
          </button>
        </div>
      </nav>

      <main className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="relative pt-32 sm:pt-40 pb-16 sm:pb-24 overflow-hidden anim-phase-enter">
          <div className="absolute top-0 right-0 -z-10 w-1/2 h-full bg-gradient-to-l from-violet-200/30 to-transparent blur-3xl opacity-50 pointer-events-none" />
          <div className="absolute bottom-0 left-0 -z-10 w-1/3 h-2/3 bg-gradient-to-tr from-violet-100/30 to-transparent blur-3xl opacity-50 pointer-events-none" />

          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10 text-center">
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[var(--on-surface)] mb-8 leading-[1.1]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>
              Every month, your product page{" "}
              <br className="hidden md:block" />
              loses <span className="text-[var(--error)]">$1,000s</span> in sales
            </h1>

            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto mb-12">
              Stop guessing. PageLeaks scans your sales page for conversion killers and tells you exactly what to fix.
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
                  {submitting ? "Loading..." : "Analyze"}
                  {!submitting && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  )}
                </button>
              </div>
            </form>

            {/* Error */}
            {error && (
              <div className="max-w-2xl mx-auto mt-4 animate-[slide-down_300ms_ease-out_forwards]">
                <div id="url-error" className="p-4 rounded-xl text-sm border-l-4 bg-red-50 border-l-[var(--error)] border border-red-200" role="alert">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zM7 3v6h2V3H7zm0 8v2h2v-2H7z" fill="var(--error)"/></svg>
                    <span className="text-[var(--error)] font-medium">{error}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Trust indicators */}
            <div className="mt-8 flex flex-wrap justify-center gap-6 sm:gap-8 text-[var(--outline)] text-sm font-medium">
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
                No Credit Card Required
              </span>
              <span className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--brand)" aria-hidden="true"><path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13.01 3h1l-1 7h3.51c.4 0 .62.19.4.66C12.97 17.55 11 21 11 21z"/></svg>
                30-Second Analysis
              </span>
            </div>
          </div>
        </section>

        {/* ── 7 Leak Categories Bento Grid ── */}
        <section className="py-16 sm:py-24 bg-[var(--surface-container-low)] anim-phase-enter" style={{ animationDelay: "100ms" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="text-center mb-12 sm:mb-16">
              <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>7 Places Your Page Leaks Revenue</h2>
              <p className="text-[var(--on-surface-variant)] text-lg">Our engine identifies the friction points that drive users away.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6">
              <div className="md:col-span-8 bg-[var(--surface-container-lowest)] p-8 sm:p-10 rounded-[2rem] shadow-sm flex flex-col justify-between group hover:shadow-xl transition-shadow duration-500" style={{ animation: "fade-in-up 500ms ease-out 0ms both" }}>
                <div>
                  <div className="w-14 h-14 glass-card rounded-2xl flex items-center justify-center mb-8 shadow-sm text-[var(--on-surface-variant)]">{CATEGORY_SVG.title}</div>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-4 text-[var(--on-surface)]">Title, Images & First Impression</h3>
                  <p className="text-[var(--on-surface-variant)] text-lg leading-relaxed max-w-lg">Generic titles and poor imagery cause visitors to bounce in seconds. We analyze your above-the-fold content for conversion impact.</p>
                </div>
              </div>

              <div className="md:col-span-4 primary-gradient text-white p-8 sm:p-10 rounded-[2rem] shadow-lg flex flex-col justify-between overflow-hidden relative" style={{ animation: "fade-in-up 500ms ease-out 80ms both" }}>
                <div className="relative z-10">
                  <div className="w-14 h-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 text-white">{CATEGORY_SVG.pricing}</div>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-4">Pricing & Value</h3>
                  <p className="text-white/80 text-lg leading-relaxed">No anchoring, no urgency, no context. If your price just sits there, customers leave to &ldquo;think about it.&rdquo;</p>
                </div>
                <div className="absolute -bottom-10 -right-10 opacity-[0.06] pointer-events-none text-white">
                  <svg width="160" height="160" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>
                </div>
              </div>

              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 160ms both" }}>
                <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">{CATEGORY_SVG.socialProof}</div>
                <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">Social Proof</h4>
                <p className="text-[var(--on-surface-variant)]">Missing reviews or buried testimonials create immediate doubt. No trust = no purchase.</p>
              </div>
              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 240ms both" }}>
                <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">{CATEGORY_SVG.cta}</div>
                <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">CTA Clarity</h4>
                <p className="text-[var(--on-surface-variant)]">Weak or hidden Add to Cart buttons let ready buyers slip away at the final moment.</p>
              </div>
              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] p-7 sm:p-8 rounded-[2rem] shadow-sm hover:shadow-lg transition-all duration-300" style={{ animation: "fade-in-up 500ms ease-out 320ms both" }}>
                <div className="w-12 h-12 glass-card rounded-xl flex items-center justify-center mb-6 text-[var(--on-surface-variant)]">{CATEGORY_SVG.trust}</div>
                <h4 className="text-xl font-bold mb-2 text-[var(--on-surface)]">Trust & Copy</h4>
                <p className="text-[var(--on-surface-variant)]">Missing guarantees, poor descriptions, and no security badges create friction at checkout.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-16 sm:py-24 bg-[var(--surface-base)] anim-phase-enter" style={{ animationDelay: "200ms" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 sm:mb-20 gap-6">
              <div className="max-w-xl">
                <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Three Steps to More Sales</h2>
                <p className="text-[var(--on-surface-variant)] text-lg">Stop losing money and start optimizing with precision.</p>
              </div>
              <div className="hidden md:block h-px bg-violet-100 flex-1 mx-12 mb-5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12 sm:gap-16 relative">
              {[
                { num: "01", title: "Input Your URL", desc: "Simply paste your sales or product page link. No code installation required." },
                { num: "02", title: "Deep AI Scan", desc: "Our AI analyzes 7 conversion factors — title, images, pricing, reviews, CTA, copy, and trust." },
                { num: "03", title: "Execute Fixes", desc: "Get a prioritized list of high-impact changes with estimated revenue impact for each." },
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
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-6 sm:mb-8 tracking-tight" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>Ready to stop the leak?</h2>
              <p className="text-lg sm:text-xl text-violet-100 mb-10 sm:mb-12 max-w-xl mx-auto">Find your conversion killers in 30 seconds. Free. No signup required.</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6">
                <button type="button" onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="cursor-pointer bg-white text-violet-600 px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg hover:bg-violet-50 transition-all hover:scale-105 active:scale-95">
                  Get Your Free Audit
                </button>
                <button type="button" onClick={() => { document.getElementById("url-input")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="cursor-pointer bg-white/10 backdrop-blur-md border border-white/20 px-10 sm:px-12 py-4 sm:py-5 rounded-full font-bold text-lg hover:bg-white/20 transition-all">
                  Learn More
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-violet-50 border-t border-violet-100 w-full">
          <div className="flex flex-col md:flex-row justify-between items-center w-full px-4 sm:px-8 py-10 sm:py-12 gap-6 max-w-7xl mx-auto">
            <div className="flex flex-col gap-1 text-center md:text-left">
              <div className="text-lg font-bold text-violet-800" style={{ fontFamily: "var(--font-manrope), Manrope, sans-serif" }}>PageLeaks</div>
              <p className="text-slate-500 text-xs tracking-wide uppercase">© 2024 PageLeaks. All rights reserved.</p>
            </div>
            <div className="flex gap-6 sm:gap-8 text-xs tracking-wide uppercase">
              <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Privacy Policy</a>
              <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Terms of Service</a>
              <a className="cursor-pointer text-slate-500 hover:text-violet-600 transition-colors" href="#">Support</a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}

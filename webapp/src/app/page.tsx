import {
  ShieldCheckIcon,
  LightningIcon,
  ClockIcon,
} from "@phosphor-icons/react/dist/ssr";
import { SAMPLE_SCAN } from "@/lib/sample-data";
import HeroForm from "./_components/HeroForm";
import HeroScanAnimation from "./_components/HeroScanAnimation";
import ScrollToCTA from "./_components/ScrollToCTA";
import DemoGrid from "./_components/DemoGrid";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <main id="main-content" className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="relative pt-16 sm:pt-24 pb-12 sm:pb-16 overflow-hidden anim-phase-enter">

          <div className="max-w-7xl mx-auto px-4 sm:px-8 relative z-10">
            <div className="grid lg:grid-cols-2 gap-12 items-start lg:pt-8">
              {/* Left: existing content, centered on mobile, left-aligned on lg+ */}
              <div className="text-center lg:text-left">
                <h1 className="font-display text-4xl sm:text-6xl md:text-7xl lg:text-6xl xl:text-7xl font-extrabold tracking-tight text-[var(--on-surface)] mb-8 leading-[1.1]">
                  Your product page is{" "}
                  <br className="hidden md:block lg:hidden xl:block" />
                  leaking <span className="text-[var(--error)]">revenue</span>
                </h1>

                <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto lg:mx-0 mb-12">
                  alpo.ai analyzes your product page&apos;s social proof and shows you exactly where you lose sales. See for yourself.
                </p>

                {/* URL Input — client component with all hooks */}
                <div className="max-w-2xl mx-auto lg:mx-0">
                  <HeroForm />
                </div>

                <div className="mt-8 flex flex-wrap justify-center lg:justify-start gap-6 sm:gap-8 text-[var(--outline)] text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <ShieldCheckIcon size={16} weight="fill" color="var(--brand)" />
                    3 Free Scans
                  </span>
                  <span className="flex items-center gap-2">
                    <LightningIcon size={16} weight="fill" color="var(--brand)" />
                    Social Proof Scored
                  </span>
                  <span className="flex items-center gap-2">
                    <ClockIcon size={16} weight="fill" color="var(--brand)" />
                    Results in 30 Seconds
                  </span>
                </div>
              </div>

              {/* Right: scan animation, desktop only */}
              <div className="hidden lg:block">
                <HeroScanAnimation />
              </div>
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
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-[var(--on-surface)]">
                We scanned <span className="text-[var(--brand)]">Gymshark</span>. Here&apos;s what we found.
              </h2>
              <p className="text-[var(--on-surface-variant)] mt-3 text-lg">Even billion-dollar brands have conversion leaks. Imagine what yours has.</p>
            </div>

            {/* Score + Summary */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-6">
              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] rounded-2xl p-8 text-center flex flex-col items-center justify-center" style={{ animation: "fade-in-up 400ms var(--ease-out-quart) both" }}>
                <p className="text-xs font-bold text-[var(--on-surface-variant)] uppercase tracking-wider mb-2">Overall Score</p>
                <div className="font-display text-7xl font-extrabold" style={{ color: "var(--warning-text)" }}>
                  {SAMPLE_SCAN.score}<span className="text-2xl text-[var(--on-surface-variant)]">/100</span>
                </div>
                <p className="text-sm text-[var(--on-surface-variant)] mt-2 font-medium">{SAMPLE_SCAN.brand} Arrival 5&quot; Shorts</p>
                <div className="mt-3 px-3 py-1 rounded-full bg-[var(--warning-light)] text-[var(--warning-text)] text-xs font-bold">
                  Needs Improvement
                </div>
              </div>

              <div className="md:col-span-4 rounded-2xl p-8 text-white flex flex-col justify-between" style={{ background: "var(--gradient-error)", animation: "fade-in-up 400ms var(--ease-out-quart) 80ms both" }}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider opacity-70 mb-1">Estimated Monthly Loss for This Product</p>
                  <div className="font-display text-4xl sm:text-5xl font-extrabold">
                    -$2,800
                  </div>
                  <p className="text-sm opacity-70 mt-1">Based on ~10K monthly visitors to this listing</p>
                </div>
                <p className="text-sm opacity-80 mt-4">3 critical dimensions scoring below 20/100</p>
              </div>

              <div className="md:col-span-4 bg-[var(--surface-container-lowest)] rounded-2xl p-8" style={{ animation: "fade-in-up 400ms var(--ease-out-quart) 160ms both" }}>
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

            {/* All 20 dimension scores — client component (uses CATEGORY_SVG with Phosphor icons) */}
            <DemoGrid />

            {/* CTA after demo */}
            <div className="text-center mt-8">
              <ScrollToCTA
                variant="primary"
                size="lg"
                shape="pill"
                className="px-10 text-lg"
              >
                Try Free →
              </ScrollToCTA>
              <p className="text-sm text-[var(--on-surface-variant)] mt-3">See how your page compares to {SAMPLE_SCAN.brand}</p>
            </div>
          </div>
        </section>

        {/* ── How It Works ── */}
        <section className="py-16 sm:py-24 bg-[var(--surface-base)] anim-phase-enter" style={{ animationDelay: "200ms" }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <div className="text-center mb-16">
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold mb-4 text-[var(--on-surface)]">Three Steps. Zero Guesswork.</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-10 md:gap-12 lg:gap-16 relative">
              {[
                { num: "01", title: "Paste Your URL", desc: "Product page, store homepage, or any sales page. No code required." },
                { num: "02", title: "Get Your Score", desc: "AI analyzes reviews, ratings, UGC, and social proof signals on your product page." },
                { num: "03", title: "Fix What Matters", desc: "Prioritized by revenue impact. Fix the red ones first. See the money come back." },
              ].map((s, i) => (
                <div key={s.num} className="relative" style={{ animation: `fade-in-up 500ms var(--ease-out-quart) ${i * 120 + 100}ms both` }}>
                  <div className="font-display text-[8rem] font-black text-[var(--brand)]/5 absolute -top-16 sm:-top-20 -left-2 sm:-left-4 pointer-events-none select-none">{s.num}</div>
                  <div className="relative z-10">
                    <h3 className="font-display text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-[var(--on-surface)]">{s.title}</h3>
                    <p className="text-[var(--on-surface-variant)] leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="py-16 sm:py-24 px-4 sm:px-8 anim-phase-enter" style={{ animationDelay: "300ms" }}>
          <div className="max-w-7xl mx-auto primary-gradient rounded-2xl sm:rounded-2xl p-8 sm:p-12 md:p-24 text-center text-white relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="font-display text-3xl sm:text-4xl md:text-6xl font-extrabold mb-6 sm:mb-8 tracking-tight">
                If {SAMPLE_SCAN.brand} leaks revenue,<br className="hidden sm:block" /> so does your page.
              </h2>
              <p className="text-lg sm:text-xl mb-10 sm:mb-12 max-w-xl mx-auto" style={{ color: "var(--brand-on-dark)" }}>Find your social proof leaks in 30 seconds. 3 free scans. No signup.</p>
              <ScrollToCTA
                variant="secondary"
                size="lg"
                shape="pill"
                className="bg-white px-10 sm:px-12 py-4 sm:py-5 text-lg"
                style={{ color: "var(--primary)" }}
              >
                Scan Your Page Now
              </ScrollToCTA>
            </div>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}

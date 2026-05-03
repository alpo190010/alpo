import Footer from "@/components/Footer";
import PricingPlans from "./_components/PricingPlans";

export const metadata = {
  title: "Pricing — alpo.ai",
  description:
    "Score your product pages free. $79/yr unlocks the diagnosis, $149/yr adds the step-by-step fix playbook. One store, no auto-renewal.",
};

export default function PricingPage() {
  return (
    <>
      <main id="main-content" className="min-h-screen bg-[var(--bg)]">
        {/* ── Hero ── */}
        <section className="pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-8">
            <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-[var(--on-surface)] mb-4 leading-[1.1]">
              Simple, transparent pricing
            </h1>
            <p className="text-lg sm:text-xl text-[var(--on-surface-variant)] max-w-2xl mx-auto">
              Score your product pages for free. Unlock the fixes when you&apos;re ready.
            </p>
          </div>
        </section>

        {/* ── Tiers + Toggle (client island) ── */}
        <PricingPlans />

        {/* ── FAQ / Trust ── */}
        <section className="py-16 sm:py-20 bg-[var(--surface-container-low)]">
          <div className="max-w-3xl mx-auto px-4 sm:px-8 text-center">
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[var(--on-surface)] mb-4">
              Questions?
            </h2>
            <p className="text-[var(--on-surface-variant)] mb-4 text-lg">
              <strong>What do I get on Free?</strong> Per-dimension scores so you know where you&apos;re losing revenue. Detailed analysis and fix recommendations are blurred until you upgrade.
            </p>
            <p className="text-[var(--on-surface-variant)] mb-4 text-lg">
              <strong>What&apos;s the difference between Insights and Fixes?</strong> Insights ($79/yr) tells you what&apos;s working and what&apos;s broken in detail. Fixes ($149/yr) adds the specific steps and code to repair each issue.
            </p>
            <p className="text-[var(--on-surface-variant)] mb-4 text-lg">
              <strong>Is this a subscription?</strong> No. Both Insights and Fixes are one-time annual purchases. After the year, you re-purchase to keep access.
            </p>
            <p className="text-[var(--on-surface-variant)] text-lg">
              <strong>What if I want fixes for more stores?</strong> Each tier covers one store. Scan unlimited products inside that store. Email us if you need a second store.
            </p>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}

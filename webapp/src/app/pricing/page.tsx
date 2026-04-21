import Footer from "@/components/Footer";
import PricingPlans from "./_components/PricingPlans";

export const metadata = {
  title: "Pricing — alpo.ai",
  description: "Simple plans: free scoring, unlimited scans on Starter, AI auto-fix on Pro.",
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
              <strong>What do I get on the free plan?</strong> Three scans per calendar month, full 18-dimension scoring, and revenue leak estimates. Fix recommendations are reserved for Starter and Pro.
            </p>
            <p className="text-[var(--on-surface-variant)] mb-4 text-lg">
              <strong>Can I cancel anytime?</strong> Yes — cancel or change your subscription from the customer portal any time; access stays active until the end of your current billing period.
            </p>
            <p className="text-[var(--on-surface-variant)] text-lg">
              <strong>When does Pro launch?</strong> Join the waitlist on the Pro card above and we&apos;ll email you the moment AI auto-fix ships.
            </p>
          </div>
        </section>

        <Footer />
      </main>
    </>
  );
}

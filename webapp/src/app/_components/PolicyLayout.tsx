import type { ReactNode } from "react";
import Footer from "@/components/Footer";

/**
 * Shared shell for legal policy pages (Terms / Privacy / Refund).
 * Keeps each page focused on the prose while giving them a single
 * consistent heading + typography treatment.
 */
export default function PolicyLayout({
  title,
  effectiveDate,
  children,
}: {
  title: string;
  effectiveDate: string;
  children: ReactNode;
}) {
  return (
    <>
      <main id="main-content" className="min-h-screen bg-[var(--bg)]">
        <section className="pt-16 sm:pt-24 pb-8 text-center">
          <div className="max-w-3xl mx-auto px-4 sm:px-8">
            <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[var(--on-surface)] mb-3 leading-[1.1]">
              {title}
            </h1>
            <p className="text-sm text-[var(--on-surface-variant)]">
              Effective {effectiveDate}
            </p>
          </div>
        </section>

        <section className="pb-16 sm:pb-24">
          <article
            className="max-w-3xl mx-auto px-4 sm:px-8 text-[var(--on-surface)] text-[15px] leading-relaxed
              [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-extrabold [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:tracking-tight
              [&_h3]:font-display [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-6 [&_h3]:mb-2
              [&_p]:mb-4 [&_p]:text-[var(--on-surface-variant)]
              [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:text-[var(--on-surface-variant)] [&_ul>li]:mb-1
              [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:text-[var(--on-surface-variant)] [&_ol>li]:mb-1
              [&_a]:text-[var(--brand)] [&_a]:underline [&_a]:underline-offset-2
              [&_strong]:text-[var(--on-surface)] [&_strong]:font-semibold"
          >
            {children}
          </article>
        </section>

        <Footer />
      </main>
    </>
  );
}

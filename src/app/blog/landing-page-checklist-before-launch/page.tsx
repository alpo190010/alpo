import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Landing Page Checklist: 15 Things to Check Before You Launch | PageScore",
  description:
    "A practical pre-launch checklist for landing pages. Covers copy, design, SEO, mobile, speed, trust signals, and more. Free AI scoring tool included.",
  keywords: [
    "landing page checklist",
    "pre-launch checklist",
    "landing page review",
    "conversion checklist",
    "launch checklist website",
    "landing page optimization checklist",
  ],
};

export default function LandingPageChecklistPage() {
  return (
    <main className="min-h-screen px-4 pt-24 pb-16 max-w-2xl mx-auto">
      <article>
        <p className="text-xs text-[var(--muted)] mb-2">March 22, 2026 · 6 min read</p>
        <h1 className="text-3xl font-bold mb-6">
          Landing Page Checklist: 15 Things to Check Before You Launch
        </h1>

        <p className="text-[var(--muted)] mb-6">
          I&apos;ve launched enough landing pages to know that the stuff you forget
          is usually the stuff that kills your conversion rate. Not the big strategic
          decisions — those you agonize over. It&apos;s the small things. The missing
          meta description. The CTA that says &quot;Submit.&quot; The form that
          doesn&apos;t work on Safari.
        </p>
        <p className="text-[var(--muted)] mb-6">
          So I made myself a checklist. I run through it every time before I push
          a landing page live. It&apos;s saved me from embarrassing mistakes more
          times than I&apos;d like to admit.
        </p>

        <h2 className="text-xl font-bold mb-3 mt-10">Copy & Messaging</h2>

        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">1. Headline states one clear outcome</h3>
            <p className="text-sm text-[var(--muted)]">
              Your visitor should read the headline and immediately know what problem
              you solve. &quot;The future of X&quot; doesn&apos;t count. &quot;Save 4 hours/week
              on invoicing&quot; does. If you can&apos;t explain the value in under 10 words,
              your headline is too vague.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">2. Subhead explains how, not just what</h3>
            <p className="text-sm text-[var(--muted)]">
              The headline says what you do. The subhead should say how or why it&apos;s
              different. &quot;AI-powered invoice scanning that auto-categorizes expenses
              and syncs to QuickBooks&quot; — now I get it.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">3. CTA button text is specific</h3>
            <p className="text-sm text-[var(--muted)]">
              &quot;Get Started&quot; is lazy. &quot;Start Free Trial&quot; tells me what happens next.
              &quot;Scan My Page Free&quot; tells me what happens and that it costs nothing.
              The more specific your button text, the less anxiety about clicking it.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">4. No jargon in the first screen</h3>
            <p className="text-sm text-[var(--muted)]">
              Everything above the fold should be readable by someone who&apos;s never
              heard of your product category. Save the technical terms for the
              features section below.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3 mt-10">Design & UX</h2>

        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">5. Primary CTA is visible without scrolling</h3>
            <p className="text-sm text-[var(--muted)]">
              On both desktop and mobile. I&apos;ve seen pages where the CTA is above
              the fold on a 27-inch monitor but below it on a laptop. Test on a
              13-inch screen or just check at 1366x768.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">6. CTA button has enough contrast</h3>
            <p className="text-sm text-[var(--muted)]">
              Your call-to-action should be the most visually prominent thing on
              the page. If it blends into the background or matches other buttons,
              you&apos;re losing clicks. Squint test: blur your eyes and see if the
              CTA still pops.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">7. Remove or minimize navigation</h3>
            <p className="text-sm text-[var(--muted)]">
              Every nav link is a potential exit. If this is a campaign landing page,
              strip the nav entirely. If it&apos;s your homepage doubling as a landing
              page, at least simplify it to 3-4 items max.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3 mt-10">Trust & Social Proof</h2>

        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">8. Social proof near the CTA</h3>
            <p className="text-sm text-[var(--muted)]">
              Testimonials, customer logos, or usage numbers should sit close to
              your signup form or buy button. That&apos;s where doubt kicks in —
              that&apos;s where proof needs to be.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">9. Testimonials use real names and specifics</h3>
            <p className="text-sm text-[var(--muted)]">
              &quot;Great product!&quot; — Anonymous is worthless. &quot;Cut our onboarding time
              from 3 days to 4 hours&quot; — Sarah K., Head of Ops at Acme. That&apos;s
              the difference between decoration and persuasion.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3 mt-10">Technical & SEO</h2>

        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">10. Page loads in under 3 seconds</h3>
            <p className="text-sm text-[var(--muted)]">
              Run Lighthouse. Check your LCP (Largest Contentful Paint). If your
              hero image is a 4MB uncompressed PNG, you&apos;re losing visitors before
              they even see your headline. Compress, lazy-load, use WebP.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">11. Meta title and description are set</h3>
            <p className="text-sm text-[var(--muted)]">
              Check how your page looks when shared on Google, Twitter, LinkedIn.
              If the preview is &quot;Next.js App&quot; or blank, you forgot to set your
              meta tags. Takes 2 minutes to fix, looks amateur if you don&apos;t.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">12. OG image is set and looks good</h3>
            <p className="text-sm text-[var(--muted)]">
              When someone shares your link, the preview image matters. Make a
              custom OG image (1200x630px) that shows your value prop and looks
              professional. Default screenshots look terrible.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">13. Works on mobile</h3>
            <p className="text-sm text-[var(--muted)]">
              Actually test it. On a real phone, not just Chrome DevTools. Check
              that forms work, buttons are tappable, text doesn&apos;t overflow, and
              nothing is hidden behind the notch.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3 mt-10">Conversion Safety Net</h2>

        <div className="space-y-4 mb-8">
          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">14. Analytics is tracking</h3>
            <p className="text-sm text-[var(--muted)]">
              Before you drive any traffic: verify your analytics fires on page
              load and on key actions (signup, purchase, CTA click). I&apos;ve run
              paid ads for 3 days before realizing my conversion tracking was
              broken. Don&apos;t be me.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-[var(--card)] border border-[var(--border)]">
            <h3 className="font-semibold mb-1">15. Test the full flow yourself</h3>
            <p className="text-sm text-[var(--muted)]">
              Go through the entire journey as a user. Click the CTA. Fill in the
              form. Complete the purchase. Check the confirmation email. If any step
              feels clunky or breaks, fix it before you send traffic. The number of
              times I&apos;ve found broken Stripe webhooks at this step is embarrassing.
            </p>
          </div>
        </div>

        <h2 className="text-xl font-bold mb-3 mt-10">The Meta-Tip</h2>
        <p className="text-[var(--muted)] mb-6">
          Checklists are good. But the fastest way to catch issues is to get a
          second pair of eyes on your page — even if that second pair is AI. I
          built PageScore because I kept missing the same stuff on my own pages.
          It catches things I overlook when I&apos;m too close to the product.
        </p>

        <div className="mt-10 p-6 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
          <h3 className="text-lg font-bold mb-2">
            Run your page through the checklist automatically
          </h3>
          <p className="text-[var(--muted)] text-sm mb-4">
            PageScore checks your landing page across 10 categories — copy,
            SEO, design, mobile, speed, trust signals, and more. Free scan
            in 30 seconds, no signup.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition"
          >
            Score My Landing Page →
          </Link>
        </div>
      </article>
    </main>
  );
}

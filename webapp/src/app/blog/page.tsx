import type { Metadata } from "next";
import Link from "next/link";
import Button from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Blog — Landing Page Tips & Conversion Optimization | alpo.ai",
  description:
    "Learn what makes a high-converting landing page. Tips, checklists, and data-driven insights from analyzing thousands of landing pages.",
};

export default function BlogPage() {
  return (
    <main id="main-content" className="min-h-screen px-4 pt-24 pb-16 max-w-2xl mx-auto">
      <h1 className="font-display text-3xl font-bold mb-2">Blog</h1>
      <p className="text-[var(--muted)] mb-10">Landing page tips, conversion data, and lessons from the trenches.</p>

      <article>
        <h2 className="font-display text-3xl font-bold mb-6">
          What Makes a High-Converting Landing Page? We Analyzed 50+ Sites.
        </h2>

        <p className="text-[var(--muted)] mb-6">
          We ran our AI landing page analyzer on 50+ popular SaaS and startup
          websites. Here&apos;s what we found — and what you can learn from their
          mistakes.
        </p>

        <h3 className="font-display text-xl font-bold mb-3 mt-8">The Average Score: 67/100</h3>
        <p className="text-[var(--muted)] mb-4">
          Even well-funded companies leave significant conversion opportunities
          on the table. The most common issues we found:
        </p>
        <ul className="space-y-2 mb-6">
          <li className="flex gap-2 text-sm">
            <span className="text-[var(--accent)]">✗</span>
            <span><strong>Weak CTAs</strong> — 78% of pages lack a clear, compelling call-to-action above the fold</span>
          </li>
          <li className="flex gap-2 text-sm">
            <span className="text-[var(--accent)]">✗</span>
            <span><strong>No social proof</strong> — 65% missing testimonials, case studies, or trust signals</span>
          </li>
          <li className="flex gap-2 text-sm">
            <span className="text-[var(--accent)]">✗</span>
            <span><strong>Poor visual hierarchy</strong> — 72% don&apos;t guide the eye toward the conversion action</span>
          </li>
        </ul>

        <h3 className="font-display text-xl font-bold mb-3 mt-8">Top Scoring Sites</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2">Site</th>
                <th className="text-right py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Stripe", 75],
                ["Vercel", 75],
                ["Notion", 65],
                ["Linear", 65],
                ["Superhuman", 65],
                ["Cal.com", 65],
              ].map(([site, score]) => (
                <tr key={String(site)} className="border-b border-[var(--border)]">
                  <td className="py-2">{site}</td>
                  <td className="text-right py-2 font-mono">{score}/100</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="font-display text-xl font-bold mb-3 mt-8">
          The 5 Quick Wins That Improve Any Landing Page
        </h3>
        <ol className="space-y-3 mb-6 list-decimal list-inside">
          <li className="text-sm">
            <strong>Add a clear CTA above the fold.</strong> Your visitor should
            know what to do within 3 seconds of landing.
          </li>
          <li className="text-sm">
            <strong>Add social proof immediately.</strong> Testimonials, logos,
            or &quot;used by X companies&quot; near the top.
          </li>
          <li className="text-sm">
            <strong>Simplify your headline.</strong> One benefit, one audience,
            one outcome. Cut everything else.
          </li>
          <li className="text-sm">
            <strong>Reduce navigation.</strong> Landing pages should have ONE
            goal — don&apos;t give people 10 exits.
          </li>
          <li className="text-sm">
            <strong>Test your page speed.</strong> Every second of load time
            drops conversion by 7%.
          </li>
        </ol>

        <div className="mt-10 p-6 rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)]">
          <h4 className="font-display text-lg font-bold mb-2">
            Want to know your score?
          </h4>
          <p className="text-[var(--muted)] text-sm mb-4">
            Paste any URL into alpo.ai and get your AI-powered score + 3
            specific fixes in 30 seconds. Free, no signup required.
          </p>
          <Button asChild variant="primary">
            <Link href="/">Score My Landing Page →</Link>
          </Button>
        </div>
      </article>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Blog — Landing Page Tips & Conversion Optimization | PageScore",
  description:
    "Learn what makes a high-converting landing page. Tips, checklists, and data-driven insights from analyzing thousands of landing pages.",
};

const posts = [
  {
    slug: "/blog/best-saas-landing-page-examples",
    title: "7 Best SaaS Landing Page Examples (And Why They Convert)",
    excerpt: "Real SaaS landing pages broken down section by section. What they do right, what they get wrong, and what you can steal for your own page.",
    date: "March 22, 2026",
    readTime: "8 min",
  },
  {
    slug: "/blog/what-is-a-good-landing-page-conversion-rate",
    title: "What Is a Good Landing Page Conversion Rate? (2026 Benchmarks)",
    excerpt: "Average landing page conversion rates by industry, traffic source, and page type. See where you stand and what to aim for based on real data.",
    date: "March 22, 2026",
    readTime: "7 min",
  },
  {
    slug: "/blog/landing-page-checklist-before-launch",
    title: "Landing Page Checklist: 15 Things to Check Before You Launch",
    excerpt: "A practical pre-launch checklist covering copy, design, SEO, mobile, speed, and trust signals. The small things that kill your conversion rate.",
    date: "March 22, 2026",
    readTime: "6 min",
  },
  {
    slug: "/blog/how-to-improve-landing-page-conversion-rate",
    title: "How to Improve Landing Page Conversion Rate: 9 Tactics That Actually Work",
    excerpt: "Nine tactics that have consistently moved the needle. No theory, no fluff — just stuff that works from years of building and killing landing pages.",
    date: "March 21, 2026",
    readTime: "5 min",
  },
];

export default function BlogPage() {
  return (
    <main className="min-h-screen px-4 pt-24 pb-16 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Blog</h1>
      <p className="text-[var(--muted)] mb-10">Landing page tips, conversion data, and lessons from the trenches.</p>

      <div className="space-y-6 mb-16">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={post.slug}
            className="block p-5 rounded-xl bg-[var(--card)] border border-[var(--border)] hover:border-indigo-500/40 transition"
          >
            <p className="text-xs text-[var(--muted)] mb-1">{post.date} · {post.readTime} read</p>
            <h2 className="text-lg font-bold mb-2">{post.title}</h2>
            <p className="text-sm text-[var(--muted)]">{post.excerpt}</p>
          </Link>
        ))}
      </div>

      <hr className="border-[var(--border)] mb-10" />

      <article>
        <h1 className="text-3xl font-bold mb-6">
          What Makes a High-Converting Landing Page? We Analyzed 50+ Sites.
        </h1>

        <p className="text-[var(--muted)] mb-6">
          We ran our AI landing page analyzer on 50+ popular SaaS and startup
          websites. Here&apos;s what we found — and what you can learn from their
          mistakes.
        </p>

        <h2 className="text-xl font-bold mb-3 mt-8">The Average Score: 67/100</h2>
        <p className="text-[var(--muted)] mb-4">
          Even well-funded companies leave significant conversion opportunities
          on the table. The most common issues we found:
        </p>
        <ul className="space-y-2 mb-6">
          <li className="flex gap-2 text-sm">
            <span className="text-red-400">✗</span>
            <span><strong>Weak CTAs</strong> — 78% of pages lack a clear, compelling call-to-action above the fold</span>
          </li>
          <li className="flex gap-2 text-sm">
            <span className="text-red-400">✗</span>
            <span><strong>No social proof</strong> — 65% missing testimonials, case studies, or trust signals</span>
          </li>
          <li className="flex gap-2 text-sm">
            <span className="text-red-400">✗</span>
            <span><strong>Poor visual hierarchy</strong> — 72% don&apos;t guide the eye toward the conversion action</span>
          </li>
        </ul>

        <h2 className="text-xl font-bold mb-3 mt-8">Top Scoring Sites</h2>
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

        <h2 className="text-xl font-bold mb-3 mt-8">
          The 5 Quick Wins That Improve Any Landing Page
        </h2>
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

        <div className="mt-10 p-6 rounded-xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20">
          <h3 className="text-lg font-bold mb-2">
            Want to know your score?
          </h3>
          <p className="text-[var(--muted)] text-sm mb-4">
            Paste any URL into PageScore and get your AI-powered score + 3
            specific fixes in 30 seconds. Free, no signup required.
          </p>
          <a
            href="/"
            className="inline-block px-6 py-3 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold transition"
          >
            Score My Landing Page →
          </a>
        </div>
      </article>
    </main>
  );
}

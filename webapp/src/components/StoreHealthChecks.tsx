"use client";

import { CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import type { DimensionCheck } from "@/lib/analysis";

/* ══════════════════════════════════════════════════════════════
   StoreHealthChecks — "What's working / What's missing" list for
   one store-wide dimension. Reads from `storeAnalysis.checks[key]`
   attached by the backend rubric `list_*_checks` helpers.

   Renders two sections (both visible):
     • What's working (N)  — green CheckCircle + dimmed label
     • What's missing (N)  — red XCircle + bolder label + weight badge,
                              sorted by weight descending

   Hidden entirely when no checks exist (pre-migration data or gated
   dimensions that emit an empty list).
   ══════════════════════════════════════════════════════════════ */

interface StoreHealthChecksProps {
  checks: DimensionCheck[] | undefined;
}

export default function StoreHealthChecks({ checks }: StoreHealthChecksProps) {
  if (!checks || checks.length === 0) return null;

  const passing = checks.filter((c) => c.passed);
  const missing = checks
    .filter((c) => !c.passed)
    .slice()
    .sort((a, b) => b.weight - a.weight);

  return (
    <section className="flex flex-col gap-4" aria-label="Dimension audit">
      {passing.length > 0 && (
        <ChecksGroup
          heading="What's working"
          count={passing.length}
          tone="pass"
          items={passing}
        />
      )}
      {missing.length > 0 && (
        <ChecksGroup
          heading="What's missing"
          count={missing.length}
          tone="fail"
          items={missing}
        />
      )}
    </section>
  );
}

/* ── One pass/fail group ────────────────────────────────────── */
function ChecksGroup({
  heading,
  count,
  tone,
  items,
}: {
  heading: string;
  count: number;
  tone: "pass" | "fail";
  items: DimensionCheck[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3
        className="font-mono text-[10px] font-bold uppercase flex items-center gap-1.5"
        style={{ color: "var(--ink-3)", letterSpacing: "0.14em" }}
      >
        <span>{heading}</span>
        <span
          className="font-display text-[11px] tabular-nums"
          style={{ color: "var(--ink-2)" }}
        >
          ({count})
        </span>
      </h3>
      <ul
        className="flex flex-col rounded-[14px] border overflow-hidden list-none p-0"
        style={{
          background: "var(--paper)",
          borderColor: "var(--rule-2)",
        }}
      >
        {items.map((item, i) => (
          <CheckRow
            key={item.id}
            item={item}
            tone={tone}
            isLast={i === items.length - 1}
          />
        ))}
      </ul>
    </div>
  );
}

/* ── Severity derived from check weight ─────────────────────── */
type Severity = "critical" | "major" | "minor";

function severityFor(weight: number): Severity {
  if (weight >= 15) return "critical";
  if (weight >= 7) return "major";
  return "minor";
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  major: "Major",
  minor: "Minor",
};

function severityColors(severity: Severity): { bg: string; fg: string } {
  switch (severity) {
    case "critical":
      return { bg: "var(--error-light)", fg: "var(--error-text)" };
    case "major":
      return { bg: "var(--warning-light)", fg: "var(--warning-text)" };
    case "minor":
      return { bg: "var(--bg-elev)", fg: "var(--ink-3)" };
  }
}

/* ── Single check row ───────────────────────────────────────── */
function CheckRow({
  item,
  tone,
  isLast,
}: {
  item: DimensionCheck;
  tone: "pass" | "fail";
  isLast: boolean;
}) {
  const iconColor =
    tone === "pass" ? "var(--success-text)" : "var(--error-text)";
  const labelColor = tone === "pass" ? "var(--ink-2)" : "var(--ink)";
  const labelWeight = tone === "pass" ? 500 : 600;
  const severity = severityFor(item.weight);
  const sevColors = severityColors(severity);

  return (
    <li
      className="flex items-start gap-3 px-4 py-3"
      style={{
        borderBottom: isLast ? "none" : "1px solid var(--rule-2)",
      }}
    >
      <span className="shrink-0 mt-0.5" aria-hidden>
        {tone === "pass" ? (
          <CheckCircleIcon size={18} weight="fill" color={iconColor} />
        ) : (
          <XCircleIcon size={18} weight="fill" color={iconColor} />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div
          className="text-[13.5px] leading-[1.4]"
          style={{ color: labelColor, fontWeight: labelWeight }}
        >
          {item.label}
        </div>
        {item.detail && (
          <p
            className="text-[12px] leading-[1.45] mt-0.5"
            style={{ color: "var(--ink-3)" }}
          >
            {item.detail}
          </p>
        )}
      </div>
      {tone === "fail" && (
        <span
          className="shrink-0 font-mono font-bold text-[10px] px-2 py-0.5 rounded-md"
          style={{
            background: sevColors.bg,
            color: sevColors.fg,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
          aria-label={`${SEVERITY_LABEL[severity]} severity`}
        >
          {SEVERITY_LABEL[severity]}
        </span>
      )}
    </li>
  );
}

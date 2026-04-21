import {
  CheckCircleIcon,
  CircleIcon,
  CircleNotchIcon,
} from "@phosphor-icons/react/dist/ssr";

type Tier = "good" | "mid" | "bad";

const DIMENSIONS: { label: string; score: number; tier: Tier }[] = [
  { label: "Social Proof", score: 7, tier: "good" },
  { label: "Trust Signals", score: 9, tier: "good" },
  { label: "Conversion Copy", score: 6, tier: "mid" },
  { label: "Visuals", score: 8, tier: "good" },
  { label: "Pricing", score: 5, tier: "mid" },
];

const TIER_COLOR: Record<Tier, string> = {
  good: "var(--success)",
  mid: "var(--warning)",
  bad: "var(--accent)",
};

export default function HeroScanAnimation() {
  return (
    <div
      aria-hidden="true"
      className="relative isolate rounded-2xl border border-[var(--outline-variant)] bg-[var(--surface-container-lowest)] shadow-[var(--shadow-subtle)] overflow-hidden"
    >
      {/* URL bar — gives the whole thing a "live page" feel */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--outline-variant)] bg-[var(--surface-container-low)]">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--outline-variant)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--outline-variant)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--outline-variant)]" />
        <span className="ml-3 flex-1 truncate rounded-md bg-[var(--surface-container-lowest)] border border-[var(--outline-variant)] px-3 py-1 text-xs text-[var(--on-surface-variant)] font-mono">
          northpeak.store/products/trail-runner-3
        </span>
      </div>

      {/* Product header */}
      <div className="flex gap-4 p-5">
        <div
          className="h-24 w-24 shrink-0 rounded-xl"
          style={{
            background:
              "linear-gradient(135deg, #e4e4e7 0%, #d4d4d8 50%, #a1a1aa 100%)",
          }}
        />
        <div className="min-w-0 flex-1 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--outline)]">
            Northpeak
          </p>
          <p className="mt-1 font-display text-base font-bold text-[var(--on-surface)] leading-tight">
            Trail Runner 3
          </p>
          <p className="mt-2 text-lg font-bold text-[var(--on-surface)]">
            $128.00
          </p>
        </div>
      </div>

      {/* Dimensions / scan area */}
      <div className="relative border-t border-[var(--outline-variant)] px-5 py-4">
        <div className="hero-scan-line" />

        <div className="space-y-3">
          {DIMENSIONS.map((d, i) => (
            <div
              key={d.label}
              className="hero-scan-row relative flex items-center gap-3 text-sm"
              style={{ ["--i" as string]: i }}
            >
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <CircleIcon
                  size={20}
                  weight="regular"
                  color="var(--outline-variant)"
                  className="icon-pending absolute inset-0"
                />
                <CircleNotchIcon
                  size={20}
                  weight="bold"
                  color="var(--primary)"
                  className="icon-active absolute inset-0"
                />
                <CheckCircleIcon
                  size={20}
                  weight="fill"
                  color={TIER_COLOR[d.tier]}
                  className="icon-complete absolute inset-0"
                />
              </span>
              <span className="font-medium text-[var(--on-surface)]">
                {d.label}
              </span>
              <span className="flex-1 border-b border-dotted border-[var(--outline-variant)]" />
              <span
                className="score font-mono text-sm font-semibold tabular-nums"
                style={{ color: TIER_COLOR[d.tier] }}
              >
                {d.score}/10
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

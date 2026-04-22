"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

type Side = "right" | "top";
type Box = [number, number, number, number]; // [x, y, w, h] in stage-absolute coords

type TargetMeta = {
  id: "title" | "reviews" | "price" | "images" | "cta";
  label: string;
  issue: string;
  score: number;
  impact: number;
  side: Side;
};

type Target = TargetMeta & { box: Box };

const TOKENS = {
  bgAlt: "var(--bg)",
  ink: "var(--ink)",
  ink2: "var(--ink-2)",
  ink3: "var(--ink-3)",
  ink4: "color-mix(in srgb, var(--ink-3) 55%, var(--paper))",
  rule: "var(--rule-2)",
  rule2: "var(--rule)",
  rule3: "color-mix(in srgb, var(--ink) 4%, transparent)",
  accent: "var(--accent)",
  accent10: "color-mix(in srgb, var(--accent) 10%, transparent)",
  accent40: "color-mix(in srgb, var(--accent) 40%, transparent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  serif: "var(--font-serif), 'Instrument Serif', 'Times New Roman', serif",
  sans: "var(--font-inter), 'Inter', system-ui, sans-serif",
  mono: "var(--font-mono), 'JetBrains Mono', ui-monospace, monospace",
};

const TARGETS_META: TargetMeta[] = [
  {
    id: "title",
    label: "Title & SEO",
    issue: "Missing primary keyword",
    score: 45,
    impact: 180,
    side: "right",
  },
  {
    id: "reviews",
    label: "Social Proof",
    issue: "Only 12 reviews shown",
    score: 15,
    impact: 840,
    side: "right",
  },
  {
    id: "price",
    label: "Pricing Psychology",
    issue: "No anchor or comparison",
    score: 40,
    impact: 320,
    side: "right",
  },
  {
    id: "images",
    label: "Product Images",
    issue: "Only 3 angles, no lifestyle",
    score: 35,
    impact: 680,
    side: "top",
  },
  {
    id: "cta",
    label: "CTA & Urgency",
    issue: 'Generic "Add to bag" copy',
    score: 50,
    impact: 260,
    side: "top",
  },
];

const TOTAL_LOSS = TARGETS_META.reduce((a, t) => a + t.impact, 0);
const AVG_SCORE = Math.round(
  TARGETS_META.reduce((a, t) => a + t.score, 0) / TARGETS_META.length,
);

const ZERO_BOX: Box = [0, 0, 0, 0];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function HeroScanAnimation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const reviewsRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLSpanElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  const [boxes, setBoxes] = useState<Box[]>(() =>
    TARGETS_META.map(() => ZERO_BOX),
  );

  useLayoutEffect(() => {
    const refs: RefObject<Element | null>[] = [
      titleRef,
      reviewsRef,
      priceRef,
      imagesRef,
      ctaRef,
    ];

    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      const next: Box[] = refs.map((ref) => {
        const el = ref.current;
        if (!el) return ZERO_BOX;
        const r = el.getBoundingClientRect();
        return [
          r.left - stageRect.left,
          r.top - stageRect.top,
          r.width,
          r.height,
        ];
      });
      setBoxes(next);
    };

    measure();
    window.addEventListener("resize", measure);
    // Fonts load with display: swap — re-measure once they settle so ring
    // boxes align to the final (not fallback) text metrics.
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => measure()).catch(() => {});
    }
    return () => window.removeEventListener("resize", measure);
  }, []);

  const [step, setStep] = useState(-1); // -1 idle, 0..n-1 target, n summary
  const [dwellCount, setDwellCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const runCycle = async () => {
      while (!cancelled) {
        setStep(-1);
        await wait(400);
        for (let i = 0; i < TARGETS_META.length; i++) {
          if (cancelled) return;
          setStep(i);
          setDwellCount((c) => c + 1);
          await wait(4500);
        }
        if (cancelled) return;
        setStep(TARGETS_META.length);
        await wait(2200);
      }
    };
    runCycle();
    return () => {
      cancelled = true;
    };
  }, []);

  const targets: Target[] = TARGETS_META.map((meta, i) => ({
    ...meta,
    box: boxes[i] ?? ZERO_BOX,
  }));
  const current =
    step >= 0 && step < targets.length ? targets[step] : null;
  const isSummary = step === targets.length;
  const idle = step === -1;

  const ringBox: Box = current
    ? current.box
    : idle
      ? ZERO_BOX
      : targets[targets.length - 1].box;

  return (
    <div
      aria-hidden="true"
      style={{
        width: "100%",
        background: TOKENS.bgAlt,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: TOKENS.sans,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--paper)",
          borderRadius: 14,
          boxShadow:
            "0 1px 2px rgba(22,19,14,.04), 0 24px 60px rgba(22,19,14,.12)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Browser chrome */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 14px",
            borderBottom: `1px solid ${TOKENS.rule2}`,
            background: "color-mix(in srgb, var(--ink) 3%, var(--paper))",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ff5f57",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#febc2e",
            }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#28c840",
            }}
          />
          <div
            style={{
              marginLeft: 12,
              flex: 1,
              padding: "4px 12px",
              background: "var(--paper)",
              borderRadius: 6,
              fontFamily: TOKENS.mono,
              fontSize: 11,
              color: TOKENS.ink3,
              border: `1px solid ${TOKENS.rule2}`,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 256 256"
              fill={TOKENS.ok}
            >
              <path d="M208 80h-28V56a52 52 0 0 0-104 0v24H48a16 16 0 0 0-16 16v112a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V96a16 16 0 0 0-16-16ZM92 56a36 36 0 0 1 72 0v24H92Z" />
            </svg>
            gymshark.com/products/arrival-5-shorts
          </div>
        </div>

        {/* Stage */}
        <div
          ref={stageRef}
          style={{
            position: "relative",
            height: 460,
            padding: 20,
            overflow: "hidden",
          }}
        >
          {/* Mock product page content */}
          <div>
            <div
              style={{
                fontFamily: TOKENS.mono,
                fontSize: 9,
                color: TOKENS.ink4,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Men · Bottoms · Shorts
            </div>

            <div
              style={{
                fontFamily: TOKENS.serif,
                fontSize: 26,
                lineHeight: 1.1,
                color: TOKENS.ink,
                letterSpacing: "-.015em",
                marginBottom: 8,
              }}
            >
              <span ref={titleRef}>Arrival 5&quot; Shorts — Onyx Grey</span>
            </div>

            <div
              ref={reviewsRef}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <div style={{ display: "flex", gap: 2 }}>
                {[...Array(5)].map((_, i) => (
                  <svg
                    key={i}
                    width="12"
                    height="12"
                    viewBox="0 0 256 256"
                    fill={i < 4 ? TOKENS.warn : TOKENS.rule}
                  >
                    <path d="m234.29 114.85-45 38.83 13.64 58.36a16 16 0 0 1-23.84 17.34L128 199.16l-51.11 30.22A16 16 0 0 1 53.06 212l13.65-58.36-45-38.83a16 16 0 0 1 9.11-28.06l59.46-5.15 23.21-55.36a16 16 0 0 1 29.48 0l23.21 55.36 59.46 5.15a16 16 0 0 1 9.11 28.1Z" />
                  </svg>
                ))}
              </div>
              <span style={{ fontSize: 11, color: TOKENS.ink3 }}>
                4.1 · 12 reviews
              </span>
            </div>
            {/* Prevent inline-flex reviews row from sitting next to following block */}
            <div style={{ height: 0 }} />

            <div
              style={{
                fontFamily: TOKENS.serif,
                fontSize: 28,
                fontWeight: 400,
                color: TOKENS.ink,
                letterSpacing: "-.01em",
                marginBottom: 14,
                lineHeight: 1.1,
              }}
            >
              <span ref={priceRef}>$38.00</span>
            </div>

            <div
              ref={imagesRef}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                gap: 6,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  height: 100,
                  borderRadius: 8,
                  background:
                    "linear-gradient(135deg, #52525b 0%, #27272a 100%)",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    top: 8,
                    background: "rgba(255,255,255,.9)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontSize: 9,
                    fontWeight: 600,
                    color: TOKENS.ink,
                  }}
                >
                  1 / 6
                </div>
              </div>
              <div
                style={{
                  height: 100,
                  borderRadius: 8,
                  background:
                    "linear-gradient(135deg, #71717a 0%, #3f3f46 100%)",
                }}
              />
              <div
                style={{
                  height: 100,
                  borderRadius: 8,
                  background:
                    "linear-gradient(135deg, #a1a1aa 0%, #52525b 100%)",
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".14em",
                  textTransform: "uppercase",
                  color: TOKENS.ink3,
                  fontWeight: 600,
                  marginBottom: 6,
                }}
              >
                Size
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {["XS", "S", "M", "L", "XL"].map((s, i) => (
                  <div
                    key={s}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 600,
                      border: `1px solid ${
                        i === 2 ? TOKENS.ink : TOKENS.rule
                      }`,
                      borderRadius: 4,
                      color: i === 2 ? TOKENS.ink : TOKENS.ink3,
                      background: i === 2 ? "var(--bg)" : "var(--paper)",
                    }}
                  >
                    {s}
                  </div>
                ))}
              </div>
            </div>

            <div
              ref={ctaRef}
              style={{
                padding: "12px 16px",
                background: TOKENS.ink,
                color: "var(--paper)",
                borderRadius: 8,
                textAlign: "center",
                fontWeight: 600,
                fontSize: 13,
                letterSpacing: ".01em",
                marginBottom: 10,
                lineHeight: 1.2,
              }}
            >
              Add to bag
            </div>

            <div
              style={{
                padding: "12px 14px",
                border: `1px solid ${TOKENS.rule}`,
                borderRadius: 8,
                fontSize: 10,
                color: TOKENS.ink3,
                display: "flex",
                gap: 16,
                justifyContent: "space-between",
                lineHeight: 1.2,
              }}
            >
              {["Free returns", "Secure checkout", "2yr warranty"].map(
                (label) => (
                  <span
                    key={label}
                    style={{
                      display: "inline-flex",
                      gap: 5,
                      alignItems: "center",
                    }}
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 256 256"
                      fill={TOKENS.ink4}
                    >
                      <path d="m229.66 77.66-128 128a8 8 0 0 1-11.32 0l-56-56a8 8 0 0 1 11.32-11.32L96 188.69 218.34 66.34a8 8 0 0 1 11.32 11.32Z" />
                    </svg>
                    {label}
                  </span>
                ),
              )}
            </div>
          </div>

          {/* Darken overlay during summary */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(22,19,14,.55)",
              opacity: isSummary ? 1 : 0,
              transition: "opacity .5s ease-out",
              pointerEvents: "none",
              zIndex: 4,
            }}
          />

          {/* Persistent "sticker" marks at visited targets */}
          {targets.map((t, i) => {
            const visited = step > i || isSummary;
            return (
              <div
                key={`dot-${t.id}`}
                style={{
                  position: "absolute",
                  left: t.box[0] + t.box[2] - 10,
                  top: t.box[1] - 6,
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  background: TOKENS.accent,
                  color: "var(--paper)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: TOKENS.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  boxShadow: `0 2px 6px ${TOKENS.accent40}`,
                  opacity: visited ? 1 : 0,
                  transform: visited ? "scale(1)" : "scale(.4)",
                  transition:
                    "opacity .3s, transform .35s cubic-bezier(.34,1.56,.64,1)",
                  pointerEvents: "none",
                  zIndex: isSummary ? 6 : 3,
                }}
              >
                {i + 1}
              </div>
            );
          })}

          {/* Focus ring */}
          <div
            style={{
              position: "absolute",
              left: ringBox[0] - 6,
              top: ringBox[1] - 6,
              width: ringBox[2] + 12,
              height: ringBox[3] + 12,
              border: `2px solid ${TOKENS.accent}`,
              borderRadius: 8,
              boxShadow: `0 0 0 6px ${TOKENS.accent10}`,
              transition:
                "left .65s cubic-bezier(.25,1,.5,1), top .65s cubic-bezier(.25,1,.5,1), width .65s cubic-bezier(.25,1,.5,1), height .65s cubic-bezier(.25,1,.5,1), opacity .35s ease-out",
              opacity: current ? 1 : 0,
              pointerEvents: "none",
              zIndex: 5,
            }}
          />

          {/* Crosshair corners */}
          {current &&
            (
              [
                [0, 0, "tl"],
                [1, 0, "tr"],
                [0, 1, "bl"],
                [1, 1, "br"],
              ] as const
            ).map(([x, y, k]) => (
              <div
                key={k}
                style={{
                  position: "absolute",
                  left: ringBox[0] - 6 + x * (ringBox[2] + 12) - 5,
                  top: ringBox[1] - 6 + y * (ringBox[3] + 12) - 5,
                  width: 10,
                  height: 10,
                  border: `2px solid ${TOKENS.accent}`,
                  borderRadius: 2,
                  background: "var(--paper)",
                  transition:
                    "left .65s cubic-bezier(.25,1,.5,1), top .65s cubic-bezier(.25,1,.5,1)",
                  pointerEvents: "none",
                  zIndex: 6,
                }}
              />
            ))}

          {/* Callout card */}
          {current && (
            <CalloutCard
              key={`callout-${dwellCount}`}
              target={current}
              index={step + 1}
            />
          )}

          {/* Summary card */}
          {isSummary && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                width: 300,
                background: "var(--paper)",
                borderRadius: 14,
                padding: "22px 24px",
                boxShadow: "0 30px 60px rgba(22,19,14,.25)",
                zIndex: 20,
                animation:
                  "hero-summary-in .45s cubic-bezier(.34,1.56,.64,1) both",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  letterSpacing: ".18em",
                  textTransform: "uppercase",
                  color: TOKENS.ink3,
                  fontWeight: 700,
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    background: TOKENS.ok,
                    borderRadius: 999,
                  }}
                />
                Audit complete
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1px 1fr",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: TOKENS.ink3,
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    Score
                  </div>
                  <div
                    style={{
                      fontFamily: TOKENS.serif,
                      fontSize: 48,
                      lineHeight: 1,
                      color: TOKENS.accent,
                      letterSpacing: "-.03em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {AVG_SCORE}
                    <span style={{ fontSize: 16, color: TOKENS.ink3 }}>
                      /100
                    </span>
                  </div>
                </div>
                <div style={{ height: 40, background: TOKENS.rule }} />
                <div>
                  <div
                    style={{
                      fontSize: 9,
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: TOKENS.ink3,
                      fontWeight: 600,
                      marginBottom: 2,
                    }}
                  >
                    Monthly loss
                  </div>
                  <div
                    style={{
                      fontFamily: TOKENS.serif,
                      fontStyle: "italic",
                      fontSize: 36,
                      lineHeight: 1,
                      color: TOKENS.accent,
                      letterSpacing: "-.02em",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    −${TOTAL_LOSS.toLocaleString()}
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: `1px solid ${TOKENS.rule}`,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 10,
                  color: TOKENS.ink3,
                  fontWeight: 500,
                }}
              >
                <span>{targets.length} issues found</span>
                <span>3 critical</span>
              </div>
            </div>
          )}

          {/* HUD badge */}
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "5px 11px",
              background: TOKENS.ink,
              color: "var(--paper)",
              fontFamily: TOKENS.mono,
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 999,
              letterSpacing: ".1em",
              display: "flex",
              alignItems: "center",
              gap: 7,
              zIndex: 30,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: isSummary ? TOKENS.ok : TOKENS.accent,
                borderRadius: 999,
                animation: isSummary
                  ? "none"
                  : "hero-pulse 1s ease-in-out infinite",
              }}
            />
            {isSummary
              ? "COMPLETE"
              : idle
                ? "READY"
                : `${step + 1} / ${targets.length}`}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes hero-pulse { 0%,100% { opacity:1 } 50% { opacity:.3 } }
        @keyframes hero-summary-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(.9); }
          to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes hero-ping {
          from { transform: scale(.2); opacity: .5; }
          to   { transform: scale(1); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hero-pulse { 0%,100% { opacity:1 } }
          @keyframes hero-summary-in { from,to { opacity: 1; transform: translate(-50%, -50%); } }
          @keyframes hero-ping { from,to { opacity: 0; } }
        }
      `}</style>
    </div>
  );
}

function CalloutCard({
  target,
  index,
}: {
  target: Target;
  index: number;
}) {
  const [x, y, w, h] = target.box;

  let cardStyle: React.CSSProperties = {};
  let pingStyle: React.CSSProperties = {};

  if (target.side === "right") {
    cardStyle = {
      left: x + w + 18,
      top: y + h / 2,
      transform: "translateY(-50%)",
    };
    pingStyle = {
      left: x + w + 6,
      top: y + h / 2 - 8,
    };
  } else {
    cardStyle = {
      left: x + w / 2,
      top: y - 16,
      transform: "translate(-50%, -100%)",
    };
    pingStyle = {
      left: x + w / 2 - 8,
      top: y - 8,
    };
  }

  const scoreColor =
    target.score < 35
      ? TOKENS.accent
      : target.score < 60
        ? TOKENS.warn
        : TOKENS.ok;

  return (
    <>
      {/* Ping ring on land */}
      <div
        style={{
          position: "absolute",
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `2px solid ${TOKENS.accent}`,
          animation: "hero-ping .5s cubic-bezier(.25,1,.5,1) forwards",
          pointerEvents: "none",
          zIndex: 12,
          ...pingStyle,
        }}
      />

      {/* Connector line for side="right" */}
      {target.side === "right" && (
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 10,
            overflow: "visible",
          }}
        >
          <line
            x1={x + w + 8}
            y1={y + h / 2}
            x2={x + w + 18}
            y2={y + h / 2}
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        </svg>
      )}

      {/* Card */}
      <div
        style={{
          position: "absolute",
          ...cardStyle,
          width: 190,
          background: "var(--paper)",
          border: `1px solid ${TOKENS.rule}`,
          borderRadius: 10,
          padding: "12px 14px",
          boxShadow:
            "0 8px 20px rgba(22,19,14,.12), 0 2px 4px rgba(22,19,14,.04)",
          zIndex: 15,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: TOKENS.accent,
              color: "var(--paper)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: TOKENS.mono,
              fontSize: 9,
              fontWeight: 700,
            }}
          >
            {String(index).padStart(2, "0")}
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: TOKENS.ink2,
            }}
          >
            {target.label}
          </span>
        </div>

        <div
          style={{
            fontFamily: TOKENS.serif,
            fontSize: 16,
            lineHeight: 1.2,
            color: TOKENS.ink,
            letterSpacing: "-.01em",
            marginBottom: 10,
          }}
        >
          {target.issue}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            paddingTop: 9,
            borderTop: `1px solid ${TOKENS.rule3}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 8,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: TOKENS.ink3,
                fontWeight: 600,
              }}
            >
              Score
            </div>
            <div
              style={{
                fontFamily: TOKENS.mono,
                fontSize: 14,
                fontWeight: 700,
                color: scoreColor,
                lineHeight: 1,
              }}
            >
              {target.score}
              <span
                style={{
                  color: TOKENS.ink3,
                  fontWeight: 500,
                  fontSize: 10,
                }}
              >
                /100
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 8,
                letterSpacing: ".1em",
                textTransform: "uppercase",
                color: TOKENS.ink3,
                fontWeight: 600,
              }}
            >
              Loss/mo
            </div>
            <div
              style={{
                fontFamily: TOKENS.mono,
                fontSize: 14,
                fontWeight: 700,
                color: TOKENS.accent,
                lineHeight: 1,
              }}
            >
              −${target.impact}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

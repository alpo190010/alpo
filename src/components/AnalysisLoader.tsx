"use client";

import { useState, useEffect } from "react";

/* ── Stage labels ── */
const STAGES = [
  { label: "Images", key: "images" },
  { label: "Description", key: "copy" },
  { label: "Trust", key: "trust" },
  { label: "Conversions", key: "conversion" },
] as const;

/* ── Icon components ── */
function CameraIcon({ active, progress }: { active: boolean; progress: number }) {
  const color = active ? "#2563EB" : "#D1D5DB";
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ color }}>
      <rect x="4" y="14" width="40" height="28" rx="4" stroke="currentColor" strokeWidth="2" fill={active ? "#EFF6FF" : "none"} />
      <circle cx="24" cy="28" r="9" stroke="currentColor" strokeWidth="2" fill={active ? "#DBEAFE" : "none"} />
      <circle cx="24" cy="28" r="4" fill={active ? "#2563EB" : "none"} stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 14 L18 8 L30 8 L32 14" stroke="currentColor" strokeWidth="2" fill="none" />
      {/* Shutter animation — spinning arc */}
      {active && progress < 1 && (
        <circle cx="24" cy="28" r="7" fill="none" stroke="#2563EB" strokeWidth="1.5"
          strokeDasharray="12 32" style={{ transformOrigin: "24px 28px", animation: "spin 1.2s linear infinite" }} />
      )}
    </svg>
  );
}

function DocumentIcon({ active, progress }: { active: boolean; progress: number }) {
  const color = active ? "#2563EB" : "#D1D5DB";
  const lp = active ? Math.min(progress * 4, 3) : 0;
  return (
    <svg width="44" height="48" viewBox="0 0 44 48" style={{ color }}>
      <path d="M4 4 L30 4 L40 14 L40 44 L4 44 Z" stroke="currentColor" strokeWidth="2" fill={active ? "#EFF6FF" : "none"} />
      <path d="M30 4 L30 14 L40 14" stroke="currentColor" strokeWidth="2" fill="none" />
      <rect x="10" y="20" height="2.5" rx="1.25" fill={active ? "#6B7280" : "#E5E7EB"}
        style={{ width: lp > 0 ? "60%" : "0", transition: "width 600ms ease" }} />
      <rect x="10" y="27" height="2.5" rx="1.25" fill={active ? "#6B7280" : "#E5E7EB"}
        style={{ width: lp > 1 ? "75%" : "0", transition: "width 600ms ease 300ms" }} />
      <rect x="10" y="34" height="2.5" rx="1.25" fill={active ? "#6B7280" : "#E5E7EB"}
        style={{ width: lp > 2 ? "45%" : "0", transition: "width 600ms ease 600ms" }} />
    </svg>
  );
}

function ShieldIcon({ active, progress }: { active: boolean; progress: number }) {
  const color = active ? "#16A34A" : "#D1D5DB";
  return (
    <svg width="44" height="48" viewBox="0 0 44 48" style={{ color }}>
      <path d="M22 2 L40 10 L40 26 C40 36 22 46 22 46 C22 46 4 36 4 26 L4 10 Z"
        stroke="currentColor" strokeWidth="2" fill={active ? "#F0FDF4" : "none"} />
      {active && (
        <path d="M12 24 L19 31 L32 18" stroke="#16A34A" strokeWidth="3" fill="none"
          strokeDasharray="30"
          strokeDashoffset={progress > 0.3 ? "0" : "30"}
          style={{ transition: "stroke-dashoffset 600ms ease" }} />
      )}
    </svg>
  );
}

function CartIcon({ active }: { active: boolean; progress: number }) {
  const color = active ? "#2563EB" : "#D1D5DB";
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ color }}>
      <path d="M4 8 L10 8 L16 30 L36 30 L42 14 L14 14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <circle cx="18" cy="38" r="4" fill={active ? "#2563EB" : "none"} stroke="currentColor" strokeWidth="2" />
      <circle cx="34" cy="38" r="4" fill={active ? "#2563EB" : "none"} stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/* ── Sonar rings ── */
function SonarRings({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <circle key={i} cx="140" cy="140" r="8" fill="none" stroke="#2563EB"
          strokeWidth="1" opacity="0"
          style={{
            animation: `sonar 2.4s ease-out ${i * 0.8}s infinite`,
          }}
        />
      ))}
    </>
  );
}

/* ── Circuit trace ── */
function CircuitTrace({ x1, y1, active }: { x1: number; y1: number; active: boolean }) {
  const length = Math.sqrt((x1 - 140) ** 2 + (y1 - 140) ** 2);
  return (
    <line x1={x1} y1={y1} x2={140} y2={140}
      stroke={active ? "#2563EB" : "#E5E7EB"}
      strokeWidth={1.5}
      strokeDasharray={length}
      strokeDashoffset={active ? 0 : length}
      style={{
        transition: "stroke-dashoffset 500ms ease, stroke 300ms ease",
        filter: active ? "drop-shadow(0 0 4px rgba(37,99,235,0.4))" : "none",
      }}
    />
  );
}

/* ── Icon positions in the 280×280 grid ── */
const ICON_POS = [
  { x: 55, y: 55 },   // top-left — camera
  { x: 185, y: 55 },  // top-right — document
  { x: 55, y: 185 },  // bottom-left — shield
  { x: 185, y: 185 }, // bottom-right — cart
];

const TRACE_ORIGINS = [
  { x: 79, y: 79 },
  { x: 201, y: 79 },
  { x: 79, y: 201 },
  { x: 201, y: 201 },
];

const ICONS = [CameraIcon, DocumentIcon, ShieldIcon, CartIcon];

/* ── Keyframe animations (injected once) ── */
const KEYFRAMES = `
@keyframes sonar {
  0% { r: 8; opacity: 0.6; }
  100% { r: 60; opacity: 0; }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes icon-in {
  0% { transform: scale(0.8); opacity: 0.5; }
  60% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes wiggle {
  0% { transform: rotate(0deg); }
  20% { transform: rotate(-5deg); }
  40% { transform: rotate(5deg); }
  60% { transform: rotate(-3deg); }
  80% { transform: rotate(2deg); }
  100% { transform: rotate(0deg); }
}
@keyframes gentle-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
@keyframes dot-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.3); }
}
`;

/* ── Main component ── */
export default function AnalysisLoader({ url }: { url: string }) {
  const [stage, setStage] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);

  // Stage progression timers
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 2000),
      setTimeout(() => setStage(2), 7000),
      setTimeout(() => setStage(3), 12000),
      setTimeout(() => setStage(4), 17000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Per-stage progress (0→1 over each 5s stage)
  useEffect(() => {
    if (stage === 0) { setStageProgress(0); return; }
    setStageProgress(0);
    const start = performance.now();
    let raf: number;
    function tick() {
      const elapsed = performance.now() - start;
      setStageProgress(Math.min(elapsed / 5000, 1));
      if (elapsed < 5000) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage]);

  const isDone = stage >= 4 && stageProgress >= 1;
  const truncatedUrl = url.length > 50 ? url.slice(0, 50) + "\u2026" : url;

  return (
    <section className="w-full flex justify-center mt-12 mb-8 px-4" aria-label="Analysis in progress">
      {/* Keyframes moved to globals.css */}
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          background: "#FFFFFF",
          border: "1.5px solid #E5E7EB",
          borderRadius: 16,
          padding: "48px 40px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* URL */}
        <p style={{
          fontSize: 13,
          color: "#6B6B6B",
          textAlign: "center",
          marginBottom: 24,
          maxWidth: 420,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {truncatedUrl}
        </p>

        {/* SVG Grid — 280×280 */}
        <div style={{ position: "relative", width: 280, height: 280 }}>
          <svg width="280" height="280" viewBox="0 0 280 280" style={{ position: "absolute", inset: 0 }}>
            {/* Sonar rings at center during stage 0 */}
            <SonarRings visible={stage === 0} />

            {/* Center dot */}
            <circle cx="140" cy="140" r={stage === 0 ? 6 : 8}
              fill={isDone ? "#2563EB" : stage === 0 ? "#E5E7EB" : "#2563EB"}
              style={{
                transition: "all 0.4s ease",
                animation: isDone ? "gentle-pulse 2s ease-in-out infinite" : "none",
              }}
            />

            {/* Circuit traces */}
            {TRACE_ORIGINS.map((t, i) => (
              <CircuitTrace key={i} x1={t.x} y1={t.y} active={stage > i} />
            ))}
          </svg>

          {/* Icons — positioned absolutely */}
          {ICONS.map((Icon, i) => {
            const pos = ICON_POS[i];
            const isActive = stage > i;
            const isCurrentlyScanning = stage === i + 1;
            const progress = isCurrentlyScanning ? stageProgress : isActive ? 1 : 0;

            // Pick animation based on icon index
            let anim = "none";
            if (isActive && !isDone) {
              if (i === 3) anim = "wiggle 400ms ease-out"; // cart wiggles
              else anim = "icon-in 400ms cubic-bezier(0.34,1.56,0.64,1)";
            }

            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pos.x - 24,
                  top: pos.y - 24,
                  width: 48,
                  height: 48,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  animation: isActive ? anim : "none",
                  filter: isActive ? "drop-shadow(0 0 8px rgba(37,99,235,0.25))" : "none",
                  transition: "filter 0.4s ease",
                }}
              >
                <Icon active={isActive} progress={progress} />
              </div>
            );
          })}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 12, marginTop: 20, marginBottom: 16 }}>
          {STAGES.map((s, i) => {
            const completed = stage > i + 1 || (stage === i + 1 && stageProgress >= 1) || isDone;
            const active = stage === i + 1 && stageProgress < 1;
            return (
              <div key={s.key} style={{
                width: 8, height: 8, borderRadius: "50%",
                backgroundColor: completed || active ? "#2563EB" : "#E5E7EB",
                transition: "background-color 0.3s ease",
                animation: active ? "dot-pulse 1s ease-in-out infinite" : "none",
              }} />
            );
          })}
        </div>

        {/* Labels */}
        <div style={{ display: "flex", gap: 24, justifyContent: "center" }}>
          {STAGES.map((s, i) => {
            const isActive = stage === i + 1;
            const isCompleted = stage > i + 1 || isDone;
            return (
              <span key={s.key} style={{
                fontSize: 12,
                color: isActive || isCompleted ? "#2563EB" : "#9CA3AF",
                fontWeight: isActive ? 600 : 400,
                transition: "color 0.4s ease",
              }}>
                {s.label}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

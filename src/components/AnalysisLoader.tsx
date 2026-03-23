"use client";

import { useState, useEffect } from "react";

const STEPS = [
  { icon: "🔍", label: "Fetching your page", sub: "Reading HTML, images, and metadata" },
  { icon: "🖼", label: "Checking visuals", sub: "Image quality, count, and layout" },
  { icon: "✍️", label: "Analyzing copy", sub: "Title, description, and keywords" },
  { icon: "⭐", label: "Evaluating trust signals", sub: "Reviews, badges, and guarantees" },
  { icon: "🛒", label: "Scoring conversions", sub: "CTA, pricing, and urgency" },
  { icon: "📊", label: "Calculating your score", sub: "Compiling results" },
];

export default function AnalysisLoader({ url }: { url: string }) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    // Each step takes ~3.5s, total ~21s
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), i * 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  const truncatedUrl = url.length > 60 ? url.slice(0, 60) + "…" : url;

  return (
    <section className="w-full flex justify-center mt-10 mb-8 px-4">
      <div style={{
        maxWidth: 480,
        width: "100%",
        background: "#FFFFFF",
        border: "1.5px solid #E5E7EB",
        borderRadius: 16,
        padding: "36px 32px",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <h2 style={{
            fontSize: 18,
            fontWeight: 600,
            color: "#111111",
            margin: "0 0 6px",
          }}>
            Analyzing your page
          </h2>
          <p style={{
            fontSize: 13,
            color: "#9CA3AF",
            margin: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {truncatedUrl}
          </p>
        </div>

        {/* Progress bar */}
        <div style={{
          width: "100%",
          height: 3,
          background: "#F3F4F6",
          borderRadius: 2,
          marginBottom: 28,
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            background: "#2563EB",
            borderRadius: 2,
            width: `${Math.min(((activeStep + 1) / STEPS.length) * 100, 95)}%`,
            transition: "width 3s cubic-bezier(0.4, 0, 0.2, 1)",
          }} />
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {STEPS.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            const isPending = i > activeStep;

            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "12px 0",
                  borderBottom: i < STEPS.length - 1 ? "1px solid #F3F4F6" : "none",
                  opacity: isPending ? 0.4 : 1,
                  transition: "opacity 0.4s ease",
                }}
              >
                {/* Status indicator */}
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontSize: 16,
                  background: isDone ? "#F0FDF4" : isActive ? "#EFF6FF" : "#F9FAFB",
                  border: isDone
                    ? "1.5px solid #BBF7D0"
                    : isActive
                    ? "1.5px solid #BFDBFE"
                    : "1.5px solid #E5E7EB",
                  transition: "all 0.4s ease",
                }}>
                  {isDone ? (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : isActive ? (
                    <div style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid #2563EB",
                      borderTopColor: "transparent",
                      animation: "loader-spin 0.8s linear infinite",
                    }} />
                  ) : (
                    <span style={{ opacity: 0.5 }}>{step.icon}</span>
                  )}
                </div>

                {/* Text */}
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontSize: 14,
                    fontWeight: isActive ? 600 : isDone ? 500 : 400,
                    color: isDone ? "#16A34A" : isActive ? "#111111" : "#9CA3AF",
                    margin: "0 0 2px",
                    transition: "color 0.4s ease",
                  }}>
                    {step.label}
                    {isDone && <span style={{ marginLeft: 6, fontSize: 12, color: "#16A34A" }}>Done</span>}
                  </p>
                  {(isActive || isDone) && (
                    <p style={{
                      fontSize: 12,
                      color: "#9CA3AF",
                      margin: 0,
                    }}>
                      {step.sub}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Estimated time */}
        <p style={{
          fontSize: 12,
          color: "#9CA3AF",
          textAlign: "center",
          marginTop: 20,
          marginBottom: 0,
        }}>
          Usually takes 15–25 seconds
        </p>
      </div>

      <style jsx>{`
        @keyframes loader-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

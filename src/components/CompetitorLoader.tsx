"use client";

import { useState, useEffect } from "react";
import { CheckIcon } from "@phosphor-icons/react";

const STEPS = [
  { icon: "🔎", label: "Finding similar products", sub: "Identifying competitors in your niche" },
  { icon: "🌐", label: "Fetching competitor pages", sub: "Loading product pages for comparison" },
  { icon: "📊", label: "Scoring competitors", sub: "Analyzing each page across 7 categories" },
  { icon: "⚖️", label: "Preparing comparison", sub: "Building your competitive breakdown" },
];

export default function CompetitorLoader({ url }: { url: string }) {
  const [activeStep, setActiveStep] = useState(0);
  const [stepsComplete, setStepsComplete] = useState(false);

  useEffect(() => {
    const timers = STEPS.map((_, i) =>
      setTimeout(() => setActiveStep(i), i * 6500)
    );
    // Mark all steps complete after the last one has had time to show
    const doneTimer = setTimeout(() => setStepsComplete(true), STEPS.length * 6500);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, []);

  const truncatedUrl = url.length > 60 ? url.slice(0, 60) + "…" : url;

  return (
    <section className="w-full flex justify-center mt-10 mb-8 px-4" aria-label="Competitor analysis in progress">
      <div className="max-w-[480px] w-full bg-[var(--surface)] border-[1.5px] border-[var(--border)] rounded-2xl px-8 py-9">
        {/* Header */}
        <div className="text-center mb-7">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1.5">
            Analyzing competitors
          </h2>
          <p className="text-[13px] text-[var(--text-tertiary)] truncate">
            {truncatedUrl}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-[3px] bg-[var(--track)] rounded-sm mb-7 overflow-hidden">
          <div
            className="h-full bg-[var(--brand)] rounded-sm"
            style={{
              width: stepsComplete
                ? "95%"
                : `${Math.min(((activeStep + 1) / STEPS.length) * 100, 90)}%`,
              transition: "width 5s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Steps */}
        {!stepsComplete ? (
          <div className="flex flex-col" role="list" aria-label="Competitor analysis steps">
            {STEPS.map((step, i) => {
              const isDone = i < activeStep;
              const isActive = i === activeStep;
              const isPending = i > activeStep;

              return (
                <div
                  key={step.label}
                  role="listitem"
                  className={`flex items-start gap-3.5 py-3 ${
                    i < STEPS.length - 1 ? "border-b border-[var(--track)]" : ""
                  } ${isPending ? "opacity-40" : "opacity-100"}`}
                  style={{ transition: "opacity 0.4s ease" }}
                >
                  {/* Status indicator */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-base border-[1.5px] ${
                      isDone
                        ? "bg-[var(--success-light)] border-[var(--success-border)]"
                        : isActive
                        ? "bg-[var(--brand-light)] border-[var(--brand-border)]"
                        : "bg-[var(--surface-dim)] border-[var(--border)]"
                    }`}
                    style={{ transition: "all 0.4s ease" }}
                  >
                    {isDone ? (
                      <CheckIcon size={16} weight="bold" color="var(--success)" />
                    ) : isActive ? (
                      <div
                        className="w-3.5 h-3.5 rounded-full border-2 border-[var(--brand)] border-t-transparent"
                        style={{ animation: "spin 0.8s linear infinite" }}
                      />
                    ) : (
                      <span className="opacity-50" aria-hidden="true">{step.icon}</span>
                    )}
                  </div>

                  {/* Text */}
                  <div className="min-w-0">
                    <p
                      className={`text-sm mb-0.5 ${
                        isDone
                          ? "font-medium text-[var(--success-text)]"
                          : isActive
                          ? "font-semibold text-[var(--text-primary)]"
                          : "font-normal text-[var(--text-tertiary)]"
                      }`}
                      style={{ transition: "color 0.4s ease" }}
                    >
                      {step.label}
                      {isDone && <span className="ml-1.5 text-xs text-[var(--success-text)]">Done</span>}
                    </p>
                    {(isActive || isDone) && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {step.sub}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Still analyzing fallback — all steps done but API hasn't returned */
          <div className="flex items-center justify-center gap-3 py-6">
            <div
              className="w-5 h-5 rounded-full border-2 border-[var(--brand)] border-t-transparent shrink-0"
              style={{ animation: "spin 0.8s linear infinite" }}
            />
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Still analyzing — almost done…
            </p>
          </div>
        )}

        {/* Estimated time */}
        <p className="text-xs text-[var(--text-tertiary)] text-center mt-5">
          Usually takes 20–30 seconds
        </p>
      </div>
    </section>
  );
}

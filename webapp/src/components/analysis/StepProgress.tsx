"use client";

import { type ReactNode } from "react";
import { CheckIcon } from "@phosphor-icons/react";

interface StepProgressProps {
  steps: { icon: ReactNode; label: string; sub: string }[];
  activeStep: number;
  stepsComplete?: boolean;
  transitionDuration?: string;
  progressCap?: number;
}

export default function StepProgress({
  steps,
  activeStep,
  stepsComplete,
  transitionDuration = "3s",
  progressCap = 95,
}: StepProgressProps) {
  return (
    <>
      {/* Progress bar */}
      <div className="w-full h-[3px] bg-[var(--track)] rounded-full mb-7 overflow-hidden">
        <div
          className="h-full bg-[var(--brand)] rounded-full"
          style={{
            width: stepsComplete
              ? "95%"
              : `${Math.min(((activeStep + 1) / steps.length) * 100, progressCap)}%`,
            transition: `width ${transitionDuration} var(--ease-out-quart)`,
          }}
        />
      </div>

      {/* Steps or fallback spinner */}
      {stepsComplete ? (
        <div className="flex items-center justify-center gap-3 py-6" role="status">
          <div
            className="w-5 h-5 rounded-full border-2 border-[var(--brand)] border-t-transparent shrink-0"
            style={{ animation: "spin 0.8s linear infinite" }}
          />
          <p className="text-sm font-medium text-[var(--text-secondary)]">
            Still analyzing — almost done…
          </p>
        </div>
      ) : (
        <div className="flex flex-col" role="list" aria-label="Analysis steps" aria-live="polite">
          {steps.map((step, i) => {
            const isDone = i < activeStep;
            const isActive = i === activeStep;
            const isPending = i > activeStep;

            return (
              <div
                key={step.label}
                role="listitem"
                className={`flex items-start gap-3.5 py-3 ${
                  i < steps.length - 1 ? "border-b border-[var(--track)]" : ""
                } ${isPending ? "opacity-40" : "opacity-100"}`}
                style={{ transition: "opacity 0.4s var(--ease-out-quart)" }}
              >
                {/* Status indicator */}
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base border-[1.5px] ${
                    isDone
                      ? "bg-[var(--success-light)] border-[var(--success-border)]"
                      : isActive
                      ? "bg-[var(--brand-light)] border-[var(--brand-border)]"
                      : "bg-[var(--surface-dim)] border-[var(--border)]"
                  }`}
                  style={{ transition: "all 0.4s var(--ease-out-quart)" }}
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
                    style={{ transition: "color 0.4s var(--ease-out-quart)" }}
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
      )}
    </>
  );
}

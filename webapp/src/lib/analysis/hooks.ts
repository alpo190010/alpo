"use client";

import { useState, useEffect, useRef } from "react";

/* ══════════════════════════════════════════════════════════════
   Hooks
   ══════════════════════════════════════════════════════════════ */

export function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const rafId = useRef<number>(0);

  useEffect(() => {
    cancelAnimationFrame(rafId.current);
    if (target <= 0) {
      valueRef.current = 0;
      setValue(0);
      return;
    }
    const startValue = valueRef.current;
    const delta = target - startValue;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + eased * delta);
      valueRef.current = next;
      setValue(next);
      if (progress < 1) rafId.current = requestAnimationFrame(tick);
    }
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, duration]);

  return value;
}

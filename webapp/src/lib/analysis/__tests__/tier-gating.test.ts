import { describe, it, expect } from "vitest";
import { getDimensionAccess } from "../conversion-model";
import { ACTIVE_DIMENSIONS } from "../constants";
import type { DimensionAccess } from "../conversion-model";

/* ══════════════════════════════════════════════════════════════
   Tier-Gating Tests — 3-tier model (free / insights / fixes)
   Free tier: scores only — diagnosis + fix-steps locked
   Insights / Fixes: dimension-level access unlocked. Fine-grained
   prose-vs-fix-steps gating happens at the API + paywall component
   level, not here.
   ══════════════════════════════════════════════════════════════ */

const ALL_DIMENSION_KEYS = [...ACTIVE_DIMENSIONS];

describe("getDimensionAccess", () => {
  describe("free plan", () => {
    it("returns locked for all active dimensions", () => {
      for (const key of ALL_DIMENSION_KEYS) {
        expect(getDimensionAccess("free", key)).toBe("locked" satisfies DimensionAccess);
      }
    });

    it("returns locked for unknown dimension keys", () => {
      expect(getDimensionAccess("free", "nonexistent")).toBe("locked");
    });
  });

  describe("insights plan", () => {
    it("returns unlocked for all active dimensions", () => {
      for (const key of ALL_DIMENSION_KEYS) {
        expect(getDimensionAccess("insights", key)).toBe("unlocked" satisfies DimensionAccess);
      }
    });
  });

  describe("fixes plan", () => {
    it("returns unlocked for all active dimensions", () => {
      for (const key of ALL_DIMENSION_KEYS) {
        expect(getDimensionAccess("fixes", key)).toBe("unlocked" satisfies DimensionAccess);
      }
    });

    it("returns unlocked for unknown dimension keys", () => {
      expect(getDimensionAccess("fixes", "nonexistent")).toBe("unlocked");
    });
  });
});

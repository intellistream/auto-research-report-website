import { describe, expect, it } from "vitest";
import { candidates, roundExample, estimateRound } from "./specdec-mechanism";

describe("SpecDec teaching model", () => {
  it("retains only the accepted prefix, plus an uncomputed correction or bonus in the output", () => {
    for (let accepted = 0; accepted <= candidates.length; accepted++) {
      const r = roundExample(accepted);
      expect(r.retained).toEqual(candidates.slice(0, accepted));
      expect(r.output).toEqual([...r.retained, r.pending]);
      expect(r.output).toHaveLength(accepted + 1);
      expect(r.targetCallsAR).toBe(accepted + 1);
      expect(r.targetCallsSpec).toBe(1);
      expect(r.allAccepted).toBe(accepted === 3);
      expect(r.status.filter(s => s === "accepted")).toHaveLength(accepted);
      expect(r.status.filter(s => s === "rejected")).toHaveLength(accepted === 3 ? 0 : 1);
    }
    expect(roundExample(1).status).toEqual(["accepted","rejected","discarded"]);
    expect(() => roundExample(4)).toThrow(RangeError);
  });
  it("handles the zero and full acceptance limits and costs without singularities", () => {
    for (let k = 1; k <= 8; k++) {
      expect(estimateRound(k,0,.15).expectedOutput).toBe(1);
      expect(estimateRound(k,1,.15).expectedOutput).toBe(k+1);
      expect(estimateRound(k,0,.15).speedup).toBeLessThan(1);
      expect(estimateRound(k,.8,.1).speedup).toBeGreaterThan(estimateRound(k,.8,.65).speedup);
    }
    expect(estimateRound(3,.8,.15).expectedOutput).toBeCloseTo(2.952);
    expect(estimateRound(3,.8,.15).roundTime).toBeCloseTo(1.83);
    expect(() => estimateRound(3,NaN,.1)).toThrow(RangeError);
  });
});

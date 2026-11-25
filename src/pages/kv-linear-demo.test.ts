import { describe, expect, it } from "vitest";
import { attentionDemoAt, linearDemoInputs, linearStateForHistory, replayAttentionDemo, attentionViewAt, type DemoKV } from "./kv-linear-demo";

describe("linear-attention teaching example", () => {
  it("replays the selected position before writing and preserves the preceding prefix", () => {
    for (const step of [1, 4, 5, 6, 8]) {
      const replay = replayAttentionDemo({ step });
      expect(replay).toEqual({ step, phase: "ready" });
      const view = attentionViewAt(replay);
      expect(view.savedCount).toBe(step - 1);
      expect(view.output).toBeNull();
      expect(view.visibleState).toEqual(step === 1 ? [[0, 0], [0, 0]] : attentionDemoAt(step - 1).state);
    }
    for (const step of [0, 2.5, 9]) expect(() => replayAttentionDemo({ step })).toThrow(RangeError);
  });

  it("cannot identify an arbitrary original V from S and z alone", () => {
    const historyA: DemoKV[] = [{ k: [1, 1], v: [1, 0] }, { k: [1, 1], v: [0, 1] }];
    const historyB: DemoKV[] = [{ k: [1, 1], v: [0.5, 0.5] }, { k: [1, 1], v: [0.5, 0.5] }];
    const a = linearStateForHistory(historyA);
    const b = linearStateForHistory(historyB);
    expect(a).toEqual({ state: [[1, 1], [1, 1]], normalizer: [2, 2] });
    expect(b).toEqual(a);
    expect(historyA[0].v).not.toEqual(historyB[0].v);
    expect(linearStateForHistory([])).toEqual({ state: [[0, 0], [0, 0]], normalizer: [0, 0] });
  });

  it("keeps K features on rows and V components on columns for a non-symmetric update", () => {
    const result = linearStateForHistory([{ k: [2, 3], v: [5, 7] }]);
    expect(result.state).toEqual([[10, 14], [15, 21]]);
    expect(result.normalizer).toEqual([2, 3]);
  });
  it("matches direct normalized kernel attention for every illustrated prefix", () => {
    for (let step = 1; step <= linearDemoInputs.length; step++) {
      const demo = attentionDemoAt(step);
      const q = linearDemoInputs[step - 1].q;
      const prefix = linearDemoInputs.slice(0, step);
      const scores = prefix.map(({ k }) => q[0] * k[0] + q[1] * k[1]);
      const total = scores.reduce((sum, score) => sum + score, 0);
      for (let column = 0; column < 2; column++) {
        const direct = prefix.reduce((sum, input, i) => sum + scores[i] * input.v[column], 0) / total;
        expect(demo.linearOutput[column]).toBeCloseTo(direct, 12);
      }
      expect(demo.fullWeights.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1, 12);
    }
  });

  it("shows a hand-checkable third step and distinguishes softmax from the linear kernel", () => {
    const demo = attentionDemoAt(3);
    expect(demo.previous).toEqual([[1, 2], [1, 4]]);
    expect(demo.update).toEqual([[4, 2], [2, 1]]);
    expect(demo.state).toEqual([[5, 4], [3, 5]]);
    expect(demo.normalizer).toEqual([4, 4]);
    expect(demo.numerator).toEqual([11, 14]);
    expect(demo.denominator).toBe(12);
    expect(demo.linearOutput[0]).toBeCloseTo(11 / 12, 12);
    expect(demo.linearOutput[1]).toBeCloseTo(14 / 12, 12);
    expect(demo.fullOutput[0]).not.toBeCloseTo(demo.linearOutput[0], 2);
  });

  it("carries the previous state forward without retaining a growing matrix", () => {
    expect(attentionDemoAt(1).previous).toEqual([[0, 0], [0, 0]]);
    for (let step = 2; step <= linearDemoInputs.length; step++) {
      const demo = attentionDemoAt(step);
      expect(demo.previous).toEqual(attentionDemoAt(step - 1).state);
      expect(demo.previousNormalizer).toEqual(attentionDemoAt(step - 1).normalizer);
      expect(demo.state).toHaveLength(2);
      expect(demo.state.every(row => row.length === 2)).toBe(true);
    }
  });
});

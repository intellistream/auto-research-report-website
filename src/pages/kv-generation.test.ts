import { describe, expect, it } from "vitest";
import { generationAt, generationConnections, generationFrames } from "./kv-generation";
import { attentionViewAt, advanceAttentionDemo, rewindAttentionDemo, type DemoCursor } from "./kv-linear-demo";

describe("one request across generation and attention", () => {
  it("connects writes only to newly created KV and reads only to existing KV without resubmitting history", () => {
    expect(Array.from({length:generationFrames.length}, (_, frame) => generationConnections(frame).writePositions))
      .toEqual([[], [1,2,3], [4], [], [], [5], []]);
    expect(generationConnections(3)).toEqual({writePositions:[], readPositions:[1,2,3,4], queryPosition:4});
    expect(generationConnections(5)).toEqual({writePositions:[5], readPositions:[], queryPosition:null});
    expect(generationConnections(6)).toEqual({writePositions:[], readPositions:[1,2,3,4,5], queryPosition:5});
    for (let frame=0; frame<generationFrames.length; frame++) {
      const current=generationAt(frame), previous=frame ? generationAt(frame-1).kvPositions : [];
      const flow=generationConnections(frame);
      expect(flow.writePositions).toEqual(current.kvPositions.filter(position=>!previous.includes(position)));
      expect(flow.readPositions.every(position=>current.kvPositions.includes(position))).toBe(true);
      if (current.pendingToken) expect(flow.writePositions).not.toContain(current.pendingToken);
      if (!flow.readPositions.length) expect(flow.queryPosition).toBeNull();
    }
  });

  it("keeps seven snapshots with only the KV positions that actually exist", () => {
    expect(generationFrames).toHaveLength(7);
    expect(generationFrames.map((_, frame) => generationAt(frame).kvPositions.length)).toEqual([0, 3, 4, 4, 4, 5, 5]);
    for (const [frame] of generationFrames.entries()) {
      const current = generationAt(frame);
      expect(current.kvPositions).toEqual(Array.from({ length: current.kvPositions.length }, (_, index) => index + 1));
      if (current.pendingToken) expect(current.kvPositions).not.toContain(current.pendingToken);
    }
    expect(generationAt(1).attentionOutput).toBe(3);
    expect(generationAt(1).pendingToken).toBe(4);
    expect(generationAt(5).attentionOutput).toBeNull();
    expect(generationAt(6).attentionOutput).toBe(5);
    for (const invalid of [-1, 1.5, 7, NaN]) expect(() => generationAt(invalid)).toThrow(RangeError);
  });
  it("creates KV only when a predicted token is processed in the next round", () => {
    const afterPrefill = generationAt(1);
    expect(afterPrefill.pendingToken).toBe(4);
    expect(afterPrefill.kvPositions).toEqual([1, 2, 3]);
    const written = generationAt(2);
    expect(written.pendingToken).toBeNull();
    expect(written.newKVPosition).toBe(4);
    expect(written.kvPositions).toEqual([...afterPrefill.kvPositions, 4]);
    const predicted = generationAt(4);
    expect(predicted.pendingToken).toBe(5);
    expect(predicted.kvPositions).toEqual(written.kvPositions);
    expect(generationAt(5).kvPositions).toEqual([...predicted.kvPositions, 5]);
  });

  it("reads the current position too, without mutating historical KV, and restores snapshots on revisit", () => {
    const written = generationAt(2);
    expect(generationAt(3).readPositions).toEqual([1, 2, 3, 4]);
    expect(generationAt(3).attentionOutput).toBe(4);
    expect(generationAt(3).pendingToken).toBeNull();
    expect(generationAt(3).kvPositions).toEqual(written.kvPositions);
    generationAt(5);
    expect(generationAt(2)).toEqual(written);
    expect(generationAt(4).currentPosition).toBeNull();
    expect(() => generationAt(7)).toThrow(RangeError);
  });

  it("separates x5 writing from reading without producing y5 early or growing KV during the read", () => {
    const written = generationAt(5), read = generationAt(6);
    expect(written.currentPosition).toBe(5);
    expect(written.kvPositions).toEqual([1,2,3,4,5]);
    expect(written.readPositions).toEqual([]);
    expect(written.attentionOutput).toBeNull();
    expect(written.action).toBe("用 Q5 读取历史");
    expect(read.kvPositions).toEqual(written.kvPositions);
    expect(read.readPositions).toEqual([1,2,3,4,5]);
    expect(read.attentionOutput).toBe(5);
    expect(generationConnections(6).writePositions).toEqual([]);
    expect(generationAt(5)).toEqual(written);
    for (let frame = 0; frame < generationFrames.length; frame++) {
      const flow = generationConnections(frame);
      expect(flow.writePositions.length > 0 && flow.readPositions.length > 0).toBe(false);
    }
  });

  it("requires update then read before advancing, carries state forward and reverses each action", () => {
    const ready: DemoCursor = { step: 4, phase: "ready" };
    const written = advanceAttentionDemo(ready);
    const read = advanceAttentionDemo(written);
    const next = advanceAttentionDemo(read);
    expect(written).toEqual({ step: 4, phase: "write" });
    expect(read).toEqual({ step: 4, phase: "read" });
    expect(next).toEqual({ step: 5, phase: "ready" });
    expect(attentionViewAt(ready).savedCount).toBe(3);
    expect(attentionViewAt(written).savedCount).toBe(4);
    expect(attentionViewAt(written).output).toBeNull();
    expect(attentionViewAt(read).visibleState).toEqual(attentionViewAt(written).visibleState);
    expect(attentionViewAt(next).visibleState).toEqual(attentionViewAt(read).visibleState);
    expect(attentionViewAt(next).visibleNormalizer).toEqual(attentionViewAt(read).visibleNormalizer);
    expect(rewindAttentionDemo(next)).toEqual(read);
    expect(rewindAttentionDemo(read)).toEqual(written);
    expect(rewindAttentionDemo(written)).toEqual(ready);
  });

  it("uses the same fourth-round calculation for the picture and expanded numbers", () => {
    const ready = attentionViewAt({ step: 4, phase: "ready" });
    const written = attentionViewAt({ step: 4, phase: "write" });
    const read = attentionViewAt({ step: 4, phase: "read" });
    expect(ready.visibleState).toEqual([[5, 4], [3, 5]]);
    expect(written.update).toEqual([[1, 2], [1, 2]]);
    expect(written.visibleState).toEqual([[6, 6], [4, 7]]);
    expect(read.visibleState).toEqual(written.visibleState);
    expect(read.visibleNormalizer).toEqual([5, 5]);
    expect(read.numerator).toEqual([10, 13]);
    expect(read.denominator).toBe(10);
    expect(read.output?.linear).toEqual([1, 1.3]);
    expect(read.output?.full[0]).toBeCloseTo(1, 12);
    expect(read.output?.full[1]).toBeCloseTo(1.335, 3);
  });

  it("can read the final token and keeps both ends bounded", () => {
    expect(advanceAttentionDemo({ step: 8, phase: "write" })).toEqual({ step: 8, phase: "read" });
    expect(advanceAttentionDemo({ step: 8, phase: "read" })).toEqual({ step: 8, phase: "read" });
    expect(rewindAttentionDemo({ step: 1, phase: "ready" })).toEqual({ step: 1, phase: "ready" });
    expect(attentionViewAt({ step: 1, phase: "ready" }).visibleState).toEqual([[0, 0], [0, 0]]);
  });
});

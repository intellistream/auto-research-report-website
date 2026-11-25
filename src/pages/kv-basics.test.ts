import { describe, expect, it } from "vitest";
import { estimateModelKVBytes, kvMemoryModels, doubleMemoryLoad, initialMemoryLoad, memoryReference } from "./kv-basics";

describe("model-specific full-attention KV estimates", () => {
  it("uses the official 14B GQA shape, including the 8 KV heads rather than 40 query heads", () => {
    const model = kvMemoryModels.find(item => item.id === "qwen3-14b")!;
    expect(estimateModelKVBytes(1, 1, model)).toBe(163840);
    expect(estimateModelKVBytes(8192, 4, model)).toBe(5 * 2 ** 30);
    // Keep the actual demand beyond the 64 GiB visual frame so the UI can show the excess.
    expect(estimateModelKVBytes(32768, 16, model)).toBe(80 * 2 ** 30);
  });

  it("counts only the hybrid 35B model's 10 full-attention layers and declares the 30 excluded linear layers", () => {
    const model = kvMemoryModels.find(item => item.id === "qwen3.5-35b-a3b")!;
    expect(model.linearAttentionLayers).toBe(30);
    expect(estimateModelKVBytes(1, 1, model)).toBe(20480);
    expect(estimateModelKVBytes(8192, 4, model)).toBe(0.625 * 2 ** 30);
    expect(estimateModelKVBytes(32768, 16, model)).toBe(10 * 2 ** 30);
  });
});


describe("capacity experiments", () => {
  it("keeps doubling exact for either factor and both factors, including the overflow case", () => {
    const base = initialMemoryLoad;
    const longer = doubleMemoryLoad(base, "tokens")!;
    const more = doubleMemoryLoad(base, "sequences")!;
    const both = doubleMemoryLoad(longer, "sequences")!;
    const max = doubleMemoryLoad(doubleMemoryLoad(both, "tokens")!, "sequences")!;
    const estimate = (load: typeof base) => estimateModelKVBytes(load.tokens, load.sequences, kvMemoryModels[0]) / 2 ** 30;
    expect([base, longer, more, both, max].map(estimate)).toEqual([5, 10, 10, 20, 80]);
    expect(estimate(max) - 64).toBe(16);
    expect(doubleMemoryLoad(max, "tokens")).toBeNull();
    expect(doubleMemoryLoad(max, "sequences")).toBeNull();
    expect(doubleMemoryLoad({ ...base, tokens: 17408 }, "tokens")).toBeNull();
    expect(doubleMemoryLoad({ ...base, sequences: 9 }, "sequences")).toBeNull();
    expect(base).toEqual({ modelId: "qwen3-14b", tokens: 8192, sequences: 4 });
  });

  it("changes only the model's KV shape at the same load, not the total model footprint", () => {
    for (const [tokens, requests] of [[8192, 4], [16384, 8], [32768, 16]]) {
      const full = estimateModelKVBytes(tokens, requests, kvMemoryModels[0]);
      const hybridPart = estimateModelKVBytes(tokens, requests, kvMemoryModels[1]);
      expect(hybridPart / full).toBe((10 / 40) * (2 / 8) * (256 / 128));
    }
  });
});

describe("fixed 64 GiB visual reference", () => {
  it("keeps the true fractional fill for a small hybrid subset", () => {
    const frame = memoryReference(0.625 * 2 ** 30);
    expect(frame.cells).toHaveLength(64);
    expect(frame.cells[0]).toBe(0.625);
    expect(frame.cells.slice(1).every(fill => fill === 0)).toBe(true);
    expect(frame.unfilledGiB).toBe(63.375);
    expect(frame.percent).toBe(0.9765625);
  });
  it("retains complete demand at, below and beyond the visual capacity", () => {
    const exact = memoryReference(64 * 2 ** 30);
    const over = memoryReference(80 * 2 ** 30);
    expect(exact.cells.every(fill => fill === 1)).toBe(true);
    expect(exact.overflowGiB).toBe(0);
    expect(exact.unfilledGiB).toBe(0);
    expect(over.gib).toBe(80);
    expect(over.percent).toBe(125);
    expect(over.overflowGiB).toBe(16);
    expect(over.cells.reduce((sum, fill) => sum + fill, 0)).toBe(64);
  });
  it("computes the optional 4 to 6 request self-check under the same full-attention scope", () => {
    expect(estimateModelKVBytes(8192, 6, kvMemoryModels[0]) / 2 ** 30).toBe(7.5);
  });
});

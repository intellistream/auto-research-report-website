import { describe, expect, it } from "vitest";
import { inferenceDemos, type DemoCell } from "./inference-demo-data";

const visible = (cells: DemoCell[]) => cells.filter(cell => cell.state !== "pending").map(cell => cell.text);

describe("inference demonstration continuity", () => {
  it("hands the first sampled token from prefill to decode", () => {
    const prefill = inferenceDemos.prefill.steps;
    expect(visible(prefill[0].rows[2].cells)).toEqual([]);
    expect(visible(prefill[1].rows[2].cells)).toEqual([]);
    expect(visible(prefill[2].rows[2].cells)).toEqual(visible(inferenceDemos.decode.steps[0].rows[0].cells));
    expect(prefill[1].rows[1].cells.every(cell => cell.state === "active")).toBe(true);
  });

  it("extends output and KV without replacing their existing prefix", () => {
    const steps = inferenceDemos.decode.steps;
    for (let i = 1; i < steps.length; i++) {
      for (const lane of [1, 2]) {
        const before = visible(steps[i - 1].rows[lane].cells);
        const after = visible(steps[i].rows[lane].cells);
        expect(after.slice(0, before.length)).toEqual(before);
        expect(after.length).toBe(before.length + 1);
      }
      const previousOutput = visible(steps[i - 1].rows[2].cells).at(-1)!;
      expect(visible(steps[i].rows[0].cells)).toEqual([previousOutput]);
      expect(visible(steps[i].rows[1].cells).at(-1)).toBe(`KV·${previousOutput}`);
    }
  });

  it("never displays unsent content and appends only the streaming delta", () => {
    let client = "";
    for (const frame of inferenceDemos.output_return.steps) {
      const delta = frame.rows[1].cells.filter(cell => cell.state === "active").map(cell => cell.text).join("");
      client += delta;
      expect(visible(frame.rows[2].cells).join("")).toBe(client);
      expect(visible(frame.rows[0].cells).join("").startsWith(client)).toBe(true);
    }
  });

  it("rejects the entire speculative suffix and commits only the corrected sequence", () => {
    const frames = inferenceDemos.speculative.steps;
    expect(visible(frames[0].rows[2].cells)).toEqual([]);
    const verified = frames[1].rows[1].cells;
    const firstRejected = verified.findIndex(cell => cell.state === "rejected");
    expect(firstRejected).toBeGreaterThan(0);
    expect(verified.slice(firstRejected).every(cell => cell.state === "rejected")).toBe(true);
    const committed = visible(frames[2].rows[2].cells);
    expect(committed.slice(0, firstRejected)).toEqual(visible(verified.slice(0, firstRejected)));
    for (const rejected of verified.slice(firstRejected)) expect(committed).not.toContain(rejected.text);
  });

  it("makes transferred KV usable only after reception and preserves its contents", () => {
    const frames = inferenceDemos.pd_transfer.steps;
    expect(visible(frames[0].rows[2].cells)).toEqual([]);
    expect(visible(frames[1].rows[2].cells)).toEqual([]);
    expect(visible(frames[2].rows[2].cells)).toEqual(visible(frames[0].rows[0].cells));
  });

  it("keeps every next-stage link within the available demonstrations", () => {
    for (const scenario of Object.values(inferenceDemos)) {
      expect(inferenceDemos[scenario.next.stage]).toBeDefined();
      for (const frame of scenario.steps) for (const row of frame.rows) {
        expect(new Set(row.cells.map(cell => cell.id)).size).toBe(row.cells.length);
      }
    }
  });
});

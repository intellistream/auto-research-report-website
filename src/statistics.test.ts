import { describe, it, expect } from "vitest";
import normal from "../public/data/normal/report.json";
import catalog from "../public/data/catalog.json";
import {
  aggregateStatistics,
  realCatalogItems,
  type ReportSnapshot,
} from "./statistics";
import { type CatalogItem, type Report, type RunData } from "./types";
const base = catalog.items.find((i) => i.id === "normal") as CatalogItem;
function snapshot(id = "real-1", day = "2026-11-03"): ReportSnapshot {
  const report = structuredClone(normal) as Report;
  report.synthetic = false;
  report.day = day;
  const item = { ...base, id, day, synthetic: false };
  return { item, report };
}
function setAllPending(s: ReportSnapshot) {
  for (const c of s.report.chapters)
    for (const g of c.groups)
      for (const e of g.entries) e.card.needs_review = true;
  return s;
}
describe("real homepage statistics", () => {
  it("excludes synthetic catalog items and synthetic reports", () => {
    const real = snapshot();
    expect(realCatalogItems([{ ...base, synthetic: true }, real.item])).toEqual(
      [real.item],
    );
    expect(
      aggregateStatistics([
        { ...real, item: { ...real.item, synthetic: true } },
      ]).total,
    ).toBe(0);
    expect(
      aggregateStatistics([
        { ...real, report: { ...real.report, synthetic: true } },
      ]).total,
    ).toBe(0);
  });
  it("counts pending PRs in the total, but excludes papers", () => {
    const s = setAllPending(snapshot());
    const result = aggregateStatistics([s]);
    expect(result.total).toBe(7);
    expect(result.pending).toBe(7);
    expect(result.papers).toBe(1);
    expect(result.sources.map((s) => s.count)).toEqual([4, 3]);
  });
  it("deduplicates the same PR across versions and preserves all report dates", () => {
    const a = snapshot("a"),
      b = snapshot("b", "2026-11-04");
    const result = aggregateStatistics([a, b]);
    expect(result.total).toBe(7);
    expect(result.reports).toBe(2);
    expect(result.daily.map((d) => d.total)).toEqual([7, 7]);
    expect(result.prs[0].versions).toBe(2);
  });
  it("does not pretend mixed version review states are approval", () => {
    const a = setAllPending(snapshot("a")),
      b = snapshot("b");
    const result = aggregateStatistics([a, b]);
    expect(result.pending).toBe(7);
    expect(result.review.find((s) => s.key === "mixed")?.count).toBe(7);
    expect(result.review.find((s) => s.key === "unflagged")?.count).toBe(0);
  });
  it("keeps pending inventory with no rendered card and deduplicates matching cards", () => {
    const s = snapshot();
    s.report.pending_prs = [
      {
        candidate: {
          repository: "vllm-project/vllm",
          pr_number: 2,
          title: "already rendered",
        },
        status: "pending",
        reason: "pending",
      },
      {
        candidate: {
          repository: "vllm-project/vllm",
          pr_number: 999,
          title: "no card yet",
        },
        status: "pending",
        reason: "analysis missing",
      },
    ];
    const result = aggregateStatistics([s]);
    expect(result.total).toBe(8);
    expect(result.pending).toBe(2);
    expect(result.review.find((r) => r.key === "mixed")?.count).toBe(1);
    expect(result.prs.find((p) => p.workId.endsWith("#999"))?.review).toBe(
      "pending",
    );
  });
  it("separates repositories with the same PR number", () => {
    const s = snapshot();
    s.report.pending_prs = [
      {
        candidate: {
          repository: "vllm-project/vllm",
          pr_number: 999,
          title: "one",
        },
        status: "pending",
        reason: "pending",
      },
      {
        candidate: {
          repository: "vllm-project/vllm-ascend",
          pr_number: 999,
          title: "two",
        },
        status: "pending",
        reason: "pending",
      },
    ];
    expect(aggregateStatistics([s]).total).toBe(9);
  });
  it("applies repository and day filters to the counts", () => {
    const s = snapshot();
    expect(aggregateStatistics([s], "ascend").total).toBe(3);
    expect(aggregateStatistics([s], "", "2026-11-05").total).toBe(0);
  });
  it("does not fabricate dates without delivered reports", () => {
    const s = snapshot();
    expect(aggregateStatistics([s]).daily.map((d) => d.day)).toEqual([
      "2026-11-03",
    ]);
  });
  it("does not turn missing run metadata into zero failures", () => {
    expect(aggregateStatistics([snapshot()]).failures).toBeNull();
  });
  it("counts known failures once per PR even when versions repeat", () => {
    const a = snapshot("a");
    const outcomes: NonNullable<RunData["outcomes"]> = {};
    for (const c of a.report.chapters)
      for (const g of c.groups)
        for (const e of g.entries) {
          outcomes[e.card.card_id] = {
            analysis: e.number === "V1" ? "failed" : "card_delivered",
            review: null,
            classification: null,
            classification_receipt: false,
            writing: null,
            writing_error: null,
          };
        }
    a.run = { outcomes } as RunData;
    const b = { ...snapshot("b"), run: a.run };
    expect(aggregateStatistics([a, b]).failures).toBe(1);
  });
  it("keeps day-specific pending bars accurate across state changes", () => {
    const a = setAllPending(snapshot("a", "2026-11-03")),
      b = snapshot("b", "2026-11-04");
    expect(aggregateStatistics([a, b]).daily.map((d) => d.pending)).toEqual([
      7, 0,
    ]);
  });
});

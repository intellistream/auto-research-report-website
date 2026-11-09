import { describe, it, expect } from "vitest";
import normal from "../public/data/normal/report.json";
import catalog from "../catalog.example.json";
import {
  optimizationStatistics,
  connectedSegments,
  directionDefinitions,
} from "./optimization";
import {
  entriesOf,
  type CatalogItem,
  type Report,
  type RunData,
  type Entry,
  type ChapterKey,
} from "./types";
import { type ReportSnapshot } from "./statistics";
const item = catalog.items.find((i) => i.id === "normal") as CatalogItem;
function snapshot(id = "a", day = "2026-11-03"): ReportSnapshot {
  const report = structuredClone(normal) as Report;
  report.synthetic = false;
  report.day = day;
  return { item: { ...item, id, day, synthetic: false }, report };
}
function retain(s: ReportSnapshot, ids: string[]) {
  for (const c of s.report.chapters)
    for (const g of c.groups)
      g.entries = g.entries.filter((e) => ids.includes(e.card.work_id));
  return s;
}
function engineering(s: ReportSnapshot) {
  return entriesOf(s.report).filter((e) => e.card.source_type !== "paper");
}
function classify(e: Entry, chapter: ChapterKey) {
  e.card.content.chapter = chapter;
}
function confirmed(s: ReportSnapshot) {
  const outcomes: NonNullable<RunData["outcomes"]> = {};
  for (const e of engineering(s)) {
    e.card.content.location_basis = "delivered_chapter";
    outcomes[e.card.card_id] = {
      analysis: "card_delivered",
      review: "escalated",
      classification: "confirmed",
      classification_receipt: true,
      writing: "skipped",
      writing_error: null,
    };
  }
  s.run = { outcomes } as RunData;
  return s;
}
describe("optimization direction statistics", () => {
  it("uses report first-level chapters, counts pending, and excludes papers and examples", () => {
    const s = confirmed(snapshot());
    for (const e of engineering(s)) e.card.needs_review = true;
    const r = optimizationStatistics([
      s,
      { ...s, item: { ...s.item, synthetic: true } },
      { ...s, report: { ...s.report, synthetic: true } },
    ]);
    expect(r.total).toBe(7);
    expect(r.pending).toBe(7);
    expect(r.papers).toBe(1);
    expect(r.tentative).toBe(0);
    expect(r.directions.reduce((n, d) => n + d.count, 0)).toBe(7);
    for (const d of r.directions)
      expect(d.count).toBe(
        engineering(s).filter((e) => e.card.content.chapter === d.key).length,
      );
    expect(r.directions.reduce((n, d) => n + (d.share ?? 0), 0)).toBeCloseTo(
      100,
    );
    expect(directionDefinitions.slice(0, 8).map((d) => d.label)).toEqual(
      s.report.chapters
        .filter((c) => c.key !== "papers")
        .map((c) => c.title.replace(/^[一二三四五六七八九十]+[、 ]\s*/, "")),
    );
  });
  it("keeps provisional chapter assignments in the pie with an unconfirmed marker", () => {
    const s = confirmed(snapshot()),
      e = engineering(s)[0];
    e.card.content.location_basis = "provisional_pending_classification";
    const r = optimizationStatistics([s]);
    expect(r.total).toBe(7);
    expect(r.tentative).toBe(1);
    expect(r.prs.find((p) => p.workId === e.card.work_id)).toMatchObject({
      direction: e.card.content.chapter,
      classificationConfirmed: false,
    });
  });
  it("requires the classification receipt, even when the stage says confirmed", () => {
    const s = confirmed(snapshot()),
      e = engineering(s)[0];
    s.run!.outcomes![e.card.card_id].classification_receipt = false;
    expect(optimizationStatistics([s]).tentative).toBe(1);
  });
  it("retains unrendered pending PRs in the denominator without guessing a direction", () => {
    const s = confirmed(snapshot());
    s.report.pending_prs = [
      {
        candidate: {
          repository: "vllm-project/vllm",
          pr_number: 999,
          title: "Decode keyword must not classify this",
        },
        status: "pending",
        reason: "missing card",
      },
    ];
    const r = optimizationStatistics([s]),
      d = r.directions.find((d) => d.key === "unclassified")!;
    expect(r.total).toBe(8);
    expect(d.count).toBe(1);
    expect(d.share).toBe(12.5);
    expect(r.series[0].counts.unclassified).toBe(1);
  });
  it("deduplicates rendered and pending entries and repeated versions on one day", () => {
    const s = confirmed(snapshot()),
      e = engineering(s)[0];
    const [repository, num] = e.card.work_id.slice(7).split("#");
    s.report.pending_prs = [
      {
        candidate: { repository, pr_number: Number(num), title: "same PR" },
        status: "pending",
        reason: "review",
      },
    ];
    const r = optimizationStatistics([
      s,
      { ...s, item: { ...s.item, id: "b" } },
    ]);
    expect(r.total).toBe(7);
    expect(r.series).toHaveLength(1);
    expect(r.series[0].total).toBe(7);
    expect(Object.values(r.series[0].counts).reduce((a, b) => a + b, 0)).toBe(
      7,
    );
  });
  it("counts a PR with conflicting first-level chapters once and shows the conflict", () => {
    const a = snapshot(),
      b = snapshot("b"),
      id = engineering(a)[0].card.work_id;
    retain(a, [id]);
    retain(b, [id]);
    classify(engineering(a)[0], "prefill");
    classify(engineering(b)[0], "decode");
    const r = optimizationStatistics([a, b]);
    expect(r.total).toBe(1);
    expect(r.prs[0].direction).toBe("classification_conflict");
    expect(r.series[0].counts.classification_conflict).toBe(1);
    expect(
      r.directions.find((d) => d.key === "classification_conflict")?.share,
    ).toBe(100);
  });
  it("applies source and date range filters to both charts", () => {
    const r = optimizationStatistics(
      [snapshot("a"), snapshot("b", "2026-11-04"), snapshot("c", "2026-11-06")],
      "ascend",
      "2026-11-04",
      "2026-11-05",
    );
    expect(r.total).toBe(3);
    expect(r.series.map((d) => d.day)).toEqual(["2026-11-04"]);
    expect(r.series[0].total).toBe(3);
    expect(r.prs.every((p) => p.source === "ascend")).toBe(true);
  });
  it("computes daily quantity and percentage-point changes across consecutive real dates", () => {
    const a = snapshot(),
      b = snapshot("b", "2026-11-04"),
      ids = engineering(a)
        .slice(0, 3)
        .map((e) => e.card.work_id);
    retain(a, ids.slice(0, 2));
    retain(b, ids);
    engineering(a).forEach((e) => classify(e, "prefill"));
    engineering(b).forEach((e, i) =>
      classify(e, i === 0 ? "prefill" : "decode"),
    );
    const r = optimizationStatistics([b, a]),
      d = r.changes.find((d) => d.key === "prefill")!;
    expect(r.total).toBe(3);
    expect(r.series.map((d) => d.total)).toEqual([2, 3]);
    expect(r.series.map((d) => d.counts.prefill)).toEqual([2, 1]);
    expect(d.countDelta).toBe(-1);
    expect(d.shareDelta).toBeCloseTo(100 / 3 - 100);
    expect(r.adjacentDates).toBe(true);
  });
  it("does not invent trends or comparisons for one date or gaps", () => {
    const r = optimizationStatistics([snapshot()]);
    expect(r.series).toHaveLength(1);
    expect(
      r.changes.every((d) => d.countDelta === null && d.shareDelta === null),
    ).toBe(true);
    const gap = optimizationStatistics([
      snapshot(),
      snapshot("b", "2026-11-05"),
    ]);
    expect(gap.series).toHaveLength(2);
    expect(gap.adjacentDates).toBe(false);
    expect(gap.changes.every((d) => d.countDelta === null)).toBe(true);
    expect(
      connectedSegments([
        { day: "2026-11-03", value: 1 },
        { day: "2026-11-05", value: 1 },
      ]).map((s) => s.length),
    ).toEqual([1, 1]);
  });
  it("preserves an actual empty report as zero counts and unknown proportions", () => {
    const s = retain(snapshot(), []),
      r = optimizationStatistics([s]);
    expect(r.total).toBe(0);
    expect(r.series[0].total).toBe(0);
    expect(r.series[0].counts.prefill).toBe(0);
    expect(r.series[0].shares.prefill).toBeNull();
    expect(r.directions.every((d) => d.share === null)).toBe(true);
    expect(
      connectedSegments([
        { day: "2026-11-03", value: 1 },
        { day: "2026-11-04", value: null },
        { day: "2026-11-05", value: 2 },
      ]).map((s) => s.length),
    ).toEqual([1, 1]);
    expect(optimizationStatistics([]).series).toEqual([]);
  });
});

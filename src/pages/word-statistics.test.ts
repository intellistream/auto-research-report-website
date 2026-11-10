import { describe, expect, it } from "vitest";
import productionCatalog from "../../public/word-reports/catalog.json";
import {
  selectedVersions,
  validateWordReport,
  wordStatistics,
} from "./word-statistics";
import { connectedSegments } from "../optimization";
import type { Catalog, Report } from "./docx-data";

const catalog = productionCatalog as Catalog;
const productionReports = import.meta.glob<Report>(
  "../../public/word-reports/*/*/report.json",
  { eager: true, import: "default" },
);
const selection = selectedVersions(catalog);
const reports = selection.map(({ day, version }) =>
  validateWordReport(
    productionReports["../../public/word-reports/" + version!.path],
    day,
    version!,
  ),
);
function fixture(day = "2026-11-02"): Report {
  return {
    schemaVersion: 1,
    sha256: "fixture",
    day,
    title: "Test fixture",
    originalName: "fixture.docx",
    intro: [],
    warnings: [],
    counts: { upstream: 1, ascend: 0, papers: 0 },
    sections: [
      {
        key: "prefill",
        title: "五 Prefill 输入上下文处理",
        blocks: [
          {
            kind: "entry",
            number: "V1",
            title: "Fixture PR",
            workId: "github:vllm-project/vllm#123",
            paragraphs: [
              [
                {
                  text: "Fixture source",
                  url: "https://github.com/vllm-project/vllm/pull/123",
                },
              ],
            ],
          },
        ],
      },
    ],
  };
}

describe("Word statistics on the production report set", () => {
  it("uses all 17 real reports and distinguishes engineering articles, primary PRs and associated PRs", () => {
    const stats = wordStatistics(reports);
    expect(
      reports.reduce(
        (sum, r) =>
          sum +
          r.sections.flatMap((s) => s.blocks).filter((b) => b.kind === "entry")
            .length,
        0,
      ),
    ).toBe(410);
    expect(stats.total).toBe(385);
    expect(stats.primaryTotal).toBe(384);
    expect(stats.linkedOnly).toBe(1);
    expect(stats.papers).toBe(26);
    expect(stats.series).toHaveLength(17);
    expect(stats.sources.map((s) => s.count)).toEqual([238, 147]);
    expect(stats.directions.slice(0, 8).map((d) => d.count)).toEqual([
      37, 80, 61, 17, 103, 57, 15, 15,
    ]);
    expect(
      stats.directions.reduce((sum, d) => sum + (d.share ?? 0), 0),
    ).toBeCloseTo(100);
    expect(stats.unidentified).toBe(0);
    expect(
      stats.prs.find((p) => p.workId === "github:vllm-project/vllm#65102"),
    ).toMatchObject({
      day: "2026-11-02",
      number: "V17",
      primary: false,
      direction: "speculative",
    });
    expect(
      stats.prs.find((p) => p.workId === "github:vllm-project/vllm#65103"),
    ).toMatchObject({ primary: true, number: "V17" });
  });
  it("uses source and real report dates for both cumulative and daily statistics", () => {
    const stats = wordStatistics(
      reports,
      "github:vllm-project/vllm-ascend",
      "2026-11-07",
      "2026-11-08",
    );
    expect(stats.series.map((d) => d.day)).toEqual([
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(
      stats.prs.every((p) =>
        p.workId.startsWith("github:vllm-project/vllm-ascend#"),
      ),
    ).toBe(true);
    for (const day of stats.series) {
      expect(day.total).toBe(catalog.days[day.day].versions[0].counts.ascend);
      expect(Object.values(day.counts).reduce((a, b) => a + b, 0)).toBe(
        day.total,
      );
    }
    expect(stats.total).toBe(stats.series.reduce((n, d) => n + d.total, 0));
    expect(stats.papers).toBe(
      reports
        .filter((r) => r.day >= "2026-11-07")
        .reduce((n, r) => n + r.counts.papers, 0),
    );
    expect(wordStatistics(reports, "", "2027-01-01").total).toBe(0);
  });
  it("reads only the current catalog version and preserves the versioned entry anchor", () => {
    const changed = structuredClone(catalog);
    changed.days["2026-11-08"].versions.push({
      ...changed.days["2026-11-08"].versions[0],
      sha256: "old",
      path: "old.json",
    });
    const selected = selectedVersions(changed, "2026-11-08", "2026-11-08");
    expect(selected).toHaveLength(1);
    expect(selected[0].version?.sha256).toBe(
      catalog.days["2026-11-08"].current,
    );
    const report = reports.find((r) => r.day === "2026-11-08")!;
    expect(
      wordStatistics([report]).prs.every(
        (p) => p.day === report.day && p.version === report.sha256,
      ),
    ).toBe(true);
    expect(() =>
      validateWordReport(report, "2026-11-07", selected[0].version!),
    ).toThrow();
    expect(() =>
      validateWordReport(
        { ...report, sha256: "wrong" },
        report.day,
        selected[0].version!,
      ),
    ).toThrow();
    expect(() =>
      validateWordReport(
        { ...report, counts: { ...report.counts, papers: null } },
        report.day,
        selected[0].version!,
      ),
    ).toThrow();
    expect(() =>
      validateWordReport(
        { ...report, schemaVersion: 99 },
        report.day,
        selected[0].version!,
      ),
    ).toThrow();
  });
});

describe("statistics data boundaries", () => {
  it("deduplicates each PR across dates but keeps its daily occurrences", () => {
    const stats = wordStatistics([fixture(), fixture("2026-11-03"), fixture()]);
    expect(stats.total).toBe(1);
    expect(stats.series.map((d) => d.total)).toEqual([1, 1]);
    expect(stats.prs[0].days).toEqual(["2026-11-02", "2026-11-03"]);
    expect(stats.changes.find((d) => d.key === "prefill")?.countDelta).toBe(0);
  });
  it("retains conflicting directions once and does not guess a chapter", () => {
    const a = fixture(),
      b = fixture("2026-11-03");
    b.sections[0].key = "decode";
    const stats = wordStatistics([a, b]);
    expect(stats.total).toBe(1);
    expect(
      stats.directions.find((d) => d.key === "classification_conflict")?.count,
    ).toBe(1);
    expect(stats.series.map((d) => d.counts.classification_conflict)).toEqual([
      0, 0,
    ]);
    expect(stats.changes.find((d) => d.key === "prefill")?.shareDelta).toBe(
      -100,
    );
    a.sections[0].key = "unknown";
    expect(
      wordStatistics([a]).directions.find((d) => d.key === "unclassified")
        ?.count,
    ).toBe(1);
  });
  it("counts explicit PR links only and reports unidentifiable entries without fabricating IDs", () => {
    const report = fixture(),
      block = report.sections[0].blocks[0];
    if (block.kind !== "entry") throw new Error("fixture");
    delete block.workId;
    block.paragraphs = [
      [
        { text: "unmerged PR #999 mentioned in prose" },
        { text: "unsafe", url: "javascript:alert(1)" },
        {
          text: "credential",
          url: "https://user:password@github.com/vllm-project/vllm/pull/999",
        },
        {
          text: "other host",
          url: "https://github.com.example.com/vllm-project/vllm/pull/999",
        },
      ],
    ];
    expect(wordStatistics([report])).toMatchObject({
      total: 0,
      unidentified: 1,
    });
    block.paragraphs[0].push({
      text: "valid",
      url: "https://github.com/vllm-project/vllm/pull/999",
    });
    expect(wordStatistics([report])).toMatchObject({
      total: 1,
      linkedOnly: 1,
      unidentified: 0,
    });
  });
  it("preserves real empty days and gaps without manufacturing proportions or trends", () => {
    const empty = fixture();
    empty.sections[0].blocks = [];
    const stats = wordStatistics([empty, fixture("2026-11-04")]);
    expect(stats.series.map((d) => d.day)).toEqual([
      "2026-11-02",
      "2026-11-04",
    ]);
    expect(stats.series[0].total).toBe(0);
    expect(stats.series[0].shares.prefill).toBeNull();
    expect(stats.adjacentDates).toBe(false);
    expect(stats.changes.every((d) => d.countDelta === null)).toBe(true);
    expect(
      connectedSegments(
        stats.series.map((d) => ({ day: d.day, value: d.counts.prefill })),
      ).map((s) => s.length),
    ).toEqual([1, 1]);
    expect(
      wordStatistics([fixture()]).changes.every((d) => d.shareDelta === null),
    ).toBe(true);
  });
});

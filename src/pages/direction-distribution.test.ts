import { describe, expect, it } from "vitest";
import index from "../../public/word-reports/flow-index.json";
import { uniquePRs } from "./ReportTrends";
import {
  communitySources,
  directionDistribution,
} from "./direction-distribution";

describe("homepage cumulative distribution", () => {
  it("uses the same primary PR population as the homepage, including community/date filters", () => {
    const entries = uniquePRs(index.entries);
    const stats = directionDistribution(entries);
    const workIds = new Set(index.entries.map((e) => e.workId));
    expect(stats.total).toBe(workIds.size);
    expect(stats.directions.reduce((sum, d) => sum + d.count, 0)).toBe(
      stats.total,
    );
    expect(
      stats.directions.reduce((sum, d) => sum + (d.share ?? 0), 0),
    ).toBeCloseTo(100);
    expect(
      communitySources.map(
        (source) =>
          directionDistribution(
            entries.filter((e) => e.workId.split("#")[0] === source.key),
          ).total,
      ),
    ).toEqual(
      communitySources.map(
        (source) => [...workIds].filter((workId) => workId.split("#")[0] === source.key).length,
      ),
    );
    const recent = uniquePRs(
      index.entries.filter(
        (e) => e.day >= "2026-11-07" && e.day <= "2026-11-08",
      ),
    );
    expect(
      communitySources.map(
        (source) =>
          directionDistribution(
            recent.filter((e) => e.workId.split("#")[0] === source.key),
          ).total,
      ),
    ).toEqual([19, 6]);
  });
  it("preserves unrecognized directions in the denominator and leaves empty shares unknown", () => {
    const empty = directionDistribution([]);
    expect(empty.total).toBe(0);
    expect(
      empty.directions.every((d) => d.count === 0 && d.share === null),
    ).toBe(true);
    const stats = directionDistribution([
      { ...index.entries[0], stage: "unknown-heading" },
    ]);
    expect(stats.total).toBe(1);
    expect(
      stats.directions.find((d) => d.key === "unclassified"),
    ).toMatchObject({ count: 1, share: 100 });
  });
});

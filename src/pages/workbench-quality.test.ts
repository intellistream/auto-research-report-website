import { describe, expect, it } from "vitest";
import { parseReportInfo, qualityLabels } from "./workbench-quality";
describe("factual report quality and historical scope", () => {
  it.each([
    ["approved", "generated", []],
    ["needs_revision", "generated", ["需修订"]],
    ["insufficient_evidence", "insufficient_evidence", ["证据不足"]],
    [undefined, undefined, ["质量状态未提供"]],
    ["new_unknown_status", "generated", ["审查状态未知"]],
    ["approved", "unavailable", ["综合未生成"]],
    ["needs_review", "generated", ["审查结果未明确"]],
    ["approved", undefined, ["综合状态未提供"]],
  ])("keeps %s/%s distinct from generation completion", (review, synthesis, labels) => {
    expect(qualityLabels({ reviewOutcome: review as string | undefined, synthesisOutcome: synthesis as string | undefined })).toEqual(labels);
  });
  it("keeps the producer revision outcome when the integration also supplies needs_review", () => {
    expect(qualityLabels({ reviewOutcome: "needs_revision", reviewStatus: "needs_review", synthesisStatus: "generated" })).toEqual(["需修订"]);
  });
  it("uses stored dates and final review issues, excluding resolved earlier checks", () => {
    const info = parseReportInfo({ coverage: { startDate: "2020-01-02", endDate: "2020-02-01" }, review: { issues: [], checks: [{ issues: [{ reason: "已解决的旧问题" }] }] } });
    expect(info.range).toEqual({ start: "2020-01-02", end: "2020-02-01" }); expect(info.issues).toEqual([]);
    expect(parseReportInfo({ review: { checks: [{ issues: [{ reason: "旧问题" }] }, { issues: [{ reason: "最终记录的原因", sourceIds: ["A"] }] }] } }).issues).toEqual([{ reason: "最终记录的原因", claim: undefined, sourceIds: ["A"] }]);
  });
  it("does not reconstruct absent or invalid scope or fabricate an issue", () => {
    for (const coverage of [undefined, { startDate: "2020-02-30", endDate: "2020-03-01" }, { startDate: "2020-03-01", endDate: "2020-02-01" }]) expect(parseReportInfo({ coverage }).range).toBeUndefined();
    expect(parseReportInfo({ review: { status: "needs_revision", issues: [{ claim: "没有原因的表述" }] } }).issues).toEqual([]);
  });
});

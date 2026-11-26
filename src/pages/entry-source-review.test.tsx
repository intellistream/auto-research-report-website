import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import DailyReportReader from "./DailyReportReader";
import type { Report, SourceReview } from "./report-preview-data";

function renderReview(status?: SourceReview["status"]) {
  const day = "2026-11-20", sha256 = "a".repeat(64);
  const counts = { upstream: 1, ascend: 0, papers: 0 };
  const version = { sha256, path: `${day}/${sha256}/report.json`, counts };
  const sourceReview = status ? { reviewer: "Codex", reviewedAt: "2026-11-26T16:00:00+08:00",
    status, summary: "原表是预填充实测，未测解码提速。", sources: ["https://github.com/vllm-project/vllm/pull/123"] } : undefined;
  const report: Report = { day, sha256, title: "日报", intro: [], counts, warnings: [],
    pipelineStatus: "complete_with_pending", publicationStatus: "reviewed",
    ...(status ? { sourceReview: { parentVersion: "b".repeat(64), reviewer: "Codex",
      reviewedAt: "2026-11-26T16:00:00+08:00", counts: { [status]: 1 } } } : {}),
    sections: [{ key: "prefill", title: "预填充", blocks: [{ kind: "entry", number: "V1",
      title: "预填充优化", workId: "github:vllm-project/vllm#123", paragraphs: [[{ text: "问题：原问题。" }]],
      needsReview: !status || status === "unverified", sourceReview }] }] };
  return renderToStaticMarkup(<MemoryRouter><DailyReportReader
    catalog={{ schemaVersion: 1, days: { [day]: { current: sha256, versions: [version] } } }}
    days={[day]} day={day} version={version} result={{ data: report }} /></MemoryRouter>);
}

describe("entry source review results", () => {
  it("shows the correction evidence and the completed status", () => {
    const html = renderReview("corrected");
    expect(html).toContain("专家修订后通过");
    expect(html).toContain("待核对项已核完");
    expect(html).toContain("原表是预填充实测，未测解码提速。");
    expect(html).toContain('href="https://github.com/vllm-project/vllm/pull/123"');
    expect(html).not.toContain("系统标记待核对");
  });
  it("keeps unresolved evidence visible as pending", () => {
    const html = renderReview("unverified");
    expect(html).toContain("核对后仍待补证据");
    expect(html).toContain("系统标记待核对");
    expect(html).toContain("仍有条目待补证据");
  });
  it("keeps the original warning when no entry review was delivered", () => {
    const html = renderReview();
    expect(html).toContain("系统标记待核对");
    expect(html).not.toContain("专家核对通过");
  });
});

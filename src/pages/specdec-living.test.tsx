import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import reviewedSurvey from "../../topics/speculative-decoding/survey.json";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import { validatedSurvey, readingSurvey } from "./topic-survey";

const index = actualIndex as unknown as TopicIndex;
const spec = index.topics.find(item => item.id === "speculative-decoding") as Topic;
function render(path: string): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/topics/:topicId" element={<TopicPages index={index} />} /></Routes>
  </MemoryRouter>);
}

describe("SpecDec novice-to-research reading contract", () => {
  it("binds a report-only editorial survey without fabricating an academic PDF", () => {
    expect(spec.academicPaper).toBeUndefined();
    expect(spec.survey).toEqual(reviewedSurvey);
    expect(validatedSurvey(spec)).toEqual(reviewedSurvey);
    expect(readingSurvey(spec)?.routes.map(route => route.id)).toEqual([
      "candidate", "verification", "accepted-state", "runtime",
    ]);
  });

  it("provides a plain-language introduction and algorithmic manuscript", () => {
    const guide = render("/topics/speculative-decoding");
    expect(guide).toContain("一次 Target 前向");
    expect(guide).toContain("从零开始，如何阅读本专题？");
    expect(guide).toContain("view=paper");
    const paper = render("/topics/speculative-decoding?view=paper");
    expect(paper).toContain("历史演进：每一代方法改变了哪项成本");
    expect(paper).toContain("一轮 K=3");
    expect(paper).toContain("跨层阅读线索");
    expect(paper).toContain(reviewedSurvey.routes[0].assessment);
    expect(paper).toContain("参考文献与原始工程来源");
  });

  it("shows all eight rich research chapters by default, not appendix-only", () => {
    const report = render("/topics/speculative-decoding?view=report");
    expect(report).toContain("本章综合判断");
    expect(report).toContain("历史演进：解决一个依赖");
    expect(report).toContain("失败或负对照");
    expect(report).toContain("证伪条件");
    expect(report).toContain("完整 PR 证据记录");
    expect(report).toContain("PDF 尚未生成");
    expect(report).toContain('open=""');
    expect(report).toContain("8 节正文");
    expect(report).toContain("part=survey-section-6");
    expect(report).toContain("part=survey-evidence-E2");
  });

  it("permits condensed reading and excludes stale editorial evidence", () => {
    const brief = render("/topics/speculative-decoding?view=report&read=brief");
    expect(brief).toContain("快速阅读");
    expect(brief).toContain("具体分析");
    const stale = structuredClone(spec);
    stale.survey = { ...spec.survey!, reportVersion: "0".repeat(64) };
    expect(validatedSurvey(stale)).toBeUndefined();
    expect(readingSurvey(stale)?.routes[0].id).toBe("route-0");
  });
});

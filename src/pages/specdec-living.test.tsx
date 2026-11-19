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
  it("binds the manuscript and reviewed report to their respective frozen versions", () => {
    expect(spec.academicPaper).toBeDefined();
    expect(spec.academicPaper!.version).toMatch(/^[a-f0-9]{64}$/);
    expect(spec.survey).toEqual(reviewedSurvey);
    expect(spec.survey!.paperVersion).toBe(spec.academicPaper!.version);
    expect(validatedSurvey(spec)).toEqual(reviewedSurvey);
    expect(readingSurvey(spec)?.routes.map(route => route.id)).toEqual([
      "candidate", "verification", "accepted-state", "runtime",
    ]);
  });

  it("shows the full academic paper through ACLGraph's versioned reader instead of the legacy hardcoded survey", () => {
    const guide = render("/topics/speculative-decoding");
    expect(guide).toContain("一次 Target 前向");
    expect(guide).toContain("从零开始，如何阅读本专题？");
    expect(guide).toContain("view=paper");
    const paper = render("/topics/speculative-decoding?view=paper");
    expect(paper).toContain(spec.academicPaper!.title);
    expect(paper).toContain("完整正文");
    expect(paper).toContain("下载同版 PDF");
    expect(paper).toContain(spec.academicPaper!.version);
    expect(paper).toContain("paper.html");
    expect(paper).toContain("references.bib");
    expect(paper).not.toContain("一轮 K=3");
    expect(paper).not.toContain("历史演进：每一代方法改变了哪项成本");
    expect(paper).not.toContain("specdec-manuscript");
  });

  it("keeps eight substantive chapters in the same nested collapsible reader as ACL", () => {
    const report = render("/topics/speculative-decoding?view=report");
    expect(report).toContain("本章综合判断");
    expect(report).toContain("技术演进与瓶颈迁移");
    expect(report).toContain("失败或负对照");
    expect(report).toContain("证伪条件");
    expect(report).toContain("局部工程证据对照");
    expect(report).not.toContain("specdec-research-assets");
    expect(report).not.toContain("105 条 PR 候选账本");
    expect(report).not.toContain("10 条核心 PR 核验记录");
    expect(report).not.toContain("固定源码与支持矩阵");
    expect(report).toContain("PDF 尚未生成");
    expect(report).toContain("8 节正文");
    expect(report).toContain('id="survey-analysis"');
    expect(report).not.toContain('id="survey-analysis" tabindex="-1" open=""');
    const full = render("/topics/speculative-decoding?view=report&read=full");
    expect(full).toContain('id="survey-analysis" tabindex="-1" open=""');
    expect(full).toContain('id="survey-section-0" tabindex="-1"');
    expect(report).toContain("part=survey-section-6");
    expect(report).toContain("part=survey-evidence-E2");
  });

  it("matches ACL's first four academic sections and preserves Chinese progressive headings", () => {
    const html = render("/topics/speculative-decoding?view=report&read=full");
    const directory = html.slice(html.indexOf('class="survey-toc"'), html.indexOf("</nav>", html.indexOf('class="survey-toc"')));
    const firstFour = [
      ["survey-abstract", "摘要与研究问题"],
      ["survey-methods", "范围与研究方法"],
      ["survey-taxonomy", "技术路线与权衡"],
      ["survey-evidence", "局部工程证据对照"],
    ] as const;
    let previous = -1;
    for (const [anchor, heading] of firstFour) {
      const position = directory.indexOf(`part=${anchor}`);
      expect(position, heading).toBeGreaterThan(previous);
      expect(directory).toContain(heading);
      previous = position;
    }
    expect(html.indexOf('id="survey-evidence"')).toBeLessThan(html.indexOf('id="survey-section-0"'));
    expect(html).toContain("候选生成：从历史检索到并行块式草稿");
    expect(html).toContain("目标验证：从固定长度到动态预算");
    expect(html).toContain("服务运行时：图执行、调度与容量约束");
    expect(html).toContain("跨层证据综合：瓶颈迁移与因果边界");
    expect(html).toContain("自适应验证：预算选择器的执行成本");
    expect(html).toContain("当前网站候选索引共 125 条");
  });

  it("uses ACLGraph's exact two-level disclosure contract in brief and full modes", () => {
    for (const topicId of ["aclgraph", "speculative-decoding"]) {
      const brief = render(`/topics/${topicId}?view=report`);
      if (topicId === "aclgraph") {
        expect(brief).toContain("研究范围与方法");
        expect(brief).toContain("如何使用这些来源");
      } else {
        expect(brief).toContain("范围与研究方法");
        expect(brief).toContain("证据层级与适用边界");
      }
      const full = render(`/topics/${topicId}?view=report&read=full`);
      const outer = (html: string) => html.match(/<details[^>]*id="survey-analysis"[^>]*>/)?.[0];
      const chapters = (html: string) => [...html.matchAll(/<details[^>]*class="survey-body-section"[^>]*>/g)]
        .map(match => match[0]);
      expect(outer(brief), topicId).toBeDefined();
      expect(outer(brief), topicId).not.toContain('open=""');
      expect(chapters(brief), topicId).toHaveLength(8);
      expect(chapters(brief).every(tag => !tag.includes('open=""')), topicId).toBe(true);
      expect(outer(full), topicId).toContain('open=""');
      expect(chapters(full), topicId).toHaveLength(8);
      expect(chapters(full).every(tag => tag.includes('open=""')), topicId).toBe(true);
    }
  });

  it("surfaces PRs added after the frozen candidate baseline without promoting them", () => {
    const incoming = { ...spec.entries[0], workId: "github:vllm-project/vllm#999999",
      title: "New PR: dynamic speculative verification", url: "https://github.com/vllm-project/vllm/pull/999999",
      day: "2026-11-19" };
    const next = { ...spec, entries: [...spec.entries, incoming] };
    const nextIndex = { ...index, topics: index.topics.map(item => item.id === spec.id ? next : item) };
    expect(validatedSurvey(next)).toBeDefined();
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/speculative-decoding?view=report"]}>
      <Routes><Route path="/topics/:topicId" element={<TopicPages index={nextIndex} />} /></Routes>
    </MemoryRouter>);
    expect(html).toContain("新入候选：21 条 PR");
    expect(html).toContain("dynamic speculative verification");
    expect(html).toContain("不代表已确认性能收益");
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

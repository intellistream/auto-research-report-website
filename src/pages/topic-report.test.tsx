import { describe, expect, it, vi } from "vitest";
import actualIndex from "../../public/word-reports/topics.json";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicResearchReport from "./TopicResearchReport";
import TopicPages, { type Entry, type Topic } from "./TopicPages";
import { evidenceTimeline, loadFrozenVersion, reportOverview, revealTopicPart, safeTopicSource, sectionLead, topicArtifactHref, type ResearchReport } from "./topic-report";

const archiveBase = import.meta.env.BASE_URL + "word-reports/";
const version = "a".repeat(64);
const entry: Entry = {
  workId: "github:vllm-project/vllm-ascend#1", title: "设备边界复用", repository: "vllm-ascend",
  url: "https://github.com/vllm-project/vllm-ascend/pull/1", day: "2026-11-12", version: "daily-version",
  number: "A1", label: "metadata", reason: "执行元数据", method: "manual", summary: "避免重复传输",
};
const report: ResearchReport = {
  title: "ACLGraph：图执行与动态状态综述", abstract: "核心问题是静态执行计划与动态请求状态之间的一致性。",
  researchQuestions: ["图执行减少了哪些主机开销？"],
  methodology: { type: "叙述性综述", searchDate: "2026-11-14", scope: "Ascend 图执行", searchStrategy: "原文核查",
    inclusionCriteria: ["可追溯来源"], exclusionCriteria: ["无配对基线"], synthesis: "按问题综合" },
  sections: [{ id: "execution", title: "捕获与状态边界", paragraphs: ["减少提交工作，不必然消除搬运。"], sourceIds: ["E1", "D1"] }],
  taxonomy: [{ problem: "动态元数据", approach: "设备侧复用", tradeoff: "需要检查依赖顺序", sourceIds: ["E1"] }],
  gaps: [{ id: "gap", title: "长期动态负载", observation: "仅有局部测量", question: "动态批次是否稳定？", validation: "同版本配对实验", sourceIds: ["E1"], status: "hypothesis" }],
  references: [
    { id: "D1", kind: "documentation", title: "CANN 官方接口", url: "https://www.hiascend.com/document", evidenceLevel: "一手官方接口语义" },
    { id: "P1", kind: "paper", title: "原始系统论文", url: "https://www.usenix.org/paper", evidenceLevel: "原始同行评审论文", year: 2022 },
    { id: "E1", kind: "pr", title: "Ascend PR", url: entry.url, evidenceLevel: "日报历史证据＋一手PR抽查", note: "配对基线范围有限", workId: entry.workId },
    { id: "M1", kind: "methodology", title: "持续综述规范", url: "https://www.prisma-statement.org/lsr", evidenceLevel: "官方持续综述报告规范" },
  ],
  limitations: ["尚未完成跨硬件复现"], changelog: [{ date: "2026-11-14", summary: "首次综合" }],
  version, revision: 1, asOf: "2026-11-14", status: "research-draft", synthesizedWorkIds: [entry.workId],
  pendingEvidence: [], sourceDelta: { added: [entry.workId], removed: [], changed: [] },
  pdfPath: `topic-reports/aclgraph/${version}/report.pdf`, markdownPath: `topic-reports/aclgraph/${version}/report.md`,
};
const topic: Topic = {
  id: "aclgraph", title: "ACLGraph", description: "研究图执行开销与状态约束。", labels: { metadata: "动态元数据" },
  coverage: { firstDay: "2026-11-12", lastDay: "2026-11-12", days: 1, prs: 1 },
  counts: { total: 1, byRepository: { "vllm-ascend": 1 } }, entries: [entry], report,
};
function renderTopic(path: string, data = topic, schemaVersion: 1 | 2 = 2) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Routes><Route path="/topics/:topicId?" element={<TopicPages index={{ schemaVersion, topics: [data] }} />} /></Routes></MemoryRouter>);
}

function render(path: string, data = topic, embedded = false) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <TopicResearchReport topic={data} report={data.report!} embedded={embedded} />
  </MemoryRouter>);
}

describe("living topic report", () => {
  it("renders synthesis and evidence boundaries while waiting for frozen artifact verification", () => {
    const html = render("/topics/aclgraph", topic, true);
    expect(html).toContain("静态执行计划与动态请求状态");
    expect(html).toContain("如何验证");
    expect(html).toContain("同版本配对实验");
    expect(html).toContain("一手官方接口语义");
    expect(html).toContain("官方文档与源码");
    expect(html).toContain("综述方法");
    expect(html).toContain("日报历史证据＋一手PR抽查");
    expect(html).not.toContain("日报工程分析");
    expect(html).not.toContain(`href="${archiveBase}topic-reports/aclgraph/${version}/report.pdf"`);
    expect(html).toContain("正在核验冻结版本");
    expect(html).toContain('id="survey-analysis" tabindex="-1"');
    expect(html).not.toContain('id="survey-analysis" tabindex="-1" open=""');
    expect(html).not.toContain('<details open="" id="survey-section-0"');
    expect(html).toContain('id="survey-pr-trends" tabindex="-1"');
    expect(html).not.toContain('id="survey-pr-trends" tabindex="-1" open=""');
  });
  it("uses shareable router destinations and provides a route back from each cited source", () => {
    const html = render("/topics/aclgraph?read=brief&repo=vllm-ascend");
    expect(html).toContain('part=survey-ref-E1');
    expect(html).toContain('read=brief&amp;repo=vllm-ascend&amp;part=survey-ref-E1');
    expect(html).toContain('id="survey-ref-E1"');
    expect(html).toContain('part=survey-section-0');
    expect(html).toContain('part=survey-gap-gap');
    expect(html).toContain('返回引用位置');
    expect(html).toContain('section=A1');
    expect(html).toContain('version=daily-version');
  });
  it("offers an overview with analyses collapsed and clearly disables an absent PDF", () => {
    const html = render("/topics/aclgraph?read=brief", { ...topic, report: { ...report, pdfPath: undefined } });
    expect(html).toContain("待验证假设");
    expect(html).toContain('id="survey-section-0"');
    expect(html).not.toContain('<details open="" id="survey-section-0"');
    expect(html).toContain("PDF 尚未生成");
    expect(html).not.toContain(`href="${archiveBase}topic-reports/aclgraph/${version}/report.pdf"`);
  });
  it("keeps the ACL guide accessible when its archived report is unavailable", () => {
    const html = renderTopic("/topics/aclgraph", { ...topic, report: undefined }, 1);
    expect(html).toContain('data-testid="aclgraph-guide"');
    expect(html).not.toContain("专题收录 PR");
    expect(html).not.toContain("未解问题与未来方向");
    expect(html).not.toContain("导出综述 PDF");
  });
  it("keeps three distinct comparison records and their conditions beside results", () => {
    const evidenceDetails: ResearchReport["evidenceDetails"] = ["backend", "eager-graph", "historical-plan"].map((id) => ({
      id, sourceIds: ["E2"], comparison: `#21281 ${id} 对照`, mechanism: `${id} 机制`, level: "作者报告",
      environment: `${id} 环境`, revision: `${id} 固定提交`, workload: `${id} 工作量`, result: `${id} 结果`,
      limitation: `${id} 一次顺序配对；不同提交不拼接`, verification: `${id} 未独立复现`,
    }));
    const html = render("/topics/aclgraph?read=brief", { ...topic, report: { ...report, evidenceDetails,
      references: [...report.references, { ...report.references[2], id: "E2", title: "Ascend #21281" }],
    } });
    for (const evidence of evidenceDetails) {
      expect(html).toContain(`id="survey-evidence-${evidence.id}"`);
      for (const field of [evidence.environment, evidence.revision, evidence.workload, evidence.result, evidence.limitation, evidence.verification]) expect(html).toContain(field);
      expect(html).toContain(`part=survey-evidence-${evidence.id}`);
    }
    expect(html).toContain("不同对照，不能拼接成统一加速比");
    expect(html).toContain('id="survey-ref-E2"');
  });
  it("shows the supplied independent review and its limits while supporting old reports", () => {
    const html = render("/topics/aclgraph?view=report&legacy=1", { ...topic, report: { ...report, reviewSummary: {
      date: "2026-11-15", provider: "OpenCode", model: "review-model-fixture", type: "independent-review",
      summary: "逐项裁定并拒绝审查模型误述；未确认严重错误不等于全量验证。", limitations: ["未运行 NPU 实验", "未独立复现原始轨迹"],
    } } });
    for (const text of ["OpenCode", "review-model-fixture", "逐项裁定", "未运行 NPU 实验", "未独立复现原始轨迹", "不表示审查模型生成了全文"]) expect(html).toContain(text);
    expect(html).toContain('id="survey-review"');
    const old = render("/topics/aclgraph?view=report&legacy=1");
    expect(old).not.toContain('id="survey-review"');
    expect(old).not.toContain('id="survey-evidence"');
  });
  it("includes PR trends in the report for current and legacy links", () => {
    for (const path of ["/topics/aclgraph?view=report&legacy=1", "/topics/aclgraph?view=evidence", "/topics/aclgraph?view=report&part=survey-appendix"]) {
      const html = render(path);
      expect(html).toContain('id="survey-appendix"');
      expect(html).toContain("工程证据的持续积累");
      expect(html).toContain("日报原文");
      expect(html).toContain(entry.url);
      expect(html).toContain(report.abstract);
    }
    const filtered = render("/topics/aclgraph?view=evidence&repo=vllm");
    expect(filtered).toContain("当前筛选下没有取材条目");
    expect(filtered).not.toContain('class="topic-evidence-row"');
    expect(filtered).toContain('id="survey-ref-E1"');
  });
  it("deduplicates PRs in progress counts and distinguishes cited work from pending evidence", () => {
    expect(evidenceTimeline({ ...topic, entries: [entry, entry, { ...entry, workId: "github:vllm-project/vllm-ascend#2", day: "2026-11-13" }] }, report)).toEqual([
      { day: "2026-11-12", synthesized: 1, pending: 0 }, { day: "2026-11-13", synthesized: 0, pending: 1 },
    ]);
  });
  it("rejects external, crossed-version and traversal artifact paths plus unsafe source URLs", () => {
    for (const pdfPath of ["https://example.com/report.pdf", "../report.pdf", `topic-reports/other/${version}/report.pdf`, `topic-reports/aclgraph/${"b".repeat(64)}/report.pdf`, `topic-reports/aclgraph/${version}/%2e%2e/report.pdf`]) {
      expect(topicArtifactHref("aclgraph", { ...report, pdfPath }, "pdf")).toBeUndefined();
    }
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://name:secret@example.com", "//example.com"]) expect(safeTopicSource(url)).toBeUndefined();
    const html = render("/topics/aclgraph?view=report&legacy=1", { ...topic, report: { ...report, references: [{ ...report.references[0], url: "javascript:alert(1)", title: "<script>alert(1)</script>" }] } });
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

// Preserve regression coverage for the archived engineering-report branch after
// the same topic starts preferring an academicPaper at its current entry point.
const actual = { ...actualIndex.topics.find((item) => item.id === "aclgraph"), academicPaper: undefined } as unknown as Topic;
const frozenReports = import.meta.glob<ResearchReport>("../../public/word-reports/topic-reports/aclgraph/*/report.json", { eager: true, import: "default" });

describe("frozen ACLGraph contract", () => {
  const frozen = frozenReports[`../../public/word-reports/topic-reports/aclgraph/${actual.report!.version}/report.json`];
  function mockRequest(data: ResearchReport = frozen, contentType = "application/pdf", status = 200) {
    return vi.fn<typeof fetch>().mockImplementation(async (input, init) => init?.method === "HEAD"
      ? new Response(null, { status, headers: { "content-type": String(input).endsWith(".md") ? "text/markdown" : String(input).endsWith(".html") ? "text/html" : contentType } })
      : Response.json(data));
  }
  it("checks real current/previous files, exact report equality and all citation targets", () => {
    expect(frozen).toEqual(actual.report);
    const previous = frozenReports[`../../public/word-reports/topic-reports/aclgraph/${frozen.previousVersion}/report.json`];
    expect(previous.version).toBe(frozen.previousVersion);
    expect(previous.revision).toBeLessThan(frozen.revision);
    const html = render("/topics/aclgraph?read=brief", actual, true);
    const targets = [...html.matchAll(/part=(survey-[^"&]+)/g)].map((match) => decodeURIComponent(match[1]));
    expect(targets.length).toBeGreaterThan(30);
    for (const id of targets) expect(html).toContain(`id="${id}"`);
    const refs = new Set(frozen.references.map((ref) => ref.id));
    for (const part of [...frozen.sections, ...frozen.taxonomy, ...frozen.gaps, ...frozen.evidenceDetails ?? []]) for (const id of part.sourceIds) expect(refs.has(id)).toBe(true);
    expect(reportOverview(frozen).boundary).toContain("尚不能支持跨模型");
    expect(html).toContain("原始系统论文");
    expect(html).toContain("二级日报记录");
    expect(html).toContain("待验证假设");
    expect(html).toContain("验证路径是后续研究方案");
    expect(html.indexOf("证据怎样改变判断")).toBeLessThan(html.indexOf('id="survey-paper"'));
    expect(html).toContain("复核 4 条已有来源");
    expect(html).toContain("7 项证据详情");
    // This legacy fixture omits the manuscript, so its curated guide has an
    // incomplete version binding and the overview must use the frozen report.
    expect(html).toContain(frozen.changelog.at(-1)!.summary);
    expect(html).not.toContain(actual.survey!.update.summary);
    expect(html).toContain('id="survey-evolution" tabindex="-1"');
  });
  it("renders all seven published evidence records and the full independent review in both reading modes", () => {
    expect(frozen.revision).toBeGreaterThanOrEqual(3);
    expect(frozen.evidenceDetails).toHaveLength(7);
    expect(frozen.evidenceDetails!.filter((evidence) => evidence.sourceIds.includes("E2"))).toHaveLength(3);
    const review = frozen.reviewSummary!;
    expect(review.type).toBe("independent-review");
    expect(review.provider).toBe("OpenCode Go");
    for (const path of ["/topics/aclgraph?view=report&read=full", "/topics/aclgraph?read=brief"]) {
      const html = render(path, actual);
      expect(html.match(/class="survey-evidence-detail"/g)).toHaveLength(7);
      for (const evidence of frozen.evidenceDetails!) {
        expect(html).toContain(`id="survey-evidence-${evidence.id}"`);
        expect(html).toContain(`part=survey-evidence-${evidence.id}`);
        for (const [key, value] of Object.entries(evidence)) {
          if (key !== "id" && key !== "sourceIds") expect(html).toContain(renderToStaticMarkup(<>{value as string}</>));
        }
      }
      for (const text of [review.provider, review.model, review.date, review.summary, ...review.limitations]) {
        expect(html).toContain(renderToStaticMarkup(<>{text}</>));
      }
      expect(html).toContain("不表示审查模型生成了全文");
      expect(html).toContain("审查限制与未复现范围");
    }
  });
  it("preserves engineering fallback filters and the specialized topic routes", () => {
    for (const id of ["engineering-fixture"]) {
      const topic = { ...actualIndex.topics.find((item) => item.id === "kv-cache"), id } as unknown as Topic;
      expect(topic.report).toBeUndefined();
      const html = renderTopic(`/topics/${id}`, topic);
      expect(html).toContain("专题收录 PR");
      expect(html).toContain("查看日报正文");
      expect(html).not.toContain("综述准备中");
      expect(html).not.toContain("<iframe");
      const rowClass = /class="topic-card"/g;
      expect(html.match(rowClass)).toHaveLength(topic.entries.length);
      const selected = topic.entries[0];
      const filtered = renderTopic(`/topics/${id}?repo=${selected.repository}&label=${selected.label}`, topic);
      const expected = topic.entries.filter((entry) => entry.repository === selected.repository && entry.label === selected.label);
      expect(filtered.match(rowClass)).toHaveLength(expected.length);
      expect(filtered).toContain(`section=${selected.number}`);
      expect(filtered).toContain(`version=${selected.version}`);
      expect(filtered).toContain(renderToStaticMarkup(<>{selected.title}</>));
    }
    const spec = actualIndex.topics.find((item) => item.id === "speculative-decoding") as unknown as Topic;
    expect(spec.report?.sections).toHaveLength(8);
    const specHtml = renderTopic("/topics/speculative-decoding", spec);
    expect(specHtml).toContain("一次 Target 前向");
    expect(specHtml).toContain("view=report");
    const directory = renderTopic("/topics", { ...topic, report: undefined });
    expect(directory).toContain("ACL Graph");
  });
  it("unlocks only artifact paths checked for the same frozen metadata", async () => {
    const request = mockRequest();
    const result = await loadFrozenVersion("aclgraph", frozen.version, new AbortController().signal, actual.report, request);
    expect(result.hrefs.pdf).toBe(`${archiveBase}${frozen.pdfPath}`);
    expect(result.hrefs.html).toBe(`${archiveBase}${frozen.htmlPath}`);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("rejects a stale index even when its version hash is unchanged", async () => {
    await expect(loadFrozenVersion("aclgraph", frozen.version, new AbortController().signal, { ...frozen, abstract: "stale" }, mockRequest())).rejects.toThrow("网页内容与冻结稿不一致");
    await expect(loadFrozenVersion("aclgraph", frozen.version, new AbortController().signal, undefined, mockRequest({ ...frozen, version: "b".repeat(64) }))).rejects.toThrow("冻结元数据与版本不符");
  });
  it("does not offer a missing PDF or an HTML fallback as PDF", async () => {
    for (const request of [mockRequest(frozen, "text/html"), mockRequest(frozen, "application/pdf", 404)]) {
      const result = await loadFrozenVersion("aclgraph", frozen.version, new AbortController().signal, frozen, request);
      expect(result.hrefs.pdf).toBeUndefined();
    }
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response("<!doctype html>", { headers: { "content-type": "text/html" } }));
    await expect(loadFrozenVersion("aclgraph", frozen.version, new AbortController().signal, undefined, request)).rejects.toThrow();
  });
  it("reveals a target and collapsed ancestors before focusing, with reduced motion honored", () => {
    const ancestor = { tagName: "DETAILS", open: false, parentElement: null };
    const target = { tagName: "LI", parentElement: ancestor, scrollIntoView: vi.fn(), focus: vi.fn() };
    const doc = { getElementById: vi.fn().mockReturnValue(target) } as unknown as Document;
    expect(revealTopicPart(doc, "survey-ref-E1", true)).toBe(true);
    expect(ancestor.open).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(sectionLead("第一句。第二句。")).toBe("第一句。");
    expect(revealTopicPart({ getElementById: () => null } as unknown as Document, "missing")).toBe(false);
  });
});

it("opens the control-plane topic from the directory and resolves each evidence view", () => {
  const item = actualIndex.topics.find(row => row.id === "distributed-inference-control-plane") as unknown as Topic;
  const path = "/topics/" + item.id;
  expect(renderTopic("/topics", item)).toContain(path);
  const overview = renderTopic(path, item);
  expect(overview.match(/<figure\b/g)).toHaveLength(3);
  expect(overview.match(/怎样验证/g)).toHaveLength(7);
  for (const [id, title] of [["scheduling", "分布式请求调度"], ["kv", "分布式 KV 优化"], ["instances", "分布式多实例优化"]]) {
    const section = renderTopic(path + "?view=" + id, item);
    expect(section).toContain("<h2>" + title + "</h2>");
    expect(section.match(/<figure\b/g)).toHaveLength(1);
  }
  expect(renderTopic(path + "?view=kv", item)).toContain("https://arxiv.org/pdf/2601.10729");
  expect(renderTopic(path + "?view=systems", item)).toContain("Llumnix");
  const evidence = renderTopic(path + "?view=evidence", item);
  expect(evidence).toContain("controller-35b-two-devbox-20261125");
  expect(evidence).toContain("713.45");
  for (const entry of item.entries) expect(evidence).toContain(entry.url);
});

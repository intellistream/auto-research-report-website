import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DocxPreview from "./DocxPreview";
import TopicPages from "./TopicPages";
import { filterResearch, kvResearch, researchTimeline, researchTopicFilter, type ResearchEntry } from "./kv-research";

function render(path: string, error?: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/topics/:topicId?" element={<TopicPages error={error} />} /></Routes>
    </MemoryRouter>,
  );
}

const pr: ResearchEntry = {
  id: "github:example/project#1", kind: "pr", repository: "vllm",
  title: "缓存交接", summary: "复用并交接缓存。", url: "https://github.com/example/project/pull/1",
  sourceDay: "2026-03-02", decision: "included", primaryTopic: "movement",
  topics: ["movement", "reuse"], rationale: "测试夹具中的跨实例缓存复用。",
  reviewLevel: "pr-description", checkedAt: "2026-11-17",
  dailyReferences: [{ day: "2026-11-09", version: "daily-version", section: "V1" }],
};
const paper: ResearchEntry = {
  id: "paper:example:1", kind: "paper", title: "论文夹具",
  summary: "独立论文来源。", url: "https://arxiv.org/abs/2309.06180",
  sourceDay: "2023-09-12", decision: "included", primaryTopic: "lifecycle",
  topics: ["lifecycle"], rationale: "研究缓存管理。", reviewLevel: "paper-abstract", checkedAt: "2026-11-17",
};

describe("independent KV research library", () => {
  it("renders the normal KV entry point before any daily catalog or topic index is available", () => {
    const html = render("/topics/kv-cache", "archive unavailable");
    expect(html).toContain("独立技术专题");
    expect(html).toContain('id="kv-basics-process"');
    expect(html).not.toContain("archive unavailable");
    const app = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/topics/kv-cache?view=guide"]}><DocxPreview /></MemoryRouter>,
    );
    expect(app).toContain("正在打开专题");
    expect(app).not.toContain("正在加载日报索引");
    expect(app).not.toContain("日报目录加载失败");
    expect(render("/topics", "archive unavailable")).toContain("/topics/kv-cache?view=guide");
  });

  it("deduplicates multi-topic material, accepts a paper without a daily reference and separates PR dates", () => {
    const excluded: ResearchEntry = { ...pr, id: "excluded", decision: "excluded", topics: [], primaryTopic: null };
    const entries = [pr, pr, paper, excluded];
    expect(filterResearch(entries, new URLSearchParams())).toHaveLength(2);
    expect(filterResearch([paper, pr], new URLSearchParams()).map((entry) => entry.id)).toEqual([pr.id, paper.id]);
    for (const topic of ["movement", "reuse"]) {
      expect(filterResearch(entries, new URLSearchParams({ topic })).map((entry) => entry.id)).toEqual([pr.id]);
    }
    expect(filterResearch(entries, new URLSearchParams({ kind: "paper" }))).toEqual([paper]);
    expect(researchTimeline(entries)).toEqual([{ month: "2026-03", count: 1 }]);
    expect(filterResearch(entries, new URLSearchParams({ month: "2026-03" }))).toEqual([pr]);
  });

  it("keeps legacy topic URLs usable while new filters operate on associated topics", () => {
    expect(researchTopicFilter(new URLSearchParams({ label: "offload" }))).toBe("movement");
    expect(researchTopicFilter(new URLSearchParams({ label: "transfer" }))).toBe("movement");
    expect(researchTopicFilter(new URLSearchParams({ label: "layout" }))).toBe("representation");
    expect(researchTopicFilter(new URLSearchParams({ label: "reuse", topic: "scheduling" }))).toBe("scheduling");
    const html = render("/topics/kv-cache?repo=vllm&label=reuse");
    expect(html).toContain("PR 记录");
    expect(html).toContain("收录 PR 的创建时间分布");
    expect(html).toContain("view=compare");
    expect(html).not.toContain('id="kv-basics-process"');
  });

  it("validates unique source identities, reviewed classifications and optional report citations", () => {
    expect(new Set(kvResearch.entries.map((entry) => entry.id)).size).toBe(kvResearch.entries.length);
    const topicIds = new Set(kvResearch.taxonomy.map((topic) => topic.id));
    expect(topicIds.size).toBe(5);
    for (const entry of kvResearch.entries) {
      expect(entry.url.startsWith("https://")).toBe(true);
      expect(entry.rationale.length).toBeGreaterThan(5);
      if (entry.kind === "pr" || entry.sourceDay) expect(entry.sourceDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else expect(entry.sourceMonth).toMatch(/^\d{4}-\d{2}$/);
      if (entry.decision === "included") {
        expect(entry.topics.length).toBeGreaterThan(0);
        expect(new Set(entry.topics).size).toBe(entry.topics.length);
        expect(entry.topics).toContain(entry.primaryTopic);
        for (const topic of entry.topics) expect(topicIds.has(topic)).toBe(true);
      } else {
        expect(entry.topics).toEqual([]);
        expect(entry.primaryTopic).toBeNull();
      }
      if (entry.kind === "pr") {
        expect(entry.headSha).toMatch(/^[a-f0-9]{40}$/);
        expect(entry.createdAt).toBeTruthy();
      }
    }
    const get = (number: number) => kvResearch.entries.find((entry) => entry.id === `github:vllm-project/vllm#${number}`)!;
    expect(get(66558).primaryTopic).toBe("scheduling");
    expect(get(66558).topics).toEqual(expect.arrayContaining(["reuse", "movement"]));
    expect(get(59774).primaryTopic).toBe("representation");
    expect(get(63306).decision).toBe("excluded");
    expect(get(66523).dailyReferences).toEqual([]);
  });

  it("serves direct papers with their own dates and source links", () => {
    const html = render("/topics/kv-cache?view=evidence&kind=paper");
    expect(html.match(/class="kv-reading-card"/g)).toHaveLength(kvResearch.entries.filter((entry) => entry.kind === "paper" && entry.decision === "included").length);
    expect(html).toContain("原始论文");
    expect(html).toContain("2023-09-12");
    expect(html).toContain("2312.07104v2");
    expect(html).not.toContain('class="kv-daily-citations"');
    expect(html).not.toContain('class="kv-source-trend"');
  });

  it("presents all five problem groups with filters and interactive cache states", () => {
    const guide = render("/topics/kv-cache");
    for (const topic of kvResearch.taxonomy) {
      expect(guide).toContain(topic.label);
      expect(guide).toContain(`view=evidence&amp;topic=${topic.id}`);
    }
    expect(guide).toContain('aria-label="缓存位置示意"');
    expect(guide).toContain("示意 · 未运行模型");
    expect(guide).not.toContain("五类单标签");
  });

  it("retains current comparison evidence and distinguishes closed proposals from merged work", () => {
    const html = render("/topics/kv-cache?view=compare");
    expect(html.match(/class="kv-method-card"/g)).toHaveLength(4);
    expect(html).toContain("当前 head 已扩展为多个队列");
    expect(html).toContain("TTFT p99 97.6→114.6秒");
    expect(html).toContain("代码中 threshold 默认0.5");
    expect(html).toContain("section=V7");
    const library = render("/topics/kv-cache?view=evidence&topic=lifecycle");
    expect(library).toContain("已关闭");
    expect(library).toContain("已合并");
    expect(library).toContain("历史审阅中未纳入的候选");
  });

  it("separates current community progress from the dated research observations", () => {
    const current = render("/topics/kv-cache?view=report");
    expect(current).toContain("社区 PR · 动态报告");
    expect(current).toContain("本期新纳入 PR");
    expect(current).toContain("2026-11-23");
    expect(current).toContain("相较 2026-11-17");
    const history = render("/topics/kv-cache?view=report&edition=2026-11-17");
    expect(history).toContain("历史报告 · 首轮调度观察");
    expect(history).toContain("研究问题与实验设想");
    expect(history).toContain("日报可作为引用记录");
    expect(history).not.toContain("新纳入 HF3FS");
  });

  it("filters and sorts month-precision paper dates without adding them to PR trends", () => {
    const monthPaper: ResearchEntry = { ...paper, id: "paper:month-only", sourceDay: null, sourceMonth: "2026-02" };
    const rows = [paper, monthPaper, pr, monthPaper];
    expect(filterResearch(rows, new URLSearchParams()).map((entry) => entry.id)).toEqual([pr.id, monthPaper.id, paper.id]);
    expect(filterResearch(rows, new URLSearchParams({ month: "2026-02" }))).toEqual([monthPaper]);
    expect(researchTimeline(rows)).toEqual([{ month: "2026-03", count: 1 }]);
  });
  it("identifies the bounded six-paper recheck without relabelling the rest of the collection", () => {
    const papers = kvResearch.entries.filter((entry) => entry.kind === "paper" && entry.paper);
    const reviewed = papers.filter((entry) => entry.paper!.evidenceReview);
    expect(reviewed.map((entry) => entry.paper!.slug).sort())
      .toEqual(["distserve", "h2o", "k-lpm", "kivi", "pagedattention", "sglang"]);
    expect(papers.filter((entry) => entry.checkedAt === "2026-11-18")).toHaveLength(18);
    for (const entry of reviewed) {
      expect(entry.sourceVersion).toMatch(/v\d+$/);
      expect(entry.paper!.evidenceReview!.checkedAt).toBe("2026-11-24");
      expect(entry.paper!.evidenceReview!.notCovered).toContain("未");
      for (const finding of entry.paper!.findings!) {
        expect(finding.url).toContain(entry.sourceVersion!.replace("arXiv:", ""));
        expect(finding.conditions.length).toBeGreaterThan(15);
        expect(finding.limit.length).toBeGreaterThan(15);
      }
    }
  });

});

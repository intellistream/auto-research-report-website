import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import type { TopicIndex } from "../pages/TopicPages";
import type { Catalog } from "../pages/report-preview-data";
import { makeAclGraphProblems } from "../pages/aclgraph-analysis.fixtures";
import CommandSearchModal, { computeCommandSearchResults } from "./CommandSearchModal";

const request = vi.hoisted(() => ({ topics: undefined as unknown, paths: [] as (string | undefined)[] }));
vi.mock("../pages/report-preview-data", async importOriginal => {
  const original = await importOriginal<typeof import("../pages/report-preview-data")>();
  return { ...original, useJson: (path?: string) => {
    request.paths.push(path);
    return path === "topics.json" && request.topics ? { path, data: request.topics } : undefined;
  } };
});
vi.mock("../features/group-mods/search", () => ({ useModSearchIndex: () => ({ data: { modSearchIndex: [] } }) }));

const fixtureProblems = makeAclGraphProblems();
const topics = (actualIndex as unknown as TopicIndex).topics;
const aclArchive = topics.find(topic => topic.id === "aclgraph")!;
const inputs: Parameters<typeof computeCommandSearchResults>[0] = {
  query: "", category: "all", topics, days: [], deduplicatedPRs: [], mods: [], aclProblems: fixtureProblems,
};
const stale = ["view=paper", "学术综述全文", "综述稿", "动态报告", aclArchive.description];

beforeEach(() => { request.topics = undefined; request.paths = []; });

describe("command search loaded topics and fallback", () => {
  it.each(["loaded", "fallback"])("renders current ACL entries with %s topics", mode => {
    if (mode === "loaded") request.topics = actualIndex;
    expect(aclArchive.academicPaper).toBeDefined();
    expect(aclArchive.description.length).toBeGreaterThan(0);
    const html = renderToStaticMarkup(<MemoryRouter><CommandSearchModal open onClose={() => {}} days={[]} /></MemoryRouter>);
    expect(request.paths).toContain("topics.json");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("ACL Graph · 导引");
    expect(html).toContain("ACL Graph · 专题剖析");
    for (const text of stale) expect(html).not.toContain(text);
    const results = computeCommandSearchResults({ ...inputs, topics: mode === "loaded" ? topics : undefined });
    expect(results.find(row => row.title === "ACL Graph · 导引")?.to).toBe("/topics/aclgraph");
    expect(results.find(row => row.title === "ACL Graph · 专题剖析")?.to).toBe("/topics/aclgraph?view=analysis");
    for (const text of stale) expect(JSON.stringify(results)).not.toContain(text);
  });

  it("stays closed without requesting the topic index", () => {
    expect(renderToStaticMarkup(<MemoryRouter><CommandSearchModal open={false} onClose={() => {}} days={[]} /></MemoryRouter>)).toBe("");
    expect(request.paths).not.toContain("topics.json");
  });
});

describe("pure command search query filtering", () => {
  it.each(["loaded", "fallback"])("finds problem keywords and PR numbers with %s topics", mode => {
    const source = mode === "loaded" ? topics : undefined;
    for (const query of ["GraphBreak", "72000", "# 72000", "graph replay study 1-1"]) {
      const results = computeCommandSearchResults({ ...inputs, topics: source, query, category: "topic" });
      const problems = results.filter(row => row.id.startsWith("topic-aclgraph-problem-"));
      expect(problems.map(row => row.id)).toEqual(["topic-aclgraph-problem-p1"]);
      expect(problems[0].to).toBe("/topics/aclgraph?view=analysis&problem=p1");
      for (const text of stale) expect(JSON.stringify(results)).not.toContain(text);
    }
  });

  it.each(["loaded", "fallback"])("keeps ACL keywords out of other topics with %s topics", mode => {
    const source = mode === "loaded" ? topics : undefined;
    const results = computeCommandSearchResults({ ...inputs, topics: source, query: "  ACLGRAPH  ", category: "topic" });
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.every(row => row.to.startsWith("/topics/aclgraph"))).toBe(true);
    expect(results.some(row => /kv-cache|speculative-decoding/.test(row.to))).toBe(false);
    const kv = computeCommandSearchResults({ ...inputs, topics: source, query: "kv", category: "topic" });
    expect(kv.find(row => row.id === "topic-kv-cache")?.to).toBe("/topics/kv-cache");
    const spec = computeCommandSearchResults({ ...inputs, topics: source, query: "speculative", category: "topic" });
    expect(spec.find(row => row.id === "topic-speculative-decoding")?.to).toBe("/topics/speculative-decoding");
  });

  it("encodes problem IDs, uses fixture statistics and leaves inputs unchanged", () => {
    const problems = makeAclGraphProblems();
    problems[0].id = "p 1/&?";
    const original = structuredClone(problems);
    const results = computeCommandSearchResults({ ...inputs, query: "GraphBreak", aclProblems: problems });
    expect(results.find(row => row.id === "topic-aclgraph-analysis")?.subtitle).toContain("6 大核心问题 · 24 篇论文 · 24 条 PR");
    const result = results.find(row => row.id === "topic-aclgraph-problem-p 1/&?")!;
    expect(result.to).toBe("/topics/aclgraph?view=analysis&problem=p+1%2F%26%3F");
    expect(problems).toEqual(original);
    expect(computeCommandSearchResults({ ...inputs, query: "unmatchable-keyword" })).toEqual([]);
  });

  it("preserves daily report, stage, PR and MOD results and category boundaries", () => {
    const catalog: Catalog = { schemaVersion: 1, days: { "2026-11-18": { current: "version", versions: [
      { sha256: "version", path: "2026-11-18/version/report.json", counts: { upstream: 2, ascend: 3, papers: 1 } },
    ] } } };
    const deduplicatedPRs: typeof inputs.deduplicatedPRs = [{ workId: "github:vllm-project/vllm#555", title: "Cache plan", day: "2026-11-18", version: "version", number: "V1", stage: "decode" }];
    const mods: typeof inputs.mods = [{ componentId: "engine-mod", displayName: "Graph runtime MOD", aliases: ["engine"], problemSummary: "Cache execution plans", maintainerNames: ["Alice"], stageIds: ["decode"], eligibilityLabel: "有依据" }];
    const source = { ...inputs, catalog, days: ["2026-11-18"], deduplicatedPRs, mods };
    expect(computeCommandSearchResults({ ...source, query: "2026-11", category: "report" }).map(row => row.to)).toEqual(["/reports/2026-11-18"]);
    const report = computeCommandSearchResults({ ...source, query: "", category: "report" })[0];
    expect(report.subtitle).toBe("vLLM 2 项 · vLLM Ascend 3 项 · 论文 1 篇");
    expect(computeCommandSearchResults({ ...source, query: "555", category: "pr" }).map(row => row.to)).toEqual(["/reports/2026-11-18?section=V1&version=version"]);
    expect(computeCommandSearchResults({ ...source, query: "Alice", category: "mod" }).map(row => row.to)).toEqual(["/group-mods/engine-mod"]);
    expect(computeCommandSearchResults({ ...source, query: "decode", category: "topic" }).some(row => row.to === "/?stage=decode")).toBe(true);
    for (const [category, kind] of [["report", "report"], ["pr", "pr"], ["mod", "mod"]] as const) expect(computeCommandSearchResults({ ...source, query: "", category }).every(row => row.kind === kind)).toBe(true);
  });
});

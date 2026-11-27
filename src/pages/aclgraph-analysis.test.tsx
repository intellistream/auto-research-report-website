import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import AclGraphTopic, { AclGraphTopicCard, resolveAclGraphSearch } from "./AclGraphTopic";
import AclGraphAnalysis, { filterAclGraphProblems } from "./AclGraphAnalysis";
import { resolveModalKeyAction } from "./AclGraphCardModal";
import {
  ACLGRAPH_PROBLEMS, ASCEND_APPLICABILITY_BADGES, READ_DEPTH_BADGES, VLLM_STATUS_BADGES,
  findAclGraphCardById, formatPrStateBadge, formatRepositoryLabel, getAclGraphAnalysisStats,
  getAclGraphCardEntries, getAdjacentAclGraphCards, getVenueBadge, safeAnalysisUrl, validateAclGraphProblems,
  type AclGraphProblem, type AclGraphVenueTier,
} from "./aclgraph-analysis";
import { makeAclGraphProblems } from "./aclgraph-analysis.fixtures";

const fixtureProblems = makeAclGraphProblems();
const topic = actualIndex.topics.find(row => row.id === "aclgraph") as unknown as Topic;
const index = actualIndex as unknown as TopicIndex;
const ssr = (element: React.ReactNode, path = "/topics/aclgraph") => renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
const escaped = (text: string) => renderToStaticMarkup(<>{text}</>);

describe("ACL Graph analysis schema", () => {
  it("accepts complete six-problem fixtures and validates the live loader", () => {
    expect(validateAclGraphProblems(fixtureProblems)).toEqual([]);
    expect(validateAclGraphProblems(ACLGRAPH_PROBLEMS)).toEqual([]);
    if (ACLGRAPH_PROBLEMS.length > 0) expect(getAclGraphAnalysisStats()).toEqual({
      problems: 6, papers: 24, fulltextPapers: 24, prs: 24, ascendPrs: 12, upstreamPrs: 12, totalCards: 48,
    });
  });

  it.each<[string, (problems: AclGraphProblem[]) => void, string]>([
    ["cross-problem card ID", p => { p[1].prs[0].id = p[0].papers[0].id; }, "duplicate identity"],
    ["paper identity", p => { p[1].papers[0].paperId = p[0].papers[0].paperId; }, "paperId: duplicate"],
    ["arXiv versions", p => { p[0].papers[0].arxivId += "v1"; p[1].papers[0].arxivId = p[0].papers[0].arxivId!.replace("v1", "v2"); }, "arxivId: duplicate"],
    ["PR repository and number", p => { p[1].prs[0].repository = p[0].prs[0].repository.toUpperCase(); p[1].prs[0].number = p[0].prs[0].number; }, "repository/number: duplicate"],
    ["problem identity", p => { p[1].id = p[0].id; }, "id: duplicate"],
    ["problem slug", p => { p[1].slug = p[0].slug; }, "slug: duplicate"],
    ["problem index", p => { p[1].index = p[0].index; }, "index: duplicate"],
    ["blank title", p => { p[0].title = " \t"; }, "title: expected a non-empty string"],
    ["blank summary", p => { p[0].papers[0].summaryLine = ""; }, "summaryLine: expected a non-empty string"],
    ["blank gap", p => { p[0].gap.researchOpportunity = " "; }, "researchOpportunity: expected"],
    ["blank key takeaway", p => { p[0].gap.keyTakeaway = " "; }, "keyTakeaway: expected"],
    ["blank PR prose", p => { p[0].prs[0].optimization = ""; }, "optimization: expected"],
    ["blank paper method", p => { p[0].papers[0].method.keyIdea = ""; }, "keyIdea: expected"],
    ["invalid venue", p => { Object.assign(p[0].papers[0], { venueTier: "conference" }); }, "venueTier: expected one of"],
    ["invalid read depth", p => { Object.assign(p[0].papers[0], { readDepth: "skimmed" }); }, "readDepth: expected one of"],
    ["invalid PR state", p => { Object.assign(p[0].prs[0], { state: "draft" }); }, "state: expected one of"],
    ["invalid vLLM status", p => { Object.assign(p[0].prs[0], { vllmStatus: "supported" }); }, "vllmStatus: expected one of"],
    ["invalid Ascend enum", p => { Object.assign(p[0].prs[0], { ascendApplicability: "maybe" }); }, "ascendApplicability: expected one of"],
    ["accepted preprint", p => { p[0].papers[3].publicationStatus = "accepted"; }, "preprint venue requires preprint status"],
    ["preprint accepted venue", p => { p[0].papers[0].publicationStatus = "preprint"; }, "published venue requires accepted status"],
    ["open PR with merge timestamp", p => { p[0].prs[0].state = "open"; }, "only merged PRs may have mergedAt"],
    ["invalid date", p => { p[0].prs[0].mergedAt = "2026-02-30"; }, "mergedAt: expected a valid"],
    ["invalid paper URL", p => { p[0].papers[0].url = "javascript:alert(1)"; }, "url: expected an HTTP(S)"],
    ["credentials URL", p => { p[0].prs[0].url = "https://user:secret@github.com/o/r/pull/1"; }, "url: expected an HTTP(S)"],
    ["invalid evidence URL", p => { p[0].papers[0].evidenceRefs[0].sourceUrl = "//example.com"; }, "sourceUrl: expected an HTTP(S)"],
    ["missing evidence", p => { Reflect.deleteProperty(p[0].prs[0], "evidenceRefs"); }, "evidenceRefs: expected an array"],
    ["empty evidence", p => { p[0].papers[0].evidenceRefs = []; }, "evidenceRefs: expected at least one item"],
    ["duplicate evidence refs", p => { p[0].papers[0].evidenceRefs.push({ ...p[0].papers[0].evidenceRefs[0] }); }, "refId: duplicate"],
    ["empty design points", p => { p[0].papers[0].method.designPoints = []; }, "designPoints: expected at least one item"],
    ["empty authors", p => { p[0].papers[0].authors = []; }, "authors: expected at least one item"],
    ["invalid number", p => { p[0].prs[0].number = 0; }, "number: expected a positive safe integer"],
  ])("rejects %s with a located error", (_name, change, expected) => {
    const problems = makeAclGraphProblems();
    change(problems);
    const errors = validateAclGraphProblems(problems);
    expect(errors.some(error => error.includes(expected))).toBe(true);
    expect(errors.every(error => error.startsWith("problems["))).toBe(true);
  });

  it.each([null, undefined, {}, "problems", [null]])("rejects non-schema data %j", value => {
    expect(validateAclGraphProblems(value).length).toBeGreaterThan(0);
  });
});

describe("badges and safe analysis helpers", () => {
  it("keeps the exact status and applicability labels and tones", () => {
    expect(VLLM_STATUS_BADGES).toEqual({
      merged_core: { label: "主干已合入", tone: "green" }, merged_recent: { label: "近期已合入", tone: "green" },
      open_pr: { label: "开放 PR", tone: "blue" }, rfc_or_draft: { label: "RFC / 草案", tone: "gray" },
      paper_prototype: { label: "论文原型", tone: "indigo" }, not_verified_in_vllm: { label: "vLLM 未核验", tone: "gray" },
    });
    expect(ASCEND_APPLICABILITY_BADGES).toEqual({
      ascend_native: { label: "原生支持", tone: "green" }, ascend_pr_available: { label: "已有昇腾 PR", tone: "green" },
      portable_framework: { label: "框架通用·可迁移", tone: "blue" }, cuda_specific_needs_port: { label: "CUDA 绑定·需移植", tone: "orange" },
      unverified: { label: "待验证", tone: "gray" },
    });
    expect(READ_DEPTH_BADGES).toEqual({ fulltext: { label: "全文精读", tone: "green" }, abstract_only: { label: "基于摘要", tone: "gray" } });
  });

  it.each<[AclGraphVenueTier, string, string, string]>([
    ["ccf_a", "CCF-A · OSDI", "CCF-A 顶会", "gold"], ["top_venue", "顶会录用 · OSDI", "顶会录用", "indigo"],
    ["peer_reviewed", "正式录用 · OSDI", "正式录用", "teal"], ["preprint", "arXiv 预印本", "arXiv 预印本", "gray"],
  ])("formats %s venues with named and unnamed fallbacks", (tier, named, fallback, tone) => {
    expect(getVenueBadge(tier, " OSDI ")).toEqual({ label: named, tone });
    expect(getVenueBadge(tier, " ")).toEqual({ label: fallback, tone });
    expect(getVenueBadge("unknown", "OSDI")).toBeNull();
    expect(getVenueBadge("unknown", "")).toBeNull();
  });

  it.each([
    ["2026-11-18T17:30:00Z", "2026-11-19"], ["2026-11-18", "2026-11-18"],
    ["2026-11-18T23:30:00", "2026-11-18"], ["2026-11-19T01:30:00+08:00", "2026-11-19"],
  ])("uses the Beijing calendar day for %s", (date, day) => {
    expect(formatPrStateBadge("merged", date)).toEqual({ label: `已合入 ${day}`, tone: "green" });
  });

  it("handles invalid merge dates and open/closed states", () => {
    for (const value of [undefined, "bad date", "2026-02-30", "2026-11-18T25:00:00Z"]) expect(formatPrStateBadge("merged", value)).toEqual({ label: "已合入", tone: "green" });
    expect(formatPrStateBadge("open")).toEqual({ label: "开放", tone: "blue" });
    expect(formatPrStateBadge("closed")).toEqual({ label: "已关闭", tone: "gray" });
    expect(formatRepositoryLabel("vllm-project/vllm-ascend")).toBe("vLLM-Ascend");
    expect(formatRepositoryLabel("vllm-project/vllm")).toBe("vLLM 上游");
    expect(formatRepositoryLabel("example/engine")).toBe("example/engine");
  });

  it("admits only absolute HTTP(S) URLs without credentials or whitespace", () => {
    for (const value of ["https://example.com/paper?q=graph#s1", "http://example.com/pull/1"]) expect(safeAnalysisUrl(value)).toBe(value);
    for (const value of [undefined, "", "javascript:alert(1)", "data:text/html,hi", "/paper", "//example.com", "https://user:secret@example.com", "https://user@example.com", " https://example.com", "https://example.com/a b", "https://example.com/\n", "https://example.com/\\evil", "https://"]) expect(safeAnalysisUrl(value)).toBeUndefined();
  });
});

describe("card ordering, adjacency, statistics and filtering", () => {
  it("sorts by problem index without mutating caller arrays", () => {
    const problems = [...fixtureProblems].reverse();
    const original = structuredClone(problems);
    const entries = getAclGraphCardEntries(problems);
    expect(problems).toEqual(original);
    expect(entries).toHaveLength(48);
    expect(entries.map(entry => entry.globalIndex)).toEqual(Array.from({ length: 48 }, (_, i) => i));
    expect(entries.slice(0, 8).map(entry => entry.card.id)).toEqual([...fixtureProblems[0].papers, ...fixtureProblems[0].prs].map(card => card.id));
    expect(entries.slice(0, 8).map(entry => entry.problemCardIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(entries.at(-1)?.problem.index).toBe(6);
    expect(findAclGraphCardById("p2-pr-1", problems)?.problem.id).toBe("p2");
    expect(findAclGraphCardById("missing", problems)).toBeUndefined();
  });

  it("does not wrap global or problem-scoped navigation boundaries", () => {
    const entries = getAclGraphCardEntries(fixtureProblems);
    const first = getAdjacentAclGraphCards(entries[0].card.id, fixtureProblems);
    expect(first.current).toEqual(entries[0]);
    expect(first.previous).toBeUndefined();
    expect(first.withinProblem.previous).toBeUndefined();
    expect(first.next).toEqual(entries[1]);
    const endProblem = getAdjacentAclGraphCards(entries[7].card.id, fixtureProblems);
    expect(endProblem.next).toEqual(entries[8]);
    expect(endProblem.withinProblem.next).toBeUndefined();
    expect(endProblem.withinProblem.previous).toEqual(entries[6]);
    const startProblem = getAdjacentAclGraphCards(entries[8].card.id, fixtureProblems);
    expect(startProblem.previous).toEqual(entries[7]);
    expect(startProblem.withinProblem.previous).toBeUndefined();
    expect(startProblem.withinProblem.next).toEqual(entries[9]);
    const last = getAdjacentAclGraphCards(entries.at(-1)!.card.id, fixtureProblems);
    expect(last.next).toBeUndefined();
    expect(last.withinProblem.next).toBeUndefined();
    expect(getAdjacentAclGraphCards(entries[7].card.id, [fixtureProblems[0]]).next).toBeUndefined();
    expect(getAdjacentAclGraphCards("missing", fixtureProblems)).toEqual({ current: undefined, previous: undefined, next: undefined, withinProblem: { previous: undefined, next: undefined } });
    expect(getAdjacentAclGraphCards("missing", [])).toEqual({ current: undefined, previous: undefined, next: undefined, withinProblem: { previous: undefined, next: undefined } });
  });

  it("counts paper reading depth and both repositories separately", () => {
    expect(getAclGraphAnalysisStats(fixtureProblems)).toEqual({ problems: 6, papers: 24, fulltextPapers: 24, prs: 24, ascendPrs: 12, upstreamPrs: 12, totalCards: 48 });
    const changed = makeAclGraphProblems();
    changed[0].papers[0].readDepth = "abstract_only";
    expect(getAclGraphAnalysisStats(changed).fulltextPapers).toBe(23);
    expect(getAclGraphAnalysisStats([])).toEqual({ problems: 0, papers: 0, fulltextPapers: 0, prs: 0, ascendPrs: 0, upstreamPrs: 0, totalCards: 0 });
  });

  it("filters all/paper/PR cards, problem context, keywords, numbers, and empty matches", () => {
    const original = structuredClone(fixtureProblems);
    expect(filterAclGraphProblems(fixtureProblems, "all", "").map(row => row.totalVisible)).toEqual([8, 8, 8, 8, 8, 8]);
    expect(filterAclGraphProblems(fixtureProblems, "paper", "").every(row => row.papers.length === 4 && row.prs.length === 0)).toBe(true);
    expect(filterAclGraphProblems(fixtureProblems, "pr", "").every(row => row.prs.length === 4 && row.papers.length === 0)).toBe(true);
    expect(filterAclGraphProblems(fixtureProblems, "all", " GraphBreak ").map(row => row.problem.id)).toEqual(["p1"]);
    expect(filterAclGraphProblems(fixtureProblems, "pr", "#72000")[0].prs.map(card => card.id)).toEqual(["p1-pr-1"]);
    expect(filterAclGraphProblems(fixtureProblems, "paper", "GRAPH replay study 1-1")[0].papers.map(card => card.id)).toEqual(["p1-paper-1"]);
    expect(filterAclGraphProblems(fixtureProblems, "all", "完全没有这个关键词")).toEqual([]);
    expect(fixtureProblems).toEqual(original);
  });
});

describe("ACL query compatibility", () => {
  it.each<[string, "guide" | "analysis", string, boolean]>([
    ["", "guide", "", false], ["?view=guide", "guide", "", true],
    ["?view=analysis", "analysis", "view=analysis", false],
    ["?view=analysis&problem=p2&card=p2-paper-1", "analysis", "view=analysis&problem=p2&card=p2-paper-1", false],
    ["?view=analysis&problem=p1&card=p2-paper-1", "analysis", "view=analysis&problem=p2&card=p2-paper-1", true],
    ["?view=paper&section=section-4-3&read=full&part=survey-top", "guide", "", true],
    ["?view=report&legacy=1&read=full&part=survey-top&repo=vllm&hotspot=x&status=open", "analysis", "view=analysis", true],
    ["?view=evidence", "analysis", "view=analysis", true], ["?read=", "analysis", "view=analysis", true],
    ["?part=survey-pr-trends", "analysis", "view=analysis", true],
    ["?legacy=1", "guide", "", true], ["?section=section-4-1", "guide", "", true],
    ["?view=foo&read=brief", "guide", "", true], ["?view=&read=brief", "guide", "", true],
    ["?view=analysis&problem=missing&card=missing", "analysis", "view=analysis", true],
    ["?view=analysis&utm_source=test", "analysis", "utm_source=test&view=analysis", true],
  ])("resolves %s immediately and normalizes only when needed", (search, section, normalized, needsNormalize) => {
    const params = new URLSearchParams(search), original = params.toString();
    const result = resolveAclGraphSearch(params, fixtureProblems);
    expect(result.section).toBe(section);
    expect(result.normalizedParams.toString()).toBe(normalized);
    expect(result.needsNormalize).toBe(needsNormalize);
    expect(params.toString()).toBe(original);
    expect(resolveAclGraphSearch(result.normalizedParams, fixtureProblems).needsNormalize).toBe(false);
    if (normalized.includes("card=")) {
      expect(result.problemId).toBe("p2");
      expect(result.cardId).toBe("p2-paper-1");
    } else {
      expect(result.cardId).toBeUndefined();
    }
  });
});

describe("two-tab ACL topic rendering", () => {
  it.each([
    ["/topics/aclgraph", "guide", "导引"], ["/topics/aclgraph?view=paper", "guide", "导引"],
    ["/topics/aclgraph?view=analysis", "analysis", "专题剖析"], ["/topics/aclgraph?view=report", "analysis", "专题剖析"],
    ["/topics/aclgraph?view=evidence", "analysis", "专题剖析"],
  ])("renders both the direct topic and TopicPages at %s", (path, section, active) => {
    const route = <Routes><Route path="/topics/:topicId" element={<TopicPages index={index} />} /></Routes>;
    for (const element of [<AclGraphTopic topic={topic} />, route]) {
      const html = ssr(element, path);
      expect(html).toContain("<h1>ACL Graph</h1>");
      expect(html).toContain(`data-testid="aclgraph-${section}"`);
      const nav = html.match(/<nav[^>]*aria-label="ACL Graph 专题分区"[^>]*>([\s\S]*?)<\/nav>/)![1];
      expect(nav.match(/<a\b/g)).toHaveLength(2);
      expect(nav).toMatch(new RegExp(`aria-current="page"[^>]*>${active}</a>`));
      for (const stale of ["综述", "动态报告", "view=paper", "view=report", "<iframe"]) expect(html).not.toContain(stale);
    }
  });

  it("provides only guide and analysis quick links on the ACL directory card", () => {
    const direct = ssr(<AclGraphTopicCard topic={topic} />);
    const directory = ssr(<Routes><Route path="/topics" element={<TopicPages index={index} />} /></Routes>, "/topics");
    const card = [...directory.matchAll(/<li class="topic-directory-card">[\s\S]*?<\/li>/g)]
      .find(([html]) => html.includes('href="/topics/aclgraph"'))![0];
    for (const html of [direct, card]) {
      expect(html).toContain('href="/topics/aclgraph"');
      expect(html).toContain('href="/topics/aclgraph?view=analysis"');
      const links = html.match(/class="acl-topic-card-sections">([\s\S]*?)<\/div>/)![1];
      expect(links.match(/<a\b/g)).toHaveLength(2);
      expect(links).toContain("导引</a>");
      expect(links).toContain("专题剖析</a>");
      for (const stale of ["旗舰综述", "view=paper", "view=report"]) expect(html).not.toContain(stale);
    }
  });
});

describe("analysis summaries and deep-linked modal content", () => {
  const render = (search = "") => ssr(<AclGraphAnalysis problems={fixtureProblems} />, "/topics/aclgraph" + search);
  it("renders all six problems, three gap boxes and summary badges without full modal prose", () => {
    const html = render("?view=analysis");
    for (const problem of fixtureProblems) {
      expect(html).toContain(`问题 ${String(problem.index).padStart(2, "0")}`);
      expect(html).toContain(escaped(problem.title));
      for (const text of Object.values(problem.gap)) expect(html).toContain(escaped(text!));
      for (const card of [...problem.papers, ...problem.prs]) {
        expect(html).toContain(escaped(card.summaryLine));
        expect(html).not.toContain(escaped(card.evidenceRefs[0].quoteExcerpt));
      }
    }
    for (const heading of ["背景（痛点与场景）", "现有工作局限", "研究机会（Research Gap）"]) expect(html.split(`<h3>${heading}</h3>`)).toHaveLength(7);
    for (const label of ["全文精读", "CCF-A · OSDI", "arXiv 预印本", "主干已合入", "原生支持"]) expect(html).toContain(label);
    for (const modalOnly of ["role=\"dialog\"", "Key Idea", "Design 1", "Ascend 适用性依据", fixtureProblems[0].prs[0].problem]) expect(html).not.toContain(modalOnly);
  });

  it("opens a paper's complete three-part analysis and evidence from its deep link", () => {
    const card = fixtureProblems[0].papers[0];
    const html = render("?view=analysis&problem=p1&card=" + card.id);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    for (const text of ["1. 研究问题", "场景", "已有 Gap", "影响", "2. 优化方法", "Key Idea", "Design 1", "解决挑战：", "3. 效果与边界", "性能结果", "实验条件", "适用限制", "vLLM / Ascend 适用性", "证据出处", "问题 01 · 第 1 / 8 张",
      card.method.keyIdea, ...Object.values(card.problem), ...Object.values(card.effectsAndLimits), card.evidenceRefs[0].quoteExcerpt,
      ...card.method.designPoints.flatMap(point => Object.values(point))]) expect(html).toContain(escaped(text));
    expect(html).toContain('href="' + card.evidenceRefs[0].sourceUrl + '"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?上一张/);
  });

  it("opens a PR with its original title, status, Ascend basis, results and GitHub source", () => {
    const card = fixtureProblems[0].prs[0];
    const html = render("?view=analysis&problem=p1&card=" + card.id);
    expect(html).toContain('role="dialog"');
    for (const text of [card.title, VLLM_STATUS_BADGES[card.vllmStatus].label, ASCEND_APPLICABILITY_BADGES[card.ascendApplicability].label,
      "已合入 2026-11-19", "1. 研究问题", "2. 优化方法", "3. 效果与边界", "性能与验证结果", "实验条件", "适用限制", "Ascend 适用性依据", "证据出处", "查看 GitHub PR", "问题 01 · 第 5 / 8 张",
      card.problem, card.optimization, card.ascendEvidence, ...Object.values(card.effectsAndLimits), card.evidenceRefs[0].quoteExcerpt]) expect(html).toContain(escaped(text));
    expect(html).toContain(`href="${card.url}"`);
    expect(html).not.toContain("<iframe");
  });
});

describe("modal keyboard actions", () => {
  const enabled = { hasPrev: true, hasNext: true };
  it.each([["Escape", "close"], ["ArrowLeft", "prev"], ["ArrowUp", "prev"], ["ArrowRight", "next"], ["ArrowDown", "next"]] as const)("maps %s to %s", (key, action) => {
    expect(resolveModalKeyAction(key, enabled)).toBe(action);
    expect(resolveModalKeyAction(key, { ...enabled, isEditableTarget: true })).toBeNull();
    expect(resolveModalKeyAction(key, { ...enabled, hasModifier: true })).toBeNull();
  });
  it("disables boundary actions and ignores unrelated keys", () => {
    for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "Enter", "Tab", " "]) expect(resolveModalKeyAction(key, { hasPrev: false, hasNext: false })).toBeNull();
    expect(resolveModalKeyAction("Escape", { hasPrev: false, hasNext: false })).toBe("close");
  });
});

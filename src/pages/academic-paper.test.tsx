import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import actualIndex from "../../public/word-reports/topics.json";
import { academicPaperHeadings, academicPaperHrefs, PAPER_FILES, parsePaperSectionParam, revealPaperHeading, revealPendingPaperSection, type AcademicPaper } from "./academic-paper";

const archiveBase = import.meta.env.BASE_URL + "word-reports/";
const version = "c".repeat(64);
const prefix = `topic-papers/aclgraph/${version}/`;
const paper: AcademicPaper = {
  schemaVersion: 1, title: "真正论文标题", titleEn: "Actual Academic Paper", abstract: "论文自己的摘要与中心论点。",
  keywords: ["ACLGraph", "动态图执行"], literatureCutoff: "2026-11-15", manuscriptRevision: "review-pending",
  version, manifestPath: prefix + "manifest.json",
  assets: Object.fromEntries(Object.entries(PAPER_FILES).map(([kind, name]) => [kind, { path: prefix + name, sha256: "d".repeat(64), bytes: 123 }])) as AcademicPaper["assets"],
};
const current = actualIndex as unknown as TopicIndex;
const publishedTopic = current.topics.find((topic) => topic.id === "aclgraph")!;
const oldTopic = { ...publishedTopic, academicPaper: undefined };
const nextTopic: Topic = { ...oldTopic, academicPaper: paper };
function render(path: string, topic = nextTopic) {
  const index: TopicIndex = { ...current, topics: current.topics.map((item) => item.id === topic.id ? topic : item) };
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}><Routes><Route path="/topics/:topicId?" element={<TopicPages index={index} />} /></Routes></MemoryRouter>);
}

describe("academic manuscript branch", () => {
  it("uses one topic title and navigation for the three sections", () => {
    const html = render("/topics/aclgraph");
    expect(html).toContain("图重放省去了哪部分工作？");
    expect(html).toContain("view=paper");
    expect(html).toContain("view=report");
    expect(html).not.toContain("view=evidence");
    expect(html).toContain("<h1>ACL Graph</h1>");
    expect(html).not.toContain("<iframe");
  });
  it("opens the real paper with its isolated HTML and same-version editable downloads", () => {
    const html = render("/topics/aclgraph?view=paper");
    expect(html).toContain("真正论文标题");
    expect(html).toContain("Actual Academic Paper");
    expect(html).toContain(`src="${archiveBase}${prefix}paper.html"`);
    expect(html).toContain('sandbox="allow-same-origin"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('title="真正论文标题 — 论文全文"');
    expect(html).not.toContain("allow-scripts");
    expect(html).not.toContain("srcDoc=");
    for (const name of [...Object.values(PAPER_FILES), "manifest.json"]) expect(html).toContain(`${archiveBase}${prefix}${name}`);
    expect(html).not.toContain("局部工程证据对照");
    expect(html).not.toContain("独立审查摘要");
    expect(html).not.toContain("工程证据的持续积累");
    expect(html).not.toContain(oldTopic.report!.abstract);
    expect(html).toContain("view=report");
    const reportView = render("/topics/aclgraph?view=report&legacy=1");
    expect(reportView).toContain(oldTopic.report!.title);
    expect(reportView).toContain("工程证据的持续积累");
    expect(reportView).not.toContain("取材证据附录");
    expect(reportView).not.toContain("<iframe");
  });
  it("names the topic in the directory and keeps the manuscript inside its own section", () => {
    const html = render("/topics");
    expect(html).toContain("ACL Graph");
    expect(html).not.toContain('/topics/aclgraph?view=evidence');
    expect(html).not.toContain(paper.title);
    expect(html).not.toContain(paper.abstract);
  });
  it("retains current report behavior when metadata is absent", () => {
    const html = render("/topics/aclgraph?view=report&legacy=1", oldTopic);
    expect(html).toContain("局部工程证据对照");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain(paper.title);
  });
  it("opens the community PR radar without an iframe at the default report URL", () => {
    const html = render("/topics/aclgraph?view=report", publishedTopic);
    expect(html).toContain("社区 PR 趋势雷达");
    expect(html).not.toContain("<iframe");
  });
  it("rejects crossed versions, external URLs, traversal and wrong artifact names", () => {
    for (const path of ["https://example.com/paper.html", `topic-papers/other/${version}/paper.html`, `topic-papers/aclgraph/${"b".repeat(64)}/paper.html`, prefix + "../paper.html", prefix + "%2e%2e/paper.html", prefix + "report.html"]) {
      const bad = { ...paper, assets: { ...paper.assets, html: { ...paper.assets.html, path } } };
      expect(academicPaperHrefs("aclgraph", bad)).toBeUndefined();
      expect(render("/topics/aclgraph?view=paper", { ...nextTopic, academicPaper: bad })).not.toContain("<iframe");
    }
    expect(academicPaperHrefs("../aclgraph", paper)).toBeUndefined();
    expect(academicPaperHrefs("aclgraph", { ...paper, version: "not-a-version" })).toBeUndefined();
    expect(academicPaperHrefs("aclgraph", { ...paper, manifestPath: "https://example.com/manifest.json" })).toBeUndefined();
    expect(academicPaperHrefs("aclgraph", { ...paper, assets: { ...paper.assets, pdf: { ...paper.assets.pdf, sha256: "invalid" } } })).toBeUndefined();
  });
  it("keeps the topic accessible and reports malformed metadata inside the survey section", () => {
    const bad = { ...paper, keywords: undefined } as unknown as AcademicPaper;
    expect(render("/topics", { ...nextTopic, academicPaper: bad })).toContain("ACL Graph");
    expect(render("/topics/aclgraph?view=paper", { ...nextTopic, academicPaper: bad })).toContain("论文版本元数据无效");
  });
  it("offers a version-bound Word original without accepting an unrelated download", () => {
    const word = { path: prefix + "paper.docx", sha256: "e".repeat(64), bytes: 123 };
    const withWord = { ...paper, assets: { ...paper.assets, word } };
    expect(academicPaperHrefs("aclgraph", withWord)?.word).toBe(archiveBase + word.path);
    expect(render("/topics/aclgraph?view=paper", { ...nextTopic, academicPaper: withWord })).toContain("下载 Word");
    for (const path of ["https://example.com/paper.docx", prefix + "../paper.docx", prefix + "paper.pdf"]) {
      expect(academicPaperHrefs("aclgraph", { ...withWord, assets: { ...withWord.assets, word: { ...word, path } } })).toBeUndefined();
    }
  });
  it("extracts existing paper headings and focuses only heading targets without injecting HTML", () => {
    const heading = { id: "section-1", tagName: "H2", textContent: "  论文第一节  ", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const doc = { querySelectorAll: vi.fn().mockReturnValue([heading]), getElementById: vi.fn().mockReturnValue(heading) } as unknown as Document;
    expect(academicPaperHeadings(doc)).toEqual([{ id: "section-1", title: "论文第一节" }]);
    expect(revealPaperHeading(doc, "section-1", true)).toBe(true);
    expect(heading.tabIndex).toBe(-1);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(revealPaperHeading({ getElementById: () => ({ tagName: "A" }) } as unknown as Document, "ref-a")).toBe(false);
  });
  it("includes and focuses third-level analytical subsections in the paper navigation", () => {
    const heading = { id: "section-3-1-1", tagName: "H4", textContent: "3.1.1 区域切分与不兼容操作", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const querySelectorAll = vi.fn().mockReturnValue([heading]);
    const doc = { querySelectorAll, getElementById: vi.fn().mockReturnValue(heading) } as unknown as Document;
    expect(academicPaperHeadings(doc)).toEqual([{ id: heading.id, title: heading.textContent }]);
    expect(querySelectorAll).toHaveBeenCalledWith("h1[id], h2[id], h3[id], h4[id]");
    expect(revealPaperHeading(doc, heading.id, true)).toBe(true);
    expect(heading.tabIndex).toBe(-1);
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: "instant", block: "start" });
    expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(revealPaperHeading({ getElementById: () => ({ tagName: "H5" }) } as unknown as Document, "unsupported")).toBe(false);
  });
  it("links all reviewed routes and downloads to the current frozen paper", () => {
    const actual = publishedTopic.academicPaper!;
    const hrefs = academicPaperHrefs("aclgraph", actual)!;
    const html = render("/topics/aclgraph?view=paper", publishedTopic);
    expect(html).toContain("ACLGraph 综述研究版图总览");
    expect(html.indexOf("ACLGraph 综述研究版图总览")).toBeLessThan(html.indexOf("<iframe"));
    for (const route of publishedTopic.survey!.routes) {
      expect(html).toContain(`href="${hrefs.html}#${encodeURIComponent(route.paperAnchor!)}"`);
    }
    for (const kind of Object.keys(actual.assets)) {
      expect(html).toContain(`href="${hrefs[kind as keyof typeof PAPER_FILES]}"`);
    }
    expect(actual.version).toBe("62dba962fda5240ee8b37bdac3d8c877245daabcdab03265e7ef7ead46d0fd86");
    expect(actual.manuscriptRevision).toBe("v5-csur-20261124");
    expect(actual.literatureCutoff).toBe("2026-11-24");
    expect(html).toContain("视角一：推理负载变化与图适配需求（4 个研究方向 · 24 项相关工作）");
    expect(html).toContain("视角二：通用执行图系统核心机制版图（第 4 章 · 4 大机制 · 33 项代表工作）");
    expect(html).toContain("细粒度机制分组（10 组）");
    for (const section of ["3-1", "3-2", "3-3", "3-4", "4-3", "4-4", "4-5", "4-6"]) {
      expect(html).toContain(`href="${hrefs.html}#section-${section}"`);
    }
    const references = [...html.matchAll(/class="acl-taxonomy-citation" href="[^"]*#ref-(\d+)"/g)]
      .map((match) => Number(match[1]));
    expect(references).toHaveLength(57);
    expect(new Set(references).size).toBe(57);
    expect(references.slice(0, 24)).toEqual([
      51, 52, 54, 56, 68, 69, 59, 61, 11, 63, 55, 57, 58,
      62, 64, 65, 66, 67, 53, 60, 70, 71, 31, 30,
    ]);
    expect(references.slice(24)).toEqual([
      8, 9, 10, 4, 5, 6, 7, 16, 17, 14, 15, 18,
      20, 21, 23, 72, 22, 24, 25, 26, 27, 19, 28, 29,
      32, 33, 34, 35, 38, 39, 36, 37, 40,
    ]);
    for (const legacy of ["双平面", "平面 I", "平面 II", "T1-L", "T2-L"]) expect(html).not.toContain(legacy);
    expect(html).toContain(`src="${hrefs.html}"`);
    expect(html).toContain(`href="${hrefs.pdf}"`);
    expect(html).toContain(`href="${hrefs.sources}"`);
    expect(html).toContain(renderToStaticMarkup(<>{actual.title}</>));
    expect(html).not.toContain("survey-page");
    expect(html).not.toContain("独立审查摘要");
    const directory = render("/topics", publishedTopic);
    expect(directory).not.toContain(renderToStaticMarkup(<>{actual.abstract}</>));
    expect(directory).not.toContain(renderToStaticMarkup(<>{oldTopic.report!.abstract}</>));
  });
});

describe("paper section query parameters", () => {
  it.each<[string, string | null]>([
    ["?view=paper&section=section-4-1", "section-4-1"],
    ["section=section-4-2", "section-4-2"],
    ["?section=%20%09section-5-2%0A%20", "section-5-2"],
    ["?section=", null],
    ["?section", null],
    ["?section=%20%09%0A", null],
    ["?view=paper", null],
    ["", null],
  ])("parses %j from either supported input type", (search, expected) => {
    expect(parsePaperSectionParam(search)).toBe(expected);
    const params = new URLSearchParams(search);
    const original = params.toString();
    expect(parsePaperSectionParam(params)).toBe(expected);
    expect(params.toString()).toBe(original);
  });
});

describe("pending paper section navigation", () => {
  const requestKey = `${version}:entry-a:section-4-1`;
  const pending = { targetSection: "section-4-1", frameReady: true, lastRevealedKey: null, requestKey };

  function sectionDocument() {
    const firstHeading = { tagName: "H2", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const nextHeading = { tagName: "H3", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const reference = { tagName: "A", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const unsupported = { tagName: "H5", tabIndex: 0, scrollIntoView: vi.fn(), focus: vi.fn() };
    const elements: Record<string, typeof firstHeading> = {
      "section-4-1": firstHeading, "section-5-2": nextHeading, "ref-1": reference, unsupported,
    };
    const getElementById = vi.fn((id: string) => elements[id] ?? null);
    const doc = { getElementById } as unknown as Document;
    return { doc, getElementById, firstHeading, nextHeading, reference, unsupported };
  }

  it("waits for iframe load and resize, then focuses and scrolls exactly once across resize ticks", () => {
    const { doc, getElementById, firstHeading } = sectionDocument();
    const waiting = revealPendingPaperSection({ ...pending, doc, frameReady: false });
    expect(waiting).toEqual({ revealed: false, nextRevealedKey: null });
    expect(getElementById).not.toHaveBeenCalled();
    expect(firstHeading.scrollIntoView).not.toHaveBeenCalled();
    expect(firstHeading.focus).not.toHaveBeenCalled();

    const ready = revealPendingPaperSection({ ...pending, doc, lastRevealedKey: waiting.nextRevealedKey });
    expect(ready).toEqual({ revealed: true, nextRevealedKey: requestKey });
    expect(getElementById).toHaveBeenCalledWith("section-4-1");
    expect(firstHeading.tabIndex).toBe(-1);
    expect(firstHeading.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
    expect(firstHeading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });

    for (let tick = 0; tick < 3; tick++) {
      expect(revealPendingPaperSection({ ...pending, doc, lastRevealedKey: ready.nextRevealedKey }))
        .toEqual({ revealed: false, nextRevealedKey: requestKey });
    }
    expect(getElementById).toHaveBeenCalledTimes(1);
    expect(firstHeading.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(firstHeading.focus).toHaveBeenCalledTimes(1);
  });

  it("preserves the previous request while the next iframe is not ready", () => {
    const { doc, getElementById, firstHeading } = sectionDocument();
    expect(revealPendingPaperSection({ ...pending, doc, frameReady: false, lastRevealedKey: "earlier-request" }))
      .toEqual({ revealed: false, nextRevealedKey: "earlier-request" });
    expect(getElementById).not.toHaveBeenCalled();
    expect(firstHeading.scrollIntoView).not.toHaveBeenCalled();
    expect(firstHeading.focus).not.toHaveBeenCalled();
  });

  it.each([null, undefined])("waits safely when the iframe document is %s", (doc) => {
    expect(revealPendingPaperSection({ ...pending, doc, lastRevealedKey: "earlier-request" }))
      .toEqual({ revealed: false, nextRevealedKey: "earlier-request" });
  });

  it("reveals a new section while the paper remains mounted", () => {
    const { doc, firstHeading, nextHeading } = sectionDocument();
    const first = revealPendingPaperSection({ ...pending, doc });
    const nextRequestKey = `${version}:entry-a:section-5-2`;
    expect(revealPendingPaperSection({ ...pending, doc, targetSection: "section-5-2", requestKey: nextRequestKey, lastRevealedKey: first.nextRevealedKey }))
      .toEqual({ revealed: true, nextRevealedKey: nextRequestKey });
    expect(firstHeading.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(nextHeading.tabIndex).toBe(-1);
    expect(nextHeading.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
    expect(nextHeading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it("reveals the same section again for a new navigation key", () => {
    const { doc, firstHeading } = sectionDocument();
    const first = revealPendingPaperSection({ ...pending, doc });
    const nextRequestKey = `${version}:entry-b:section-4-1`;
    expect(revealPendingPaperSection({ ...pending, doc, requestKey: nextRequestKey, lastRevealedKey: first.nextRevealedKey }))
      .toEqual({ revealed: true, nextRevealedKey: nextRequestKey });
    expect(firstHeading.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(firstHeading.focus).toHaveBeenCalledTimes(2);
  });

  it("clears the tracked key when section is removed, even without a ready iframe", () => {
    const { doc, firstHeading } = sectionDocument();
    const first = revealPendingPaperSection({ ...pending, doc });
    const cleared = revealPendingPaperSection({ doc: null, targetSection: null, frameReady: false, requestKey: "", lastRevealedKey: first.nextRevealedKey });
    expect(cleared).toEqual({ revealed: false, nextRevealedKey: null });
    expect(firstHeading.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(revealPendingPaperSection({ ...pending, doc, lastRevealedKey: cleared.nextRevealedKey }))
      .toEqual({ revealed: true, nextRevealedKey: requestKey });
    expect(firstHeading.scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it.each(["ref-1", "missing", "unsupported"])("rejects %s without scrolling or marking the request as revealed", (targetSection) => {
    const { doc, firstHeading, nextHeading, reference, unsupported } = sectionDocument();
    for (const lastRevealedKey of [null, "earlier-request"]) {
      const rejected = revealPendingPaperSection({ ...pending, doc, targetSection, lastRevealedKey });
      expect(rejected).toEqual({ revealed: false, nextRevealedKey: lastRevealedKey });
    }
    for (const element of [firstHeading, nextHeading, reference, unsupported]) {
      expect(element.scrollIntoView).not.toHaveBeenCalled();
      expect(element.focus).not.toHaveBeenCalled();
      expect(element.tabIndex).toBe(0);
    }
    expect(revealPendingPaperSection({ ...pending, doc })).toEqual({ revealed: true, nextRevealedKey: requestKey });
  });

  it("honors reduced motion for a pending section reveal", () => {
    const { doc, firstHeading } = sectionDocument();
    expect(revealPendingPaperSection({ ...pending, doc, reducedMotion: true }))
      .toEqual({ revealed: true, nextRevealedKey: requestKey });
    expect(firstHeading.scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "instant", block: "start" });
    expect(firstHeading.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });
});

describe("paper section server rendering", () => {
  it("renders the PR deep link with its target and frozen v5 iframe without browser APIs", () => {
    const frozenV5Version = "62dba962fda5240ee8b37bdac3d8c877245daabcdab03265e7ef7ead46d0fd86";
    expect(publishedTopic.academicPaper!.version).toBe(frozenV5Version);
    const html = render("/topics/aclgraph?view=paper&section=section-4-3", publishedTopic);
    expect(html).toContain('class="academic-paper-page" data-target-section="section-4-3"');
    expect(html.match(/<iframe\b[^>]*>/)?.[0]).toContain(`src="${archiveBase}topic-papers/aclgraph/${frozenV5Version}/paper.html"`);
    expect(html).toContain('sandbox="allow-same-origin"');
    expect(html).not.toContain('role="alert"');
  });

  it.each(["", "&section=", "&section=%20%09"])("omits the target attribute for a plain or empty section: %s", (search) => {
    expect(render(`/topics/aclgraph?view=paper${search}`, publishedTopic)).not.toContain("data-target-section");
  });
});

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import actualIndex from "../../public/word-reports/topics.json";
import { academicPaperHeadings, academicPaperHrefs, PAPER_FILES, revealPaperHeading, type AcademicPaper } from "./academic-paper";

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
    expect(html).toContain("图回放省去了哪部分工作？");
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
    const reportView = render("/topics/aclgraph?view=report");
    expect(reportView).toContain(oldTopic.report!.title);
    expect(reportView).toContain("工程证据的持续积累");
    expect(reportView).not.toContain("取材证据附录");
    expect(reportView).not.toContain("<iframe");
  });
  it("names the topic in the directory and keeps the manuscript inside its own section", () => {
    const html = render("/topics");
    expect(html).toContain("ACL Graph");
    expect(html).not.toContain("PR 与趋势");
    expect(html).not.toContain(paper.title);
    expect(html).not.toContain(paper.abstract);
  });
  it("retains current report behavior when metadata is absent", () => {
    const html = render("/topics/aclgraph?view=report", oldTopic);
    expect(html).toContain("局部工程证据对照");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain(paper.title);
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
  it("opens the taxonomy and links all five branches to their frozen chapters", () => {
    const actual = publishedTopic.academicPaper!;
    expect(actual.manuscriptRevision).toBe("R2.1-taxonomy-examples");
    const hrefs = academicPaperHrefs("aclgraph", actual)!;
    const html = render("/topics/aclgraph?view=paper", publishedTopic);
    expect(html).toContain("ACLGraph 技术分类总图");
    expect(html.indexOf("ACLGraph 技术分类总图")).toBeLessThan(html.indexOf("<iframe"));
    for (const anchor of ["capture", "selection", "replay-state", "scheduling", "lifecycle"]) {
      expect(html).toContain(`href="${hrefs.html}#${anchor}"`);
    }
    expect(html).toContain("昇腾直接工作");
    expect(html).toContain("可借鉴的 GPU 工作");
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

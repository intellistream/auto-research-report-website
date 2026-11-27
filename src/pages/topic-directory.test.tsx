import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import actualIndex from "../../public/word-reports/topics.json";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";

const index = actualIndex as unknown as TopicIndex;
const acl = index.topics.find(topic => topic.id === "aclgraph")!;

function renderDirectory(topics: Topic[], schemaVersion: TopicIndex["schemaVersion"] = 2) {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={["/topics"]}>
      <Routes><Route path="/topics" element={<TopicPages index={{ schemaVersion, topics }} />} /></Routes>
    </MemoryRouter>,
  );
  return [...html.matchAll(/<li class="topic-directory-card">[\s\S]*?<\/li>/g)].map(([card]) => card);
}

describe("technical topic directory", () => {
  it("renders every published topic with the same evidence and section slots", () => {
    const cards = renderDirectory(index.topics);
    const paths = [
      "/topics/kv-cache?view=overview", "/topics/aclgraph?view=analysis",
      "/topics/speculative-decoding?view=report",
      "/topics/distributed-inference-control-plane?view=instances",
    ];
    expect(cards).toHaveLength(index.topics.filter(topic => topic.id !== "kv-cache").length + 1);
    for (const path of paths) {
      const card = cards.find(html => html.includes('href="' + path + '"'));
      expect(card).toBeDefined();
      expect(card).toContain('class="topic-directory-evidence"');
      expect(card).toContain('class="topic-section-links"');
    }
  });

  it.each([1, 2] as const)("keeps engineering entry points for schema %i", schemaVersion => {
    const [kvCard, card] = renderDirectory(
      [{ ...acl, id: "engineering", academicPaper: undefined, report: schemaVersion === 1 ? acl.report : undefined }],
      schemaVersion,
    );
    expect(kvCard).toContain("KV Cache");
    expect(card).toContain('href="/topics/engineering"');
    expect(card).toContain('href="/topics/engineering?focus=routes"');
    expect(card).toContain('href="/topics/engineering?focus=evidence"');
    expect(card).toContain('class="topic-directory-evidence"');
  });

  it("keeps the date, question and reading link for a generic dynamic report", () => {
    const [, card] = renderDirectory([{ ...acl, id: "dynamic-review", academicPaper: undefined }]);
    expect(card).toContain(acl.report!.title);
    expect(card).toContain('dateTime="' + acl.report!.asOf + '"');
    expect(card).toContain(acl.report!.researchQuestions[0]);
    expect(card).toMatch(/href="\/topics\/dynamic-review"[^>]*>阅读报告<\/a>/);
    expect(card).toContain('class="topic-directory-evidence"');
  });

  it("keeps the paper preview and renders invalid manuscript metadata without a broken link", () => {
    const paper = acl.academicPaper!;
    const id = "academic-review";
    const remap = (path: string) => path.replace("/aclgraph/", "/" + id + "/");
    const academicPaper = {
      ...paper,
      manifestPath: remap(paper.manifestPath),
      assets: Object.fromEntries(Object.entries(paper.assets).map(([key, asset]) =>
        [key, { ...asset, path: remap(asset.path) }],
      )) as typeof paper.assets,
    };
    const [, card, invalidCard] = renderDirectory([
      { ...acl, id, academicPaper },
      { ...acl, id: "invalid-paper", academicPaper: { ...academicPaper, version: "invalid" } },
    ]);
    expect(card).toContain(academicPaper.title);
    expect(card).toMatch(/href="\/topics\/academic-review"[^>]*>阅读论文全文<\/a>/);
    expect(card).toContain('class="topic-directory-evidence"');
    expect(invalidCard).toContain("论文版本元数据无效");
    expect(invalidCard).not.toContain("href=");
  });
});

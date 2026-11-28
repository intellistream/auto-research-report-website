import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import actualIndex from "../../public/word-reports/topics.json";
import TopicPages, { type TopicIndex } from "./TopicPages";

const index = actualIndex as unknown as TopicIndex;
const acl = index.topics.find(topic => topic.id === "aclgraph")!;

function renderDetail(path: string, data = index) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/topics/" + path]}>
      <Routes><Route path="/topics/:topicId" element={<TopicPages index={data} />} /></Routes>
    </MemoryRouter>,
  );
}

function expectLayout(html: string, active: string, count: number, current = "page") {
  expect(html).toMatch(/<header class="topic-detail-header"[^>]*>[\s\S]*?<\/header><nav class="topic-detail-nav"/);
  const nav = html.match(/<nav class="topic-detail-nav"[^>]*>([\s\S]*?)<\/nav>/)![1];
  expect(nav.match(/<a /g)).toHaveLength(count);
  expect(nav.match(/aria-current=/g)).toHaveLength(1);
  expect(nav).toContain(`aria-current="${current}"`);
  const selected = nav.match(/<a[^>]*aria-current=[^>]*>([^<]+)<\/a>/)?.[1];
  expect(selected).toBe(active);
}

describe("technical topic details", () => {
  it.each([
    ["aclgraph?view=evidence", "专题剖析", 2],
    ["pipeline-reordering", "导引", 2],
    ["pipeline-reordering?view=analysis", "专题剖析", 2],
    ["kv-cache?view=evidence&kind=paper", "论文", 4],
    ["speculative-decoding?view=evidence", "动态报告", 3],
    ["distributed-inference-control-plane", "总览", 6],
    ["distributed-inference-control-plane?view=guide", "总览", 6],
    ["distributed-inference-control-plane?view=scheduling", "分布式请求调度", 6],
    ["distributed-inference-control-plane?view=systems", "论文与实现", 6],
    ["distributed-inference-control-plane?view=evidence", "实测与工程证据", 6],
  ] as const)("uses the shared layout and one active section for %s", (path, active, count) => {
    const html = renderDetail(path);
    expectLayout(html, active, count);
    if (path === "distributed-inference-control-plane") {
      expect(html.indexOf("</nav>")).toBeLessThan(html.indexOf("cp-architecture"));
    }
  });

  it("keeps the older workbench focus URLs and filter state shareable", () => {
    const data: TopicIndex = { schemaVersion: 1, topics: [{
      ...acl, id: "engineering", academicPaper: undefined,
    }] };
    const html = renderDetail("engineering?focus=evidence&repo=vllm", data);
    expectLayout(html, "工程证据库", 4, "location");
    expect(html).toContain("focus=routes&amp;repo=vllm");
    expect(html).toContain('id="topic-evidence-workbench"');
  });

  it("keeps standalone manuscript and report navigation available", () => {
    const id = "shared-review";
    const paper = acl.academicPaper!;
    const remap = (path: string) => path.replace("/aclgraph/", "/" + id + "/");
    const academicPaper = {
      ...paper,
      manifestPath: remap(paper.manifestPath),
      assets: Object.fromEntries(Object.entries(paper.assets).map(([key, asset]) =>
        [key, { ...asset, path: remap(asset.path) }],
      )) as typeof paper.assets,
    };
    const data: TopicIndex = { schemaVersion: 2, topics: [{ ...acl, id, academicPaper }] };
    const paperPage = renderDetail(id, data);
    expectLayout(paperPage, "学术综述稿", 2);
    expect(paperPage).toContain("下载同版 PDF");
    const reportPage = renderDetail(id + "?view=report", data);
    expectLayout(reportPage, "动态报告", 2);
    expect(reportPage).toContain('id="survey-top"');
    expect(reportPage).toContain("快速阅读");
  });
});

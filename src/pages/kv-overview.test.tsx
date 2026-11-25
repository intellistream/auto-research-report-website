import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import KvCacheTopic, { kvTopicView } from "./KvCacheTopic";
import overview from "./kv-overview.json";
import { communityEntries } from "./kv-community";
import { kvResearch } from "./kv-research";
import { synthesisPaper } from "./kv-synthesis";
import { latestWeeklyReport, weeklyReports, weeklySource } from "./kv-weekly";
import { safeTopicSource } from "./topic-report";

function render(search: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/kv-cache?" + search]}><KvCacheTopic/></MemoryRouter>);
}

describe("KV overall report and supporting evidence", () => {
  it("covers the taxonomy with included, relevant papers and full PR identities", () => {
    expect(overview.directions.map(item => item.id).sort()).toEqual(kvResearch.taxonomy.map(item => item.id).sort());
    const references: { papers?: string[]; prs?: string[]; sources?: string[] }[] = [
      ...overview.judgments.map(item => item.evidence), ...overview.directions.map(item => item.evidence), overview.validation.evidence,
    ];
    for (const evidence of references) {
      expect((evidence.papers?.length ?? 0) + (evidence.prs?.length ?? 0) + (evidence.sources?.length ?? 0)).toBeGreaterThan(0);
      for (const slug of evidence.papers ?? []) expect(synthesisPaper(slug)?.decision).toBe("included");
      for (const id of evidence.prs ?? []) {
        expect(id).toMatch(/^github:vllm-project\/vllm(-ascend)?#\d+$/);
        expect(communityEntries.find(entry => entry.id === id)?.decision).toBe("included");
      }
      for (const id of evidence.sources ?? []) expect(safeTopicSource(weeklySource(id)?.url ?? "")).toBeTruthy();
    }
    for (const direction of overview.directions) {
      for (const slug of direction.evidence.papers) expect(synthesisPaper(slug)?.topics).toContain(direction.id);
      for (const id of direction.evidence.prs) expect(communityEntries.find(entry => entry.id === id)?.topics).toContain(direction.id);
    }
    expect(weeklySource("proposal-53277")?.kind).toBe("proposal");
    expect(communityEntries.some(entry => entry.id.endsWith("#53277"))).toBe(false);
  });

  it("links the candidate to its dated judgment without claiming a later evidence cutoff", () => {
    const question = weeklyReports.find(item => item.week === overview.validation.week)?.questions
      .find(item => item.id === overview.validation.questionId);
    expect(question?.title).toBe(overview.validation.title);
    expect(overview.materialThrough <= latestWeeklyReport.materialThrough).toBe(true);
    expect(overview.relatedWorkThrough <= question!.relatedWork.checkedAt).toBe(true);
    const html = render("view=overview");
    const hrefs = [...html.split('<article class="kv-overview">')[1].matchAll(/href="([^"]+)"/g)]
      .map(match => match[1].replaceAll("&amp;", "&"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of new Set(hrefs)) {
      if (href.startsWith("https://")) { expect(safeTopicSource(href)).toBe(href); continue; }
      const destination = new URL(href, "http://localhost");
      const query = destination.searchParams;
      const linkedHtml = render(query.toString());
      const part = query.get("part");
      if (part) expect(linkedHtml).toContain(`id="${part}"`);
      if (query.get("view") === "survey") expect(query.get("topic")).toBeTruthy();
    }
  });

  it("opens the whole report regardless of stale weekly, edition and material filters", () => {
    const query = new URLSearchParams("view=overview&week=2030-01-07&edition=unknown&topic=unknown&q=no-match&repo=vllm-ascend&state=closed&collection=recommended");
    expect(kvTopicView(query)).toBe("overview");
    const html = render(query.toString());
    const article = html.split('<article class="kv-overview">')[1];
    for (const direction of overview.directions) expect(article).toContain(`id="kv-overview-${direction.id}"`);
    expect(article).toContain('id="kv-overview-validation"');
    expect(html).not.toContain('aria-label="选择周报"');
    expect(html).not.toContain('aria-label="原版报告说明"');
    for (const href of [...article.matchAll(/href="([^"]+)"/g)].map(match => match[1].replaceAll("&amp;", "&"))) {
      const target = new URL(href, "http://localhost");
      if (target.origin !== "http://localhost") continue;
      expect(target.searchParams.get("q")).not.toBe("no-match");
      expect(target.searchParams.get("edition")).not.toBe("unknown");
      expect(target.searchParams.get("topic")).not.toBe("unknown");
    }
  });
});

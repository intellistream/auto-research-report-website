import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import {
  aclGraphDynamicReport as report, filterFeaturedPrs, filterTrackedPrs, findTrackedPrByWorkId,
  formatIsoDate, hotspotById, legacyRevisionHrefs, repoLabel, resolveSurveySectionLink,
  shortSha, SURVEY_SECTION_MAP, type FeaturedPrFilters, type TrackedPrFilters,
} from "./aclgraph-dynamic-report";
import { safeTopicSource } from "./topic-report";
import { validatedSurvey } from "./topic-survey";

const index = actualIndex as unknown as TopicIndex;
const topic = index.topics.find(item => item.id === "aclgraph")!;
const archiveBase = import.meta.env.BASE_URL + "word-reports/";
const featuredFilters: FeaturedPrFilters = { repo: "all", hotspot: "all", status: "all" };
const trackedFilters: TrackedPrFilters = { query: "", repo: "all", hotspot: "all", status: "all" };
const surveySections = [
  { hint: "capture-granularity", routeId: "capture", anchor: "section-4-3", nextAnchor: "section-6-1", nextSection: "6.1" },
  { hint: "dynamic-metadata", routeId: "replay-state", anchor: "section-4-4", nextAnchor: "section-6-2", nextSection: "6.2" },
  { hint: "padding-and-correctness", routeId: "replay-state", anchor: "section-4-4", nextAnchor: "section-6-2", nextSection: "6.2" },
  { hint: "lifecycle-and-compilation", routeId: "lifecycle", anchor: "section-4-6", nextAnchor: "section-7-2", nextSection: "7.2" },
] as const;

function render(path = "/topics/aclgraph?view=report"): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/topics/:topicId" element={<TopicPages index={index} />} /></Routes>
  </MemoryRouter>);
}

function escaped(value: string): string {
  return renderToStaticMarkup(<>{value}</>);
}

function region(html: string, id: string, tag: "section" | "details" = "section"): string {
  const markup = html.match(new RegExp(`<${tag}\\b[^>]*id="${id}"[^>]*>[\\s\\S]*?</${tag}>`))?.[0];
  expect(markup, id).toBeDefined();
  return markup!;
}

function articles(html: string, className: string): string[] {
  return [...html.matchAll(new RegExp(`<article\\b[^>]*class="${className}"[^>]*>[\\s\\S]*?</article>`, "g"))]
    .map(match => match[0]);
}

function featuredSlugs(html: string) {
  return articles(html, "acl-pr-card").map(card => card.match(/id="acl-pr-([^"]+)"/)?.[1]);
}

describe("ACLGraph dynamic report dataset integrity", () => {
  it("keeps tracked PRs, repository splits and window merges consistent with the KPIs", () => {
    expect(report.allTrackedPrs).toHaveLength(147);
    expect(new Set(report.allTrackedPrs.map(pr => pr.workId)).size).toBe(147);
    const merged = report.allTrackedPrs.filter(pr => pr.mergedInWindow);
    expect(merged).toHaveLength(41);
    expect(report.kpis).toMatchObject({
      trackedPrCount: 147, ascendCount: 72, vllmCount: 75,
      newlyMergedCount: 41, ascendMergedInWindow: 16, vllmMergedInWindow: 25,
      openPrCount: 100, mergedTotalCount: 47,
    });
    for (const [repository, total, newlyMerged] of [["vllm-ascend", 72, 16], ["vllm", 75, 25]] as const) {
      expect(report.allTrackedPrs.filter(pr => pr.repository === repository)).toHaveLength(total);
      expect(merged.filter(pr => pr.repository === repository)).toHaveLength(newlyMerged);
    }
    expect(report.allTrackedPrs.filter(pr => pr.state === "OPEN")).toHaveLength(report.kpis.openPrCount);
    expect(report.allTrackedPrs.filter(pr => pr.state === "MERGED")).toHaveLength(report.kpis.mergedTotalCount);
    for (const pr of merged) {
      expect(pr.state).toBe("MERGED");
      expect(pr.mergedAt!.slice(0, 10) >= report.periodStart).toBe(true);
      expect(pr.mergedAt!.slice(0, 10) <= report.periodEnd).toBe(true);
    }
  });

  it("partitions all 147 PRs into four hotspots with a complete percentage distribution", () => {
    expect(report.hotspots).toHaveLength(4);
    expect(report.kpis.hotspotCount).toBe(report.hotspots.length);
    expect(new Set(report.hotspots.map(hotspot => hotspot.id)).size).toBe(4);
    expect(report.hotspots.reduce((sum, hotspot) => sum + hotspot.count, 0)).toBe(147);
    expect(Math.abs(report.hotspots.reduce((sum, hotspot) => sum + hotspot.sharePct, 0) - 100)).toBeLessThanOrEqual(0.1);
    for (const hotspot of report.hotspots) {
      const prs = report.allTrackedPrs.filter(pr => pr.hotspotId === hotspot.id);
      expect(prs).toHaveLength(hotspot.count);
      expect(prs.filter(pr => pr.repository === "vllm-ascend")).toHaveLength(hotspot.ascendCount);
      expect(prs.filter(pr => pr.repository === "vllm")).toHaveLength(hotspot.vllmCount);
      expect(prs.filter(pr => pr.mergedInWindow)).toHaveLength(hotspot.mergedInWindow);
      expect(hotspot.sharePct).toBeCloseTo(hotspot.count / 147 * 100, 1);
      expect(hotspotById(hotspot.id)).toBe(hotspot);
    }
  });

  it("resolves every featured slug in the four insights", () => {
    expect(report.insights).toHaveLength(4);
    const slugs = new Set(report.featuredPrs.map(pr => pr.slug));
    for (const insight of report.insights) {
      expect(insight.featuredSlugs.length).toBeGreaterThan(0);
      for (const slug of insight.featuredSlugs) expect(slugs.has(slug), slug).toBe(true);
      expect(hotspotById(insight.hotspotId)).toBeDefined();
    }
  });

  it("keeps 14 unique, safely linked featured PRs with the 9 / 5 repository split", () => {
    expect(report.featuredPrs).toHaveLength(14);
    expect(report.kpis.featuredCount).toBe(14);
    expect(report.featuredPrs.filter(pr => pr.repository === "vllm-ascend")).toHaveLength(9);
    expect(report.featuredPrs.filter(pr => pr.repository === "vllm")).toHaveLength(5);
    expect(new Set(report.featuredPrs.map(pr => pr.slug)).size).toBe(14);
    for (const pr of report.featuredPrs) {
      expect(safeTopicSource(pr.url)).toBe(pr.url);
      expect(findTrackedPrByWorkId(pr.workId)).toMatchObject({
        number: pr.number, repository: pr.repository, isFeatured: true, featuredSlug: pr.slug,
      });
    }
  });

  it("accounts for all 11 baseline PRs and their three change statuses", () => {
    expect(report.baselineUpdates).toHaveLength(11);
    expect(new Set(report.baselineUpdates.map(pr => pr.workId)).size).toBe(11);
    expect(report.baselineUpdates.filter(pr => pr.changeStatus === "active-commits")).toHaveLength(6);
    expect(report.baselineUpdates.filter(pr => pr.changeStatus === "open-unchanged")).toHaveLength(3);
    expect(report.baselineUpdates.filter(pr => pr.changeStatus === "merged-pre-baseline")).toHaveLength(2);
    expect(report.kpis).toMatchObject({ baselineTotalCount: 11, baselineChangedCount: 6 });
    for (const pr of report.baselineUpdates) {
      expect(findTrackedPrByWorkId(pr.workId)).toMatchObject({ number: pr.number, isBaseline: true, state: pr.currentState });
    }
  });

  it("resolves all PR work IDs in the four next-watch items", () => {
    expect(report.nextWatchlist).toHaveLength(4);
    for (const item of report.nextWatchlist) {
      expect(item.watchPrs.length).toBeGreaterThan(0);
      for (const workId of item.watchPrs) {
        const pr = findTrackedPrByWorkId(workId);
        expect(pr, workId).toBeDefined();
        expect(safeTopicSource(pr!.url)).toBe(pr!.url);
      }
    }
    expect(findTrackedPrByWorkId("github:vllm-project/vllm#999999999")).toBeUndefined();
  });

  it("offers safe, version-bound PDF, HTML, Markdown and JSON hrefs for revisions 3, 2 and 1", () => {
    expect(report.legacyArchive.revisions).toHaveLength(3);
    expect(report.legacyArchive.revisions.map(revision => revision.revision)).toEqual([3, 2, 1]);
    expect(report.legacyArchive.revisions.map(revision => revision.version.slice(0, 8)))
      .toEqual(["6dd5554a", "7c0aa735", "74b1b63d"]);
    for (const revision of report.legacyArchive.revisions) {
      expect(revision.version).toMatch(/^[a-f0-9]{64}$/);
      const hrefs = legacyRevisionHrefs(revision.version);
      for (const kind of ["pdf", "html", "md", "json"] as const) {
        expect(hrefs[kind]).toBe(`${archiveBase}topic-reports/aclgraph/${revision.version}/report.${kind}`);
        expect(hrefs[kind]).toBe(archiveBase + revision.paths[kind]);
        expect(new URL(hrefs[kind]!, "https://reports.example").origin).toBe("https://reports.example");
      }
    }
  });
});

describe("ACLGraph dynamic report pure helpers", () => {
  it.each<{ name: string; filters: Partial<FeaturedPrFilters>; count: number }>([
    { name: "all featured PRs", filters: {}, count: 14 },
    { name: "Ascend", filters: { repo: "vllm-ascend" }, count: 9 },
    { name: "upstream vLLM", filters: { repo: "vllm" }, count: 5 },
    { name: "updatable metadata", filters: { hotspot: "updatable-metadata" }, count: 4 },
    { name: "open status", filters: { status: "OPEN" }, count: 2 },
    { name: "merged status", filters: { status: "MERGED" }, count: 12 },
  ])("filters $name", ({ filters, count }) => {
    const prs = filterFeaturedPrs(report.featuredPrs, { ...featuredFilters, ...filters });
    expect(prs).toHaveLength(count);
    for (const pr of prs) {
      if (filters.repo) expect(pr.repository).toBe(filters.repo);
      if (filters.hotspot) expect(pr.hotspotId).toBe(filters.hotspot);
      if (filters.status) expect(pr.state).toBe(filters.status);
    }
  });

  it("intersects featured repository, hotspot and status filters", () => {
    expect(filterFeaturedPrs(report.featuredPrs, {
      repo: "vllm-ascend", hotspot: "updatable-metadata", status: "MERGED",
    }).map(pr => pr.number)).toEqual([21329, 21019, 21191]);
    expect(filterFeaturedPrs(report.featuredPrs, {
      repo: "vllm", hotspot: "updatable-metadata", status: "OPEN",
    }).map(pr => pr.number)).toEqual([52440]);
  });

  it("returns an empty featured intersection", () => {
    expect(filterFeaturedPrs(report.featuredPrs, {
      repo: "vllm", hotspot: "padding-replay-correctness", status: "OPEN",
    })).toEqual([]);
  });

  it("searches tracked PRs by number and by a case-insensitive title, trimming whitespace", () => {
    for (const query of ["#22172", "  #22172  ", "dFlAsH2 GrApH iN pD sErViNg"]) {
      const prs = filterTrackedPrs(report.allTrackedPrs, { ...trackedFilters, query });
      expect(prs.map(pr => pr.number)).toEqual([22172]);
    }
    expect(filterTrackedPrs(report.allTrackedPrs, { ...trackedFilters, query: "no-such-PR-title-999999999" })).toEqual([]);
    expect(filterTrackedPrs(report.allTrackedPrs, { ...trackedFilters, query: "  " })).toHaveLength(147);
  });

  it.each<{ status: TrackedPrFilters["status"]; count: number }>([
    { status: "all", count: 147 }, { status: "merged-in-window", count: 41 },
    { status: "MERGED", count: 47 }, { status: "OPEN", count: 100 },
  ])("filters tracked status $status", ({ status, count }) => {
    const prs = filterTrackedPrs(report.allTrackedPrs, { ...trackedFilters, status });
    expect(prs).toHaveLength(count);
    if (status === "merged-in-window") expect(prs.every(pr => pr.mergedInWindow)).toBe(true);
    else if (status !== "all") expect(prs.every(pr => pr.state === status)).toBe(true);
  });

  it("intersects tracked repository, hotspot, query and status rather than combining them as alternatives", () => {
    const filters: TrackedPrFilters = {
      query: "DFlash2 graph in PD serving", repo: "vllm-ascend",
      hotspot: "graph-boundary-expansion", status: "merged-in-window",
    };
    expect(filterTrackedPrs(report.allTrackedPrs, filters).map(pr => pr.number)).toEqual([22172]);
    expect(filterTrackedPrs(report.allTrackedPrs, { ...filters, repo: "vllm" })).toEqual([]);
    expect(filterTrackedPrs(report.allTrackedPrs, { ...filters, hotspot: "updatable-metadata" })).toEqual([]);
    expect(filterTrackedPrs(report.allTrackedPrs, { ...filters, status: "OPEN" })).toEqual([]);
  });

  it.each(surveySections)("links published $hint to $anchor in the app and standalone paper", ({ hint, routeId, anchor }) => {
    expect(validatedSurvey(topic)).toBe(topic.survey);
    const route = topic.survey!.routes.find(item => item.id === routeId)!;
    expect(resolveSurveySectionLink(hint, topic)).toEqual({
      anchor, sectionNumber: route.paperSection, sectionTitle: route.title,
      appTo: { pathname: "/topics/aclgraph", search: "view=paper&section=" + anchor },
      htmlHref: archiveBase + topic.academicPaper!.assets.html.path + "#" + anchor,
    });
  });

  it("automatically follows a validated future manuscript's changed anchors and versioned assets", () => {
    const paper = structuredClone(topic.academicPaper!);
    const previousPaperVersion = paper.version;
    paper.version = "5".repeat(64);
    paper.manuscriptRevision = "v5-test";
    paper.manifestPath = paper.manifestPath.replace(previousPaperVersion, paper.version);
    for (const asset of Object.values(paper.assets)) asset.path = asset.path.replace(previousPaperVersion, paper.version);
    const reportVersion = "b".repeat(64);
    const next: Topic = { ...topic, academicPaper: paper,
      report: { ...topic.report!, version: reportVersion, revision: 5 },
      survey: { ...topic.survey!, reportVersion, paperVersion: paper.version,
        routes: topic.survey!.routes.map(route => {
          const section = surveySections.find(item => item.routeId === route.id);
          return section ? { ...route, title: "v5 " + route.title,
            paperAnchor: section.nextAnchor, paperSection: section.nextSection } : route;
        }),
      },
    };
    expect(validatedSurvey(next)).toBe(next.survey);
    for (const { hint, routeId, nextAnchor, nextSection } of surveySections) {
      expect(nextAnchor).not.toBe(SURVEY_SECTION_MAP[hint].defaultAnchor);
      expect(nextSection).not.toBe(SURVEY_SECTION_MAP[hint].defaultSection);
      expect(resolveSurveySectionLink(hint, next)).toEqual({
        anchor: nextAnchor, sectionNumber: nextSection,
        sectionTitle: "v5 " + topic.survey!.routes.find(route => route.id === routeId)!.title,
        appTo: { pathname: "/topics/aclgraph", search: "view=paper&section=" + nextAnchor },
        htmlHref: `${archiveBase}topic-papers/aclgraph/${paper.version}/paper.html#${nextAnchor}`,
      });
    }
  });

  it.each<{ name: string; candidate?: Topic; hasHtml: boolean }>([
    { name: "missing topic", hasHtml: false },
    { name: "missing survey", candidate: { ...topic, survey: undefined }, hasHtml: true },
    { name: "missing manuscript", candidate: { ...topic, academicPaper: undefined }, hasHtml: false },
    { name: "stale survey", candidate: { ...topic, survey: { ...topic.survey!, reportVersion: "0".repeat(64),
      routes: topic.survey!.routes.map(route => ({ ...route, paperAnchor: "stale-anchor", paperSection: "99", title: "Stale route" })),
    } }, hasHtml: true },
    { name: "invalid manuscript", candidate: { ...topic,
      academicPaper: { ...topic.academicPaper!, version: "../invalid" },
    }, hasHtml: false },
  ])("uses safe default sections for a $name", ({ candidate, hasHtml }) => {
    if (candidate) expect(validatedSurvey(candidate)).toBeUndefined();
    for (const { hint } of surveySections) {
      const defaults = SURVEY_SECTION_MAP[hint];
      const link = resolveSurveySectionLink(hint, candidate);
      expect(link).toMatchObject({
        anchor: defaults.defaultAnchor, sectionNumber: defaults.defaultSection, sectionTitle: defaults.defaultTitle,
        appTo: { pathname: "/topics/aclgraph", search: "view=paper&section=" + defaults.defaultAnchor },
      });
      if (hasHtml) expect(link.htmlHref).toBe(archiveBase + topic.academicPaper!.assets.html.path + "#" + defaults.defaultAnchor);
      else expect(link.htmlHref).toBeUndefined();
    }
  });

  it.each([
    ["2026-11-24T09:24:21.054Z", "2026-11-24"], ["2026-11-11", "2026-11-11"],
    [" 2026-11-24T23:30:00-08:00 ", "2026-11-24"],
    [undefined, "未记录"], [null, "未记录"], ["", "未记录"], ["  ", "未记录"],
    ["not-a-date", "未记录"], ["2026-13-24", "未记录"], ["11/24/2026", "未记录"],
  ])("formats ISO date %s as %s", (value, expected) => {
    expect(formatIsoDate(value)).toBe(expected);
  });

  it.each([
    ["6dd5554a521e6faeb3477353dd6258a54089733402109dec9c3555eb67ba1d66", "6dd5554"],
    ["  abcdef123456  ", "abcdef1"], ["abc", "abc"],
    [undefined, "未记录"], [null, "未记录"], ["", "未记录"], ["   ", "未记录"],
  ])("shortens SHA %s to %s", (value, expected) => {
    expect(shortSha(value)).toBe(expected);
  });

  it("names both repositories for readers", () => {
    expect(repoLabel("vllm-ascend")).toBe("vLLM-Ascend");
    expect(repoLabel("vllm")).toBe("vLLM 上游");
  });

  it.each([
    "", "not-a-version", "a".repeat(63), "a".repeat(65), "g".repeat(64), "A".repeat(64),
    "../" + "a".repeat(64), "a".repeat(64) + "/../", "%2e%2e%2f" + "a".repeat(64),
    "a".repeat(64) + "?format=pdf", "javascript:alert(1)",
  ])("rejects unsafe or invalid archive version %s for every artifact kind", version => {
    expect(legacyRevisionHrefs(version)).toEqual({ pdf: undefined, html: undefined, md: undefined, json: undefined });
  });
});

describe("ACLGraph dynamic report SSR and filter URL contract", () => {
  it("shows one observation window, the headline, TL;DR and four consistent KPI cards", () => {
    const html = render();
    const hero = html.match(/<header class="acl-radar-hero">[\s\S]*?<\/header>/)?.[0];
    expect(hero).toBeDefined();
    const edition = hero!.match(/<div class="acl-radar-edition">[\s\S]*?<\/div>/)![0].replace(/<[^>]+>/g, "");
    expect(edition).toContain("社区 PR 趋势雷达");
    expect(edition).toContain("观察窗口 2026-11-11 至 2026-11-24 · 本期核对 2026-11-24");
    expect(edition.match(/观察窗口/g)).toHaveLength(1);
    expect(edition.match(/本期核对/g)).toHaveLength(1);
    expect(hero).toContain(`<h2 id="acl-radar-headline">${escaped(report.headline)}</h2>`);
    expect(hero).toContain(`<p class="acl-radar-tldr">${escaped(report.tldr)}</p>`);
    const cards = [...hero!.matchAll(/<div class="acl-radar-kpi">[\s\S]*?<\/div>/g)].map(match => match[0]);
    expect(cards).toHaveLength(4);
    expect(cards.map(card => card.match(/<strong>(.*?)<\/strong>/)![1])).toEqual(["147", "41", "6 / 11", "4"]);
    for (const [i, card] of report.kpis.cards.entries()) {
      expect(cards[i]).toContain(`<dt>${escaped(card.label)}</dt>`);
      expect(cards[i]).toContain(escaped(card.detail));
    }
  });

  it("renders four hotspot segments and legend chips with the same percentages and filter targets", () => {
    const html = render();
    const segments = [...html.matchAll(/<button[^>]*class="acl-radar-segment"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
    const chips = [...html.matchAll(/<button[^>]*class="acl-radar-legend-chip"[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
    expect(segments).toHaveLength(4);
    expect(chips).toHaveLength(4);
    expect(segments.map(segment => Number(segment.match(/<span>([\d.]+)%<\/span>/)![1])))
      .toEqual([42.2, 25.2, 19, 13.6]);
    for (const [i, hotspot] of report.hotspots.entries()) {
      for (const control of [segments[i], chips[i]]) {
        expect(control).toContain('aria-pressed="false"');
        expect(control).toContain('aria-controls="acl-radar-featured"');
        expect(control).toContain(`data-hotspot="${hotspot.colorToken}"`);
        expect(control).toContain(hotspot.sharePct.toFixed(1) + "%");
      }
      expect(chips[i]).toContain(escaped(hotspot.shortLabel));
      expect(chips[i]).toContain(`${hotspot.count} 条`);
    }
  });

  it("renders all four insight titles and jump pills targeting existing featured cards", () => {
    const html = render();
    const insights = region(html, "acl-radar-insights");
    expect(insights).toContain("本期 PR 关注焦点");
    const cards = articles(insights, "acl-radar-insight");
    expect(cards).toHaveLength(4);
    for (const [i, insight] of report.insights.entries()) {
      expect(cards[i]).toContain(`<h4>${escaped(insight.title)}</h4>`);
      for (const slug of insight.featuredSlugs) {
        expect(cards[i]).toContain(`aria-controls="acl-pr-${slug}"`);
        expect(html).toContain(`id="acl-pr-${slug}"`);
      }
    }
  });

  it("renders all 14 detailed featured cards with evidence, survey links, GitHub sources and collapsed follow-up", () => {
    const featured = region(render(), "acl-radar-featured");
    expect(featured).toContain("重点 PR 深度解读");
    expect(featured).toContain("当前显示 <strong>14 / 14</strong>");
    const cards = articles(featured, "acl-pr-card");
    expect(cards).toHaveLength(14);
    for (const [i, pr] of report.featuredPrs.entries()) {
      const card = cards[i];
      expect(card).toContain(`id="acl-pr-${pr.slug}"`);
      expect(card).toContain(escaped(pr.zhTitle));
      for (const label of ["改了什么", "核心机制", "实测与边界", "与论文综述的联系"]) expect(card).toContain(`<dt>${label}</dt>`);
      for (const value of [pr.whatChanged, pr.mechanism, pr.evidenceAndBoundary, pr.surveyConnection.summary, pr.readingScope, pr.nextWatch]) {
        expect(card).toContain(escaped(value));
      }
      const link = resolveSurveySectionLink(pr.surveyConnection.targetSectionHint, topic);
      expect(card).toContain(`href="/topics/aclgraph?view=paper&amp;section=${link.anchor}"`);
      expect(card).toContain(`href="${link.htmlHref}"`);
      expect(card).toContain("paper.html#section-");
      expect(card).toContain(`href="${pr.url}"`);
      expect(card).toContain("GitHub PR ↗");
      expect(card).toContain('<details class="acl-pr-more"><summary>核查范围与下一步跟踪</summary>');
      expect(card.match(/<details[^>]*>/)![0]).not.toContain('open=""');
    }
  });

  it("renders exactly five upstream featured cards for repo=vllm", () => {
    const featured = region(render("/topics/aclgraph?view=report&repo=vllm"), "acl-radar-featured");
    expect(featured).toContain("当前显示 <strong>5 / 14</strong>");
    expect(featuredSlugs(featured)).toEqual([
      "metadata-address-guard", "encoder-graph-mixin", "pipeline-local-padding", "warmup-kv-release", "platform-graph-policy",
    ]);
    expect(featured).toContain('aria-pressed="true">vLLM 上游（5）</button>');
  });

  it("renders four metadata cards and an active status spotlight for hotspot=updatable-metadata", () => {
    const html = render("/topics/aclgraph?view=report&hotspot=updatable-metadata");
    const featured = region(html, "acl-radar-featured");
    expect(featured).toContain("当前显示 <strong>4 / 14</strong>");
    expect(featuredSlugs(featured)).toEqual([
      "mla-updatable-graph", "mla-dcp-updatable", "device-query-boundaries", "metadata-address-guard",
    ]);
    const spotlight = html.match(/<p class="acl-radar-spotlight"[^>]*>[\s\S]*?<\/p>/)?.[0];
    const hotspot = hotspotById("updatable-metadata")!;
    expect(spotlight).toContain('role="status"');
    expect(spotlight).toContain('data-hotspot="cyan"');
    expect(spotlight).toContain(escaped(hotspot.label));
    expect(spotlight).toContain(escaped(hotspot.oneLineSummary));
    expect(html).toMatch(/class="acl-radar-segment"[^>]*data-hotspot="cyan"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/class="acl-radar-legend-chip"[^>]*data-hotspot="cyan"[^>]*aria-pressed="true"/);
  });

  it("renders only open featured PRs #21762 and #52440 for status=OPEN", () => {
    const featured = region(render("/topics/aclgraph?view=report&status=OPEN"), "acl-radar-featured");
    expect(featured).toContain("当前显示 <strong>2 / 14</strong>");
    expect(featuredSlugs(featured)).toEqual(["ascend-encoder-guard", "metadata-address-guard"]);
    const cards = articles(featured, "acl-pr-card");
    expect(cards[0]).toContain('<span class="acl-pr-number">#21762</span>');
    expect(cards[1]).toContain('<span class="acl-pr-number">#52440</span>');
    for (const card of cards) expect(card).toContain('class="acl-pr-status acl-pr-status--open"');
    expect(featured).toContain('aria-pressed="true">开放中</button>');
  });

  it("intersects URL filters and offers a friendly reset when the combination has no featured PRs", () => {
    const html = render("/topics/aclgraph?view=report&repo=vllm&hotspot=padding-replay-correctness&status=OPEN");
    const featured = region(html, "acl-radar-featured");
    expect(featuredSlugs(featured)).toEqual([]);
    expect(featured).toContain("当前显示 <strong>0 / 14</strong>");
    expect(featured).toContain("这个组合暂时没有重点 PR");
    expect(featured).toContain("放宽一个筛选条件，就能继续阅读本期进展。");
    expect(featured).toContain("重置全部筛选</button>");
    expect(region(html, "acl-radar-all-prs", "details")).toContain("匹配 147 / 147 条 PR");
  });

  it("falls back to all featured PRs for unrecognized URL filter values", () => {
    const html = render("/topics/aclgraph?view=report&repo=unknown&hotspot=unknown&status=closed");
    expect(articles(region(html, "acl-radar-featured"), "acl-pr-card")).toHaveLength(14);
    expect(html).not.toContain('class="acl-radar-spotlight"');
    expect(region(html, "acl-radar-featured")).not.toContain("重置筛选</button>");
  });

  it("renders six active baseline diff cards and five quiet rows covering all 11 PRs and the Rev 3 supplement", () => {
    const baseline = region(render(), "acl-radar-baseline");
    expect(baseline).toContain("既有 11 条跟踪 PR 状态变动");
    expect(baseline).toContain(escaped(report.baselineR3SupplementNote));
    const activeCards = articles(baseline, "acl-baseline-card");
    const quietList = baseline.match(/<ul class="acl-baseline-list">[\s\S]*?<\/ul>/)![0];
    const quietRows = [...quietList.matchAll(/<li>[\s\S]*?<\/li>/g)].map(match => match[0]);
    expect(activeCards).toHaveLength(6);
    expect(quietRows).toHaveLength(5);
    for (const pr of report.baselineUpdates) {
      const rows = pr.changeStatus === "active-commits" ? activeCards : quietRows;
      const matches = rows.filter(row => row.includes(`href="${pr.url}"`));
      expect(matches, pr.workId).toHaveLength(1);
      const row = matches[0];
      expect(row).toContain(escaped(pr.zhTitle));
      expect(row).toContain(escaped(pr.statusNote));
      expect(row).toContain(`<code title="${pr.currentHeadSha}">${shortSha(pr.currentHeadSha)}</code>`);
      if (pr.changeStatus === "active-commits") {
        expect(row).toContain('class="acl-baseline-diff"');
        expect(row).toContain(`+${pr.commitsAfterNov11} 次新提交`);
        expect(row).toContain(escaped(pr.latestCommitMessage));
        expect(row).toContain(pr.baselineHeadSha ? shortSha(pr.baselineHeadSha) : "基线未录 SHA");
      }
    }
  });

  it("renders four watch cards with resolved GitHub links for every watched PR", () => {
    const watchlist = region(render(), "acl-radar-watchlist");
    expect(watchlist).toContain("下一轮重点关注");
    const cards = articles(watchlist, "acl-radar-watch-card");
    expect(cards).toHaveLength(4);
    for (const [i, item] of report.nextWatchlist.entries()) {
      expect(cards[i]).toContain(`<h4>${escaped(item.title)}</h4>`);
      expect(cards[i]).toContain(escaped(item.signalToWatch));
      expect(cards[i].match(/class="acl-radar-jump"/g)).toHaveLength(item.watchPrs.length);
      for (const workId of item.watchPrs) {
        const pr = findTrackedPrByWorkId(workId)!;
        expect(cards[i]).toContain(`href="${pr.url}"`);
        expect(cards[i]).toContain(`<strong>#${pr.number}</strong>`);
      }
    }
  });

  it("keeps the complete index drawer collapsed while server-rendering all 147 tracked rows", () => {
    const drawer = region(render(), "acl-radar-all-prs", "details");
    expect(drawer.match(/^<details[^>]*>/)![0]).not.toContain('open=""');
    expect(drawer).toContain("完整追踪 PR 索引");
    expect(drawer).toContain("匹配 147 / 147 条 PR");
    const body = drawer.match(/<tbody>[\s\S]*?<\/tbody>/)![0];
    const rows = [...body.matchAll(/<tr>[\s\S]*?<\/tr>/g)].map(match => match[0]);
    expect(rows).toHaveLength(147);
    for (const [i, pr] of report.allTrackedPrs.entries()) {
      expect(rows[i]).toContain(`href="${pr.url}"`);
      expect(rows[i]).toContain(`<strong>#${pr.number} ↗</strong>`);
      expect(rows[i]).toContain(escaped(pr.title));
    }
  });

  it("keeps the archive collapsed and exposes all three revisions, downloads and the legacy switch", () => {
    const drawer = region(render(), "acl-radar-archive", "details");
    expect(drawer.match(/^<details[^>]*>/)![0]).not.toContain('open=""');
    expect(drawer).toContain('href="/topics/aclgraph?view=report&amp;legacy=1"');
    const rows = [...drawer.matchAll(/<li>[\s\S]*?<\/li>/g)].map(match => match[0]);
    expect(rows).toHaveLength(3);
    for (const [i, revision] of report.legacyArchive.revisions.entries()) {
      expect(rows[i]).toContain(`Rev ${revision.revision}</span>`);
      expect(rows[i]).toContain(`<code title="${revision.version}">${revision.version.slice(0, 8)}</code>`);
      for (const kind of ["pdf", "html", "md", "json"] as const) {
        expect(rows[i]).toContain(`href="${archiveBase}${revision.paths[kind]}"`);
        if (kind !== "html") expect(rows[i]).toContain(`href="${archiveBase}${revision.paths[kind]}" download=""`);
      }
    }
  });

  it.each([
    "/topics/aclgraph?view=report&legacy=1",
    "/topics/aclgraph?view=report&part=survey-taxonomy",
    "/topics/aclgraph?view=report&read=full",
    "/topics/aclgraph?read=brief",
  ])("preserves the legacy report and return banner for %s", path => {
    const html = render(path);
    const banner = html.match(/<aside class="acl-legacy-banner"[^>]*>[\s\S]*?<\/aside>/)?.[0];
    expect(banner).toContain('href="/topics/aclgraph?view=report"');
    expect(banner).toContain("返回新版《社区 PR 趋势雷达》");
    expect(html).toContain(escaped(topic.report!.title));
    expect(html).toContain(escaped(topic.report!.abstract));
    expect(html).toContain('id="survey-analysis"');
    expect(html).toContain('id="survey-taxonomy"');
    expect(html).toContain("工程证据的持续积累");
    expect(html).not.toContain('class="acl-radar"');
  });

  it("renders the default dynamic report without iframes or javascript URLs", () => {
    const html = render("/topics/aclgraph?view=report");
    expect(html).toContain("社区 PR 趋势雷达");
    expect(html).toContain('class="acl-radar"');
    expect(html).not.toMatch(/<iframe\b/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toContain('class="acl-legacy-banner"');
  });
});

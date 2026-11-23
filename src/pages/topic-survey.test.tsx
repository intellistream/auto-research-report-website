import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import source from "../../topics/aclgraph/survey.json";
import TopicPages, { type Topic, type TopicIndex } from "./TopicPages";
import { readingSurvey, validatedSurvey, type TopicSurvey } from "./topic-survey";

const topic = actualIndex.topics.find((item) => item.id === "aclgraph") as unknown as Topic;
const survey = source as TopicSurvey;
const checkedTopic = { ...topic, survey };
function render(item: Topic, view: string) {
  const index: TopicIndex = { schemaVersion: 2, topics: [item] };
  return renderToStaticMarkup(<MemoryRouter initialEntries={[`/topics/aclgraph?view=${view}`]}>
    <Routes><Route path="/topics/:topicId" element={<TopicPages index={index} />} /></Routes>
  </MemoryRouter>);
}

describe("continuous survey presentation", () => {
  it("uses reviewed source data and exposes traceable evidence, limitations and questions", () => {
    expect(validatedSurvey(checkedTopic)).toEqual(survey);
    const html = render(checkedTopic, "paper");
    expect(html).not.toContain(survey.thesis);
    const map = html.slice(html.indexOf('<figure class="acl-taxonomy">'), html.indexOf("</figure>"));
    expect(survey.routes).toHaveLength(4);
    expect(survey.routes.flatMap((route) => route.subcategories!)).toHaveLength(13);
    expect(map).toContain('<table class="acl-taxonomy-table"');
    expect(map.match(/scope="rowgroup"/g)).toHaveLength(4);
    expect(map.match(/scope="row"/g)).toHaveLength(13);
    for (const route of survey.routes) {
      expect(map).toContain(`#${route.paperAnchor}"`);
      for (const subcategory of route.subcategories!) {
        expect(map).toContain(subcategory.title);
        for (const work of subcategory.works) {
          expect(map).toContain(work.label);
          expect(map).toContain(`#ref-${work.reference}"`);
        }
      }
    }
    const first = survey.routes[0];
    expect(html).toContain(first.assessment);
    expect(html).toContain(first.limitation);
    expect(html).toContain(`part=survey-gap-${first.gapIds[0]}`);
    expect(html).toContain(`part=survey-evidence-${first.evidenceIds[0]}`);
    expect(html).toContain(topic.report!.references.find((item) => item.id === first.sourceIds[0])!.url);
  });

  it("accepts matching new versions without a frontend hash edit", () => {
    const version = "b".repeat(64);
    const next = { ...checkedTopic, report: { ...topic.report!, version, revision: 4 }, survey: { ...survey, reportVersion: version } };
    expect(validatedSurvey(next)).toBe(next.survey);
    expect(render(next, "report")).toContain(survey.update.summary);
    expect(render(next, "paper")).toContain(survey.routes[0].assessment);
  });

  it("accepts a first revision with an explicit zero previous revision", () => {
    const first = { ...checkedTopic, report: { ...topic.report!, revision: 1 },
      survey: { ...survey, update: { ...survey.update, previousRevision: 0 } } };
    expect(validatedSurvey(first)).toBe(first.survey);
  });

  it("rejects a curated guide when its bound manuscript is absent", () => {
    const missing = { ...checkedTopic, academicPaper: undefined };
    expect(validatedSurvey(missing)).toBeUndefined();
    expect(readingSurvey(missing)!.routes[0].paperAnchor).toBeUndefined();
    expect(readingSurvey(missing)!.update.summary).toBe(topic.report!.changelog.at(-1)!.summary);
  });

  it("replaces stale judgments with the new report's own analysis", () => {
    const next = { ...checkedTopic, report: { ...topic.report!, version: "b".repeat(64),
      changelog: [{ date: "2026-11-18", summary: "新报告推翻旧的服务判断。" }],
      taxonomy: [{ problem: "新报告的问题", approach: "新路线", tradeoff: "新边界", sourceIds: ["E1"] }],
    } };
    expect(validatedSurvey(next)).toBeUndefined();
    const report = render(next, "report");
    expect(report).toContain("新报告推翻旧的服务判断。");
    expect(report).not.toContain(survey.update.summary);
    expect(report).toContain(topic.report!.evidenceDetails![0].result);
    expect(report).toContain(topic.report!.evidenceDetails![0].limitation);
    const paper = render(next, "paper");
    expect(paper).toContain("新报告的问题");
    expect(paper).toContain("新边界");
    expect(paper).not.toContain(encodeURIComponent(survey.routes[0].paperAnchor!));
  });

  it("does not follow old manuscript anchors after the manuscript changes", () => {
    const next = { ...checkedTopic, academicPaper: { ...topic.academicPaper!, version: "b".repeat(64) } };
    expect(validatedSurvey(next)).toBeUndefined();
    expect(readingSurvey(next)!.routes[0].paperAnchor).toBeUndefined();
  });

  it("rejects malformed routes, crossed references and unrelated evidence", () => {
    const badValues = [
      { ...survey, routes: undefined },
      { ...survey, routes: [{ ...survey.routes[0], sourceIds: ["missing"] }] },
      { ...survey, routes: [{ ...survey.routes[0], evidenceIds: ["missing"] }] },
      { ...survey, routes: [{ ...survey.routes[0], sourceIds: ["E5"], evidenceIds: ["e1-h2d-removal"] }] },
      { ...survey, pendingQuestions: [{ workId: "missing", routeIds: ["state"], question: "Q", missingEvidence: "E" }] },
    ];
    for (const bad of badValues) {
      const item = { ...checkedTopic, survey: bad as TopicSurvey };
      expect(validatedSurvey(item)).toBeUndefined();
      expect(readingSurvey(item)!.routes.length).toBe(topic.report!.taxonomy.length);
      expect(render(item, "paper")).toContain("技术路线与待验证问题");
    }
  });

  it("rejects malformed taxonomy rows and citation numbers before rendering", () => {
    const invalid: unknown[] = [null, [], [{ title: " ", works: [{ label: "Paper", reference: 1 }] }],
      { title: "Missing array", works: [] }, [{ title: "Missing works" }], [{ title: "No works", works: [] }]];
    for (const reference of [0, -1, 1.5, "1", true, null]) {
      invalid.push([{ title: "A category", works: [{ label: "Paper", reference }] }]);
    }
    for (const subcategories of invalid) {
      const bad = { ...survey, routes: survey.routes.map((route, index) => index ? route : { ...route, subcategories }) } as unknown as TopicSurvey;
      const item = { ...checkedTopic, survey: bad };
      expect(validatedSurvey(item)).toBeUndefined();
      expect(render(item, "paper")).toContain("技术路线与待验证问题");
    }
  });

  it("separates the dated topic reassessment, frozen report and pending leads", () => {
    const html = render(checkedTopic, "report");
    expect(html).toContain(survey.researchAssessment!.summary);
    expect(html).toContain("选题复评于");
    expect(html).toContain("冻结报告修订 3 与同版 PDF 保留原研究截止日期");
    expect(html).toContain("收录数量不代表判断发生变化");
    expect(html).toContain("新线索提出了哪些问题");
    expect(html).toContain(survey.pendingQuestions![0].question);
    expect(html).toContain(survey.pendingQuestions![0].missingEvidence);
    expect(html).toContain('id="survey-evidence-e1-h2d-removal"');
    expect(html).not.toContain('title="Research Gaps"');
  });
});

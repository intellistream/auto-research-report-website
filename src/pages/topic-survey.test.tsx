import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import actualIndex from "../../public/word-reports/topics.json";
import source from "../../topics/aclgraph/survey.json";
import type { Topic } from "./TopicPages";
import TopicResearchReport from "./TopicResearchReport";
import { readingSurvey, validatedSurvey, type TopicSurvey } from "./topic-survey";

const topic = actualIndex.topics.find((item) => item.id === "aclgraph") as unknown as Topic;
const survey = source as TopicSurvey;
const checkedTopic = { ...topic, survey };
function render(item: Topic) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/topics/aclgraph"]}>
    <TopicResearchReport topic={item} report={item.report!} embedded />
  </MemoryRouter>);
}

describe("continuous survey presentation", () => {
  it("preserves the frozen archive projection, version bindings and reference identities", () => {
    expect(source).toEqual(topic.survey);
    expect(validatedSurvey(checkedTopic)).toEqual(survey);
    expect(survey.paperVersion).toBe("62dba962fda5240ee8b37bdac3d8c877245daabcdab03265e7ef7ead46d0fd86");
    expect(survey.reportVersion).toBe("6dd5554a521e6faeb3477353dd6258a54089733402109dec9c3555eb67ba1d66");
    expect(source.scenarios).toHaveLength(4);
    const scenarioWorks = source.scenarios.flatMap((scenario) => scenario.works);
    expect(scenarioWorks).toHaveLength(24);
    expect(source.scenarios.map((scenario) => scenario.works.length)).toEqual([6, 7, 5, 6]);
    expect(source.scenarios.map((scenario) => scenario.paperSections)).toEqual([
      ["3.1", "3.4"], ["3.1", "3.2", "3.3"], ["3.3"], ["3.1", "3.2", "3.4"],
    ]);
    expect(survey.routes).toHaveLength(4);
    expect(survey.routes.map((route) => route.id)).toEqual(["capture", "replay-state", "scheduling", "lifecycle"]);
    const groups = survey.routes.flatMap((route) => route.subcategories!);
    expect(groups).toHaveLength(10);
    const mechanismWorks = groups.flatMap((group) => group.works);
    expect(mechanismWorks).toHaveLength(33);
    expect(survey.routes.map((route) => route.subcategories!.flatMap((group) => group.works).length)).toEqual([7, 5, 12, 9]);
    const works = [...scenarioWorks, ...mechanismWorks];
    expect(new Set(works.map((work) => work.reference)).size).toBe(57);
    expect(Object.fromEntries(works.map((work) => [work.label, work.reference]))).toEqual({
      Orca: 51, vLLM: 52, Llumnix: 53, SGLang: 54, Hydragen: 55, ChunkAttention: 56,
      FlexAttention: 57, FlashMask: 58, "Sarathi-Serve": 59, DistServe: 60,
      "POD-Attention": 61, "PLA-Serve (LAPS)": 11, Cortex: 62, CoRa: 63, ACRoBat: 64,
      SpecInfer: 65, Sequoia: 66, "EAGLE-2": 67, Punica: 68, "S-LoRA": 69, COMET: 70,
      "Triton-Distributed": 71, FlashOverlap: 31, "CloudMatrix384（昇腾超节点）": 30,
      "动态编译系统 Nimble（2021）": 8, DISC: 9, Relax: 10, GraCE: 4, "xLLM（昇腾实证）": 5,
      "Breakable CUDA Graphs": 6, "Hybrid JIT–CUDA Graph": 7, vAttention: 16, MoonBright: 17,
      FlashInfer: 14, PolyGraph: 15, "Event Tensor (ETC)": 18,
      "GPU 调度系统 Nimble（2020）": 20, IOS: 21, Taskflow: 23, "DNN 图优化系统 AutoGraph": 72,
      Opara: 22, SET: 24, Rammer: 25, MUSTARD: 26, FlashMoE: 27, MPK: 19,
      NanoFlow: 28, "MegaScale-Infer": 29, "Breaking the Ice": 32, ServerlessLLM: 33,
      "DEEPSERVE（昇腾）": 34, BlitzScale: 35, CRIUgpu: 38, "PhoenixOS / PhOS": 39,
      "服务物化系统 Medusa": 36, Foundry: 37, GCR: 40,
    });

    expect(survey.routes.map((route) => route.paperAnchor)).toEqual(["section-4-3", "section-4-4", "section-4-5", "section-4-6"]);
    for (const legacy of ["双平面", "平面 I", "平面 II", "Tree 1", "Tree 2", "T1-L", "T2-L", "T1-B", "T2-B", "早期剪枝", "相邻剪枝"]) expect(JSON.stringify(source)).not.toContain(legacy);
    const html = render(checkedTopic);
    for (const route of survey.routes) {
      const reading = readingSurvey(checkedTopic)!.routes.find(item => item.id === route.id)!;
      expect(reading.assessment).toBe(route.assessment);
      expect(reading.limitation).toBe(route.limitation);
      for (const id of route.gapIds) expect(html).toContain(`part=survey-gap-${id}`);
      for (const id of route.evidenceIds) expect(html).toContain(`part=survey-evidence-${id}`);
      expect(html).toContain(topic.report!.references.find((item) => item.id === route.sourceIds[0])!.url);
    }
  });

  it("keeps shared survey validation independent of optional archived scenario-map data", () => {
    const withFirst = (changes: Record<string, unknown>) => source.scenarios.map((item, index) => index ? item : { ...item, ...changes });
    const invalid: unknown[] = [undefined, null, {}, [], [null, ...source.scenarios.slice(1)],
      withFirst({ title: " " }), withFirst({ workload: undefined }), withFirst({ dynamicity: undefined }),
      withFirst({ impact: null }), withFirst({ requirement: null }), withFirst({ boundary: " " }),
      withFirst({ paperSections: ["javascript:alert(1)"] }), withFirst({ paperSections: [] }),
      withFirst({ paperSections: ["3.1#ref-1"] }), withFirst({ paperSections: ["4.3"] }),
      withFirst({ paperSections: ["3.1", "3.1"] }), withFirst({ paperSections: null }),
      withFirst({ works: undefined }), withFirst({ works: [] }),
      withFirst({ id: source.scenarios[1].id }),
    ];
    for (const reference of [0, -1, 1.5, 75, "51", true, null, undefined, NaN, Infinity, source.scenarios[0].works[1].reference]) {
      invalid.push(withFirst({ works: source.scenarios[0].works.map((work, index) => index ? work : { ...work, reference }) }));
    }
    for (const work of [null, {}, { label: " ", reference: 51 }, { label: "Orca", reference: 51, context: " " },
      { ...source.scenarios[0].works[0], role: "unknown" }, { ...source.scenarios[0].works[0], role: undefined },
      ...[undefined, null, {}, { status: "unknown", detail: "A claim" }, { status: "明确使用", detail: " " }]
        .map((graphEvidence) => ({ ...source.scenarios[0].works[0], graphEvidence }))]) {
      invalid.push(withFirst({ works: [work, ...source.scenarios[0].works.slice(1)] }));
    }

    for (const scenarios of invalid) {
      const item = { ...checkedTopic, survey: { ...survey, scenarios } as TopicSurvey };
      expect(validatedSurvey(item)).toBe(item.survey);
      expect(readingSurvey(item)!.routes).toEqual(survey.routes);
    }
  });

  it("accepts optional mechanism subcategories and platform examples without changing shared evidence", () => {
    const fallback = { ...survey, routes: survey.routes.map((route, index) => index ? route : { ...route, subcategories: undefined }) };
    const item = { ...checkedTopic, survey: fallback };
    expect(validatedSurvey(item)).toBe(fallback);
    expect(readingSurvey(item)!.routes[0].assessment).toBe(survey.routes[0].assessment);
    const withoutExamples = { ...item, survey: { ...fallback, routes: fallback.routes.map((route) => ({ ...route, examples: undefined })) } };
    expect(validatedSurvey(withoutExamples)).toBe(withoutExamples.survey);
    expect(readingSurvey(withoutExamples)!.routes[0].sourceIds).toEqual(survey.routes[0].sourceIds);
  });

  it("accepts matching new versions without a frontend hash edit", () => {
    const version = "b".repeat(64);
    const next = { ...checkedTopic, report: { ...topic.report!, version, revision: 4 }, survey: { ...survey, reportVersion: version } };
    expect(validatedSurvey(next)).toBe(next.survey);
    expect(render(next)).toContain(survey.update.summary);
    expect(readingSurvey(next)!.routes[0].assessment).toBe(survey.routes[0].assessment);
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
    const report = render(next);
    expect(report).toContain("新报告推翻旧的服务判断。");
    expect(report).not.toContain(survey.update.summary);
    expect(report).toContain(topic.report!.evidenceDetails![0].result);
    expect(report).toContain(topic.report!.evidenceDetails![0].limitation);
    const paper = render(next);
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
      expect(render(item)).toContain("技术路线与关键权衡");
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
      expect(render(item)).toContain("技术路线与关键权衡");
    }
  });

  it("separates the dated topic reassessment, frozen report and pending leads", () => {
    const html = render(checkedTopic);
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

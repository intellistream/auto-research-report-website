import type { Topic } from "./TopicPages";
import { safeTopicSource } from "./topic-report";

export type SurveyRoute = {
  id: string; title: string; problem: string; mechanism: string[];
  assessment: string; limitation: string; sourceIds: string[]; evidenceIds: string[]; gapIds: string[];
  paperSection?: string; paperAnchor?: string;
};
export type SurveyUpdateEvidence = {
  title: string; change: string; sourceIds: string[]; evidenceIds: string[];
  limitation?: string;
};
export type TopicSurvey = {
  schemaVersion: 1; reportVersion: string; paperVersion?: string; reviewedAt: string; thesis: string;
  routes: SurveyRoute[];
  update: { summary: string; previousRevision?: number; evidence: SurveyUpdateEvidence[]; nextGapIds: string[] };
  researchAssessment?: { asOf: string; scope: string; summary: string; decisions: {
    gapId: string; decision: string; reason: string; reopenWhen: string; sourceUrls: string[];
  }[] };
  pendingQuestions?: { workId: string; routeIds: string[]; question: string; missingEvidence: string }[];
};

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Reject stale editorial judgments and broken citations before displaying them. */
export function validatedSurvey(topic: Topic): TopicSurvey | undefined {
  const report = topic.report;
  const survey = topic.survey;
  if (!report || !survey || survey.schemaVersion !== 1 || !hash(survey.reportVersion)
    || survey.reportVersion !== report.version
    || (topic.academicPaper ? !hash(survey.paperVersion) || survey.paperVersion !== topic.academicPaper.version : survey.paperVersion !== undefined)
    || !text(survey.thesis) || !text(survey.reviewedAt) || !Array.isArray(survey.routes) || !survey.routes.length
    || !survey.update || !text(survey.update.summary) || !Array.isArray(survey.update.evidence)
    || !strings(survey.update.nextGapIds)) return;
  const sources = new Set(report.references.map((item) => item.id));
  const evidence = new Map((report.evidenceDetails ?? []).map((item) => [item.id, item]));
  const gaps = new Map(report.gaps.map((item) => [item.id, item]));
  const linksValid = (item: { sourceIds: string[]; evidenceIds: string[]; gapIds?: string[] }) =>
    strings(item.sourceIds) && item.sourceIds.length > 0 && item.sourceIds.every((id) => sources.has(id))
    && strings(item.evidenceIds) && item.evidenceIds.every((id) => evidence.has(id)
      && evidence.get(id)!.sourceIds.every((source) => item.sourceIds.includes(source)))
    && (!item.gapIds || strings(item.gapIds) && item.gapIds.every((id) => gaps.has(id)
      && gaps.get(id)!.sourceIds.every((source) => item.sourceIds.includes(source))));
  const routeIds = new Set<string>();
  for (const route of survey.routes) {
    if (!route || !text(route.id) || !/^[a-z0-9][a-z0-9-]*$/.test(route.id) || routeIds.has(route.id)
      || ![route.title, route.problem, route.assessment, route.limitation].every(text)
      || !strings(route.mechanism) || !route.mechanism.length || !strings(route.gapIds) || !linksValid(route)) return;
    routeIds.add(route.id);
  }
  if (!survey.update.evidence.every((item) => item && text(item.title) && text(item.change) && linksValid(item))
    || !survey.update.nextGapIds.every((id) => gaps.has(id))
    || (survey.update.previousRevision !== undefined && (!Number.isInteger(survey.update.previousRevision)
      || survey.update.previousRevision < 0 || survey.update.previousRevision >= report.revision))) return;
  if (survey.researchAssessment) {
    const review = survey.researchAssessment;
    if (![review.asOf, review.scope, review.summary].every(text) || !Array.isArray(review.decisions)
      || !review.decisions.every((item) => item && gaps.has(item.gapId)
        && ["missing_evidence", "evaluation_requirement"].includes(item.decision)
        && [item.reason, item.reopenWhen].every(text) && strings(item.sourceUrls) && item.sourceUrls.length > 0
        && item.sourceUrls.every((url) => !!safeTopicSource(url)))) return;
  }
  if (survey.pendingQuestions) {
    const pending = new Set((report.pendingEvidence ?? []).map((item) => item.workId));
    if (!Array.isArray(survey.pendingQuestions) || !survey.pendingQuestions.every((item) => item && pending.has(item.workId)
      && [item.question, item.missingEvidence].every(text) && strings(item.routeIds) && item.routeIds.every((id) => routeIds.has(id)))) return;
  }
  return survey;
}

/** A new report remains readable even before its concise editorial guide is reviewed. */
export function readingSurvey(topic: Topic): TopicSurvey | undefined {
  const checked = validatedSurvey(topic);
  if (checked) return checked;
  const report = topic.report;
  if (!report) return;
  const evidence = report.evidenceDetails ?? [];
  const affected = new Set([...(report.sourceDelta?.added ?? []), ...(report.sourceDelta?.changed ?? [])]);
  const changedEvidence = affected.size ? evidence.filter((item) => item.sourceIds.some((id) => affected.has(id))) : evidence;
  return {
    schemaVersion: 1, reportVersion: report.version, reviewedAt: report.asOf, thesis: report.researchQuestions[0] ?? report.abstract,
    routes: report.taxonomy.map((row, index) => {
      const matching = evidence.filter((item) => item.sourceIds.some((id) => row.sourceIds.includes(id)));
      return {
        id: `route-${index}`, title: row.problem, problem: row.problem, mechanism: [row.approach],
        assessment: matching[0]?.result ?? "当前依据用于解释机制；服务收益需结合对应负载验证。",
        limitation: [row.tradeoff, matching[0]?.limitation].filter(Boolean).join(" "), sourceIds: row.sourceIds,
        evidenceIds: matching.map((item) => item.id),
        gapIds: report.gaps.filter((item) => item.status !== "resolved" && item.sourceIds.some((id) => row.sourceIds.includes(id))).map((item) => item.id),
      };
    }),
    update: {
      summary: report.changelog[report.changelog.length - 1]?.summary ?? report.abstract,
      evidence: changedEvidence.slice(0, 4).map((item) => ({ title: item.comparison, change: item.result,
        limitation: item.limitation, sourceIds: item.sourceIds, evidenceIds: [item.id] })),
      nextGapIds: report.gaps.filter((item) => item.status !== "resolved").slice(0, 3).map((item) => item.id),
    },
  };
}

export function surveyReportLink(topicId: string, part: string) {
  return { pathname: `/topics/${topicId}`, search: new URLSearchParams({ view: "report", part }).toString() };
}

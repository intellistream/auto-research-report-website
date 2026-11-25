import rawReport from "./aclgraph-dynamic-report.json";
import type { Topic } from "./TopicPages";
import { academicPaperHrefs } from "./academic-paper";
import { validatedSurvey } from "./topic-survey";
import { topicVersionArtifactHref } from "./topic-report";

export type HotspotId = "graph-boundary-expansion" | "padding-replay-correctness" | "lifecycle-kernel-ops" | "updatable-metadata";
export type HotspotColorToken = "indigo" | "amber" | "emerald" | "cyan";
export type SurveySectionHint = "capture-granularity" | "dynamic-metadata" | "padding-and-correctness" | "lifecycle-and-compilation";
export type RepoFilter = "all" | "vllm-ascend" | "vllm";
export type StatusFilter = "all" | "MERGED" | "OPEN";
export type TrackedStatusFilter = "all" | "merged-in-window" | "MERGED" | "OPEN";
export type HotspotFilter = "all" | HotspotId;
export type Repository = Exclude<RepoFilter, "all">;
export type PrState = Exclude<StatusFilter, "all">;

export interface DailyReference {
  day: string;
  version: string;
  number: string;
  title: string;
  sectionKey: string;
}

export interface HotspotBucket {
  id: HotspotId;
  label: string;
  shortLabel: string;
  colorToken: HotspotColorToken;
  oneLineSummary: string;
  count: number;
  sharePct: number;
  ascendCount: number;
  vllmCount: number;
  mergedInWindow: number;
}

export interface TrendInsight {
  id: string;
  title: string;
  tag: string;
  hotspotId: HotspotId;
  summary: string;
  ascendSignal: string;
  upstreamBenchmark: string;
  featuredSlugs: string[];
  takeaway: string;
}

export interface PrSnapshot {
  workId: string;
  repo: "vllm-project/vllm-ascend" | "vllm-project/vllm";
  repository: Repository;
  number: number;
  title: string;
  state: PrState;
  draft: boolean;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
  headSha: string;
  changedFilesCount: number;
  dailyReferences: DailyReference[];
  hotspotId: HotspotId;
}

export interface FeaturedPr extends PrSnapshot {
  slug: string;
  zhTitle: string;
  changeTag: string;
  whatChanged: string;
  mechanism: string;
  evidenceAndBoundary: string;
  surveyConnection: {
    summary: string;
    taxonomyBranch: string;
    targetSectionHint: SurveySectionHint;
  };
  nextWatch: string;
  readingScope: string;
}

export interface TrackedPr extends PrSnapshot {
  merged: boolean;
  mergedInWindow: boolean;
  isBaseline: boolean;
  labels: string[];
  isFeatured: boolean;
  featuredSlug: string | null;
}

export interface BaselineUpdate {
  workId: string;
  number: number;
  repo: "vllm-project/vllm-ascend";
  url: string;
  title: string;
  zhTitle: string;
  baselineDay: string;
  baselineLabel: string;
  baselineStage: string;
  baselineEvidenceId: string;
  baselineState: string;
  baselineHeadSha: string | null;
  currentState: PrState;
  currentDraft: boolean;
  currentHeadSha: string;
  mergedAt: string | null;
  updatedAt: string;
  commitsAfterNov11: number;
  commitsAfterNov14: number;
  latestCommitDate: string;
  latestCommitMessage: string;
  changeStatus: "active-commits" | "open-unchanged" | "merged-pre-baseline";
  statusNote: string;
}

export interface NextWatchItem {
  id: string;
  title: string;
  hotspotId: HotspotId;
  whyItMatters: string;
  watchPrs: string[];
  signalToWatch: string;
}

export interface LegacyRevision {
  revision: number;
  version: string;
  asOf: string;
  label: string;
  summary: string;
  paths: Record<"json" | "html" | "md" | "pdf" | "manifest", string>;
}

export interface AclGraphDynamicReportData {
  schemaVersion: 1;
  topicId: "aclgraph";
  edition: string;
  periodStart: string;
  periodEnd: string;
  baselineDate: string;
  checkedAt: string;
  headline: string;
  tldr: string;
  scopeSummary: string;
  kpis: {
    trackedPrCount: number;
    queriedPrCount: number;
    newlyMergedCount: number;
    openPrCount: number;
    mergedTotalCount: number;
    baselineTotalCount: number;
    baselineChangedCount: number;
    baselinePostNov14CommitCount: number;
    hotspotCount: number;
    ascendCount: number;
    ascendMergedInWindow: number;
    vllmCount: number;
    vllmMergedInWindow: number;
    featuredCount: number;
    cards: { id: string; label: string; value: string; detail: string }[];
  };
  hotspots: HotspotBucket[];
  insights: TrendInsight[];
  featuredPrs: FeaturedPr[];
  baselineUpdates: BaselineUpdate[];
  baselineR3SupplementNote: string;
  nextWatchlist: NextWatchItem[];
  allTrackedPrs: TrackedPr[];
  legacyArchive: { description: string; revisions: LegacyRevision[] };
}

// JSON imports widen string literals; this assertion preserves the editorial schema's unions.
export const aclGraphDynamicReport: AclGraphDynamicReportData = rawReport as AclGraphDynamicReportData;

export const SURVEY_SECTION_MAP = {
  "capture-granularity": { routeId: "capture", defaultAnchor: "section-4-3", defaultSection: "4.3", defaultTitle: "图捕获、合法性改造与图粒度控制" },
  "dynamic-metadata": { routeId: "replay-state", defaultAnchor: "section-4-4", defaultSection: "4.4", defaultTitle: "动态参数更新、显存与地址稳定性管理" },
  "padding-and-correctness": { routeId: "replay-state", defaultAnchor: "section-4-4", defaultSection: "4.4", defaultTitle: "动态参数更新、显存与地址稳定性管理" },
  "lifecycle-and-compilation": { routeId: "lifecycle", defaultAnchor: "section-4-6", defaultSection: "4.6", defaultTitle: "图生命周期管理、缓存与跨进程恢复" },
} as const satisfies Record<SurveySectionHint, { routeId: string; defaultAnchor: string; defaultSection: string; defaultTitle: string }>;

export interface SurveySectionLink {
  anchor: string;
  sectionNumber: string;
  sectionTitle: string;
  appTo: { pathname: string; search: string };
  htmlHref?: string;
}

export function resolveSurveySectionLink(hint: SurveySectionHint, topic?: Topic): SurveySectionLink {
  const mapped = SURVEY_SECTION_MAP[hint];
  const route = topic ? validatedSurvey(topic)?.routes.find(item => item.id === mapped.routeId) : undefined;
  const anchor = route?.paperAnchor || mapped.defaultAnchor;
  const paperHrefs = topic?.academicPaper ? academicPaperHrefs("aclgraph", topic.academicPaper) : undefined;
  return {
    anchor,
    sectionNumber: route?.paperSection || mapped.defaultSection,
    sectionTitle: route?.title || mapped.defaultTitle,
    appTo: { pathname: "/topics/aclgraph", search: "view=paper&section=" + anchor },
    ...(paperHrefs ? { htmlHref: `${paperHrefs.html}#${encodeURIComponent(anchor)}` } : {}),
  };
}

export interface FeaturedPrFilters {
  repo: RepoFilter;
  hotspot: HotspotFilter;
  status: StatusFilter;
}

export interface TrackedPrFilters {
  query: string;
  repo: RepoFilter;
  hotspot: HotspotFilter;
  status: TrackedStatusFilter;
}

export function filterFeaturedPrs(prs: readonly FeaturedPr[], { repo, hotspot, status }: FeaturedPrFilters): FeaturedPr[] {
  return prs.filter(pr => (repo === "all" || pr.repository === repo)
    && (hotspot === "all" || pr.hotspotId === hotspot)
    && (status === "all" || pr.state === status));
}

export function filterTrackedPrs(prs: readonly TrackedPr[], { query, repo, hotspot, status }: TrackedPrFilters): TrackedPr[] {
  const needle = query.trim().toLowerCase();
  return prs.filter(pr => (repo === "all" || pr.repository === repo)
    && (hotspot === "all" || pr.hotspotId === hotspot)
    && (status === "all" || (status === "merged-in-window" ? pr.mergedInWindow : pr.state === status))
    && (!needle || [`#${pr.number}`, pr.title, pr.repo, pr.repository, pr.workId, ...pr.labels]
      .some(value => value.toLowerCase().includes(needle))));
}

export function formatIsoDate(iso?: string | null): string {
  const value = iso?.trim();
  return value && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && !Number.isNaN(Date.parse(value))
    ? value.slice(0, 10) : "未记录";
}

export function shortSha(sha?: string | null): string {
  return sha?.trim().slice(0, 7) || "未记录";
}

export function repoLabel(repo: Repository): string {
  return repo === "vllm-ascend" ? "vLLM-Ascend" : "vLLM 上游";
}

export function legacyRevisionHrefs(version: string) {
  return {
    pdf: topicVersionArtifactHref("aclgraph", version, "pdf"),
    html: topicVersionArtifactHref("aclgraph", version, "html"),
    md: topicVersionArtifactHref("aclgraph", version, "md"),
    json: topicVersionArtifactHref("aclgraph", version, "json"),
  };
}

const trackedByWorkId = new Map(aclGraphDynamicReport.allTrackedPrs.map(pr => [pr.workId, pr]));
const hotspotsById = new Map(aclGraphDynamicReport.hotspots.map(hotspot => [hotspot.id, hotspot]));

export function findTrackedPrByWorkId(workId: string): TrackedPr | undefined {
  return trackedByWorkId.get(workId);
}

export function hotspotById(id: HotspotId): HotspotBucket | undefined {
  return hotspotsById.get(id);
}

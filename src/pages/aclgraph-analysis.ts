import problems12 from "./aclgraph-data/problems-1-2.json";
import problems34 from "./aclgraph-data/problems-3-4.json";
import problems56 from "./aclgraph-data/problems-5-6.json";

export type AclGraphBadgeTone = "green" | "blue" | "orange" | "indigo" | "gold" | "teal" | "gray";
export type AclGraphBadgeSpec = { label: string; tone: AclGraphBadgeTone };
export type AclGraphVenueTier = "ccf_a" | "top_venue" | "peer_reviewed" | "preprint" | "unknown";
export type AclGraphPublicationStatus = "accepted" | "preprint";
export type AclGraphReadDepth = "fulltext" | "abstract_only";
export type AclGraphVllmStatus = "merged_core" | "merged_recent" | "open_pr" | "rfc_or_draft" | "paper_prototype" | "not_verified_in_vllm";
export type AclGraphAscendApplicability = "ascend_native" | "ascend_pr_available" | "portable_framework" | "cuda_specific_needs_port" | "unverified";
export type AclGraphPrState = "open" | "merged" | "closed";
export type AclGraphEvidenceRef = { refId: string; section: string; quoteExcerpt: string; metrics: string[]; sourceUrl?: string };
export type AclGraphPaperDesignPoint = { title: string; challengeAddressed: string; mechanism: string };
export type AclGraphPaperProblem = { scenario: string; existingGap: string; impact: string };
export type AclGraphPaperMethod = { keyIdea: string; designPoints: AclGraphPaperDesignPoint[] };
export type AclGraphPaperEffectsAndLimits = {
  performanceSummary: string;
  experimentalConditions: string;
  limitations: string;
  engineeringApplicability: string;
};
export type AclGraphPaperCard = {
  id: string;
  kind: "paper";
  paperId: string;
  arxivId?: string;
  title: string;
  url?: string;
  authors: string[];
  venueOrYear: string;
  venueName: string;
  venueTier: AclGraphVenueTier;
  publicationStatus: AclGraphPublicationStatus;
  citationCount?: number;
  readDepth: AclGraphReadDepth;
  summaryLine: string;
  problem: AclGraphPaperProblem;
  method: AclGraphPaperMethod;
  effectsAndLimits: AclGraphPaperEffectsAndLimits;
  evidenceRefs: AclGraphEvidenceRef[];
};
export type AclGraphPrEffectsAndLimits = { resultSummary: string; experimentalConditions: string; limitations: string };
export type AclGraphPrCard = {
  id: string;
  kind: "pr";
  prId: string;
  repository: string;
  number: number;
  title: string;
  displayTitle: string;
  url: string;
  state: AclGraphPrState;
  mergedAt?: string;
  vllmStatus: AclGraphVllmStatus;
  ascendApplicability: AclGraphAscendApplicability;
  ascendEvidence: string;
  hardwareDependency: string;
  summaryLine: string;
  problem: string;
  optimization: string;
  effectsAndLimits: AclGraphPrEffectsAndLimits;
  evidenceRefs: AclGraphEvidenceRef[];
};
export type AclGraphCard = AclGraphPaperCard | AclGraphPrCard;
export type AclGraphProblemGap = { background: string; existingLimitations: string; researchOpportunity: string; keyTakeaway?: string };
export type AclGraphProblem = {
  id: string;
  index: number;
  slug: string;
  title: string;
  shortTitle: string;
  priorityBadge: string;
  gap: AclGraphProblemGap;
  papers: AclGraphPaperCard[];
  prs: AclGraphPrCard[];
};

export const VLLM_STATUS_BADGES: Readonly<Record<AclGraphVllmStatus, AclGraphBadgeSpec>> = {
  merged_core: { label: "主干已合入", tone: "green" },
  merged_recent: { label: "近期已合入", tone: "green" },
  open_pr: { label: "开放 PR", tone: "blue" },
  rfc_or_draft: { label: "RFC / 草案", tone: "gray" },
  paper_prototype: { label: "论文原型", tone: "indigo" },
  not_verified_in_vllm: { label: "vLLM 未核验", tone: "gray" },
};
export const ASCEND_APPLICABILITY_BADGES: Readonly<Record<AclGraphAscendApplicability, AclGraphBadgeSpec>> = {
  ascend_native: { label: "原生支持", tone: "green" },
  ascend_pr_available: { label: "已有昇腾 PR", tone: "green" },
  portable_framework: { label: "框架通用·可迁移", tone: "blue" },
  cuda_specific_needs_port: { label: "CUDA 绑定·需移植", tone: "orange" },
  unverified: { label: "待验证", tone: "gray" },
};
export const READ_DEPTH_BADGES: Readonly<Record<AclGraphReadDepth, AclGraphBadgeSpec>> = {
  fulltext: { label: "全文精读", tone: "green" },
  abstract_only: { label: "基于摘要", tone: "gray" },
};
export const VENUE_TIER_LABELS: Readonly<Record<AclGraphVenueTier, string | null>> = {
  ccf_a: "CCF-A 顶会",
  top_venue: "顶会录用",
  peer_reviewed: "正式录用",
  preprint: "arXiv 预印本",
  unknown: null,
};

export function getVenueBadge(venueTier: AclGraphVenueTier, venueName: string): AclGraphBadgeSpec | null {
  const venue = venueName.trim();
  switch (venueTier) {
    case "ccf_a": return { label: venue ? `CCF-A · ${venue}` : "CCF-A 顶会", tone: "gold" };
    case "top_venue": return { label: venue ? `顶会录用 · ${venue}` : "顶会录用", tone: "indigo" };
    case "peer_reviewed": return { label: venue ? `正式录用 · ${venue}` : "正式录用", tone: "teal" };
    case "preprint": return { label: "arXiv 预印本", tone: "gray" };
    case "unknown": return null;
  }
}

// Match reports.py's Beijing calendar day, without depending on the browser timezone.
// A date-only value keeps its day; timezone-less ISO timestamps are treated as Beijing time.
function beijingDay(value: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) return undefined;
  const day = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== match[1]) return undefined;
  if (!match[2]) return match[1];
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return undefined;
  const timestamp = Date.parse(match[5] ? value : `${value}+08:00`);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function formatPrStateBadge(state: AclGraphPrState, mergedAt?: string): AclGraphBadgeSpec {
  if (state === "open") return { label: "开放", tone: "blue" };
  if (state === "closed") return { label: "已关闭", tone: "gray" };
  const day = mergedAt ? beijingDay(mergedAt) : undefined;
  return { label: day ? `已合入 ${day}` : "已合入", tone: "green" };
}

export function formatRepositoryLabel(repository: string): string {
  if (repository === "vllm-project/vllm-ascend") return "vLLM-Ascend";
  if (repository === "vllm-project/vllm") return "vLLM 上游";
  return repository;
}

export function safeAnalysisUrl(url?: string): string | undefined {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url) || /[\u0000-\u0020\u007f\\]/.test(url)) return undefined;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch { return undefined; }
}

/** Validate untrusted JSON. Empty chunks are legal during Phase 1; final 6×(4+4) counts belong in acceptance tests. */
export function validateAclGraphProblems(problems: unknown): string[] {
  const errors: string[] = [];
  const problemIds = new Set<string>();
  const slugs = new Set<string>();
  const indices = new Set<string>();
  const cardIds = new Set<string>();
  const paperIds = new Set<string>();
  const arxivIds = new Set<string>();
  const prIds = new Set<string>();
  const prIdentities = new Set<string>();
  const fail = (path: string, message: string) => { errors.push(`${path}: ${message}`); };
  function object(value: unknown, path: string): Record<string, unknown> {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    fail(path, "expected an object");
    return {};
  }
  function string(value: unknown, path: string): value is string {
    if (typeof value === "string" && value.trim()) return true;
    fail(path, "expected a non-empty string");
    return false;
  }
  function strings(row: Record<string, unknown>, fields: string[], path: string) {
    for (const field of fields) string(row[field], `${path}.${field}`);
  }
  function array(value: unknown, path: string, nonEmpty = false): unknown[] {
    if (!Array.isArray(value)) { fail(path, "expected an array"); return []; }
    if (nonEmpty && !value.length) fail(path, "expected at least one item");
    return value;
  }
  function unique(value: unknown, seen: Set<string>, path: string) {
    if (!string(value, path)) return;
    const key = value.trim();
    if (seen.has(key)) fail(path, `duplicate identity ${key}`);
    seen.add(key);
  }
  function oneOf(value: unknown, choices: readonly string[], path: string) {
    if (typeof value !== "string" || !choices.includes(value)) fail(path, `expected one of ${choices.join(", ")}`);
  }
  function url(value: unknown, path: string, optional = false) {
    if (value === undefined && optional) return;
    if (typeof value !== "string" || !safeAnalysisUrl(value)) fail(path, "expected an HTTP(S) URL without credentials");
  }
  function evidence(value: unknown, path: string) {
    const refs = new Set<string>();
    array(value, path, true).forEach((item, i) => {
      const at = `${path}[${i}]`;
      const ref = object(item, at);
      unique(ref.refId, refs, `${at}.refId`);
      strings(ref, ["section", "quoteExcerpt"], at);
      array(ref.metrics, `${at}.metrics`).forEach((metric, j) => string(metric, `${at}.metrics[${j}]`));
      url(ref.sourceUrl, `${at}.sourceUrl`, true);
    });
  }
  function card(value: unknown, kind: "paper" | "pr", path: string) {
    const row = object(value, path);
    unique(row.id, cardIds, `${path}.id`);
    oneOf(row.kind, [kind], `${path}.kind`);
    strings(row, ["title", "summaryLine"], path);
    evidence(row.evidenceRefs, `${path}.evidenceRefs`);
    const effects = object(row.effectsAndLimits, `${path}.effectsAndLimits`);
    strings(effects, ["experimentalConditions", "limitations"], `${path}.effectsAndLimits`);
    if (kind === "paper") {
      unique(row.paperId, paperIds, `${path}.paperId`);
      if (row.arxivId !== undefined && string(row.arxivId, `${path}.arxivId`)) {
        if (!/^(?:\d{2}(?:0[1-9]|1[0-2])\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/.test(row.arxivId)) fail(`${path}.arxivId`, "invalid arXiv ID");
        unique(row.arxivId.replace(/v\d+$/, ""), arxivIds, `${path}.arxivId`);
      }
      url(row.url, `${path}.url`, true);
      strings(row, ["venueOrYear"], path);
      // An empty venueName is intentional for unknown venues and unnamed preprints.
      if (typeof row.venueName !== "string") fail(`${path}.venueName`, "expected a string");
      oneOf(row.venueTier, Object.keys(VENUE_TIER_LABELS), `${path}.venueTier`);
      oneOf(row.publicationStatus, ["accepted", "preprint"], `${path}.publicationStatus`);
      oneOf(row.readDepth, Object.keys(READ_DEPTH_BADGES), `${path}.readDepth`);
      if (row.venueTier === "preprint" && row.publicationStatus !== "preprint") fail(`${path}.publicationStatus`, "preprint venue requires preprint status");
      if (["ccf_a", "top_venue", "peer_reviewed"].includes(String(row.venueTier)) && row.publicationStatus !== "accepted") fail(`${path}.publicationStatus`, "published venue requires accepted status");
      if (row.citationCount !== undefined && (!Number.isSafeInteger(row.citationCount) || Number(row.citationCount) < 0)) fail(`${path}.citationCount`, "expected a non-negative safe integer");
      array(row.authors, `${path}.authors`, true).forEach((author, i) => string(author, `${path}.authors[${i}]`));
      strings(object(row.problem, `${path}.problem`), ["scenario", "existingGap", "impact"], `${path}.problem`);
      const method = object(row.method, `${path}.method`);
      string(method.keyIdea, `${path}.method.keyIdea`);
      array(method.designPoints, `${path}.method.designPoints`, true).forEach((point, i) => {
        const at = `${path}.method.designPoints[${i}]`;
        strings(object(point, at), ["title", "challengeAddressed", "mechanism"], at);
      });
      strings(effects, ["performanceSummary", "engineeringApplicability"], `${path}.effectsAndLimits`);
    } else {
      unique(row.prId, prIds, `${path}.prId`);
      strings(row, ["repository", "displayTitle", "ascendEvidence", "hardwareDependency", "problem", "optimization"], path);
      if (typeof row.repository === "string" && !/^[\w.-]+\/[\w.-]+$/.test(row.repository)) fail(`${path}.repository`, "expected owner/repository");
      if (!Number.isSafeInteger(row.number) || Number(row.number) < 1) fail(`${path}.number`, "expected a positive safe integer");
      if (typeof row.repository === "string" && Number.isSafeInteger(row.number)) unique(`${row.repository.toLowerCase()}#${row.number}`, prIdentities, `${path}.repository/number`);
      url(row.url, `${path}.url`);
      oneOf(row.state, ["open", "merged", "closed"], `${path}.state`);
      oneOf(row.vllmStatus, Object.keys(VLLM_STATUS_BADGES), `${path}.vllmStatus`);
      oneOf(row.ascendApplicability, Object.keys(ASCEND_APPLICABILITY_BADGES), `${path}.ascendApplicability`);
      if (row.mergedAt !== undefined) {
        if (typeof row.mergedAt !== "string" || !beijingDay(row.mergedAt)) fail(`${path}.mergedAt`, "expected a valid ISO date or timestamp");
        if (row.state !== "merged") fail(`${path}.mergedAt`, "only merged PRs may have mergedAt");
      }
      string(effects.resultSummary, `${path}.effectsAndLimits.resultSummary`);
    }
  }
  array(problems, "problems").forEach((value, i) => {
    const path = `problems[${i}]`;
    const row = object(value, path);
    unique(row.id, problemIds, `${path}.id`);
    unique(row.slug, slugs, `${path}.slug`);
    if (typeof row.slug === "string" && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug)) fail(`${path}.slug`, "expected a lowercase URL slug");
    if (!Number.isSafeInteger(row.index) || Number(row.index) < 1) fail(`${path}.index`, "expected a positive safe integer");
    else unique(String(row.index), indices, `${path}.index`);
    strings(row, ["title", "shortTitle", "priorityBadge"], path);
    const gap = object(row.gap, `${path}.gap`);
    strings(gap, ["background", "existingLimitations", "researchOpportunity"], `${path}.gap`);
    if (gap.keyTakeaway !== undefined) string(gap.keyTakeaway, `${path}.gap.keyTakeaway`);
    array(row.papers, `${path}.papers`).forEach((value, j) => card(value, "paper", `${path}.papers[${j}]`));
    array(row.prs, `${path}.prs`).forEach((value, j) => card(value, "pr", `${path}.prs[${j}]`));
  });
  return errors;
}

function loadProblems(chunks: readonly unknown[]): readonly AclGraphProblem[] {
  if (!chunks.every(Array.isArray)) throw new Error("ACL Graph analysis chunks must be arrays");
  const problems: unknown[] = chunks.flat();
  const errors = validateAclGraphProblems(problems);
  if (errors.length) throw new Error(`Invalid ACL Graph analysis data:\n${errors.join("\n")}`);
  // This is the sole JSON-to-domain cast, after complete structural validation.
  return Object.freeze((problems as AclGraphProblem[]).sort((a, b) => a.index - b.index));
}

export const ACLGRAPH_PROBLEMS: readonly AclGraphProblem[] = loadProblems([problems12, problems34, problems56]);
export type AclGraphModalEntry = { problem: AclGraphProblem; card: AclGraphCard; globalIndex: number; problemCardIndex: number };

export function getAclGraphProblems(): readonly AclGraphProblem[] { return ACLGRAPH_PROBLEMS; }
export function getAclGraphProblemById(id: string): AclGraphProblem | undefined {
  return ACLGRAPH_PROBLEMS.find(problem => problem.id === id);
}

/** Stable order: problem.index, then papers, then PRs. Both indices are zero-based. */
export function getAclGraphCardEntries(problems: readonly AclGraphProblem[] = ACLGRAPH_PROBLEMS): AclGraphModalEntry[] {
  const entries: AclGraphModalEntry[] = [];
  for (const problem of [...problems].sort((a, b) => a.index - b.index)) {
    const cards: AclGraphCard[] = [...problem.papers, ...problem.prs];
    cards.forEach((card, problemCardIndex) => entries.push({ problem, card, globalIndex: entries.length, problemCardIndex }));
  }
  return entries;
}

export function findAclGraphCardById(cardId: string, problems: readonly AclGraphProblem[] = ACLGRAPH_PROBLEMS): AclGraphModalEntry | undefined {
  return getAclGraphCardEntries(problems).find(entry => entry.card.id === cardId);
}

/** No wrap at either boundary. Pass [problem] for a scoped sequence, or use withinProblem on the global sequence. */
export function getAdjacentAclGraphCards(cardId: string, problems: readonly AclGraphProblem[] = ACLGRAPH_PROBLEMS) {
  const entries = getAclGraphCardEntries(problems);
  const index = entries.findIndex(entry => entry.card.id === cardId);
  const current = index < 0 ? undefined : entries[index];
  const previous = index > 0 ? entries[index - 1] : undefined;
  const next = index < 0 ? undefined : entries[index + 1];
  return {
    current,
    previous,
    next,
    withinProblem: {
      previous: current && previous?.problem.id === current.problem.id ? previous : undefined,
      next: current && next?.problem.id === current.problem.id ? next : undefined,
    },
  };
}

export function getAclGraphAnalysisStats(problems: readonly AclGraphProblem[] = ACLGRAPH_PROBLEMS) {
  const cards = getAclGraphCardEntries(problems).map(entry => entry.card);
  const papers = cards.filter((card): card is AclGraphPaperCard => card.kind === "paper");
  const prs = cards.filter((card): card is AclGraphPrCard => card.kind === "pr");
  return {
    problems: problems.length,
    totalCards: cards.length,
    papers: papers.length,
    fulltextPapers: papers.filter(card => card.readDepth === "fulltext").length,
    prs: prs.length,
    ascendPrs: prs.filter(card => card.repository === "vllm-project/vllm-ascend").length,
    upstreamPrs: prs.filter(card => card.repository === "vllm-project/vllm").length,
  };
}

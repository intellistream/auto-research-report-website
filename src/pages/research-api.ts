type ResearchStatus = "queued" | "running" | "complete" | "failed";
export type ResearchStage = "searching" | "supplementing_1" | "supplementing_2"
  | "synthesizing" | "reviewing" | "revising" | "rendering";

export type ResearchJob = {
  id: string;
  status: ResearchStatus;
  query?: string;
  days?: number;
  stage?: ResearchStage;
  stageHistory?: ResearchStage[];
  observedStages?: ResearchStage[];
  error?: string;
  cached?: boolean;
  synthesisStatus?: "generated" | "unavailable" | "insufficient_evidence";
  reviewStatus?: "approved" | "needs_review" | "unavailable" | "insufficient_evidence";
  report?: { html: string; pdf?: string };
};

const connectionError = "无法连接调研服务。请确认网站已接入调研接口，再试一次。";
const statuses: ResearchStatus[] = ["queued", "running", "complete", "failed"];
const stages: ResearchStage[] = [
  "searching", "supplementing_1", "supplementing_2", "synthesizing", "reviewing", "revising", "rendering",
];

export function isResearchJobId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export function isResearchTaskId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function researchTaskHref(id: string, pageUrl: string) {
  if (!isResearchTaskId(id)) throw new Error("调研任务链接无效。");
  const url = new URL(pageUrl);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("调研任务链接无效。");
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "/research?" + new URLSearchParams({ task: id.toLowerCase() }).toString();
  return url.href;
}

export function researchApiBase(configured: string | undefined, origin: string) {
  try {
    const base = new URL(configured?.trim() || "/", origin);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
      throw new Error();
    }
    return base.origin + base.pathname.replace(/\/+$/, "");
  } catch {
    throw new Error(connectionError);
  }
}

export function parseResearchJob(data: unknown, base: string, expectedId?: string): ResearchJob {
  const job = data as Partial<ResearchJob> | null;
  if (!job || !isResearchJobId(job.id)
    || (expectedId && job.id !== expectedId) || !job.status || !statuses.includes(job.status)) {
    throw new Error(connectionError);
  }
  const result: ResearchJob = { id: job.id, status: job.status };
  if (typeof job.query === "string" && [...job.query.trim()].length >= 2
    && [...job.query.trim()].length <= 120) result.query = job.query.trim();
  if (typeof job.days === "number" && Number.isInteger(job.days) && job.days >= 7 && job.days <= 365) {
    result.days = job.days;
  }
  if (job.stage && stages.includes(job.stage)) result.stage = job.stage;
  if (Array.isArray(job.stageHistory)) {
    result.stageHistory = job.stageHistory.slice(-32).filter((stage) => stages.includes(stage));
  }
  if (typeof job.error === "string") result.error = job.error;
  if (job.cached === true) result.cached = true;
  if (job.synthesisStatus === "generated" || job.synthesisStatus === "unavailable"
    || job.synthesisStatus === "insufficient_evidence") {
    result.synthesisStatus = job.synthesisStatus;
  }
  if (job.reviewStatus === "approved" || job.reviewStatus === "needs_review"
    || job.reviewStatus === "unavailable" || job.reviewStatus === "insufficient_evidence") {
    result.reviewStatus = job.reviewStatus;
  }
  if (job.status === "complete") {
    const reportPath = `/api/research/jobs/${job.id}/report`;
    if (job.report?.html !== `${reportPath}.html`) {
      throw new Error("调研服务未返回可用的 HTML 报告。");
    }
    result.report = { html: base + job.report.html };
    if (job.report.pdf === `${reportPath}.pdf`) result.report.pdf = base + job.report.pdf;
  }
  return result;
}

export function mergeResearchJobProgress(previous: ResearchJob | undefined, next: ResearchJob): ResearchJob {
  const previousHistory = previous?.id === next.id ? previous.observedStages ?? previous.stageHistory ?? [] : [];
  const observedStages = [...(next.stageHistory ?? previousHistory)];
  if (next.stage && next.status !== "queued" && observedStages.at(-1) !== next.stage) {
    observedStages.push(next.stage);
  }
  return { ...next, observedStages: observedStages.slice(-32) };
}

async function requestResearchJob(path: string, options: RequestInit, expectedId?: string) {
  const base = researchApiBase(import.meta.env.VITE_RESEARCH_API_BASE, window.location.origin);
  const response = await fetch(`${base}/api/research/jobs${path}`, { ...options, cache: "no-store" })
    .catch(() => { throw new Error(connectionError); });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(connectionError);
  }
  const data: unknown = await response.json().catch(() => { throw new Error(connectionError); });
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new Error(typeof detail === "string" && detail ? detail : connectionError);
  }
  return parseResearchJob(data, base, expectedId);
}

export function submitResearchJob(query: string, days: number, signal: AbortSignal) {
  return requestResearchJob("", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, days }),
    signal,
  });
}

export function getResearchJob(id: string, signal: AbortSignal) {
  if (!isResearchJobId(id)) return Promise.reject(new Error("调研任务链接无效。"));
  return requestResearchJob(`/${id}`, { signal }, id);
}

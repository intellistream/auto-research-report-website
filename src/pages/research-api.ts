type ResearchStatus = "queued" | "running" | "complete" | "failed";
type ResearchStage = "searching" | "synthesizing" | "rendering";

export type ResearchJob = {
  id: string;
  status: ResearchStatus;
  stage?: ResearchStage;
  error?: string;
  cached?: boolean;
  synthesisStatus?: "generated" | "unavailable" | "insufficient_evidence";
  report?: { html: string; pdf?: string };
};

const connectionError = "无法连接调研服务。请确认网站已接入调研接口，再试一次。";
const statuses: ResearchStatus[] = ["queued", "running", "complete", "failed"];
const stages: ResearchStage[] = ["searching", "synthesizing", "rendering"];

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
  if (!job || typeof job.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(job.id)
    || (expectedId && job.id !== expectedId) || !job.status || !statuses.includes(job.status)) {
    throw new Error(connectionError);
  }
  const result: ResearchJob = { id: job.id, status: job.status };
  if (job.stage && stages.includes(job.stage)) result.stage = job.stage;
  if (typeof job.error === "string") result.error = job.error;
  if (job.cached === true) result.cached = true;
  if (job.synthesisStatus === "generated" || job.synthesisStatus === "unavailable"
    || job.synthesisStatus === "insufficient_evidence") {
    result.synthesisStatus = job.synthesisStatus;
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
  return requestResearchJob(`/${id}`, { signal }, id);
}

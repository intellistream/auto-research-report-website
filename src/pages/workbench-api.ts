import type { ResearchJob } from "./research-api";

export type Member = {
  user_id: string; github_id: number; github_login: string; is_admin: boolean; status: string;
  daily_generation_limit: number; active_job_limit: number; created_at?: number; last_login_at?: number | null;
};
export type Session = { authenticated: true; member: Member; csrf_token: string; expires_at: string };
export type Study = {
  id: string; name: string; description: string; createdAt: string; updatedAt: string;
  expiresAt?: string; reportCount: number; activeJobCount: number;
};
export type Job = ResearchJob & {
  studyId: string; number: number; createdAt: string; updatedAt?: string; completedAt?: string;
  retryOf?: string; retryable?: boolean; reportExpiresAt?: string; reportExpired?: boolean;
  report?: { html: string; pdf?: string; json?: string };
};
export type Page<T> = { items: T[]; offset: number; total: number; limit: number };
export type Usage = {
  accepted: number; charged: number; refunded: number; succeeded: number; failed: number; active: number;
  dailyGenerationLimit: number; activeJobLimit: number; resetsAt?: string;
};
export type QueueItem = { id: string; studyId: string; ownerUserId: string; status: string; stage?: string; createdAt?: string };
export type AuditItem = { id?: string; userId?: string; action: string; studyId?: string; jobId?: string; createdAt?: string; result?: string };
export type MemberResolution = { github_id: number; github_login: string; confirmation_token: string };

const unavailable = "工作台暂时无法连接，请稍后重新读取。";
const uncertain = "连接中断，提交结果尚未确认。请检查本次提交结果，不要新建另一次生成。";
const obj = (value: unknown): Record<string, any> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkbenchError(unavailable, "invalid_response");
  return value as Record<string, any>;
};
const str = (value: unknown) => typeof value === "string" ? value : "";
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
export const validId = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
function identifier(value: unknown): string {
  if (!validId(value)) throw new WorkbenchError(unavailable, "invalid_response");
  return value;
}
export class WorkbenchError extends Error {
  constructor(message: string, readonly code = "unavailable", readonly status = 0, readonly uncertain = false, readonly account?: string) { super(message); }
}
export const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
export const errorMessage = (error: unknown) => error instanceof WorkbenchError ? error.message : unavailable;
export function parseMember(value: unknown): Member {
  const data = obj(value);
  if (!validId(data.user_id) || typeof data.github_id !== "number" || !str(data.github_login)
    || typeof data.is_admin !== "boolean" || !str(data.status)
    || !Number.isInteger(data.daily_generation_limit) || !Number.isInteger(data.active_job_limit)) {
    throw new WorkbenchError(unavailable, "invalid_response");
  }
  return { user_id: data.user_id, github_id: data.github_id, github_login: data.github_login,
    is_admin: data.is_admin, status: data.status, daily_generation_limit: data.daily_generation_limit,
    active_job_limit: data.active_job_limit, created_at: typeof data.created_at === "number" ? data.created_at : undefined,
    last_login_at: typeof data.last_login_at === "number" ? data.last_login_at : null };
}
export function parseStudy(value: unknown): Study {
  const data = obj(value);
  if (!str(data.name) || !str(data.createdAt) || !str(data.updatedAt)
    || !Number.isInteger(data.reportCount) || !Number.isInteger(data.activeJobCount)) {
    throw new WorkbenchError(unavailable, "invalid_response");
  }
  return { id: identifier(data.id), name: data.name, description: str(data.description), createdAt: data.createdAt,
    updatedAt: data.updatedAt, expiresAt: str(data.expiresAt) || undefined,
    reportCount: data.reportCount, activeJobCount: data.activeJobCount };
}
export function jobPath(studyId: string, jobId: string) {
  return `/api/research/studies/${identifier(studyId)}/jobs/${identifier(jobId)}`;
}
export function parseJob(value: unknown, studyId: string): Job {
  const data = obj(value);
  if (data.studyId !== studyId || !["queued", "running", "complete", "failed"].includes(data.status)
    || !Number.isInteger(data.number) || !str(data.createdAt) || !str(data.query)
    || ![7, 30, 90, 180, 365].includes(data.days)) throw new WorkbenchError(unavailable, "invalid_response");
  const id = identifier(data.id);
  const stages = ["searching", "supplementing_1", "supplementing_2", "synthesizing", "reviewing", "revising", "rendering"];
  const job: Job = { id, studyId, status: data.status, number: data.number, createdAt: data.createdAt,
    updatedAt: str(data.updatedAt) || undefined, completedAt: str(data.generatedAt || data.finishedAt || data.completedAt) || undefined,
    query: data.query, days: data.days, reportExpiresAt: str(data.reportExpiresAt) || undefined,
    reportExpired: data.reportExpired === true, retryable: typeof data.retryable === "boolean" ? data.retryable : undefined, retryOf: str(data.retryOf) || undefined };
  if (stages.includes(data.stage)) job.stage = data.stage;
  if (Array.isArray(data.stageHistory)) job.stageHistory = data.stageHistory.filter((v: unknown) => stages.includes(String(v))).slice(-32);
  if (typeof data.error === "string") job.error = data.error;
  if (["approved", "needs_review", "unavailable", "insufficient_evidence"].includes(data.reviewStatus)) job.reviewStatus = data.reviewStatus;
  if (["generated", "unavailable", "insufficient_evidence"].includes(data.synthesisStatus)) job.synthesisStatus = data.synthesisStatus;
  if (data.report && !job.reportExpired) {
    const formats = obj(data.report);
    const report: Record<string, string> = {};
    for (const format of ["html", "pdf", "json"]) {
      if (formats[format] == null) continue;
      const expected = `${jobPath(studyId, id)}/report.${format}`;
      if (formats[format] !== expected) throw new WorkbenchError(unavailable, "invalid_report_path");
      report[format] = expected;
    }
    if (report.html) job.report = report as Job["report"];
  }
  return job;
}
function parsePage<T>(value: unknown, key: string, parse: (value: unknown) => T): Page<T> {
  const data = obj(value);
  if (!Array.isArray(data[key]) || !Number.isInteger(data.total) || !Number.isInteger(data.offset) || !Number.isInteger(data.limit)) {
    throw new WorkbenchError(unavailable, "invalid_response");
  }
  return { items: data[key].map(parse), total: data.total, offset: data.offset, limit: data.limit };
}
export function parseUsage(value: unknown): Usage {
  const data = obj(value);
  return { accepted: count(data.accepted), charged: count(data.charged), refunded: count(data.refunded),
    succeeded: count(data.succeeded), failed: count(data.failed), active: count(data.active),
    dailyGenerationLimit: count(data.dailyGenerationLimit), activeJobLimit: count(data.activeJobLimit),
    resetsAt: str(data.resetsAt) || undefined };
}

/** Only same-origin, authenticated endpoints. No dynamic endpoint discovery or anonymous fallback. */
export class WorkbenchApi {
  private csrf = "";
  private epoch = 0;
  private controllers = new Set<AbortController>();
  cancelPending() { this.epoch++; this.controllers.forEach((c) => c.abort()); this.controllers.clear(); }
  onSessionRejected?: (error: WorkbenchError) => void;
  clear() { this.cancelPending(); this.csrf = ""; }
  private async request(path: string, method = "GET", body?: unknown, key?: string, signal?: AbortSignal, file = false): Promise<any> {
    const write = !["GET", "HEAD"].includes(method);
    if (write && !this.csrf) throw new WorkbenchError("请重新登录后再操作。", "authentication_required", 401);
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controllers.add(controller);
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, write ? 30_000 : 15_000);
    const headers: Record<string, string> = {};
    if (write) { headers["X-CSRF-Token"] = this.csrf; headers["Content-Type"] = "application/json"; }
    if (key) headers["Idempotency-Key"] = key;
    try {
      let response: Response;
      try {
        response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
      } catch {
        if (signal?.aborted || epoch !== this.epoch) throw new DOMException("Aborted", "AbortError");
        throw new WorkbenchError(write ? uncertain : unavailable, "network_error", 0, write);
      }
      if (epoch !== this.epoch || signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (response.status === 204) return undefined;
      if (file && response.ok) {
        const expected = path.endsWith(".pdf") ? "application/pdf" : path.endsWith(".json") ? "application/json" : "text/html";
        if (!response.headers.get("content-type")?.split(";")[0].trim().includes(expected)) throw new WorkbenchError("报告格式暂不可用，请重新读取记录。", "invalid_report_format");
        const blob = await response.blob();
        if (epoch !== this.epoch || signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return blob;
      }
      let data: Record<string, any>;
      try { data = obj(await response.json()); }
      catch {
        if (response.status === 401 || response.status === 403) {
          const error = new WorkbenchError("请重新登录后再操作。", "authentication_required", response.status);
          this.onSessionRejected?.(error); throw error;
        }
        throw new WorkbenchError(write ? uncertain : unavailable, "invalid_response", response.status, write);
      }
      if (epoch !== this.epoch || signal?.aborted) throw new DOMException("Aborted", "AbortError");
      if (!response.ok) {
        const detail = typeof data.detail === "object" && data.detail ? data.detail : {};
        const error = new WorkbenchError(str(detail.message).slice(0, 500) || unavailable, str(detail.code) || "request_failed", response.status,
          write && response.status >= 500, str(detail.github_login) || undefined);
        if (response.status === 401 || (response.status === 403 && /disabled|inactive|not_approved|not_admitted|not_allowed|membership/.test(error.code))) {
          this.onSessionRejected?.(error);
        }
        throw error;
      }
      return data;
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); this.controllers.delete(controller); }
  }
  async session(signal?: AbortSignal): Promise<Session> {
    const data = await this.request("/api/session", "GET", undefined, undefined, signal);
    const member = parseMember(data.member);
    if (data.authenticated !== true || member.status !== "active" || !str(data.csrf_token) || !str(data.expires_at)) {
      throw new WorkbenchError("当前账号尚未开通研究权限，请联系管理员。", "not_admitted", 403);
    }
    this.csrf = data.csrf_token;
    return { authenticated: true, member, csrf_token: data.csrf_token, expires_at: data.expires_at };
  }
  logout(all = false) { return this.request(`/api/session/${all ? "logout-all" : "logout"}`, "POST", {}); }
  async studies(offset = 0, search = "", signal?: AbortSignal) {
    return parsePage(await this.request(`/api/research/studies?${new URLSearchParams({ offset: String(offset), limit: "20", search })}`, "GET", undefined, undefined, signal), "studies", parseStudy);
  }
  async study(id: string, signal?: AbortSignal) {
    const data = await this.request(`/api/research/studies/${identifier(id)}`, "GET", undefined, undefined, signal);
    const study = parseStudy(data.study ?? data);
    if (study.id !== id) throw new WorkbenchError(unavailable, "invalid_response");
    return study;
  }
  async createStudy(name: string, description: string, key: string) {
    const data = await this.request("/api/research/studies", "POST", { name, description }, key);
    return parseStudy(data.study ?? data);
  }
  async renameStudy(id: string, name: string) {
    const data = await this.request(`/api/research/studies/${identifier(id)}`, "PATCH", { name });
    return parseStudy(data.study ?? data);
  }
  deleteStudy(id: string) { return this.request(`/api/research/studies/${identifier(id)}`, "DELETE"); }
  async jobs(studyId: string, offset = 0, signal?: AbortSignal) {
    return parsePage(await this.request(`/api/research/studies/${identifier(studyId)}/jobs?offset=${offset}&limit=20`, "GET", undefined, undefined, signal), "jobs", (v) => parseJob(v, studyId));
  }
  async job(studyId: string, jobId: string, signal?: AbortSignal) {
    const data = await this.request(jobPath(studyId, jobId), "GET", undefined, undefined, signal);
    const job = parseJob(data.job ?? data, studyId);
    if (job.id !== jobId) throw new WorkbenchError(unavailable, "invalid_response");
    return job;
  }
  async generate(studyId: string, query: string, days: number, key: string) {
    const data = await this.request(`/api/research/studies/${identifier(studyId)}/jobs`, "POST", { query, days }, key);
    return parseJob(data.job ?? data, studyId);
  }
  async retry(studyId: string, jobId: string, key: string) {
    const data = await this.request(`${jobPath(studyId, jobId)}/retry`, "POST", {}, key);
    return parseJob(data.job ?? data, studyId);
  }
  deleteJob(studyId: string, jobId: string) { return this.request(jobPath(studyId, jobId), "DELETE"); }
  async usage(signal?: AbortSignal) { return parseUsage(await this.request("/api/research/usage", "GET", undefined, undefined, signal)); }
  async report(studyId: string, jobId: string, format: "html" | "pdf" | "json", signal?: AbortSignal): Promise<Blob> {
    return this.request(`${jobPath(studyId, jobId)}/report.${format}`, "GET", undefined, undefined, signal, true);
  }
  async members(offset = 0, signal?: AbortSignal): Promise<{ items: Member[]; nextOffset?: number }> {
    const data = await this.request(`/api/admin/members?limit=100&offset=${offset}`, "GET", undefined, undefined, signal);
    if (!Array.isArray(data.members)) throw new WorkbenchError(unavailable, "invalid_response");
    return { items: data.members.map(parseMember), nextOffset: typeof data.next_offset === "number" ? data.next_offset : undefined };
  }
  async resolveMember(github_login: string): Promise<MemberResolution> {
    const data = await this.request("/api/admin/members/resolve", "POST", { github_login });
    const identity = obj(data.identity);
    if (!str(identity.github_login) || typeof identity.github_id !== "number" || !str(data.confirmation_token)) throw new WorkbenchError(unavailable, "invalid_response");
    return { github_id: identity.github_id, github_login: identity.github_login, confirmation_token: data.confirmation_token };
  }
  async admit(confirmation_token: string) { return this.request("/api/admin/members", "POST", { confirmation_token }); }
  updateMember(id: string, patch: { status?: string; daily_generation_limit?: number; active_job_limit?: number }) {
    return this.request(`/api/admin/members/${identifier(id)}`, "PATCH", patch);
  }
  async queue(offset = 0, signal?: AbortSignal): Promise<Page<QueueItem>> {
    const data = await this.request(`/api/admin/research/queue?limit=20&offset=${offset}`, "GET", undefined, undefined, signal);
    if (!Array.isArray(data.jobs)) throw new WorkbenchError(unavailable, "invalid_response");
    const items = data.jobs.map((value: unknown) => {
      const item = obj(value);
      return { id: identifier(item.id), studyId: identifier(item.studyId), ownerUserId: identifier(item.userId),
        status: str(item.status), stage: str(item.stage) || undefined, createdAt: str(item.createdAt) || undefined };
    });
    return { items, total: count(data.total), offset, limit: 20 };
  }
  async adminUsage(signal?: AbortSignal): Promise<{ userId: string; usage: Usage }[]> {
    const data = await this.request("/api/admin/research/usage", "GET", undefined, undefined, signal);
    if (!Array.isArray(data.usage)) throw new WorkbenchError(unavailable, "invalid_response");
    return data.usage.map((value: unknown) => { const item = obj(value); return { userId: identifier(item.userId), usage: parseUsage(item) }; });
  }
  async audit(signal?: AbortSignal): Promise<AuditItem[]> {
    const data = await this.request("/api/admin/audit", "GET", undefined, undefined, signal);
    if (!Array.isArray(data.events)) throw new WorkbenchError(unavailable, "invalid_response");
    return data.events.map((value: unknown) => { const item = obj(value); return { id: str(item.id), userId: str(item.userId), action: str(item.action),
      studyId: str(item.studyId), jobId: str(item.jobId), createdAt: str(item.createdAt), result: str(item.result) }; });
  }
}

export function workbenchEntry(configured: string | undefined): string | undefined {
  if (!configured?.trim()) return undefined;
  try {
    const url = new URL(configured.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || url.hostname.endsWith(".trycloudflare.com") || url.pathname !== "/") return undefined;
    return `${url.origin}/#/research`;
  } catch { return undefined; }
}
export function privateLocation(studyId?: string, jobId?: string) {
  const params = new URLSearchParams();
  if (studyId) params.set("study", identifier(studyId));
  if (jobId && studyId) params.set("job", identifier(jobId));
  return `/research${params.size ? `?${params}` : ""}`;
}

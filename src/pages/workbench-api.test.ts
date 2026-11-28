import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchApi, parseJob, workbenchEntry, validUsageDay } from "./workbench-api";
const member = { user_id: "a", github_id: 11, github_login: "controlled-a", is_admin: false, status: "active", daily_generation_limit: 5, active_job_limit: 1 };
const session = { authenticated: true, member, csrf_token: "test-csrf", expires_at: "2099-01-01T00:00:00Z" };
const study = { id: "s1", name: "测试研究", description: "", createdAt: "2026-11-28T00:00:00Z", updatedAt: "2026-11-28T00:00:00Z", reportCount: 0, activeJobCount: 0 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());
describe("same-origin workbench client", () => {
  it("rejects missing identity before a write and uses CSRF and a stable operation key once authenticated", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json(study)); vi.stubGlobal("fetch", fetcher);
    const api = new WorkbenchApi(); await expect(api.createStudy("研究", "", "op")).rejects.toMatchObject({ status: 401 });
    expect(fetcher).not.toHaveBeenCalled(); await api.session(); await api.createStudy("研究", "", "same-operation");
    expect(fetcher.mock.calls[1][0]).toBe("/api/research/studies");
    expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "X-CSRF-Token": "test-csrf", "Idempotency-Key": "same-operation" } });
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ name: "研究", description: "" });
  });
  it("does not retry uncertain submissions or silently switch endpoints", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(session)).mockRejectedValueOnce(new TypeError("network")); vi.stubGlobal("fetch", fetcher);
    const api = new WorkbenchApi(); await api.session(); await expect(api.generate("s1", "测试问题", 30, "operation")).rejects.toMatchObject({ uncertain: true }); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects parent mismatches and report paths outside the authenticated job", () => {
    const job = { id: "j1", studyId: "s1", number: 1, query: "测试问题", days: 30, createdAt: "2026-11-28T00:00:00Z", status: "complete" };
    expect(() => parseJob(job, "s2")).toThrow();
    for (const url of ["https://other.org/report.html", "/api/research/jobs/j1/report.html", "/api/research/studies/s2/jobs/j1/report.html"]) expect(() => parseJob({ ...job, report: { html: url } }, "s1")).toThrow();
    expect(parseJob({ ...job, report: { html: "/api/research/studies/s1/jobs/j1/report.html" } }, "s1").report?.html).toContain("/studies/s1/jobs/j1/");
  });
  it("invalidates late responses after identity is cleared", async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>((done) => { resolve = done; })));
    const api = new WorkbenchApi(); const request = api.study("s1"); api.clear(); resolve(json(study)); await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("notifies session rejection on direct protected file access", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: { code: "not_authenticated", message: "请重新登录" } }, 401)));
    const api = new WorkbenchApi(), rejected = vi.fn(); api.onSessionRejected = rejected;
    await expect(api.report("s1", "j1", "pdf")).rejects.toMatchObject({ status: 401 }); expect(rejected).toHaveBeenCalledOnce();
  });
  it("accepts only a fixed clean HTTPS origin for the public gateway", () => {
    expect(workbenchEntry("https://research.example.org")).toBe("https://research.example.org/#/research");
    for (const input of [undefined, "http://example.org", "//example.org", "https://name:secret@example.org", "https://example.org/path", "https://example.org/?token=x", "https://a.trycloudflare.com"]) expect(workbenchEntry(input)).toBeUndefined();
  });
});


describe("session-check classification and account boundaries", () => {
  it.each([[401, "authentication_required"], [403, "member_not_allowed"], [503, "github_unavailable"]])("leaves %s/%s session classification to the provider", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: { code } }, Number(status))));
    const api = new WorkbenchApi(), rejected = vi.fn(); api.onSessionRejected = rejected;
    await expect(api.session()).rejects.toMatchObject({ code, status }); expect(rejected).not.toHaveBeenCalled();
  });
  it("invalidates the previous account's late protected response and uses the new account's CSRF", async () => {
    let resolve!: (response: Response) => void;
    const next = { ...session, member: { ...member, user_id: "b", github_id: 22, github_login: "controlled-b" }, csrf_token: "b-csrf" };
    const fetcher = vi.fn().mockResolvedValueOnce(json(session)).mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }))
      .mockResolvedValueOnce(json(next)).mockResolvedValueOnce(json(study)); vi.stubGlobal("fetch", fetcher);
    const api = new WorkbenchApi(), rejected = vi.fn(); api.onSessionRejected = rejected; await api.session();
    const oldRead = api.study("s1"); await api.session(); resolve(json({ detail: { code: "session_revoked" } }, 401));
    await expect(oldRead).rejects.toMatchObject({ name: "AbortError" }); expect(rejected).not.toHaveBeenCalled();
    await api.createStudy("研究", "", "new-account-operation");
    expect(fetcher.mock.calls[3][1].headers["X-CSRF-Token"]).toBe("b-csrf");
  });
  it("does not let a late malformed protected body revoke a newly validated account", async () => {
    let rejectBody!: (reason?: unknown) => void;
    const response = new Response("", { status: 401 });
    response.json = () => new Promise((_, reject) => { rejectBody = reject; });
    const fetcher = vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(response)
      .mockResolvedValueOnce(json({ ...session, member: { ...member, user_id: "b" } })); vi.stubGlobal("fetch", fetcher);
    const api = new WorkbenchApi(), rejected = vi.fn(); api.onSessionRejected = rejected; await api.session();
    const oldRead = api.study("s1"); await Promise.resolve(); await api.session(); rejectBody(new SyntaxError("late malformed response"));
    await expect(oldRead).rejects.toMatchObject({ name: "AbortError" }); expect(rejected).not.toHaveBeenCalled();
  });
  it("does not accept an already-expired successful session response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...session, expires_at: "2000-01-01T00:00:00Z" })));
    await expect(new WorkbenchApi().session()).rejects.toMatchObject({ code: "session_expired", status: 401 });
  });
});


it("preserves producer quality outcomes independently of legacy review normalization", () => {
  const job = parseJob({ id: "j", studyId: "s1", number: 8, query: "质量状态", days: 30, status: "complete", createdAt: "2026-11-28T00:00:00Z", reviewStatus: "needs_revision", synthesisStatus: "insufficient_evidence" }, "s1");
  expect(job.reviewOutcome).toBe("needs_revision"); expect(job.synthesisOutcome).toBe("insufficient_evidence");
});


describe("safe administration projections", () => {
  it("uses a confirmed member response and rejects a different target as uncertain", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json({ member: { ...member, daily_generation_limit: 8, active_job_limit: 2 } })).mockResolvedValueOnce(json({ member: { ...member, user_id: "other" } }));
    vi.stubGlobal("fetch", fetcher); const api = new WorkbenchApi(); await api.session();
    expect(await api.updateMember("a", { daily_generation_limit: 7, active_job_limit: 1 })).toMatchObject({ user_id: "a", daily_generation_limit: 8, active_job_limit: 2 });
    await expect(api.updateMember("a", { daily_generation_limit: 7 })).rejects.toMatchObject({ uncertain: true });
  });
  it("preserves the historical day and already-net charge, without manufacturing missing counts or copying private fields", async () => {
    const payload = { day: "2026-11-27", usage: [{ userId: "not-first-page", githubLogin: "historical-user", day: "2026-11-27", accepted: 4, charged: 3, refunded: 1, succeeded: 2, active: 99, query: "private query", report: "private report" }] };
    const fetcher = vi.fn().mockResolvedValue(json(payload)); vi.stubGlobal("fetch", fetcher); const api = new WorkbenchApi(); const result = await api.adminUsage("2026-11-27");
    expect(result.day).toBe("2026-11-27"); expect(result.items[0].usage.charged).toBe(3); expect(result.items[0].usage.failed).toBeUndefined();
    expect(result.items[0]).toMatchObject({ userId: "not-first-page", githubLogin: "historical-user" }); expect(JSON.stringify(result)).not.toMatch(/active|private/);
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/research/usage?day=2026-11-27");
  });
  it("rejects a missing or mismatched day and invalid calendar dates instead of calling them today", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ usage: [] })).mockResolvedValueOnce(json({ day: "2026-11-28", usage: [] })));
    const api = new WorkbenchApi(); await expect(api.adminUsage("2026-11-27")).rejects.toMatchObject({ code: "invalid_response" }); await expect(api.adminUsage("2026-11-27")).rejects.toMatchObject({ code: "invalid_response" });
    expect(validUsageDay("2026-02-30")).toBe(false); expect(validUsageDay("2026-11-27")).toBe(true);
  });
  it("projects only queue metadata, preserves missing durations, and follows the actual audit cursor", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ total: 1, jobs: [{ id: "job", studyId: "study", userId: "owner", githubLogin: "owner-name", status: "running", waitSeconds: 12.5, runningSeconds: null, query: "private", model: "private" }] }))
      .mockResolvedValueOnce(json({ events: [{ id: "evt", action: "member.update", userId: "admin", actorType: "member", actorGithubLogin: "admin-name", targetUserId: "target", targetGithubLogin: "target-name", query: "private", exception: "private" }], total: 101, next_offset: 100 }));
    vi.stubGlobal("fetch", fetcher); const api = new WorkbenchApi(); const queue = await api.queue();
    expect(queue.items[0]).toMatchObject({ waitSeconds: 12.5, runningSeconds: null, githubLogin: "owner-name" }); expect(JSON.stringify(queue)).not.toContain("private");
    const audit = await api.audit(50); expect(audit.nextOffset).toBe(100); expect(audit.items[0]).toMatchObject({ userId: "admin", targetUserId: "target", actorType: "member" }); expect(JSON.stringify(audit)).not.toContain("private");
    expect(fetcher.mock.calls[1][0]).toBe("/api/admin/audit?limit=50&offset=50");
  });
  it("notifies permission rejection for admin requests so cached management data can be cleared", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ detail: { code: "admin_required" } }, 403)));
    const api = new WorkbenchApi(), rejected = vi.fn(); api.onSessionRejected = rejected; await expect(api.members()).rejects.toMatchObject({ status: 403 }); expect(rejected).toHaveBeenCalledOnce();
  });
});

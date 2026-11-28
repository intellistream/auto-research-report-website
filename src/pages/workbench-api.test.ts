import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchApi, parseJob, workbenchEntry } from "./workbench-api";
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

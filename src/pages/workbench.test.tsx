// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ResearchQuery from "./ResearchQuery";
import SiteLayout from "../shell/SiteLayout";
import { WorkbenchSessionProvider } from "./WorkbenchSession";
import { generationWait } from "./workbench-ui";
import type { Job, Study, Member } from "./workbench-api";
const time = "2026-11-28T00:00:00Z";
const makeStudy = (id: string, name: string): Study => ({ id, name, description: "受控测试资料", createdAt: time, updatedAt: time, expiresAt: "2027-05-28T00:00:00Z", reportCount: 0, activeJobCount: 0 });
const makeJob = (id: string, studyId: string, query: string, number: number, status: Job["status"] = "complete"): Job => ({ id, studyId, query, number, status, days: 30, createdAt: `2026-11-28T00:0${number}:00Z`, completedAt: time, reportExpiresAt: "2027-02-28T00:00:00Z", reviewStatus: "approved", synthesisStatus: "generated", ...(status === "complete" ? { report: { html: `/api/research/studies/${studyId}/jobs/${id}/report.html`, json: `/api/research/studies/${studyId}/jobs/${id}/report.json` } } : { error: "受控生成失败" }) });
const member = { user_id: "member-a", github_id: 11, github_login: "controlled-a", is_admin: false, status: "active", daily_generation_limit: 5, active_job_limit: 1 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
let adminMembers: Member[];
let studies: Study[], jobs: Job[], session: any, sessionStatus: number, charged: number, failRead: boolean, loseSubmission: boolean;
let fetcher: ReturnType<typeof vi.fn>, keys: Map<string, Job>, hook: ((path: string, options: RequestInit) => Promise<Response> | undefined) | undefined;
function show(path = "/research?study=s1", strict = false) {
  const content = <WorkbenchSessionProvider><SiteLayout days={[]}><ResearchQuery /></SiteLayout></WorkbenchSessionProvider>;
  return render(<MemoryRouter initialEntries={[path]}>{strict ? <StrictMode>{content}</StrictMode> : content}</MemoryRouter>);
}
function summarize(study: Study) { return { ...study, reportCount: jobs.filter((j) => j.studyId === study.id && j.status === "complete" && !j.reportExpired).length, activeJobCount: jobs.filter((j) => j.studyId === study.id && ["running", "queued"].includes(j.status)).length }; }
beforeEach(() => {
  vi.stubEnv("VITE_WORKBENCH_MODE", "enabled");
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  studies = [makeStudy("s1", "研究甲"), makeStudy("s2", "研究乙")]; jobs = [makeJob("j1", "s1", "第一份报告问题", 1), makeJob("j2", "s1", "第二份报告问题", 2)];
  session = { authenticated: true, member: { ...member }, csrf_token: "controlled-csrf", expires_at: "2099-01-01T00:00:00Z" };
  adminMembers = [{ ...member }];
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  sessionStatus = 200; charged = 2; failRead = false; loseSubmission = false; keys = new Map(); hook = undefined;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:controlled-report") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  fetcher = vi.fn(async (input: string, options: RequestInit = {}) => {
    const path = String(input), method = options.method || "GET", url = new URL(path, "http://localhost");
    const special = hook?.(path, options); if (special) return special;
    if (path === "/api/session") return sessionStatus === 200 ? json(session) : json({ detail: { code: sessionStatus === 403 ? "member_disabled" : "not_authenticated", message: "受控会话不可用" } }, sessionStatus);
    if (path.startsWith("/api/session/logout")) { sessionStatus = 401; return new Response(null, { status: 204 }); }
    if (path === "/api/research/usage") return json({ accepted: charged, charged, refunded: 0, succeeded: 2, failed: 0, active: jobs.filter((j) => ["queued", "running"].includes(j.status)).length, dailyGenerationLimit: session.member.daily_generation_limit, activeJobLimit: session.member.active_job_limit, resetsAt: "2026-11-28T16:00:00Z" });
    if (path === "/api/admin/members/resolve") return json({ identity: { github_id: 22, github_login: "controlled-new" }, confirmation_token: "controlled-confirmation" });
    if (path === "/api/admin/members" && method === "POST") return json({ member });
    if (url.pathname === "/api/admin/members") return json({ members: adminMembers, next_offset: null });
    if (url.pathname === "/api/admin/research/queue") return json({ jobs: [{ id: "queue-1", studyId: "study-number", userId: "member-number", githubLogin: "controlled-queue-member", status: "running", stage: "searching", createdAt: time, updatedAt: time, waitSeconds: 120, runningSeconds: 480 }], total: 1, offset: 0, limit: 20 });
    if (url.pathname === "/api/admin/research/usage") return json({ day: url.searchParams.get("day"), usage: [{ userId: "member-number", githubLogin: "controlled-queue-member", day: url.searchParams.get("day"), accepted: 2, charged: 2, refunded: 0, succeeded: 1, failed: 0, active: 1 }] });
    if (url.pathname === "/api/admin/audit") return json({ events: [{ id: "event-1", action: "study.create", userId: "member-number", actorGithubLogin: "controlled-queue-member", studyId: "study-number", createdAt: time, result: "accepted" }], total: 1, next_offset: null });
    if (path.startsWith("/api/admin/members/") && method === "PATCH") {
      const id = path.split("/").at(-1), target = adminMembers.find((m) => m.user_id === id)!;
      Object.assign(target, JSON.parse(String(options.body))); return json({ member: target });
    }
    if (failRead && method === "GET" && path.includes("/jobs?")) throw new TypeError("controlled offline");
    if (url.pathname === "/api/research/studies" && method === "POST") {
      const body = JSON.parse(String(options.body)), study = makeStudy("s-new", body.name); studies.push(study); return json(study);
    }
    if (url.pathname === "/api/research/studies") {
      const own = studies.filter((s) => s.name.includes(url.searchParams.get("search") || "")); return json({ studies: own.map(summarize), offset: 0, limit: 20, total: own.length });
    }
    const match = /^\/api\/research\/studies\/([^/]+)(?:\/jobs(?:\/([^/]+))?(?:\/(retry|report\.(?:html|pdf|json)))?)?$/.exec(url.pathname);
    if (match) {
      const [, studyId, jobId, action] = match, study = studies.find((s) => s.id === studyId);
      if (!study) return json({ detail: { code: "not_found", message: "内容不存在、已到期或当前账号无法访问。" } }, 404);
      if (!url.pathname.includes("/jobs")) {
        if (method === "DELETE") { studies = studies.filter((s) => s.id !== studyId); return new Response(null, { status: 204 }); }
        if (method === "PATCH") study.name = JSON.parse(String(options.body)).name;
        return json(summarize(study));
      }
      if (method === "POST") {
        const key = (options.headers as Record<string, string>)["Idempotency-Key"]; if (keys.has(key)) return json(keys.get(key));
        const body = action === "retry" ? jobs.find((j) => j.id === jobId)! : JSON.parse(String(options.body));
        const next = makeJob(`j-new-${keys.size}`, studyId, body.query, jobs.length + 1); jobs.push(next); keys.set(key, next); charged++;
        if (loseSubmission) { loseSubmission = false; throw new TypeError("controlled response loss"); } return json(next);
      }
      if (!jobId) return json({ jobs: jobs.filter((j) => j.studyId === studyId), offset: 0, limit: 20, total: jobs.filter((j) => j.studyId === studyId).length });
      const job = jobs.find((j) => j.id === jobId && j.studyId === studyId);
      if (!job) return json({ detail: { code: "not_found", message: "内容不存在、已到期或当前账号无法访问。" } }, 404);
      if (method === "DELETE") { jobs = jobs.filter((j) => j.id !== jobId); return new Response(null, { status: 204 }); }
      if (action === "report.json") return json({ query: job.query, coverage: { startDate: "2026-10-29", endDate: "2026-11-28" }, synthesisStatus: job.synthesisStatus, review: { status: job.reviewStatus, issues: [] } });
      if (action?.startsWith("report.")) return new Response("<h1>受控报告</h1>", { headers: { "content-type": "text/html" } }); return json(job);
    }
    throw new Error(`Unexpected test request: ${method} ${path}`);
  }); vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("member workbench interactions using controlled fixtures", () => {
  it("creates an empty study without generation or quota use, with an empty report prompt", async () => {
    studies = []; jobs = []; charged = 0; show("/research");
    await screen.findByText("还没有研究"); fireEvent.change(screen.getByLabelText("研究名称"), { target: { value: "空研究" } }); fireEvent.click(screen.getByRole("button", { name: "创建研究" }));
    await screen.findByRole("heading", { name: "空研究" }); expect((screen.getByPlaceholderText("请输入你想生成的报告内容") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("检索时间") as HTMLSelectElement).value).toBe("30"); expect(screen.getByText(generationWait)).toBeTruthy(); expect(charged).toBe(0); expect(jobs).toHaveLength(0);
  });
  it("confirms an uncertain study creation with its original parameters and operation key", async () => {
    studies = []; jobs = []; let attempts = 0; const requests: RequestInit[] = [];
    hook = (path, options) => {
      if (path !== "/api/research/studies" || options.method !== "POST") return;
      requests.push(options); attempts++;
      return attempts === 1 ? Promise.reject(new TypeError("controlled lost creation response")) : Promise.resolve(json(makeStudy("confirmed-study", "待确认研究")));
    };
    show("/research"); await screen.findByText("还没有研究"); fireEvent.change(screen.getByLabelText("研究名称"), { target: { value: "待确认研究" } }); fireEvent.click(screen.getByRole("button", { name: "创建研究" }));
    await screen.findByRole("button", { name: "检查创建结果" }); expect(attempts).toBe(1); fireEvent.click(screen.getByRole("button", { name: "检查创建结果" }));
    await waitFor(() => expect(attempts).toBe(2)); expect((requests[0].headers as Record<string,string>)["Idempotency-Key"]).toBe((requests[1].headers as Record<string,string>)["Idempotency-Key"]); expect(requests[0].body).toBe(requests[1].body);
  });
  it("adds a report in the same study and preserves both previous reports", async () => {
    show(); await screen.findByText("第二份报告问题"); const field = screen.getByPlaceholderText("请输入你想生成的报告内容");
    expect((field as HTMLTextAreaElement).value).toBe(""); fireEvent.change(field, { target: { value: "新增的研究问题" } }); fireEvent.click(screen.getByRole("button", { name: "生成报告" }));
    await screen.findByText("新增的研究问题"); expect(screen.getByText("第一份报告问题")).toBeTruthy(); expect(screen.getByText("第二份报告问题")).toBeTruthy(); expect(jobs).toHaveLength(3); expect(studies).toHaveLength(2);
  });
  it("reads the chosen report, exposes only available formats and returns to its study", async () => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.click(within(screen.getByTestId("job-j1")).getByRole("button", { name: "查看报告" }));
    await screen.findByRole("heading", { name: "第一份报告问题" }); await screen.findByTitle("当前报告预览");
    expect(screen.getByRole("button", { name: "下载 HTML" })).toBeTruthy(); expect(screen.getByRole("button", { name: "下载 JSON" })).toBeTruthy(); expect(screen.queryByRole("button", { name: "下载 PDF" })).toBeNull();
    expect(screen.getByText("PDF 暂不可用，HTML 仍可阅读和下载。")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "返回本研究的报告与生成记录" }));
    await screen.findByText("第二份报告问题"); expect(screen.getByText("第一份报告问题")).toBeTruthy();
  });
  it("retries a failed generation in the original study without deleting older reports", async () => {
    jobs.push(makeJob("failed", "s1", "失败的问题", 3, "failed")); show(); await screen.findByText("失败的问题"); fireEvent.click(screen.getByRole("button", { name: "重试（计一次生成）" }));
    await waitFor(() => expect(jobs).toHaveLength(4)); expect(studies).toHaveLength(2); expect(jobs[3].studyId).toBe("s1"); expect(screen.getByText("第一份报告问题")).toBeTruthy();
  });
  it("does not auto-resubmit after a lost response and confirms the same key and parameters", async () => {
    loseSubmission = true; show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "需要确认的生成" } }); fireEvent.click(screen.getByRole("button", { name: "生成报告" }));
    await screen.findByRole("button", { name: "检查本次提交结果" }); const posts = () => fetcher.mock.calls.filter(([path, o]) => path.includes("/jobs") && o.method === "POST");
    expect(posts()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "额度详情" }));
    expect(screen.getByRole("region", { name: "生成额度详情" })).toBeTruthy();
    expect((screen.getByPlaceholderText("请输入你想生成的报告内容") as HTMLTextAreaElement).disabled).toBe(true);
    expect(posts()).toHaveLength(1); fireEvent.click(screen.getByRole("button", { name: "检查本次提交结果" })); await screen.findByText("需要确认的生成");
    expect(posts()).toHaveLength(2); expect(posts()[0][1].headers["Idempotency-Key"]).toBe(posts()[1][1].headers["Idempotency-Key"]); expect(posts()[0][1].body).toBe(posts()[1][1].body); expect(jobs).toHaveLength(3); expect(charged).toBe(3);
  });
  it("discards a late response after switching studies, including on the mobile selector", async () => {
    let resolve!: (response: Response) => void; hook = (path) => path.startsWith("/api/research/studies/s1/jobs?") ? new Promise((done) => { resolve = done; }) : undefined;
    show(); await screen.findByRole("button", { name: /研究乙/ }); fireEvent.click(screen.getByRole("button", { name: "我的研究 · 选择研究" }));
    expect(screen.getByRole("button", { name: "我的研究 · 选择研究" }).getAttribute("aria-expanded")).toBe("true"); fireEvent.click(screen.getByRole("button", { name: /研究乙/ }));
    await screen.findByRole("heading", { name: "研究乙" }); resolve(json({ jobs, offset: 0, limit: 20, total: jobs.length })); await waitFor(() => expect(screen.queryByText("第一份报告问题")).toBeNull());
    expect(screen.getByRole("heading", { name: "研究乙" })).toBeTruthy(); expect(fetcher.mock.calls.some(([, o]) => o.method === "POST")).toBe(false);
  });
  it("keeps successful reports when state reads fail and does not call generation", async () => {
    show(); await screen.findByText("第二份报告问题"); failRead = true; fireEvent.click(screen.getByRole("button", { name: "刷新状态" })); await screen.findByRole("button", { name: "恢复读取" });
    expect(screen.getByText("第一份报告问题")).toBeTruthy(); expect(fetcher.mock.calls.some(([, o]) => o.method === "POST")).toBe(false);
  });
  it("explains quota across studies while allowing existing report reading", async () => {
    session.member.daily_generation_limit = 2; show(); await screen.findByText(/今日生成额度不足/); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "测试额度" } });
    expect((screen.getByRole("button", { name: "生成报告" }) as HTMLButtonElement).disabled).toBe(true); expect(screen.getAllByRole("button", { name: "查看报告" })).toHaveLength(2);
    expect(screen.getByText("今日已用 2/2 · 进行中 0/1")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "额度详情" }));
    expect(within(screen.getByRole("region", { name: "生成额度详情" })).getByText(/额度跨本人所有研究合计/)).toBeTruthy();
  });

  it.each([401, 403])("clears reports and drafts on expired or disabled session (%i)", async (status) => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "私有草稿" } });
    sessionStatus = status; fireEvent(window, new Event("focus")); await screen.findByRole("link", { name: "使用 GitHub 登录" });
    expect(screen.queryByText("第一份报告问题")).toBeNull(); expect(screen.queryByDisplayValue("私有草稿")).toBeNull(); expect(screen.queryByRole("heading", { name: "研究甲" })).toBeNull();
  });
  it("clears the previous member when the authenticated identity changes", async () => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "A的草稿" } });
    session = { ...session, member: { ...member, user_id: "member-b", github_id: 22, github_login: "controlled-b" } }; studies = [makeStudy("b1", "B的研究")]; jobs = [];
    fireEvent(window, new Event("focus")); await screen.findByLabelText("账号菜单 @controlled-b"); expect(screen.queryByDisplayValue("A的草稿")).toBeNull(); expect(screen.queryByText("第一份报告问题")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /B的研究/ })); await screen.findByPlaceholderText("请输入你想生成的报告内容"); expect((screen.getByPlaceholderText("请输入你想生成的报告内容") as HTMLTextAreaElement).value).toBe("");
  });
  it("revokes the selected device session and clears private UI on logout", async () => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.click(screen.getByLabelText(/账号菜单 @/)); fireEvent.click(screen.getByRole("button", { name: "退出所有设备" }));
    await screen.findByText("已退出所有设备。"); expect(screen.queryByText("第一份报告问题")).toBeNull(); expect(fetcher.mock.calls.some(([path, o]) => path === "/api/session/logout-all" && o.headers["X-CSRF-Token"] === "controlled-csrf")).toBe(true);
  });
  it("deletes one terminal report only after confirming its scope", async () => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.click(within(screen.getByTestId("job-j1")).getByLabelText("生成记录 #1 更多操作")); fireEvent.click(within(screen.getByTestId("job-j1")).getByRole("button", { name: "删除这份报告" }));
    const dialog = screen.getByRole("dialog", { name: "删除这份报告" }); expect(within(dialog).getByText(/当前研究和其他报告继续保留/)).toBeTruthy(); fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.queryByText("第一份报告问题")).toBeNull()); expect(screen.getByText("第二份报告问题")).toBeTruthy(); expect(studies).toHaveLength(2); expect(charged).toBe(2);
  });
  it("shows report expiry without requesting expired content", async () => {
    jobs[0].reportExpired = true; show("/research?study=s1&job=j1"); await screen.findByText(/报告文件已到期/); expect(fetcher.mock.calls.some(([path]) => path.includes("/report."))).toBe(false); expect(screen.queryByTitle("当前报告预览")).toBeNull();
  });
});
describe("admin workbench safe views", () => {
  it("resolves a stable GitHub identity before allowing admission", async () => {
    session.member.is_admin = true; show(); await screen.findByLabelText(/账号菜单 @/); fireEvent.click(screen.getByLabelText(/账号菜单 @/)); fireEvent.click(screen.getByRole("link", { name: "管理后台" }));
    await screen.findByLabelText("GitHub 用户名"); fireEvent.change(screen.getByLabelText("GitHub 用户名"), { target: { value: "controlled-new" } }); fireEvent.click(screen.getByRole("button", { name: "新增用户" }));
    await screen.findByText(/稳定 GitHub ID 22/); expect(fetcher.mock.calls.some(([path, o]) => path === "/api/admin/members" && o.method === "POST")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "确认开通" })); await waitFor(() => expect(fetcher.mock.calls.some(([path, o]) => path === "/api/admin/members" && o.method === "POST")).toBe(true));
  });
  it("uses safe queue, usage and audit endpoints without requesting member reports", async () => {
    session.member.is_admin = true; show(); await screen.findByText("第二份报告问题"); fireEvent.click(screen.getByLabelText(/账号菜单 @/)); fireEvent.click(screen.getByRole("link", { name: "管理后台" })); await screen.findByLabelText("GitHub 用户名");
    const start = fetcher.mock.calls.length; fireEvent.click(screen.getByRole("button", { name: "生成队列" })); await screen.findByRole("table", { name: "生成队列" }); expect(screen.queryByRole("heading", { name: /第一份报告问题/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "用量统计" })); await screen.findByRole("table", { name: /用量统计/ }); fireEvent.click(screen.getByRole("button", { name: "操作记录" })); await screen.findByText("新建研究");
    expect(fetcher.mock.calls.slice(start).every(([path]) => path.startsWith("/api/admin/"))).toBe(true); expect(fetcher.mock.calls.some(([path]) => path.includes("/report."))).toBe(false); expect(screen.queryByRole("button", { name: /重试/ })).toBeNull();
  });
});

describe("independent management navigation and header account", () => {
  it("puts the only account control in the global header and removes the redundant workspace tabs", async () => {
    session.member.is_admin = true; show(); await screen.findByText("第二份报告问题");
    const trigger = screen.getByLabelText("账号菜单 @controlled-a");
    expect(trigger.closest(".site-header-actions")).toBeTruthy(); expect(document.querySelectorAll(".wb-header-account")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "工作台" })).toBeNull(); expect(screen.queryByText("账号与退出")).toBeNull();
    fireEvent.click(trigger); expect(screen.getByRole("link", { name: "我的研究" })).toBeTruthy(); expect(screen.getByRole("link", { name: "管理后台" })).toBeTruthy();
    fireEvent.keyDown(trigger, { key: "Escape" }); expect(trigger.closest("details")?.open).toBe(false);
  });
  it("shows a compact research summary without the large card or visibility decoration", async () => {
    show(); await screen.findByText("第二份报告问题");
    const summary = screen.getByRole("region", { name: "当前研究概览" });
    expect(summary.classList.contains("wb-card")).toBe(false); expect(screen.queryByText("仅本人可见")).toBeNull();
    expect(within(summary).getByRole("heading", { name: "研究甲" })).toBeTruthy();
    expect(within(summary).getByText(/研究保留至/)).toBeTruthy(); expect(within(summary).getByText(/报告文件逐份到期/)).toBeTruthy();
    expect(within(summary).getByRole("button", { name: "复制链接" })).toBeTruthy(); expect(within(summary).getByRole("button", { name: "删除研究" })).toBeTruthy();
    expect(screen.getByPlaceholderText("请输入你想生成的报告内容")).toBeTruthy(); expect(screen.getByRole("complementary", { name: "我的研究列表" })).toBeTruthy();
  });
  it("requires login for a direct management URL and returns login to that URL", async () => {
    sessionStatus = 401; show("/research/admin");
    const link = await screen.findByRole("link", { name: "使用 GitHub 登录" });
    expect(link.getAttribute("href")).toContain("return_to=%2F%23%2Fresearch%2Fadmin");
    expect(screen.getByRole("heading", { name: "管理后台", level: 1 })).toBeTruthy();
    expect(fetcher.mock.calls.some(([path]) => path.startsWith("/api/admin/"))).toBe(false);
  });
  it("does not show management to members and rejects its direct URL without fetching admin data", async () => {
    show("/research/admin"); await screen.findByText(/当前账号没有管理权限/);
    fireEvent.click(screen.getByLabelText(/账号菜单 @/)); expect(screen.queryByRole("link", { name: "管理后台" })).toBeNull();
    expect(fetcher.mock.calls.some(([path]) => path.startsWith("/api/admin/"))).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "返回我的研究" })); await screen.findByRole("heading", { name: "研究查询", level: 1 });
  });
  it("returns from management to the selected report, retaining its reader and scroll position", async () => {
    session.member.is_admin = true; show("/research?study=s1&job=j1"); await screen.findByTitle("当前报告预览");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 627 });
    fireEvent.click(screen.getByLabelText(/账号菜单 @/)); fireEvent.click(screen.getByRole("link", { name: "管理后台" }));
    await screen.findByRole("heading", { name: "管理后台", level: 1 }); expect(screen.queryByRole("heading", { name: "研究查询", level: 1 })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "返回我的研究" })); await screen.findByRole("heading", { name: "第一份报告问题" });
    await waitFor(() => expect(window.scrollTo).toHaveBeenCalledWith(0, 627));
  });
  it("provides a safe research return when management is opened directly", async () => {
    session.member.is_admin = true; show("/research/admin"); await screen.findByLabelText("GitHub 用户名");
    expect(fetcher.mock.calls.some(([path]) => path.startsWith("/api/research/studies"))).toBe(false);
    fireEvent.click(screen.getByRole("link", { name: "返回我的研究" })); await screen.findByRole("heading", { name: "新建一项研究" });
  });
  it("keeps independent member drafts when saving another row, refreshing or changing category", async () => {
    session.member.is_admin = true;
    adminMembers = [{ ...member }, { ...member, user_id: "member-b", github_id: 22, github_login: "long-controlled-member-name-for-responsive-layout" }];
    show("/research/admin"); await screen.findByTestId("member-row-member-a");
    const a = screen.getByTestId("member-row-member-a"), b = screen.getByTestId("member-row-member-b");
    expect(a.closest("table")).toBe(screen.getByRole("table", { name: "成员与额度" })); expect(b.closest("table")).toBe(a.closest("table"));
    fireEvent.change(within(a).getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "7" } });
    fireEvent.change(within(b).getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "9" } });
    adminMembers.reverse(); fireEvent.click(within(b).getByRole("button", { name: "保存上限" }));
    await waitFor(() => expect(adminMembers.find((m) => m.user_id === "member-b")?.daily_generation_limit).toBe(9));
    await waitFor(() => expect((within(screen.getByTestId("member-row-member-a")).getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("7"));
    fireEvent.click(screen.getByRole("button", { name: "刷新" })); await screen.findByTestId("member-row-member-b");
    expect((within(screen.getByTestId("member-row-member-a")).getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("7");
    fireEvent.click(screen.getByRole("button", { name: "生成队列" })); await screen.findByRole("table", { name: "生成队列" });
    fireEvent.click(screen.getByRole("button", { name: "成员与额度" }));
    expect((within(screen.getByTestId("member-row-member-a")).getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("7");
    expect(fetcher.mock.calls.filter(([path, opts]) => opts.method === "PATCH").map(([path]) => path)).toEqual(["/api/admin/members/member-b"]);
  });
  it("does not request a private session or show account controls in the public build", async () => {
    vi.stubEnv("VITE_WORKBENCH_MODE", ""); show("/research"); await screen.findByText("工作台入口尚未配置，请联系管理员。");
    expect(fetcher.mock.calls.some(([path]) => path === "/api/session")).toBe(false); expect(screen.queryByLabelText(/账号菜单 @/)).toBeNull();
  });
});

describe("automatic session checks and failure-only retry", () => {
  const checks = () => fetcher.mock.calls.filter(([path]) => path === "/api/session").length;
  it("shows only the GitHub action after a normal anonymous result", async () => {
    sessionStatus = 401; show("/research"); await screen.findByRole("link", { name: "使用 GitHub 登录" });
    const gate = screen.getByRole("region", { name: "研究查询" });
    expect(within(gate).queryByRole("button")).toBeNull(); expect(within(gate).getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("重新检查登录状态")).toBeNull(); expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
  });
  it("checks automatically on an authenticated return and coalesces focus/visibility/pageshow without losing a draft", async () => {
    show(); await screen.findByText("第二份报告问题");
    fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "正在编辑的草稿" } });
    const before = checks(); let resolve!: (response: Response) => void;
    hook = (path) => path === "/api/session" ? new Promise((done) => { resolve = done; }) : undefined;
    fireEvent(window, new Event("focus")); fireEvent(document, new Event("visibilitychange")); fireEvent(window, new Event("pageshow"));
    await waitFor(() => expect(checks()).toBe(before + 1));
    expect(screen.queryByText("正在确认登录状态…")).toBeNull(); expect(screen.getByDisplayValue("正在编辑的草稿")).toBeTruthy();
    await act(async () => { resolve(json(session)); });
    expect(checks()).toBe(before + 1); expect(screen.getByDisplayValue("正在编辑的草稿")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "使用 GitHub 登录" })).toBeNull();
  });
  it.each(["anonymous", "member"])("explains a network failure safely and removes retry when recovery returns %s", async (result) => {
    hook = (path) => path === "/api/session" ? Promise.reject(new TypeError("raw transport detail token=do-not-display")) : undefined;
    show("/research"); await screen.findByRole("button", { name: "重试" });
    expect(screen.getByText("无法连接登录服务，请检查网络后重试。")).toBeTruthy(); expect(document.body.textContent).not.toContain("do-not-display");
    hook = undefined; sessionStatus = result === "anonymous" ? 401 : 200;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "重试" })).toBeNull());
    expect(screen.queryByText("无法连接登录服务，请检查网络后重试。")).toBeNull();
    if (result === "anonymous") expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeTruthy();
    else await screen.findByLabelText("账号菜单 @controlled-a");
  });
  it("explains service failure without exposing the raw response, and retries automatically into the member view", async () => {
    hook = (path) => path === "/api/session" ? Promise.resolve(json({ detail: { code: "auth_unavailable", message: "raw backend URL token=private" } }, 503)) : undefined;
    show("/research"); await screen.findByRole("button", { name: "重试" });
    expect(screen.getByText("登录服务暂时不可用，请稍后重试。")).toBeTruthy(); expect(document.body.textContent).not.toContain("token=private");
    hook = undefined; fireEvent.click(screen.getByRole("button", { name: "重试" })); await screen.findByLabelText("账号菜单 @controlled-a");
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
  });
  it("keeps an authenticated draft during a temporary check failure and enables actions after retry", async () => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "保留此草稿" } });
    hook = (path) => path === "/api/session" ? Promise.reject(new TypeError("controlled offline")) : undefined;
    fireEvent(window, new Event("focus")); await screen.findByRole("button", { name: "重试" });
    expect(screen.getByDisplayValue("保留此草稿")).toBeTruthy(); expect((screen.getByRole("button", { name: "生成报告" }) as HTMLButtonElement).disabled).toBe(true);
    hook = undefined; fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "重试" })).toBeNull());
    expect(screen.getByDisplayValue("保留此草稿")).toBeTruthy(); expect((screen.getByRole("button", { name: "生成报告" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("automatically discovers a login from another tab without a retry button", async () => {
    sessionStatus = 401; show("/research"); await screen.findByRole("link", { name: "使用 GitHub 登录" });
    sessionStatus = 200; fireEvent(document, new Event("visibilitychange"));
    await screen.findByLabelText("账号菜单 @controlled-a"); await screen.findByRole("button", { name: /研究甲/ });
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
  });
  it.each([
    [403, "member_not_allowed", "GitHub @controlled-a：当前 GitHub 账号尚未开通研究权限，请联系管理员。"],
    [403, "member_disabled", "GitHub @controlled-a：当前账号已停用，请联系管理员。"],
    [401, "session_expired", "登录会话已过期，请重新登录。"],
    [401, "session_revoked", "登录会话已失效，请重新登录。"],
    [401, "oauth_failed", "本次 GitHub 登录未完成，请重新登录。"],
    [503, "github_unavailable", "GitHub 登录暂不可用，请稍后重新登录。"],
  ])("consumes %s/%s once in StrictMode and preserves the notice across ordinary anonymous checks", async (status, code, notice) => {
    let consumed = false;
    hook = (path) => {
      if (path !== "/api/session") return;
      const data = consumed ? { code: "authentication_required" } : { code, github_login: "controlled-a", message: "raw notice token=private" };
      const responseStatus = consumed ? 401 : Number(status); consumed = true;
      return Promise.resolve(json({ detail: data }, responseStatus));
    };
    show("/research", true); await screen.findByText(String(notice)); expect(checks()).toBe(1);
    await act(async () => { fireEvent(window, new Event("focus")); }); expect(checks()).toBe(2);
    expect(screen.getByText(String(notice))).toBeTruthy();
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull(); expect(document.body.textContent).not.toContain("token=private");
  });
  it("treats a malformed anonymous response as a check failure rather than normal logged-out state", async () => {
    hook = (path) => path === "/api/session" ? Promise.resolve(new Response("<html>private diagnostic</html>", { status: 401 })) : undefined;
    show("/research"); await screen.findByRole("button", { name: "重试" });
    expect(screen.getByText("登录状态检查未完成，请重试。")).toBeTruthy(); expect(document.body.textContent).not.toContain("private diagnostic");
    hook = undefined; sessionStatus = 401; fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "重试" })).toBeNull());
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeTruthy();
  });
  it.each([false, true])("does not restore private contents from a check completed after logout (all=%s)", async (all) => {
    show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "退出后应移除的草稿" } });
    let resolve!: (response: Response) => void;
    hook = (path) => path === "/api/session" ? new Promise((done) => { resolve = done; }) : undefined;
    fireEvent(window, new Event("focus")); await waitFor(() => expect(checks()).toBe(2));
    fireEvent.click(screen.getByLabelText(/账号菜单 @/)); fireEvent.click(screen.getByRole("button", { name: all ? "退出所有设备" : "退出当前设备" }));
    const notice = all ? "已退出所有设备。" : "已退出当前设备。"; await screen.findByText(notice);
    await act(async () => { resolve(json(session)); });
    expect(screen.getByText(notice)).toBeTruthy(); expect(screen.queryByText("第一份报告问题")).toBeNull();
    expect(screen.queryByDisplayValue("退出后应移除的草稿")).toBeNull(); expect(screen.queryByLabelText(/账号菜单 @/)).toBeNull();
    hook = undefined; await act(async () => { fireEvent(window, new Event("focus")); }); expect(checks()).toBe(3);
    expect(screen.getByText(notice)).toBeTruthy(); expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
  });

  it("ignores a successful check arriving after a protected request rejects the session", async () => {
    show(); await screen.findByText("第二份报告问题"); let resolve!: (response: Response) => void;
    hook = (path) => path === "/api/session" ? new Promise((done) => { resolve = done; })
      : path.startsWith("/api/research/studies/s1/jobs?") ? Promise.resolve(json({ detail: { code: "session_revoked" } }, 401)) : undefined;
    fireEvent(window, new Event("focus")); await waitFor(() => expect(checks()).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: "刷新状态" })); await screen.findByText("登录会话已失效，请重新登录。");
    await act(async () => { resolve(json(session)); });
    expect(screen.queryByText("第一份报告问题")).toBeNull(); expect(screen.queryByLabelText(/账号菜单 @/)).toBeNull();
    expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeTruthy();
  });
  it("clears private contents when a failed background check outlives the known session expiry", async () => {
    show(); await screen.findByText("第二份报告问题");
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2100-01-01T00:00:00Z"));
    hook = (path) => path === "/api/session" ? Promise.reject(new TypeError("controlled offline")) : undefined;
    fireEvent(window, new Event("focus")); await screen.findByText("登录会话已过期，请重新登录。");
    expect(screen.queryByText("第一份报告问题")).toBeNull(); expect(screen.queryByLabelText(/账号菜单 @/)).toBeNull();
    expect(screen.getByText("无法连接登录服务，请检查网络后重试。")).toBeTruthy();
  });
});


describe("compact generation and research tools", () => {
  it("keeps search and creation accessible without repeated sidebar headings", async () => {
    show(); await screen.findByText("第二份报告问题");
    const sidebar = screen.getByRole("complementary", { name: "我的研究列表" });
    expect(within(sidebar).queryByRole("heading")).toBeNull(); expect(within(sidebar).queryByText("搜索本人研究")).toBeNull();
    const search = within(sidebar).getByRole("searchbox", { name: "搜索本人研究" });
    expect(search.getAttribute("placeholder")).toBe("按研究名称搜索");
    fireEvent.change(search, { target: { value: "研究乙" } });
    await waitFor(() => expect(within(sidebar).queryByRole("button", { name: /研究甲/ })).toBeNull());
    expect(await within(sidebar).findByRole("button", { name: /研究乙/ })).toBeTruthy();
    expect(fetcher.mock.calls.some(([path]) => path.includes("search=%E7%A0%94%E7%A9%B6%E4%B9%99"))).toBe(true);
    fireEvent.click(within(sidebar).getByRole("button", { name: "新建研究" })); await screen.findByRole("heading", { name: "新建一项研究" });
    expect(fetcher.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
    expect(screen.getByRole("button", { name: "我的研究 · 选择研究" })).toBeTruthy();
  });
  it("opens quota details without submitting or changing the draft and preserves validation", async () => {
    show(); await screen.findByText("第二份报告问题");
    const form = screen.getByRole("region", { name: "生成报告" });
    expect(within(form).getByText("今日已用 2/5 · 进行中 0/1")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "生成额度详情" })).toBeNull();
    const field = within(form).getByRole("textbox", { name: "报告内容" });
    fireEvent.change(field, { target: { value: "!!" } });
    expect(field.getAttribute("aria-invalid")).toBe("true"); expect((within(form).getByRole("button", { name: "生成报告" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field, { target: { value: "保留的研究问题" } }); fireEvent.change(within(form).getByLabelText("检索时间"), { target: { value: "90" } });
    const toggle = within(form).getByRole("button", { name: "额度详情" }); fireEvent.click(toggle);
    expect(toggle.getAttribute("type")).toBe("button"); expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const details = screen.getByRole("region", { name: "生成额度详情" });
    expect(within(details).getByText("额度跨本人所有研究合计，创建研究不计入。")).toBeTruthy(); expect(within(details).getByText(/恢复日额度/)).toBeTruthy();
    fireEvent.click(toggle); expect(screen.queryByRole("region", { name: "生成额度详情" })).toBeNull();
    expect((field as HTMLTextAreaElement).value).toBe("保留的研究问题"); expect((within(form).getByLabelText("检索时间") as HTMLSelectElement).value).toBe("90");
    expect(fetcher.mock.calls.some(([, options]) => options.method === "POST")).toBe(false);
    expect(within(form).getByText("报告生成可能需要十几分钟，可关闭页面稍后在本研究查看。")).toBeTruthy();
  });
  it("keeps pending generation disabled while quota details remain operable", async () => {
    let resolve!: (response: Response) => void;
    hook = (path, options) => path === "/api/research/studies/s1/jobs" && options.method === "POST" ? new Promise((done) => { resolve = done; }) : undefined;
    show(); await screen.findByText("第二份报告问题"); fireEvent.change(screen.getByPlaceholderText("请输入你想生成的报告内容"), { target: { value: "延迟返回的生成" } });
    fireEvent.click(screen.getByRole("button", { name: "生成报告" })); await screen.findByRole("button", { name: "正在提交…" });
    expect((screen.getByRole("button", { name: "正在提交…" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("检索时间") as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "额度详情" })); expect(screen.getByRole("region", { name: "生成额度详情" })).toBeTruthy();
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    const job = makeJob("j3", "s1", "延迟返回的生成", 3); jobs.push(job); charged++;
    await act(async () => { resolve(json(job)); }); await screen.findByText("今日已用 3/5 · 进行中 0/1");
    expect(screen.getByText("第一份报告问题")).toBeTruthy(); expect(screen.getByText("第二份报告问题")).toBeTruthy();
  });
  it("does not invent zero usage when the quota read fails", async () => {
    hook = (path) => path === "/api/research/usage" ? Promise.reject(new TypeError("controlled usage outage")) : undefined;
    show(); await screen.findByText("用量暂不可用，提交时核验"); expect(screen.queryByText(/今日已用 0/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "额度详情" }));
    expect(within(screen.getByRole("region", { name: "生成额度详情" })).getByText("暂时无法读取用量，提交时仍由服务端检查额度。")).toBeTruthy();
  });
});


describe("compact report cards and factual quality", () => {
  it("keeps stable generation numbers, concise dates and no search-range or generic quality warning in the list", async () => {
    jobs[0].number = 7; jobs[1].number = 42; show(); await screen.findByText("第二份报告问题");
    const history = screen.getByRole("region", { name: "报告与生成记录" }), card = within(history).getByTestId("job-j1");
    expect(within(card).getByText("#7")).toBeTruthy(); expect(within(history).getByText("#42")).toBeTruthy();
    expect(within(card).queryByText(/生成记录 7/)).toBeNull(); expect(card.textContent).not.toContain("最近 30 天");
    expect(card.textContent).not.toMatch(/待核查|需进一步核查/); expect(within(card).getByText("已生成")).toBeTruthy();
    expect(within(card).getByText("2026/11/28 08:01")).toBeTruthy(); expect(within(card).getByText("2027/02/28")).toBeTruthy();
    expect(card.textContent).not.toContain("08:01:00"); expect(within(card).getByRole("button", { name: "删除这份报告" }).closest("details")?.open).toBe(false);
    expect(within(history).getByRole("button", { name: "刷新状态" })).toBeTruthy();
  });
  it("scopes each more menu and confirmation to its own record after the list changes order", async () => {
    show(); await screen.findByText("第二份报告问题");
    const first = screen.getByLabelText("生成记录 #1 更多操作"), second = screen.getByLabelText("生成记录 #2 更多操作");
    fireEvent.click(first); expect(first.closest("details")?.open).toBe(true);
    fireEvent.pointerDown(second); fireEvent.click(second); expect(first.closest("details")?.open).toBe(false);
    fireEvent.keyDown(second, { key: "Escape" }); expect(second.closest("details")?.open).toBe(false);
    jobs.reverse(); fireEvent.click(screen.getByRole("button", { name: "刷新状态" })); await waitFor(() => expect(screen.getAllByRole("button", { name: "查看报告" })).toHaveLength(2));
    fireEvent.click(screen.getByLabelText("生成记录 #1 更多操作")); fireEvent.click(within(screen.getByTestId("job-j1")).getByRole("button", { name: "删除这份报告" }));
    const dialog = screen.getByRole("dialog", { name: "删除这份报告" }); fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
    await waitFor(() => expect(screen.queryByText("第一份报告问题")).toBeNull()); expect(screen.getByText("第二份报告问题")).toBeTruthy(); expect(studies).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "DELETE").map(([path]) => path)).toEqual(["/api/research/studies/s1/jobs/j1"]);
  });
  it("shows a producer revision and evidence shortage separately from generation success, then reads actual historical scope and reasons", async () => {
    const original = jobs[0];
    const raw = { ...original, reviewStatus: "needs_revision", synthesisStatus: "insufficient_evidence" };
    hook = (path) => path.startsWith("/api/research/studies/s1/jobs?") ? Promise.resolve(json({ jobs: [raw, jobs[1]], offset: 0, limit: 20, total: 2 }))
      : path === "/api/research/studies/s1/jobs/j1" ? Promise.resolve(json(raw))
      : path.endsWith("/j1/report.json") ? Promise.resolve(json({ coverage: { startDate: "2020-01-02", endDate: "2020-02-01" }, review: { status: "needs_revision", issues: [{ claim: "受控表述", reason: "来源未提供相应测试条件", sourceIds: ["source-A"] }] }, synthesisStatus: "insufficient_evidence" })) : undefined;
    show(); await screen.findByText("第二份报告问题"); const card = screen.getByTestId("job-j1");
    expect(within(card).getByText("已生成")).toBeTruthy(); expect(within(card).getByText("需修订")).toBeTruthy(); expect(within(card).getByText("证据不足")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "查看报告" })); await screen.findByTitle("当前报告预览");
    await screen.findByText("来源未提供相应测试条件"); expect(screen.getByText("资料检索范围")).toBeTruthy(); expect(screen.getByText(/本次选择：最近 30 天/)).toBeTruthy();
    expect(screen.getByText("2020-01-02")).toBeTruthy(); expect(screen.getByText("2020-02-01")).toBeTruthy(); expect(screen.getByText("来源编号：source-A")).toBeTruthy();
    expect(screen.getByRole("button", { name: "下载 JSON" })).toBeTruthy(); expect(screen.queryByText("需进一步核查")).toBeNull();
  });
  it("does not present missing quality as approval or invent a reason", async () => {
    jobs[0].reviewStatus = undefined; jobs[0].synthesisStatus = undefined;
    show(); await screen.findByText("第二份报告问题"); const card = screen.getByTestId("job-j1"); expect(within(card).getByText("质量状态未提供")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "查看报告" })); await screen.findByTitle("当前报告预览");
    await screen.findByText("报告未提供具体问题或依据。"); expect(screen.queryByText("审查通过")).toBeNull(); expect(screen.getByRole("button", { name: "下载 HTML" })).toBeTruthy();
  });
  it("keeps HTML readable if optional scope/quality JSON fails and retries only that metadata", async () => {
    hook = (path) => path.endsWith("/report.json") ? Promise.reject(new TypeError("private raw transport")) : undefined;
    show("/research?study=s1&job=j1"); await screen.findByTitle("当前报告预览"); await screen.findByText("暂时无法读取报告中的资料范围与质量说明，正文仍可阅读。");
    const htmlReads = () => fetcher.mock.calls.filter(([path]) => path.endsWith("/report.html")).length; expect(htmlReads()).toBe(1);
    hook = undefined; fireEvent.click(screen.getByRole("button", { name: "重新读取资料与质量说明" })); await screen.findByText("2026-10-29");
    expect(htmlReads()).toBe(1); expect(screen.getByTitle("当前报告预览")).toBeTruthy(); expect(document.body.textContent).not.toContain("private raw transport");
  });
});


describe("compact member table and row-owned operations", () => {
  function members() {
    session.member.is_admin = true;
    adminMembers = [{ ...member, is_admin: true }, { ...member, user_id: "member-b", github_id: 22, github_login: "controlled-long-member-name-123456789" }];
    show("/research/admin");
  }
  it("uses six clear columns with independent role and real membership state, without the removed explanation", async () => {
    members(); await screen.findByTestId("member-row-member-a");
    const table = screen.getByRole("table", { name: "成员与额度" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["用户名", "身份", "状态", "每日生成上限", "未完成任务上限", "操作"]);
    expect(within(screen.getByTestId("member-row-member-a")).getByText("管理员")).toBeTruthy();
    expect(within(screen.getByTestId("member-row-member-b")).getByText("成员", { exact: true })).toBeTruthy();
    expect(within(screen.getByTestId("member-row-member-b")).getByText("已开通")).toBeTruthy();
    expect(screen.queryByText("跨该成员所有研究合计；日额度为 0 时仍可阅读历史，降低额度不取消已接收生成。")).toBeNull();
    expect(screen.getByRole("region", { name: "成员列表，可横向滚动" }).tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "新增用户" })).toBeTruthy();
  });
  it("saves two stable row targets independently and retains another edit when a slower save finishes", async () => {
    let resolve!: (response: Response) => void;
    hook = (path, options) => path === "/api/admin/members/member-a" && options.method === "PATCH" ? new Promise((done) => { resolve = done; }) : undefined;
    members(); await screen.findByTestId("member-row-member-a");
    const a = () => within(screen.getByTestId("member-row-member-a")), b = () => within(screen.getByTestId("member-row-member-b"));
    fireEvent.change(a().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "7" } }); fireEvent.click(a().getByRole("button", { name: "保存上限" }));
    await a().findByRole("button", { name: "正在保存…" }); expect((b().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).disabled).toBe(false);
    fireEvent.change(b().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "9" } }); fireEvent.click(b().getByRole("button", { name: "保存上限" }));
    await b().findByText("上限已更新"); fireEvent.change(b().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "11" } });
    adminMembers.find((m) => m.user_id === "member-a")!.daily_generation_limit = 7;
    await act(async () => { resolve(json({ member: adminMembers.find((m) => m.user_id === "member-a") })); }); await a().findByText("上限已更新");
    expect((a().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("7"); expect((b().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("11");
    expect(b().getByText("未保存")).toBeTruthy(); expect(b().queryByText("上限已更新")).toBeNull();
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "PATCH").map(([path, options]) => [path, JSON.parse(String(options.body)).daily_generation_limit])).toEqual([["/api/admin/members/member-a", 7], ["/api/admin/members/member-b", 9]]);
  });
  it("keeps an uncertain save error in its own row and preserves other drafts through refresh or temporary pagination removal", async () => {
    members(); await screen.findByTestId("member-row-member-a");
    const a = () => within(screen.getByTestId("member-row-member-a")), b = () => within(screen.getByTestId("member-row-member-b"));
    fireEvent.change(a().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "7" } }); fireEvent.change(b().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "9" } });
    hook = (path, options) => path === "/api/admin/members/member-a" && options.method === "PATCH" ? Promise.reject(new TypeError("controlled response loss")) : undefined;
    fireEvent.click(a().getByRole("button", { name: "保存上限" })); await a().findByText("保存结果待确认，请刷新核对。");
    expect(b().queryByRole("alert")).toBeNull(); expect((b().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("9");
    const other = adminMembers.pop()!; fireEvent.click(screen.getByRole("button", { name: "刷新" })); await waitFor(() => expect(screen.queryByTestId("member-row-member-b")).toBeNull());
    adminMembers.push(other); fireEvent.click(screen.getByRole("button", { name: "刷新" })); await screen.findByTestId("member-row-member-b");
    expect((b().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("9"); expect((a().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("7");
  });
  it("confirms status changes for the chosen member and locates a failure in that row without erasing quota drafts", async () => {
    members(); await screen.findByTestId("member-row-member-a");
    const a = () => within(screen.getByTestId("member-row-member-a")), b = () => within(screen.getByTestId("member-row-member-b"));
    fireEvent.change(a().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "8" } });
    fireEvent.click(b().getByRole("button", { name: "停用成员" }));
    let dialog = screen.getByRole("dialog", { name: "停用成员" }); expect(within(dialog).getByText(/GitHub ID 22/)).toBeTruthy();
    expect(fetcher.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false); fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
    fireEvent.click(b().getByRole("button", { name: "停用成员" })); dialog = screen.getByRole("dialog", { name: "停用成员" }); fireEvent.click(within(dialog).getByRole("button", { name: "确认" }));
    await b().findByText("成员已停用"); expect(b().getByText("已停用", { exact: true })).toBeTruthy();
    hook = (path, options) => path === "/api/admin/members/member-b" && options.method === "PATCH" ? Promise.resolve(json({ detail: { code: "controlled_conflict", message: "受控启用失败，请刷新后重试。" } }, 409)) : undefined;
    fireEvent.click(b().getByRole("button", { name: "重新启用" })); fireEvent.click(within(screen.getByRole("dialog", { name: "重新启用成员" })).getByRole("button", { name: "确认" }));
    await b().findByText("受控启用失败，请刷新后重试。"); expect(screen.queryByRole("dialog")).toBeNull(); expect(a().queryByRole("alert")).toBeNull();
    expect((a().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("8");
    hook = undefined; fireEvent.click(b().getByRole("button", { name: "重新启用" })); fireEvent.click(within(screen.getByRole("dialog", { name: "重新启用成员" })).getByRole("button", { name: "确认" }));
    await b().findByText("成员已重新启用"); expect(b().getByText("已开通")).toBeTruthy(); expect((a().getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("8");
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "PATCH").every(([path]) => path === "/api/admin/members/member-b")).toBe(true);
  });
});


describe("approved management tables and confirmed limits", () => {
  async function management() { session.member.is_admin = true; adminMembers = [{ ...member }, { ...member, user_id: "member-b", github_id: 22, github_login: "controlled-b" }]; show("/research/admin"); await screen.findByTestId("member-row-member-a"); }
  it("disables unchanged rows and preserves the other limit when only one changes", async () => {
    await management(); const row = within(screen.getByTestId("member-row-member-a"));
    expect((row.getByRole("button", { name: "保存上限" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(row.getByRole("button", { name: "保存上限" }).closest("form")!);
    expect(fetcher.mock.calls.some(([, options]) => options.method === "PATCH")).toBe(false);
    fireEvent.change(row.getByRole("spinbutton", { name: /未完成任务上限/ }), { target: { value: "2" } }); fireEvent.click(row.getByRole("button", { name: "保存上限" }));
    await row.findByText("上限已更新");
    const writes = fetcher.mock.calls.filter(([, options]) => options.method === "PATCH");
    expect(JSON.parse(String(writes[0][1].body))).toEqual({ daily_generation_limit: 5, active_job_limit: 2 }); expect(charged).toBe(2);
    expect((row.getByRole("button", { name: "保存上限" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("adopts both limits confirmed by the backend, without replacing another member's draft", async () => {
    await management(); const a = within(screen.getByTestId("member-row-member-a")), b = within(screen.getByTestId("member-row-member-b"));
    fireEvent.change(b.getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "11" } });
    hook = (path, options) => {
      if (path === "/api/admin/members/member-a" && options.method === "PATCH") { Object.assign(adminMembers[0], { daily_generation_limit: 8, active_job_limit: 3 }); return Promise.resolve(json({ member: adminMembers[0] })); }
    };
    fireEvent.change(a.getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "7" } }); fireEvent.click(a.getByRole("button", { name: "保存上限" })); await a.findByText("上限已更新");
    expect((a.getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("8"); expect((a.getByRole("spinbutton", { name: /未完成任务上限/ }) as HTMLInputElement).value).toBe("3");
    expect((b.getByRole("spinbutton", { name: /每日生成上限/ }) as HTMLInputElement).value).toBe("11"); expect(b.getByText("未保存")).toBeTruthy();
  });
  it("requires a read after an uncertain write and never silently resends", async () => {
    await management(); const a = () => within(screen.getByTestId("member-row-member-a"));
    hook = (path, options) => { if (path === "/api/admin/members/member-a" && options.method === "PATCH") { adminMembers[0].daily_generation_limit = 7; return Promise.reject(new TypeError("controlled timeout")); } };
    fireEvent.change(a().getByRole("spinbutton", { name: /每日生成上限/ }), { target: { value: "7" } }); fireEvent.click(a().getByRole("button", { name: "保存上限" })); await a().findByText("保存结果待确认，请刷新核对。");
    expect((a().getByRole("button", { name: "保存上限" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "刷新" })); await a().findByText("上限已更新"); expect(a().queryByText("未保存")).toBeNull();
    expect(fetcher.mock.calls.filter(([, options]) => options.method === "PATCH")).toHaveLength(1);
  });
  it("shows real queue durations and safe expandable identifiers without private links", async () => {
    await management(); fireEvent.click(screen.getByRole("button", { name: "生成队列" })); const table = await screen.findByRole("table", { name: "生成队列" }); const view = within(table);
    expect(view.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["用户名", "生成编号", "状态", "当前阶段", "提交时间", "等待时长", "运行时长"]);
    expect(view.getByText("@controlled-queue-member")).toBeTruthy(); expect(view.getByText("2分0秒")).toBeTruthy(); expect(view.getByText("8分0秒")).toBeTruthy();
    fireEvent.click(view.getByLabelText("生成 queue-1 的完整元信息")); expect(view.getByText("study-number")).toBeTruthy(); expect(view.queryByRole("link")).toBeNull();
    expect(fetcher.mock.calls.filter(([path]) => path.startsWith("/api/admin/")).every(([path]) => !path.includes("report"))).toBe(true);
  });
  it("keeps historical acceptance date, net charge, and missing counts instead of inventing live totals", async () => {
    await management(); fireEvent.click(screen.getByRole("button", { name: "用量统计" })); await screen.findByRole("table", { name: /用量统计/ });
    hook = (path) => path === "/api/admin/research/usage?day=2026-11-27" ? Promise.resolve(json({ day: "2026-11-27", usage: [{ userId: "member-outside-first-page", githubLogin: "historical-member", day: "2026-11-27", accepted: 4, charged: 3, refunded: 1, succeeded: 2, active: 99 }] })) : undefined;
    fireEvent.change(screen.getByLabelText(/统计日期/), { target: { value: "2026-11-27" } }); const table = await screen.findByRole("table", { name: "用量统计 2026-11-27" });
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["4", "3", "1", "2", "未提供"]);
    expect(within(table).getByText("@historical-member")).toBeTruthy(); expect(within(table).queryByText("99")).toBeNull(); expect(screen.queryByText(/实际模型资源消耗/)).toBeNull();
    expect(screen.getByText("2026-11-27 受理的任务 · 北京时间")).toBeTruthy();
  });
  it("discards a previous day's late response and shows no fabricated members on an empty day", async () => {
    await management(); let release!: (response: Response) => void;
    hook = (path) => path === "/api/admin/research/usage?day=2026-11-27" ? new Promise((done) => { release = done; }) : path === "/api/admin/research/usage?day=2026-11-26" ? Promise.resolve(json({ day: "2026-11-26", usage: [] })) : undefined;
    fireEvent.click(screen.getByRole("button", { name: "用量统计" })); await screen.findByRole("table", { name: /用量统计/ });
    fireEvent.change(screen.getByLabelText(/统计日期/), { target: { value: "2026-11-27" } }); await waitFor(() => expect(release).toBeTypeOf("function"));
    fireEvent.change(screen.getByLabelText(/统计日期/), { target: { value: "2026-11-26" } }); await screen.findByText("该日没有生成用量");
    await act(async () => { release(json({ day: "2026-11-27", usage: [{ userId: "late-account", accepted: 1 }] })); });
    expect(screen.queryByText(/late-account/)).toBeNull(); expect(screen.getByText("2026-11-26 受理的任务 · 北京时间")).toBeTruthy();
  });
  it("distinguishes actor and target, explains worker failures, and follows the real audit cursor", async () => {
    await management();
    hook = (path) => path === "/api/admin/audit?limit=50&offset=0" ? Promise.resolve(json({ total: 51, next_offset: 50, events: [{ id: "auth-event", action: "member.update", userId: "admin-id", actorGithubLogin: "admin-name", actorType: "member", targetUserId: "member-outside-page", targetGithubLogin: "target-name", createdAt: time, result: "ok" }] }))
      : path === "/api/admin/audit?limit=50&offset=50" ? Promise.resolve(json({ total: 51, next_offset: null, events: [{ id: "research-event", action: "job.fail", userId: "member-outside-page", actorType: "system", targetUserId: "member-outside-page", targetGithubLogin: "target-name", jobId: "job-unique-id", studyId: "study-id", createdAt: time, result: "ok" }] })) : undefined;
    fireEvent.click(screen.getByRole("button", { name: "操作记录" })); let table = await screen.findByRole("table", { name: "操作记录" });
    expect(within(table).getByText("@admin-name")).toBeTruthy(); expect(within(table).getByText("@target-name")).toBeTruthy(); expect(within(table).getByText("更新成员设置")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "加载更多操作记录" })); await within(table).findByText("系统");
    const failedRow = within(table).getByText("报告生成").closest("tr")!; expect(within(failedRow).getAllByText("失败").length).toBeGreaterThan(0); expect(within(failedRow).queryByText("已完成")).toBeNull(); expect(within(failedRow).queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button", { name: "加载更多操作记录" })).toBeNull();
  });
  it("clears all management data when a protected response revokes admin permission", async () => {
    await management(); hook = (path) => path.startsWith("/api/admin/members?") ? Promise.resolve(json({ detail: { code: "admin_required", message: "此操作需要管理员权限。" } }, 403)) : undefined;
    fireEvent.click(screen.getByRole("button", { name: "刷新" })); await screen.findByText("当前账号没有管理权限，请重新登录后核对。");
    expect(screen.queryByRole("table")).toBeNull(); expect(screen.queryByRole("spinbutton")).toBeNull(); expect(screen.getByRole("link", { name: "使用 GitHub 登录" })).toBeTruthy();
  });
});

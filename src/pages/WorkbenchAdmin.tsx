import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, type WorkbenchApi, type Member, type MemberResolution, type QueueItem, type Usage, type AuditItem } from "./workbench-api";
import { ConfirmDialog, Notice, dateText } from "./workbench-ui";
type Tab = "members" | "queue" | "usage" | "audit";
const titles: Record<Tab, string> = { members: "成员与额度", queue: "生成队列", usage: "用量", audit: "操作记录" };
export default function WorkbenchAdmin({ api, available }: { api: WorkbenchApi; available: boolean }) {
  const [tab, setTab] = useState<Tab>("members"), [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<Member[]>([]), [queue, setQueue] = useState<QueueItem[]>([]);
  const [usage, setUsage] = useState<{ userId: string; usage: Usage }[]>([]), [audit, setAudit] = useState<AuditItem[]>([]);
  const [login, setLogin] = useState(""), [resolution, setResolution] = useState<MemberResolution>(), [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<Member>();
  const [memberOffset, setMemberOffset] = useState<number>(), [queueTotal, setQueueTotal] = useState(0);
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    const request = tab === "members" ? api.members(0, controller.signal).then((page) => { setMembers(page.items); setMemberOffset(page.nextOffset); })
      : tab === "queue" ? api.queue(0, controller.signal).then((page) => { setQueue(page.items); setQueueTotal(page.total); })
      : tab === "usage" ? api.adminUsage(controller.signal).then(setUsage) : api.audit(controller.signal).then(setAudit);
    request.catch((error) => { if (!controller.signal.aborted) setError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort();
  }, [api, tab, revision]);
  async function mutate(action: () => Promise<unknown>) {
    if (busy || !available) return; setBusy(true); setError("");
    try { await action(); if (alive.current) { setToggle(undefined); setResolution(undefined); setRevision((v) => v + 1); } }
    catch (error) { if (alive.current) setError(errorMessage(error)); } finally { if (alive.current) setBusy(false); }
  }
  async function more() {
    if (busy) return; setBusy(true); setError("");
    try {
      if (tab === "members" && memberOffset !== undefined) { const page = await api.members(memberOffset); if (alive.current) { setMembers((old) => [...old, ...page.items]); setMemberOffset(page.nextOffset); } }
      if (tab === "queue") { const page = await api.queue(queue.length); if (alive.current) { setQueue((old) => [...old, ...page.items]); setQueueTotal(page.total); } }
    } catch (error) { if (alive.current) setError(errorMessage(error)); } finally { if (alive.current) setBusy(false); }
  }
  async function resolve(e: FormEvent) {
    e.preventDefault(); if (!login.trim() || busy) return; setBusy(true); setError(""); setResolution(undefined);
    try { const result = await api.resolveMember(login.trim()); if (alive.current) setResolution(result); }
    catch (error) { if (alive.current) setError(errorMessage(error)); } finally { if (alive.current) setBusy(false); }
  }
  return <section className="wb-card wb-admin"><h2>工作台管理</h2><p className="wb-muted">管理成员资格、生成次数和运行状态。管理权限不授予阅读成员研究或报告的权限。</p>
    <nav className="wb-tabs" aria-label="管理分类">{(Object.keys(titles) as Tab[]).map((key) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{titles[key]}</button>)}</nav>
    <div className="wb-section-heading"><h3>{titles[tab]}</h3><button onClick={() => setRevision((v) => v + 1)}>刷新管理数据</button></div>
    {error && <Notice error>{error}{tab === "audit" && <p>操作记录接口尚不可用时，不用成员正文或其他数据代替。</p>}</Notice>}
    {loading ? <Notice>正在读取{titles[tab]}…</Notice> : tab === "members" ? <>
      <form className="wb-inline-form" onSubmit={resolve}><label>GitHub 用户名<input value={login} onChange={(e) => { setLogin(e.target.value); setResolution(undefined); }} required maxLength={100} placeholder="输入用户名，先核对身份" /></label><button disabled={!available || busy || !login.trim()}>核对 GitHub 身份</button></form>
      {resolution && <aside className="wb-notice"><p>核对结果：@{resolution.github_login} · 稳定 GitHub ID {resolution.github_id}</p><p>请确认这是要邀请的成员。保存后自行发送工作台地址。</p><button className="wb-primary" disabled={!available || busy} onClick={() => void mutate(() => api.admit(resolution.confirmation_token))}>确认开通</button></aside>}
      {!members.length && !error && <p className="wb-empty">尚无成员记录</p>}<ul className="wb-admin-list">{members.map((member) => <li key={member.user_id}><div className="wb-section-heading"><div><strong>@{member.github_login}</strong><p className="wb-meta">GitHub ID {member.github_id} · {member.status === "disabled" ? "已停用" : member.last_login_at == null ? "待首次登录" : "已开通"}{member.is_admin ? " · 管理员" : ""}</p></div><button className="wb-danger-text" disabled={!available || busy} onClick={() => setToggle(member)}>{member.status === "disabled" ? "重新启用" : "停用成员"}</button></div>
        <MemberLimits key={`${member.user_id}-${member.daily_generation_limit}-${member.active_job_limit}`} member={member} disabled={!available || busy} onSave={(daily, active) => void mutate(() => api.updateMember(member.user_id, { daily_generation_limit: daily, active_job_limit: active }))} /></li>)}</ul>{memberOffset !== undefined && <button disabled={busy} onClick={() => void more()}>加载更多成员</button>}
    </> : tab === "queue" ? <>
      {!queue.length && !error && <p className="wb-empty">当前没有排队或运行的生成</p>}<ul className="wb-admin-list">{queue.map((item) => <li key={item.id}><dl className="wb-metadata"><div><dt>生成编号</dt><dd>{item.id}</dd></div><div><dt>研究编号</dt><dd>{item.studyId}</dd></div><div><dt>成员编号</dt><dd>{item.ownerUserId}</dd></div><div><dt>运行状态</dt><dd>{item.status === "queued" ? "排队中" : "运行中"} · {item.stage ? ({searching:"检索资料",synthesizing:"综合分析",reviewing:"审查",revising:"修订",rendering:"生成文件"} as Record<string,string>)[item.stage] || "处理中" : "尚无阶段"}</dd></div><div><dt>提交时刻</dt><dd>{dateText(item.createdAt)}</dd></div></dl></li>)}</ul>{queue.length < queueTotal && <button disabled={busy} onClick={() => void more()}>加载更多队列</button>}
    </> : tab === "usage" ? <>
      {!usage.length && !error && <p className="wb-empty">当前没有用量记录</p>}<ul className="wb-admin-list">{usage.map((item) => <li key={item.userId}><strong>成员 {item.userId}</strong><p>今日接受 {item.usage.accepted} 次 · 计量 {item.usage.charged} 次 · 退额 {item.usage.refunded} 次</p><p>成功 {item.usage.succeeded} · 失败 {item.usage.failed} · 未结束 {item.usage.active}</p><p className="wb-meta">实际模型资源消耗尚未提供。</p></li>)}</ul>
    </> : <>
      {!audit.length && !error && <p className="wb-empty">当前没有操作记录</p>}<ul className="wb-admin-list">{audit.map((item, index) => <li key={item.id || index}><strong>{item.action}</strong><p className="wb-meta">{dateText(item.createdAt)} · 成员编号 {item.userId || "未提供"} · {item.result || "结果未提供"}</p>{item.studyId && <p>研究编号 {item.studyId}</p>}{item.jobId && <p>生成编号 {item.jobId}</p>}</li>)}</ul>
    </>}
    {toggle && <ConfirmDialog title={toggle.status === "disabled" ? "重新启用成员" : "停用成员"} busy={busy} onCancel={() => setToggle(undefined)} onConfirm={() => void mutate(() => api.updateMember(toggle.user_id, { status: toggle.status === "disabled" ? "active" : "disabled" }))}>
      <p>@{toggle.github_login}（GitHub ID {toggle.github_id}）</p><p>{toggle.status === "disabled" ? "重新启用后须重新登录。原研究和用量按保留规则继续，旧会话不会恢复。" : "保存后撤销该成员所有会话并拒绝新的研究访问。停用不会把其研究转交管理员。"}</p>
    </ConfirmDialog>}
  </section>;
}
function MemberLimits({ member, disabled, onSave }: { member: Member; disabled: boolean; onSave: (daily: number, active: number) => void }) {
  const [daily, setDaily] = useState(String(member.daily_generation_limit)), [active, setActive] = useState(String(member.active_job_limit));
  const valid = /^\d+$/.test(daily) && /^\d+$/.test(active) && +daily <= 100000 && +active >= 1 && +active <= 100;
  return <form className="wb-limits" onSubmit={(e) => { e.preventDefault(); if (valid && !disabled) onSave(+daily, +active); }}>
    <label>每日报告生成次数<input type="number" min={0} max={100000} step={1} value={daily} onChange={(e) => setDaily(e.target.value)} required /></label>
    <label>同时未结束的生成数<input type="number" min={1} max={100} step={1} value={active} onChange={(e) => setActive(e.target.value)} required /></label>
    <button disabled={disabled || !valid}>保存额度</button><p className="wb-meta">跨该成员所有研究合计；日额度为 0 时仍可阅读历史，降低额度不取消已接收生成。</p>
  </form>;
}

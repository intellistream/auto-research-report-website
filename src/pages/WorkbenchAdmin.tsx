import { useEffect, useRef, useState, type FormEvent } from "react";
import { WorkbenchError, errorMessage, type WorkbenchApi, type Member, type MemberResolution, type QueueItem, type Usage, type AuditItem } from "./workbench-api";
import { ConfirmDialog, Notice, dateText } from "./workbench-ui";
type MemberDraft = { daily: string; active: string; baselineDaily: number; baselineActive: number };
type MemberResult = { error: boolean; message: string };
type MemberAction = "quota" | "status";
type Tab = "members" | "queue" | "usage" | "audit";
const titles: Record<Tab, string> = { members: "成员与额度", queue: "生成队列", usage: "用量", audit: "操作记录" };
export default function WorkbenchAdmin({ api, available }: { api: WorkbenchApi; available: boolean }) {
  const [tab, setTab] = useState<Tab>("members"), [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<Member[]>([]), [queue, setQueue] = useState<QueueItem[]>([]);
  const [usage, setUsage] = useState<{ userId: string; usage: Usage }[]>([]), [audit, setAudit] = useState<AuditItem[]>([]);
  const [login, setLogin] = useState(""), [resolution, setResolution] = useState<MemberResolution>(), [busy, setBusy] = useState(false);
  const [toggle, setToggle] = useState<Member>();
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [memberActions, setMemberActions] = useState<Record<string, MemberAction | undefined>>({});
  const [memberResults, setMemberResults] = useState<Record<string, MemberResult | undefined>>({});
  const memberPending = useRef(new Set<string>());
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
  useEffect(() => {
    // Drafts are keyed by identity and survive refresh, reordering and pagination.
    setMemberDrafts((old) => {
      let next = old;
      for (const member of members) {
        const draft = old[member.user_id];
        if (!draft || (draft.baselineDaily === member.daily_generation_limit && draft.baselineActive === member.active_job_limit)) continue;
        if (next === old) next = { ...old };
        next[member.user_id] = {
          daily: draft.daily === String(draft.baselineDaily) ? String(member.daily_generation_limit) : draft.daily,
          active: draft.active === String(draft.baselineActive) ? String(member.active_job_limit) : draft.active,
          baselineDaily: member.daily_generation_limit, baselineActive: member.active_job_limit,
        };
      }
      return next;
    });
  }, [members]);
  function editMember(member: Member, patch: Partial<Pick<MemberDraft, "daily" | "active">>) {
    setMemberDrafts((old) => ({ ...old, [member.user_id]: { ...(old[member.user_id] ?? { daily: String(member.daily_generation_limit), active: String(member.active_job_limit), baselineDaily: member.daily_generation_limit, baselineActive: member.active_job_limit }), ...patch } }));
    setMemberResults((old) => ({ ...old, [member.user_id]: undefined }));
  }
  async function updateMember(id: string, patch: { status?: string; daily_generation_limit?: number; active_job_limit?: number }, action: MemberAction) {
    if (!available || busy || memberPending.current.has(id)) return;
    memberPending.current.add(id); setMemberActions((old) => ({ ...old, [id]: action })); setMemberResults((old) => ({ ...old, [id]: undefined }));
    try {
      await api.updateMember(id, patch);
      if (!alive.current) return;
      setMembers((old) => old.map((member) => member.user_id === id ? { ...member, ...patch } : member));
      if (action === "quota") setMemberDrafts((old) => ({ ...old, [id]: { daily: String(patch.daily_generation_limit), active: String(patch.active_job_limit), baselineDaily: patch.daily_generation_limit!, baselineActive: patch.active_job_limit! } }));
      setMemberResults((old) => ({ ...old, [id]: { error: false, message: action === "quota" ? "额度已保存" : patch.status === "disabled" ? "成员已停用" : "成员已重新启用" } }));
      setRevision((value) => value + 1);
    } catch (error) {
      if (alive.current) setMemberResults((old) => ({ ...old, [id]: { error: true, message: error instanceof WorkbenchError && error.uncertain ? "保存结果尚未确认，请刷新成员列表核对后再操作。" : errorMessage(error) } }));
    } finally {
      memberPending.current.delete(id); if (alive.current) setMemberActions((old) => ({ ...old, [id]: undefined }));
    }
  }
  async function mutate(action: () => Promise<unknown>) {
    if (busy || !available) return; setBusy(true); setError("");
    try { await action(); if (alive.current) { setResolution(undefined); setRevision((v) => v + 1); } }
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
    {loading && <Notice>正在读取{titles[tab]}…</Notice>}
    <div hidden={tab !== "members"}>
      <form className="wb-inline-form" onSubmit={resolve}><label>GitHub 用户名<input value={login} onChange={(e) => { setLogin(e.target.value); setResolution(undefined); }} required maxLength={100} placeholder="输入用户名，先核对身份" /></label><button disabled={!available || busy || !login.trim()}>新增用户</button></form>
      {resolution && <aside className="wb-notice"><p>核对结果：@{resolution.github_login} · 稳定 GitHub ID {resolution.github_id}</p><p>请确认这是要邀请的成员。保存后自行发送工作台地址。</p><button className="wb-primary" disabled={!available || busy} onClick={() => void mutate(() => api.admit(resolution.confirmation_token))}>确认开通</button></aside>}
      {!members.length && !loading && !error && <p className="wb-empty">尚无成员记录</p>}
      {members.length > 0 && <div className="wb-members-scroll" role="region" aria-label="成员列表，可横向滚动" tabIndex={0}>
        <table className="wb-member-table" aria-label="成员与额度"><colgroup><col className="wb-member-user-col" /><col className="wb-member-role-col" /><col className="wb-member-state-col" /><col className="wb-member-daily-col" /><col className="wb-member-active-col" /><col className="wb-member-actions-col" /></colgroup>
          <thead><tr><th scope="col">用户名</th><th scope="col">身份</th><th scope="col">状态</th><th scope="col" id="wb-member-column-daily">每日报告上限</th><th scope="col" id="wb-member-column-active">同时未完成上限</th><th scope="col">操作</th></tr></thead>
          <tbody>{members.map((member) => <MemberRow key={member.user_id} member={member} draft={memberDrafts[member.user_id]} disabled={!available || busy || !!memberActions[member.user_id]} action={memberActions[member.user_id]} result={memberResults[member.user_id]}
            onDraft={(patch) => editMember(member, patch)} onSave={(daily, active) => void updateMember(member.user_id, { daily_generation_limit: daily, active_job_limit: active }, "quota")} onToggle={() => setToggle(member)} />)}</tbody>
        </table>
      </div>}
      {memberOffset !== undefined && <button disabled={busy} onClick={() => void more()}>加载更多成员</button>}
    </div>
    {tab === "members" ? null : tab === "queue" ? <>
      {!queue.length && !loading && !error && <p className="wb-empty">当前没有排队或运行的生成</p>}<ul className="wb-admin-list">{queue.map((item) => <li key={item.id}><dl className="wb-metadata"><div><dt>生成编号</dt><dd>{item.id}</dd></div><div><dt>研究编号</dt><dd>{item.studyId}</dd></div><div><dt>成员编号</dt><dd>{item.ownerUserId}</dd></div><div><dt>运行状态</dt><dd>{item.status === "queued" ? "排队中" : "运行中"} · {item.stage ? ({searching:"检索资料",synthesizing:"综合分析",reviewing:"审查",revising:"修订",rendering:"生成文件"} as Record<string,string>)[item.stage] || "处理中" : "尚无阶段"}</dd></div><div><dt>提交时刻</dt><dd>{dateText(item.createdAt)}</dd></div></dl></li>)}</ul>{queue.length < queueTotal && <button disabled={busy} onClick={() => void more()}>加载更多队列</button>}
    </> : tab === "usage" ? <>
      {!usage.length && !loading && !error && <p className="wb-empty">当前没有用量记录</p>}<ul className="wb-admin-list">{usage.map((item) => <li key={item.userId}><strong>成员 {item.userId}</strong><p>今日接受 {item.usage.accepted} 次 · 计量 {item.usage.charged} 次 · 退额 {item.usage.refunded} 次</p><p>成功 {item.usage.succeeded} · 失败 {item.usage.failed} · 未结束 {item.usage.active}</p><p className="wb-meta">实际模型资源消耗尚未提供。</p></li>)}</ul>
    </> : <>
      {!audit.length && !loading && !error && <p className="wb-empty">当前没有操作记录</p>}<ul className="wb-admin-list">{audit.map((item, index) => <li key={item.id || index}><strong>{item.action}</strong><p className="wb-meta">{dateText(item.createdAt)} · 成员编号 {item.userId || "未提供"} · {item.result || "结果未提供"}</p>{item.studyId && <p>研究编号 {item.studyId}</p>}{item.jobId && <p>生成编号 {item.jobId}</p>}</li>)}</ul>
    </>}
    {toggle && <ConfirmDialog title={toggle.status === "disabled" ? "重新启用成员" : "停用成员"} busy={busy || !!memberActions[toggle.user_id]} onCancel={() => setToggle(undefined)} onConfirm={() => { const member = toggle; setToggle(undefined); void updateMember(member.user_id, { status: member.status === "disabled" ? "active" : "disabled" }, "status"); }}>
      <p>@{toggle.github_login}（GitHub ID {toggle.github_id}）</p><p>{toggle.status === "disabled" ? "重新启用后须重新登录。原研究和用量按保留规则继续，旧会话不会恢复。" : "保存后撤销该成员所有会话并拒绝新的研究访问。停用不会把其研究转交管理员。"}</p>
    </ConfirmDialog>}
  </section>;
}
function MemberRow({ member, draft, disabled, action, result, onDraft, onSave, onToggle }: {
  member: Member; draft?: MemberDraft; disabled: boolean; action?: MemberAction; result?: MemberResult;
  onDraft: (patch: Partial<Pick<MemberDraft, "daily" | "active">>) => void; onSave: (daily: number, active: number) => void; onToggle: () => void;
}) {
  const daily = draft?.daily ?? String(member.daily_generation_limit), active = draft?.active ?? String(member.active_job_limit);
  const dirty = daily !== String(member.daily_generation_limit) || active !== String(member.active_job_limit);
  const valid = /^\d+$/.test(daily) && /^\d+$/.test(active) && +daily <= 100000 && +active >= 1 && +active <= 100;
  const formId = `wb-member-form-${member.user_id}`, nameId = `wb-member-name-${member.user_id}`, resultId = `wb-member-result-${member.user_id}`;
  const knownStatus = member.status === "active" || member.status === "disabled";
  return <tr className="wb-member-row" data-testid={`member-row-${member.user_id}`}>
    <th scope="row"><span id={nameId} className="wb-member-login">@{member.github_login}</span><small className="wb-member-id">GitHub ID {member.github_id}</small></th>
    <td>{member.is_admin ? "管理员" : "成员"}</td><td><span className={`wb-member-state${member.status === "disabled" ? " wb-member-disabled" : ""}`}>{member.status === "active" ? "已开通" : member.status === "disabled" ? "已停用" : "状态未知"}</span></td>
    <td><input form={formId} name="daily" aria-labelledby={`${nameId} wb-member-column-daily`} aria-describedby={result ? resultId : undefined} type="number" min={0} max={100000} step={1} value={daily} onChange={(event) => onDraft({ daily: event.target.value })} required disabled={disabled} /></td>
    <td><input form={formId} name="active" aria-labelledby={`${nameId} wb-member-column-active`} aria-describedby={result ? resultId : undefined} type="number" min={1} max={100} step={1} value={active} onChange={(event) => onDraft({ active: event.target.value })} required disabled={disabled} /></td>
    <td><form id={formId} onSubmit={(event) => { event.preventDefault(); if (valid && !disabled) onSave(+daily, +active); }}>
      <div className="wb-member-row-actions"><button type="submit" aria-describedby={nameId} disabled={disabled || !valid}>{action === "quota" ? "正在保存…" : "保存额度"}</button>
        <button type="button" aria-describedby={nameId} className="wb-danger-text" disabled={disabled || !knownStatus} onClick={onToggle}>{action === "status" ? "正在处理…" : member.status === "disabled" ? "重新启用" : "停用成员"}</button>
        {dirty && <span className="wb-draft-note" role="status">未保存</span>}
        {result && !result.error && <span id={resultId} className="wb-row-result" role="status">{result.message}</span>}</div>
      {dirty && !valid && <p className="wb-row-error" role="alert">额度须为整数；每日上限0–100000，同时未完成上限1–100。</p>}
      {result?.error && <p id={resultId} className="wb-row-error" role="alert">{result.message}</p>}
    </form></td>
  </tr>;
}

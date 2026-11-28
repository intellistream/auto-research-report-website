import { useEffect, useRef, useState, type FormEvent } from "react";
import { WorkbenchError, errorMessage, isAbort, validUsageDay, type WorkbenchApi, type Member, type MemberResolution, type QueueItem, type AdminUsage, type AuditPage } from "./workbench-api";
import { ConfirmDialog, Notice, listDateText } from "./workbench-ui";
import { AuditTable, QueueTable, UsageTable } from "./WorkbenchAdminTables";
import { beijingDay } from "./workbench-admin-model";
type MemberDraft = { daily: string; active: string; baselineDaily: number; baselineActive: number };
type MemberResult = { error: boolean; message: string; uncertain?: boolean };
type MemberPatch = { status?: string; daily_generation_limit?: number; active_job_limit?: number };
type MemberAction = "quota" | "status";
type Tab = "members" | "queue" | "usage" | "audit";
const titles: Record<Tab, string> = { members: "成员与额度", queue: "生成队列", usage: "用量统计", audit: "操作记录" };
export default function WorkbenchAdmin({ api, available }: { api: WorkbenchApi; available: boolean }) {
  const [tab, setTab] = useState<Tab>("members"), [loading, setLoading] = useState(true), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [members, setMembers] = useState<Member[]>([]), [queue, setQueue] = useState<QueueItem[]>([]);
  const [usage, setUsage] = useState<AdminUsage>(), [audit, setAudit] = useState<AuditPage>({ items: [] });
  const [usageDay, setUsageDay] = useState(() => beijingDay()), [readAt, setReadAt] = useState<Partial<Record<Tab, string>>>({});
  const [login, setLogin] = useState(""), [resolution, setResolution] = useState<MemberResolution>(), [busy, setBusy] = useState(false), [moreBusy, setMoreBusy] = useState(false);
  const [toggle, setToggle] = useState<Member>();
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});
  const [memberActions, setMemberActions] = useState<Record<string, MemberAction | undefined>>({});
  const [memberResults, setMemberResults] = useState<Record<string, MemberResult | undefined>>({});
  const memberPending = useRef(new Set<string>()), unconfirmed = useRef(new Map<string, MemberPatch>());
  const [memberOffset, setMemberOffset] = useState<number>(), [queueTotal, setQueueTotal] = useState(0);
  const alive = useRef(true), readEpoch = useRef(0), readController = useRef<AbortController | undefined>(undefined), moreController = useRef<AbortController | undefined>(undefined);
  useEffect(() => { alive.current = true; return () => { alive.current = false; readController.current?.abort(); moreController.current?.abort(); }; }, []);
  function acceptMembers(items: Member[], append = false) {
    setMembers((old) => append ? [...old.filter((member) => !items.some((item) => item.user_id === member.user_id)), ...items] : items);
    for (const member of items) {
      const patch = unconfirmed.current.get(member.user_id);
      if (!patch) continue;
      unconfirmed.current.delete(member.user_id);
      const matches = Object.entries(patch).every(([key, value]) => member[key as keyof Member] === value);
      setMemberResults((old) => ({ ...old, [member.user_id]: { error: !matches, message: matches ? patch.status ? member.status === "disabled" ? "成员已停用" : "成员已重新启用" : "上限已更新" : "后台当前值已读取，请核对本行输入后再保存。" } }));
    }
  }
  useEffect(() => {
    const epoch = ++readEpoch.current, controller = new AbortController();
    readController.current = controller; moreController.current?.abort(); setMoreBusy(false);
    if (!available || (tab === "usage" && !validUsageDay(usageDay))) { setLoading(false); return () => controller.abort(); }
    setLoading(true); setError("");
    const current = () => alive.current && !controller.signal.aborted && epoch === readEpoch.current;
    const request = tab === "members" ? api.members(0, controller.signal).then((page) => { if (current()) { acceptMembers(page.items); setMemberOffset(page.nextOffset); } })
      : tab === "queue" ? api.queue(0, controller.signal).then((page) => { if (current()) { setQueue(page.items); setQueueTotal(page.total); } })
      : tab === "usage" ? api.adminUsage(usageDay, controller.signal).then((page) => { if (current()) setUsage(page); })
      : api.audit(0, controller.signal).then((page) => { if (current()) setAudit(page); });
    request.then(() => { if (current()) setReadAt((old) => ({ ...old, [tab]: new Date().toISOString() })); })
      .catch((failure) => { if (current() && !isAbort(failure)) setError(errorMessage(failure)); })
      .finally(() => { if (current()) setLoading(false); });
    return () => { controller.abort(); if (readEpoch.current === epoch) readEpoch.current++; };
  }, [api, tab, revision, usageDay, available]);
  useEffect(() => {
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
    setMemberResults((old) => old[member.user_id]?.uncertain ? old : { ...old, [member.user_id]: undefined });
  }
  async function updateMember(id: string, patch: MemberPatch, action: MemberAction) {
    if (!available || busy || memberPending.current.has(id) || unconfirmed.current.has(id)) return;
    memberPending.current.add(id); setMemberActions((old) => ({ ...old, [id]: action })); setMemberResults((old) => ({ ...old, [id]: undefined }));
    try {
      const confirmed = await api.updateMember(id, patch);
      if (!alive.current) return;
      // A read started before this confirmation may not overwrite the confirmed row.
      readEpoch.current++; readController.current?.abort(); moreController.current?.abort();
      setMembers((old) => old.map((member) => member.user_id === id ? confirmed : member));
      if (action === "quota") setMemberDrafts((old) => ({ ...old, [id]: { daily: String(confirmed.daily_generation_limit), active: String(confirmed.active_job_limit), baselineDaily: confirmed.daily_generation_limit, baselineActive: confirmed.active_job_limit } }));
      setMemberResults((old) => ({ ...old, [id]: { error: false, message: action === "quota" ? "上限已更新" : confirmed.status === "disabled" ? "成员已停用" : "成员已重新启用" } }));
      setRevision((value) => value + 1);
    } catch (failure) {
      if (alive.current && !isAbort(failure)) {
        const uncertain = failure instanceof WorkbenchError && failure.uncertain;
        if (uncertain) unconfirmed.current.set(id, patch);
        setMemberResults((old) => ({ ...old, [id]: { error: true, uncertain, message: uncertain ? "保存结果待确认，请刷新核对。" : errorMessage(failure) } }));
      }
    } finally {
      memberPending.current.delete(id); if (alive.current) setMemberActions((old) => ({ ...old, [id]: undefined }));
    }
  }
  async function mutate(action: () => Promise<unknown>) {
    if (busy || !available) return; setBusy(true); setError("");
    try { await action(); if (alive.current) { setResolution(undefined); setRevision((v) => v + 1); } }
    catch (failure) { if (alive.current && !isAbort(failure)) setError(errorMessage(failure)); } finally { if (alive.current) setBusy(false); }
  }
  async function more() {
    if (moreBusy || loading || !available) return;
    const controller = new AbortController(), epoch = readEpoch.current; moreController.current = controller; setMoreBusy(true); setError("");
    const current = () => alive.current && !controller.signal.aborted && epoch === readEpoch.current;
    try {
      if (tab === "members" && memberOffset !== undefined) { const page = await api.members(memberOffset, controller.signal); if (current()) { acceptMembers(page.items, true); setMemberOffset(page.nextOffset); } }
      if (tab === "queue") { const page = await api.queue(queue.length, controller.signal); if (current()) { setQueue((old) => [...old.filter((item) => !page.items.some((next) => next.id === item.id)), ...page.items]); setQueueTotal(page.total); } }
      if (tab === "audit" && audit.nextOffset !== undefined) { const page = await api.audit(audit.nextOffset, controller.signal); if (current()) setAudit((old) => ({ ...page, items: [...old.items.filter((item) => !item.id || !page.items.some((next) => next.id === item.id)), ...page.items] })); }
    } catch (failure) { if (current() && !isAbort(failure)) setError(errorMessage(failure)); } finally { if (current()) setMoreBusy(false); }
  }
  async function resolve(event: FormEvent) {
    event.preventDefault(); if (!login.trim() || busy || !available) return; setBusy(true); setError(""); setResolution(undefined);
    try { const result = await api.resolveMember(login.trim()); if (alive.current) setResolution(result); }
    catch (failure) { if (alive.current && !isAbort(failure)) setError(errorMessage(failure)); } finally { if (alive.current) setBusy(false); }
  }
  const moreButton = (label: string) => <button disabled={!available || moreBusy || loading} onClick={() => void more()}>{moreBusy ? "正在加载…" : label}</button>;
  return <section className="wb-card wb-admin"><h2>工作台管理</h2><p className="wb-muted">管理成员资格、生成次数和运行状态。管理权限不授予阅读成员研究或报告的权限。</p>
    <nav className="wb-tabs" aria-label="管理分类">{(Object.keys(titles) as Tab[]).map((key) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{titles[key]}</button>)}</nav>
    <div className="wb-section-heading"><h3>{titles[tab]}</h3><div className="wb-admin-tools">
      {tab === "usage" && <label className="wb-admin-date">统计日期<input type="date" value={usageDay} onChange={(event) => setUsageDay(event.target.value)} /><span>北京时间</span></label>}
      {tab === "queue" && readAt.queue && <small className="wb-muted">读取于 {listDateText(readAt.queue)}</small>}
      <button disabled={!available || loading} onClick={() => setRevision((v) => v + 1)}>刷新</button></div></div>
    {error && <Notice error>{error} <button disabled={!available || loading} onClick={() => setRevision((v) => v + 1)}>重试</button></Notice>}
    {loading && <Notice>正在读取{titles[tab]}…</Notice>}
    <div hidden={tab !== "members"}>
      <form className="wb-inline-form" onSubmit={resolve}><label>GitHub 用户名<input value={login} onChange={(e) => { setLogin(e.target.value); setResolution(undefined); }} required maxLength={100} placeholder="输入用户名，先核对身份" /></label><button disabled={!available || busy || !login.trim()}>新增用户</button></form>
      {resolution && <aside className="wb-notice"><p>核对结果：@{resolution.github_login} · 稳定 GitHub ID {resolution.github_id}</p><p>请确认这是要邀请的成员。保存后自行发送工作台地址。</p><button className="wb-primary" disabled={!available || busy} onClick={() => void mutate(() => api.admit(resolution.confirmation_token))}>确认开通</button></aside>}
      {!members.length && !loading && !error && <p className="wb-empty">尚无成员记录</p>}
      {members.length > 0 && <div className="wb-members-scroll" role="region" aria-label="成员列表，可横向滚动" tabIndex={0}>
        <table className="wb-member-table" aria-label="成员与额度"><colgroup><col className="wb-member-user-col" /><col className="wb-member-role-col" /><col className="wb-member-state-col" /><col className="wb-member-daily-col" /><col className="wb-member-active-col" /><col className="wb-member-actions-col" /></colgroup>
          <thead><tr><th scope="col">用户名</th><th scope="col">身份</th><th scope="col">状态</th><th scope="col" id="wb-member-column-daily">每日生成上限</th><th scope="col" id="wb-member-column-active">未完成任务上限</th><th scope="col">操作</th></tr></thead>
          <tbody>{members.map((member) => <MemberRow key={member.user_id} member={member} draft={memberDrafts[member.user_id]} disabled={!available || busy || !!memberActions[member.user_id]} action={memberActions[member.user_id]} result={memberResults[member.user_id]}
            onDraft={(patch) => editMember(member, patch)} onSave={(daily, active) => void updateMember(member.user_id, { daily_generation_limit: daily, active_job_limit: active }, "quota")} onToggle={() => setToggle(member)} />)}</tbody>
        </table>
      </div>}
      {memberOffset !== undefined && <button disabled={!available || moreBusy || loading} onClick={() => void more()}>加载更多成员</button>}
    </div>
    {tab === "members" ? null : tab === "queue" ? <>
      {!queue.length && !loading && !error && <p className="wb-empty">当前没有排队或运行的任务</p>}
      {!!queue.length && <QueueTable items={queue} />}{queue.length < queueTotal && moreButton("加载更多队列")}
    </> : tab === "usage" ? <>
      {!validUsageDay(usageDay) && <Notice error>请选择有效的统计日期。</Notice>}
      {usage?.day === usageDay && <><p className="wb-meta">{usage.day} 受理的任务 · 北京时间</p>{!usage.items.length && !loading && !error && <p className="wb-empty">该日没有生成用量</p>}{!!usage.items.length && <UsageTable usage={usage} />}</>}
    </> : <>
      {!audit.items.length && !loading && !error && <p className="wb-empty">当前没有操作记录</p>}
      {!!audit.items.length && <AuditTable items={audit.items} />}{audit.nextOffset !== undefined && moreButton("加载更多操作记录")}
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
  const valid = /^\d+$/.test(daily) && /^\d+$/.test(active) && +daily <= 100000 && +active >= 1 && +active <= 100;
  const dirty = valid ? +daily !== member.daily_generation_limit || +active !== member.active_job_limit : daily !== String(member.daily_generation_limit) || active !== String(member.active_job_limit);
  const formId = `wb-member-form-${member.user_id}`, nameId = `wb-member-name-${member.user_id}`, resultId = `wb-member-result-${member.user_id}`;
  const knownStatus = member.status === "active" || member.status === "disabled";
  return <tr className="wb-member-row" data-testid={`member-row-${member.user_id}`}>
    <th scope="row"><span id={nameId} className="wb-member-login">@{member.github_login}</span><small className="wb-member-id">GitHub ID {member.github_id}</small></th>
    <td>{member.is_admin ? "管理员" : "成员"}</td><td><span className={`wb-member-state${member.status === "disabled" ? " wb-member-disabled" : ""}`}>{member.status === "active" ? "已开通" : member.status === "disabled" ? "已停用" : "状态未知"}</span></td>
    <td><input form={formId} name="daily" aria-labelledby={`${nameId} wb-member-column-daily`} aria-describedby={result ? resultId : undefined} type="number" min={0} max={100000} step={1} value={daily} onChange={(event) => onDraft({ daily: event.target.value })} required disabled={disabled} /></td>
    <td><input form={formId} name="active" aria-labelledby={`${nameId} wb-member-column-active`} aria-describedby={result ? resultId : undefined} type="number" min={1} max={100} step={1} value={active} onChange={(event) => onDraft({ active: event.target.value })} required disabled={disabled} /></td>
    <td><form id={formId} onSubmit={(event) => { event.preventDefault(); if (valid && dirty && !disabled && !result?.uncertain) onSave(+daily, +active); }}>
      <div className="wb-member-row-actions"><button type="submit" aria-describedby={nameId} disabled={disabled || !valid || !dirty || result?.uncertain}>{action === "quota" ? "正在保存…" : "保存上限"}</button>
        <button type="button" aria-describedby={nameId} className="wb-danger-text" disabled={disabled || !knownStatus || result?.uncertain} onClick={onToggle}>{action === "status" ? "正在处理…" : member.status === "disabled" ? "重新启用" : "停用成员"}</button>
        {dirty && <span className="wb-draft-note" role="status">未保存</span>}
        {result && !result.error && <span id={resultId} className="wb-row-result" role="status">{result.message}</span>}</div>
      {dirty && !valid && <p className="wb-row-error" role="alert">上限须为整数；每日0–100000，未完成任务1–100。</p>}
      {result?.error && <p id={resultId} className="wb-row-error" role="alert">{result.message}</p>}
    </form></td>
  </tr>;
}

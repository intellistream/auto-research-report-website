import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy } from "lucide-react";
import { ResearchProgress } from "./ResearchQuery";
import { WorkbenchError, errorMessage, privateLocation, type WorkbenchApi, type Job, type Study, type Usage } from "./workbench-api";
import { ConfirmDialog, Notice, dateText, generationWait, pending } from "./workbench-ui";
import type { Draft, Operation } from "./WorkbenchWorkspace";
import WorkbenchReport from "./WorkbenchReport";
export default function WorkbenchStudy({ api, id, jobId, revision, available, draft, onDraft, operation, operationError, onGenerate, onChanged, onJob, onDeleted }: {
  api: WorkbenchApi; id: string; jobId?: string; revision: number; available: boolean; draft: Draft; onDraft: (draft: Draft) => void;
  operation?: Operation; operationError?: string; onGenerate: (draft?: Draft, retryOf?: string) => void;
  onChanged: () => void; onJob: (id?: string) => void; onDeleted: () => void;
}) {
  const [study, setStudy] = useState<Study>(), [jobs, setJobs] = useState<Job[]>([]), [total, setTotal] = useState(0), [usage, setUsage] = useState<Usage>();
  const [error, setError] = useState(""), [usageError, setUsageError] = useState(""), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0);
  const [reportJob, setReportJob] = useState<Job>(), [jobError, setJobError] = useState("");
  const [rename, setRename] = useState(false), [name, setName] = useState(""), [remove, setRemove] = useState<Job | "study">();
  const [busy, setBusy] = useState(false), [actionError, setActionError] = useState(""), [copyMessage, setCopyMessage] = useState("");
  const historyPosition = useRef<number | undefined>(undefined);
  const mounted = useRef(true); useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    Promise.all([api.study(id, controller.signal), api.jobs(id, 0, controller.signal)]).then(([next, page]) => {
      if (controller.signal.aborted) return;
      setStudy(next); setJobs(page.items); setTotal(page.total); if (!rename) setName(next.name);
    }).catch((error) => { if (!controller.signal.aborted) { setError(errorMessage(error));
      if (error instanceof WorkbenchError && [404, 410].includes(error.status)) { setStudy(undefined); setJobs([]); setReportJob(undefined); }
    } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    api.usage(controller.signal).then((next) => { if (!controller.signal.aborted) { setUsage(next); setUsageError(""); } })
      .catch(() => { if (!controller.signal.aborted) { setUsage(undefined); setUsageError("暂时无法读取用量，提交时仍由服务端检查额度。"); } });
    return () => controller.abort();
  }, [api, id, revision, refresh]);
  useEffect(() => {
    if (!jobs.some(pending) && !study?.activeJobCount && !(reportJob && pending(reportJob))) return;
    const timer = setTimeout(() => { if (!document.hidden) setRefresh((v) => v + 1); }, 5000); return () => clearTimeout(timer);
  }, [jobs, study?.activeJobCount, reportJob, refresh]);
  useEffect(() => {
    setReportJob((old) => old?.id === jobId ? old : undefined); setJobError(""); if (!jobId) return;
    const controller = new AbortController();
    api.job(id, jobId, controller.signal).then((job) => { if (!controller.signal.aborted) setReportJob(job); })
      .catch((error) => { if (!controller.signal.aborted) setJobError(errorMessage(error)); }); return () => controller.abort();
  }, [api, id, jobId, revision, refresh]);
  function openJob(next?: string) {
    if (next) historyPosition.current = window.scrollY;
    onJob(next);
  }
  useEffect(() => {
    if (jobId || historyPosition.current === undefined) return;
    const top = historyPosition.current;
    const timer = setTimeout(() => window.scrollTo(0, top), 0);
    return () => clearTimeout(timer);
  }, [jobId]);
  async function moreJobs() {
    setBusy(true); setActionError("");
    try { const page = await api.jobs(id, jobs.length); if (mounted.current) { setJobs((old) => [...old, ...page.items.filter((j) => !old.some((v) => v.id === j.id))]); setTotal(page.total); } }
    catch (error) { if (mounted.current) setActionError(errorMessage(error)); } finally { if (mounted.current) setBusy(false); }
  }
  async function saveName(e: FormEvent) {
    e.preventDefault(); if (!name.trim() || busy) return; setBusy(true); setActionError("");
    try { await api.renameStudy(id, name.trim()); if (mounted.current) { setRename(false); onChanged(); } }
    catch (error) { if (mounted.current) setActionError(errorMessage(error)); } finally { if (mounted.current) setBusy(false); }
  }
  async function deleteContent() {
    if (!remove || busy) return; setBusy(true); setActionError("");
    try {
      if (remove === "study") { await api.deleteStudy(id); if (mounted.current) onDeleted(); }
      else { await api.deleteJob(id, remove.id); if (mounted.current) { if (jobId === remove.id) onJob(); setRemove(undefined); onChanged(); } }
    } catch (error) { if (mounted.current) { setRemove(undefined); setActionError(errorMessage(error)); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function copy(job?: string) {
    const url = new URL(window.location.href); url.search = ""; url.hash = privateLocation(id, job);
    try { await navigator.clipboard.writeText(url.href); if (mounted.current) setCopyMessage(job ? "报告链接已复制，仅本人登录后可访问。" : "研究链接已复制，仅本人登录后可访问。"); }
    catch { if (mounted.current) setCopyMessage("复制不可用，请复制浏览器地址。链接只供本人登录后定位。"); }
  }
  if (loading) return <Notice>正在读取当前研究…</Notice>;
  if (!study) return <Notice error>{error || "内容不存在、已到期或当前账号无法访问。"}<button onClick={() => setRefresh((v) => v + 1)}>重新读取研究</button></Notice>;
  const keyword = draft.query.trim(), valid = [...keyword].length >= 2 && [...keyword].length <= 120 && /[\p{L}\p{N}]/u.test(keyword);
  const unavailableQuota = !!usage && (usage.charged >= usage.dailyGenerationLimit || usage.active >= usage.activeJobLimit);
  const blocked = !available || !!operation || unavailableQuota;
  return <>
    <section className="wb-study-summary" aria-label="当前研究概览">
      <div className="wb-study-toolbar"><h2 title={study.name}>{study.name}</h2>
        <span className="wb-study-counts">{study.reportCount} 份报告 · {study.activeJobCount} 项生成中</span>
        <span className="wb-study-retention">{study.expiresAt ? <>研究保留至 <time dateTime={study.expiresAt}>{dateText(study.expiresAt)}</time></> : "研究到期时间尚未提供"}<span> · 报告文件逐份到期</span></span>
        <div className="wb-actions" aria-label="当前研究操作"><button onClick={() => void copy()}><Copy size={15} />复制链接</button><button disabled={!available} onClick={() => setRename(!rename)}>重命名</button><button className="wb-danger-text" disabled={!available || study.activeJobCount > 0} title={study.activeJobCount > 0 ? "有生成尚未结束，暂不能删除整项研究" : undefined} onClick={() => setRemove("study")}>删除研究</button></div>
      </div>
      {study.description && <details className="wb-study-description"><summary>研究说明</summary><p>{study.description}</p></details>}
      {study.activeJobCount > 0 && <p className="wb-meta wb-study-pending-note">有生成尚未结束，暂不能删除整项研究。</p>}
      {rename && <form className="wb-inline-form" onSubmit={saveName}><label>新的研究名称<input value={name} maxLength={120} required onChange={(e) => setName(e.target.value)} /></label><button disabled={busy || !available || !name.trim()}>保存名称</button></form>}
      {copyMessage && <p role="status" className="wb-meta">{copyMessage}</p>}
    </section>
    {error && <Notice error>状态暂未更新：{error}<button onClick={() => setRefresh((v) => v + 1)}>恢复读取</button></Notice>}{actionError && <Notice error>{actionError}</Notice>}
    {jobId ? <section className="wb-card"><div className="wb-actions"><button onClick={() => openJob()}>返回本研究的报告与生成记录</button><button onClick={() => void copy(jobId)}>复制报告链接</button></div>
      {jobError ? <Notice error>{jobError}<button onClick={() => setRefresh((v) => v + 1)}>重新读取记录</button></Notice> : !reportJob ? <Notice>正在读取这份生成记录…</Notice> : <WorkbenchReport key={reportJob.id} api={api} job={reportJob} available={available} />}</section>
      : <><section className="wb-card"><h3>在本研究内生成报告</h3><form className="wb-form" onSubmit={(e) => { e.preventDefault(); if (valid && !blocked) onGenerate(draft); }}>
        <label>报告内容<textarea name="query" value={draft.query} placeholder="请输入你想生成的报告内容" rows={3} maxLength={120} required disabled={!!operation} aria-describedby="wb-query-guidance" onChange={(e) => onDraft({ ...draft, query: e.target.value })} /></label>
        <p id="wb-query-guidance" className="wb-meta">请输入 2 至 120 个字符，包含文字或数字。本次内容作为取材问题，已有报告继续保留。</p>
        <label className="wb-days">检索时间<select value={draft.days} disabled={!!operation} onChange={(e) => onDraft({ ...draft, days: Number(e.target.value) })}>{[7, 30, 90, 180, 365].map((days) => <option key={days} value={days}>最近 {days} 天</option>)}</select></label>
        <button className="wb-primary" disabled={!valid || blocked}>{operation?.state === "pending" ? "正在提交…" : "生成报告"}</button>
        <p className="wb-meta">{usage ? `今日已用 ${usage.charged} / ${usage.dailyGenerationLimit} 次生成 · 当前 ${usage.active} / ${usage.activeJobLimit} 项未结束` : usageError || "正在读取用量…"}。额度跨本人所有研究合计，创建研究不计入。{usage?.resetsAt && ` 北京时间 ${dateText(usage.resetsAt)} 恢复日额度。`}</p>
        <p className="wb-wait">{generationWait}</p>
        {unavailableQuota && usage && <Notice>{usage.active >= usage.activeJobLimit ? "你有生成尚未结束，请在我的研究列表查看对应研究和进度，结束后再提交。" : "今日生成额度不足，可继续阅读已有报告，等待恢复或联系管理员。"}</Notice>}
        {operationError && <Notice error>{operationError}</Notice>}{operation?.state === "unknown" && <Notice error>{operation.error}<button type="button" disabled={!available} onClick={() => onGenerate()}>检查本次提交结果</button><p>检查沿用原研究、原参数和同一次操作标记，不另建生成。</p></Notice>}
      </form></section>
      <section className="wb-card wb-history"><div className="wb-section-heading"><h3>报告与生成记录</h3><button onClick={() => setRefresh((v) => v + 1)}>刷新状态</button></div>
        {!jobs.length && <p className="wb-empty">这项研究还没有报告。填写上方内容后可生成第一份。</p>}
        <ol>{[...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number).map((job) => <li key={job.id} className="wb-job" data-testid={`job-${job.id}`}>
          <div className="wb-job-heading"><h4><span className="wb-meta">生成记录 {job.number}</span>{job.query}</h4><span className={`wb-status wb-status-${job.status}`}>{job.reportExpired ? "报告已到期" : job.status === "complete" ? "已生成" : job.status === "failed" ? "生成失败" : job.status === "queued" ? "排队中" : "生成中"}</span></div>
          <p className="wb-meta">最近 {job.days} 天 · 提交于 {dateText(job.createdAt)}{job.retryOf && " · 来自一次失败重试"}</p>{pending(job) && <ResearchProgress job={job} interrupted={!!error} />}
          {job.status === "failed" && <p className="wb-error-text">{job.error || "本次生成未完成，可重试。"} 其他报告继续保留。</p>}
          {job.status === "complete" && <p className="wb-meta">{job.reportExpired ? "文件已到期，生成历史仍保留在本研究中。" : `报告文件保留至 ${dateText(job.reportExpiresAt)}`}</p>}
          {job.status === "complete" && (job.reviewStatus !== "approved" || job.synthesisStatus !== "generated") && <p className="wb-warning">已生成，需进一步核查。请查看审查与证据状态。</p>}
          <div className="wb-actions"><button onClick={() => openJob(job.id)}>{job.status === "complete" && !job.reportExpired ? "查看报告" : "查看生成记录"}</button>
            {job.status === "failed" && job.retryable !== false && <button disabled={!available || !!operation || unavailableQuota} onClick={() => onGenerate(undefined, job.id)}>重试（计一次生成）</button>}
            {!pending(job) && <button className="wb-danger-text" disabled={!available || busy} onClick={() => setRemove(job)}>{job.status === "complete" ? "删除这份报告" : "删除这条记录"}</button>}</div>
        </li>)}</ol>{jobs.length < total && <button disabled={busy} onClick={() => void moreJobs()}>加载更多生成记录</button>}
      </section></>}
    {remove && <ConfirmDialog title={remove === "study" ? "删除整项研究" : remove.status === "complete" ? "删除这份报告" : "删除这条生成记录"} busy={busy} onCancel={() => setRemove(undefined)} onConfirm={() => void deleteContent()}>
      {remove === "study" ? <p>将删除本研究、{study.reportCount} 份可读报告及 {total} 条生成记录，在线内容将无法访问。</p> : <p>只删除选中的这份报告及对应终态生成记录。当前研究和其他报告继续保留。</p>}<p>已登记的生成用量和不含正文的操作记录继续保留。</p>
    </ConfirmDialog>}
  </>;
}

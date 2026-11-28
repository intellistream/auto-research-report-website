import { useEffect, useRef, useState, type FormEvent } from "react";
import { List, Plus } from "lucide-react";
import { WorkbenchError, errorMessage, isAbort, validId, type WorkbenchApi, type Study } from "./workbench-api";
import { dateText, Notice } from "./workbench-ui";
import WorkbenchStudy from "./WorkbenchStudy";
export type Draft = { query: string; days: number };
export type Operation = { key: string; query: string; days: number; retryOf?: string; state: "pending" | "unknown"; error?: string };
type CreateOperation = { key: string; name: string; description: string; unknown?: boolean };
export default function WorkbenchWorkspace({ api, available, researchSearch, onNavigate }: {
  api: WorkbenchApi; available: boolean; researchSearch: string; onNavigate: (path: string) => void;
}) {
  const parameters = new URLSearchParams(researchSearch);
  const setParameters = (next: URLSearchParams | Record<string, string>) => onNavigate(`/research${new URLSearchParams(next).size ? `?${new URLSearchParams(next)}` : ""}`);
  const studyParam = parameters.getAll("study"), jobParam = parameters.getAll("job");
  const invalid = studyParam.length > 1 || jobParam.length > 1 || studyParam.some((v) => !validId(v))
    || jobParam.some((v) => !validId(v)) || (!!jobParam.length && !studyParam.length);
  const selected = invalid ? undefined : studyParam[0], selectedJob = invalid ? undefined : jobParam[0];
  const [creating, setCreating] = useState(!selected), [mobileList, setMobileList] = useState(false);
  const [studies, setStudies] = useState<Study[]>([]), [total, setTotal] = useState(0), [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true), [listError, setListError] = useState(""), [revision, setRevision] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({}), [operations, setOperations] = useState<Record<string, Operation | undefined>>({});
  const [opError, setOpError] = useState<Record<string, string>>({}), [createOp, setCreateOp] = useState<CreateOperation>();
  const operationRef = useRef<Record<string, Operation | undefined>>({});
  const mounted = useRef(true), searchRef = useRef(search); searchRef.current = search;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setCreating(!selected); }, [selected]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setListError("");
    api.studies(0, search, controller.signal).then((page) => {
      if (!controller.signal.aborted) { setStudies(page.items); setTotal(page.total); }
    }).catch((error) => { if (!controller.signal.aborted) setListError(errorMessage(error)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, search, revision]);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setRevision((v) => v + 1); }, 15_000); return () => clearInterval(timer); }, []);
  const change = () => { if (mounted.current) setRevision((v) => v + 1); };
  function choose(id: string, jobId?: string) {
    setParameters(new URLSearchParams({ study: id, ...(jobId ? { job: jobId } : {}) })); setCreating(false); setMobileList(false);
  }
  async function moreStudies() {
    if (loading) return; const requested = search; setLoading(true); setListError("");
    try { const page = await api.studies(studies.length, requested);
      if (mounted.current && searchRef.current === requested) { setStudies((old) => [...old, ...page.items.filter((item) => !old.some((s) => s.id === item.id))]); setTotal(page.total); }
    } catch (error) { if (mounted.current && searchRef.current === requested) setListError(errorMessage(error)); }
    finally { if (mounted.current && searchRef.current === requested) setLoading(false); }
  }
  async function generate(studyId: string, input?: Draft, retryOf?: string) {
    const existing = operationRef.current[studyId]; if (existing?.state === "pending" || !available) return;
    const op: Operation = existing ?? { key: crypto.randomUUID(), query: input?.query.trim() ?? "", days: input?.days ?? 30, retryOf, state: "pending" };
    operationRef.current[studyId] = { ...op, state: "pending" };
    setOperations((old) => ({ ...old, [studyId]: { ...op, state: "pending", error: undefined } })); setOpError((old) => ({ ...old, [studyId]: "" }));
    try {
      if (op.retryOf) await api.retry(studyId, op.retryOf, op.key); else await api.generate(studyId, op.query, op.days, op.key);
      if (!mounted.current) return;
      operationRef.current[studyId] = undefined; setOperations((old) => ({ ...old, [studyId]: undefined })); setDrafts((old) => ({ ...old, [studyId]: { query: "", days: op.days } })); change();
    } catch (error) {
      if (!mounted.current || isAbort(error)) return;
      if (error instanceof WorkbenchError && error.uncertain) { operationRef.current[studyId] = { ...op, state: "unknown", error: error.message }; setOperations((old) => ({ ...old, [studyId]: operationRef.current[studyId] })); }
      else { operationRef.current[studyId] = undefined; setOperations((old) => ({ ...old, [studyId]: undefined })); setOpError((old) => ({ ...old, [studyId]: errorMessage(error) })); }
    }
  }
  return <>
    <header className="wb-top"><div><span className="wb-eyebrow">个人研究工作台</span><h1>研究查询</h1></div></header>
      <button className="wb-mobile-toggle" aria-expanded={mobileList} aria-controls="wb-studies" onClick={() => setMobileList((v) => !v)}><List size={17} />我的研究 · 选择研究</button>
      <div className="wb-layout"><aside id="wb-studies" className={`wb-studies${mobileList ? " wb-list-open" : ""}`} aria-label="我的研究列表">
        <div className="wb-aside-heading"><h2>我的研究</h2><button aria-label="新建研究" onClick={() => { setCreating(true); setMobileList(false); }}><Plus size={18} />新建</button></div>
        <label className="wb-search"><span>搜索本人研究</span><input type="search" value={search} onChange={(e) => { setStudies([]); setSearch(e.target.value); }} placeholder="按研究名称搜索" /></label>
        {loading && !studies.length && <Notice>正在读取研究列表…</Notice>}{listError && <Notice error>{listError}<button onClick={change}>重新读取列表</button></Notice>}
        {!loading && !listError && !studies.length && <p className="wb-empty">{search ? "没有匹配的本人研究" : "还没有研究"}</p>}
        <ul>{studies.map((study) => <li key={study.id}><button aria-current={!creating && selected === study.id ? "page" : undefined} onClick={() => choose(study.id)}>
          <strong>{study.name}</strong><span>{study.reportCount ? `${study.reportCount} 份报告` : "暂无可读报告"}{study.activeJobCount > 0 && ` · ${study.activeJobCount} 项生成中`}</span>
          <small>最近活动 {dateText(study.updatedAt)}</small></button></li>)}</ul>
        {studies.length < total && <button onClick={() => void moreStudies()} disabled={loading}>{loading ? "正在读取…" : "加载更多研究"}</button>}
      </aside><main className="wb-content" aria-label="研究工作区">
        {invalid ? <Notice error>内容不存在、已到期或当前账号无法访问。<button onClick={() => { setParameters({}); setCreating(true); }}>返回我的研究</button></Notice>
          : creating || !selected ? <CreateStudy api={api} available={available} operation={createOp} onOperation={setCreateOp} onCreated={(study) => { change(); choose(study.id); }} onCancel={selected ? () => setCreating(false) : undefined} />
          : <WorkbenchStudy key={selected} api={api} id={selected} jobId={selectedJob} revision={revision} available={available}
            draft={drafts[selected] ?? { query: "", days: 30 }} onDraft={(draft) => setDrafts((old) => ({ ...old, [selected]: draft }))}
            operation={operations[selected]} operationError={opError[selected]} onGenerate={(draft, retryOf) => void generate(selected, draft, retryOf)}
            onChanged={change} onJob={(id) => choose(selected, id)} onDeleted={() => { setParameters({}); setCreating(true); change(); }} />}
      </main></div>
  </>;
}
function CreateStudy({ api, available, operation, onOperation, onCreated, onCancel }: {
  api: WorkbenchApi; available: boolean; operation?: CreateOperation; onOperation: (op?: CreateOperation) => void;
  onCreated: (study: Study) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(operation?.name ?? ""), [description, setDescription] = useState(operation?.description ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy || !available || !name.trim()) return;
    const op = operation ?? { key: crypto.randomUUID(), name: name.trim(), description: description.trim() }; onOperation({ ...op, unknown: true }); setBusy(true); setError("");
    try { const study = await api.createStudy(op.name, op.description, op.key); if (alive.current) { onOperation(undefined); onCreated(study); } }
    catch (error) { if (alive.current && !isAbort(error)) { onOperation(error instanceof WorkbenchError && error.uncertain ? { ...op, unknown: true } : undefined); setError(errorMessage(error)); } }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="wb-card"><span className="wb-eyebrow">我的研究 / 新建研究</span><h2>新建一项研究</h2><p className="wb-muted">用研究整理同一方向的多份报告，创建后可以稍后再生成。</p>
    <form className="wb-form" onSubmit={submit}><label>研究名称<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required disabled={busy || !!operation?.unknown} /></label>
      <label>研究说明（选填）<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} disabled={busy || !!operation?.unknown} /></label>
      <div className="wb-actions"><button className="wb-primary" disabled={busy || !available || !name.trim()}>{busy ? "正在保存…" : operation?.unknown ? "检查创建结果" : "创建研究"}</button>{onCancel && <button type="button" onClick={onCancel} disabled={busy}>取消</button>}</div>
      <p className="wb-muted">只保存研究，不调用模型，不消耗报告生成次数。</p>{operation?.unknown && !busy && <Notice>保存结果尚未确认。检查将沿用本次创建标记，找回同一项研究。</Notice>}{error && <Notice error>{error}</Notice>}
    </form></section>;
}

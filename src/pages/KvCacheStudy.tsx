import { ArrowRight, ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { kvResearch } from "./kv-research";
import { DailyCitations } from "./KvMaterialLibrary";
import { safeTopicSource } from "./topic-report";
import study from "./kv-cache-study.json";
import "./kv-cache-study.css";

export { study as kvStudy };

function Source({ id, children }: { id: string; children?: ReactNode }) {
  const source = study.sources.find((item) => item.id === id);
  const url = source && safeTopicSource(source.url);
  if (!source || !url) return null;
  return <a href={url} target="_blank" rel="noreferrer">{children ?? source.title} <ArrowUpRight size={12} aria-hidden="true" /></a>;
}

function PRSources({ numbers }: { numbers: number[] }) {
  return <div className="kv-sources">{study.methods.filter((method) => numbers.includes(method.number)).map((method) =>
    <a key={method.number} href={method.url} target="_blank" rel="noreferrer">vLLM #{method.number} <ArrowUpRight size={12} aria-hidden="true" /></a>)}</div>;
}

const cacheStates = {
  resident: { label: "设备内命中", action: "接入 6 块已有 KV，补算余下 32 个 token。", note: "缓存匹配后仍需保护引用、检查可分配空间，再安排计算。", prefill: 32 },
  cpu: { label: "CPU 内命中", action: "回载 6 块 KV，再补算余下 32 个 token。", note: "这个分支假设连接器支持对应缓存格式。传输需要时间，也需要设备空间。", prefill: 32 },
  miss: { label: "缓存已被淘汰", action: "没有可用历史 KV，重新处理全部 128 个 token。", note: "请求的文字前缀相同，可复用的缓存还需要实际存在。", prefill: 128 },
};
type CacheState = keyof typeof cacheStates;

export function CacheExample() {
  const [state, setState] = useState<CacheState>("resident");
  const selected = cacheStates[state];
  return <section className="kv-cache-example" aria-labelledby="kv-example-title">
    <div className="kv-section-heading"><div><h3 id="kv-example-title">同一个前缀，缓存位置不同，下一步也不同</h3><p>普通注意力示意。输入 128 个 token，每块 16 个，前 96 个与历史请求一致。</p></div><span className="kv-example-label">示意 · 未运行模型</span></div>
    <div className="kv-state-controls" role="group" aria-label="缓存位置示意">
      {(Object.entries(cacheStates) as [CacheState, typeof selected][]).map(([key, value]) =>
        <button key={key} type="button" aria-pressed={state === key} onClick={() => setState(key)}>{value.label}</button>)}
    </div>
    <div className="kv-token-blocks" aria-label="128 token 输入的八个缓存块">
      {Array.from({ length: 8 }, (_, index) => <div key={index} className={index < 6 && state !== "miss" ? `kv-token-block ${state}` : "kv-token-block fresh"}>
        <span>{index * 16 + 1}–{(index + 1) * 16}</span>
        <strong>{index < 6 && state !== "miss" ? state === "cpu" ? "回载" : "复用" : "计算"}</strong>
      </div>)}
    </div>
    <div className="kv-example-result" aria-live="polite" aria-atomic="true">
      <strong>{selected.action}</strong><p>{selected.note}</p>
      <span>本次 Prefill 需处理 <b>{selected.prefill}</b> 个 token</span>
    </div>
    <p className="kv-sources"><Source id="apc-design" /><Source id="pd" /></p>
  </section>;
}

export function KvStudyProvenance() {
  return <details className="kv-provenance"><summary>核对范围与版本依据</summary>
    <p>{study.scope}</p><p>{study.verification}</p><p>核对日期为 {study.asOf}。PR 状态取核对当日，官方文档为当日读取的 main 文件快照。</p>
    <ul>{study.methods.map((method) => <li key={method.number}><a href={method.codeUrl} target="_blank" rel="noreferrer">#{method.number} 固定版本代码</a><code>head {method.headSha}</code><code>base {method.baseSha}</code></li>)}</ul>
    <ul>{study.sources.map((source) => <li key={source.id}><Source id={source.id} /><span>{source.kind} · {source.kind.startsWith("官方") ? "文档 blob " : ""}{source.revision}</span></li>)}</ul>
  </details>;
}

const statuses: Record<string, string> = { merged: "已合并", draft: "草稿", open: "开放中" };

export function KvMethodComparison() {
  return <article className="kv-study">
    <Link className="kv-comparison-return" to={{ search: "view=report" }}>返回动态报告</Link>
    <header className="kv-study-intro"><p className="kv-direction">社区 PR · 专项分析</p><h2>前缀感知调度的方法对比</h2><p>{study.focus} 本轮把排序信号、额外处理、公平性与验证条件放在同一组字段下比较。</p><p className="kv-muted">机制分析基于 {study.asOf} · 四条 vLLM PR；2026-11-23 回查状态与代码版本未变</p></header>
    <div className="kv-comparison-table" role="region" aria-label="四条 PR 的方法与状态对比，可横向滚动" tabIndex={0}><table><thead><tr><th scope="col">工作</th><th scope="col">排序看什么</th><th scope="col">要付出的代价</th><th scope="col">当前状态</th></tr></thead><tbody>
      {study.methods.map((method) => <tr key={method.number}><th scope="row"><a href={method.url} target="_blank" rel="noreferrer">#{method.number}</a><span>{method.title}</span></th><td>{method.signal}</td><td>{method.cost}</td><td><span className={`kv-pr-status ${method.status}`}>{statuses[method.status]}</span></td></tr>)}
    </tbody></table></div>
    <section aria-labelledby="kv-paper-title"><h3 id="kv-paper-title">论文已经提供了哪些基础？</h3><div className="kv-paper-grid">{study.papers.map((paper) => <article key={paper.sourceId} className="kv-paper-card"><h4>{paper.title}</h4><p>{paper.body}</p><div className="kv-sources"><Source id={paper.sourceId} /></div></article>)}</div></section>
    <section aria-labelledby="kv-cases-title">
      <h3 id="kv-cases-title">逐项看机制、效果与成立条件</h3>
      <p className="kv-muted">TTFT 表示首 token 等待时间，p50 / p99 分别为50 / 99分位数。p90 interactivity 沿用来源的单用户输出速度90分位口径。</p>
      <p className="kv-muted">{study.verification}</p>
      <div className="kv-method-cards">{study.methods.map((method) => {
        const entry = kvResearch.entries.find((row) => row.id === method.workId);
        return <article className="kv-method-card" key={method.number} id={`kv-pr-${method.number}`} tabIndex={-1}>
          <div className="kv-method-meta"><span>vLLM #{method.number}</span><span className={`kv-pr-status ${method.status}`}>{statuses[method.status]}</span><span>head {method.headSha.slice(0, 7)}</span></div><h4>{method.title}</h4>
          <dl className="kv-method-fields"><div><dt>要解决什么</dt><dd>{method.problem}</dd></div><div><dt>具体怎样处理</dt><dd>{method.flow}</dd></div><div><dt>额外处理与边界</dt><dd>{method.cost} {method.boundary}</dd></div></dl>
          <details className="kv-method-evidence"><summary>效果与适用条件</summary><dl className="kv-method-fields"><div><dt>适用配置</dt><dd><ul>{method.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul></dd></div><div><dt>证据类型</dt><dd>{method.evidenceKind}</dd></div><div><dt>验证环境</dt><dd>{method.environment}</dd></div><div><dt>作者报告</dt><dd>{method.result}</dd></div><div><dt>证据范围</dt><dd>{method.evidenceLimit}</dd></div></dl></details>
          <p className="kv-version-note">{method.versionNote}</p>
          <div className="kv-sources"><a href={method.url} target="_blank" rel="noreferrer">原始 PR <ArrowUpRight size={12} aria-hidden="true" /></a><a href={method.codeUrl} target="_blank" rel="noreferrer">固定版本代码 <ArrowUpRight size={12} aria-hidden="true" /></a></div>
          <DailyCitations references={entry?.dailyReferences} />
        </article>;
      })}</div>
    </section>
    <p><Link className="kv-action" to={{ search: "view=report&edition=2026-11-17" }}>查看该版观察与待验证问题 <ArrowRight size={15} aria-hidden="true" /></Link></p>
    <KvStudyProvenance />
  </article>;
}

export function KvHistoricalReport() {
  return <article className="kv-study kv-progress">
    <Link className="kv-comparison-return" to={{ search: "view=report" }}>返回本期动态报告</Link><header className="kv-study-intro"><p className="kv-direction">历史报告 · 首轮调度观察</p><h2>{study.focus}</h2><p>{study.summary}</p><p className="kv-muted">更新于 {study.asOf} · 修订 {study.revision} · 当前聚焦前缀感知调度</p></header>
    <p className="kv-muted">本页保留 2026-11-17 对四条调度 PR 的阶段判断与实验设想。2026-11-23 已回查这四条的状态、版本和说明，未发现变化；新增工作见本期动态报告。</p>
    <p className="kv-muted">{study.scope} {study.verification}</p>
    <section aria-labelledby="kv-observations-title"><h3 id="kv-observations-title">本轮材料支持哪些观察？</h3><div className="kv-report-notes">{study.observations.map((observation) => <article key={observation.title}><h4>{observation.title}</h4><p>{observation.body}</p><PRSources numbers={observation.numbers} /></article>)}</div></section>
    <section aria-labelledby="kv-research-title"><h3 id="kv-research-title">下一步可以验证什么？</h3><p className="kv-muted">以下是基于本轮材料提出的研究问题与实验设想。</p><div className="kv-research-questions">{study.questions.map((question) => <article key={question.title}><span className="kv-direction">待验证</span><h4>{question.title}</h4><p>{question.observation}</p><h5>怎样验证</h5><p>{question.experiment}</p><PRSources numbers={question.numbers} /></article>)}</div></section>
    <section aria-labelledby="kv-updates-title"><h3 id="kv-updates-title">更新记录</h3>{study.changelog.map((change) => <div className="kv-update" key={change.date + change.title}><time dateTime={change.date}>{change.date}</time><div><h4>{change.title}</h4><p>{change.body}</p></div></div>)}<p className="kv-muted">后续根据 PR 修订、GPU 验证与新增论文更新证据和判断。</p></section>
    <p><Link to={{ search: "view=compare" }}>查看完整方法与验证条件 <ArrowRight size={14} aria-hidden="true" /></Link></p><KvStudyProvenance />
  </article>;
}

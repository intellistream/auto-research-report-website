import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import KvCommunityEdition from "./KvCommunityEdition";
import { KvHistoricalReport } from "./KvCacheStudy";
import { kvCommunity, versionChanges } from "./kv-community";
import {
  eventLabels, kvWeekly, materialFor, materialSearch, reportSourceIds, resolveWeeklyReport,
  weeklyEventCounts, weeklyEvents, weeklyReports, weeklySearch, weeklySource, weekLabel, weekRange,
  type WeeklyProgress, type WeeklyQuestion, type WeeklyReport,
} from "./kv-weekly";
import "./kv-weekly.css";

function Sources({ ids }: { ids: string[] }) {
  return <span className="kv-weekly-sources">{ids.map(id => {
    const source = weeklySource(id)!;
    return <a key={id} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>;
  })}</span>;
}

function SectionHeading({ number, id, title }: { number: string; id: string; title: string }) {
  return <div className="kv-weekly-section-heading">
    <span aria-hidden="true">{number}</span><h3 id={id} tabIndex={-1}>{title}</h3>
  </div>;
}

function ProgressCard({ item, report }: { item: WeeklyProgress; report: WeeklyReport }) {
  const sources = item.sourceIds.map(id => weeklySource(id)!);
  const events = weeklyEvents(report.week).filter(event => sources.some(source => source.workId === event.workId));
  const labels = [...new Set(events.map(event => eventLabels[event.kind]))];
  return <article className="kv-weekly-feature" id={"kv-weekly-progress-" + item.id} tabIndex={-1}>
    <header>
      <div className="kv-weekly-feature-meta">{(labels.length ? labels : [sources.some(source => source.kind === "pr") ? "延续跟踪" : "相关工作补充"])
        .map(label => <span key={label}>{label}</span>)}</div>
      <h4>{item.title}</h4>
    </header>
    <dl className="kv-weekly-feature-fields">
      <div><dt>原有问题</dt><dd>{item.problem}</dd></div>
      <div><dt>改动与机制</dt><dd>{item.mechanism}</dd></div>
      <div className="kv-weekly-feature-evidence"><dt>验证与边界</dt><dd>{item.evidence}</dd></div>
      <div><dt>影响与联系</dt><dd>{item.implication}</dd></div>
    </dl>
    <div className="kv-weekly-next"><strong>继续跟踪</strong><p>{item.next}</p></div>
    <Sources ids={item.sourceIds}/>
    <details className="kv-weekly-detail kv-weekly-feature-versions"><summary>版本与适用条件</summary>
      <div className="kv-weekly-detail-body">{sources.map(source => <div key={source.id}>
        <p><strong>{source.label}</strong> · <code>{source.version}</code> · <time dateTime={source.checkedAt}>{source.checkedAt}</time></p>
        <p className="kv-weekly-muted">{source.scope}</p>
        {source.readingSearch && <Link to={{ search: source.readingSearch }}>阅读对应版本的完整解读</Link>}
      </div>)}</div>
    </details>
  </article>;
}

function ResearchQuestion({ question, report, query }: { question: WeeklyQuestion; report: WeeklyReport; query: URLSearchParams }) {
  return <article className="kv-weekly-question" id={question.id} tabIndex={-1}>
    <h4>{question.problemTitle}</h4>
    <p className="kv-weekly-decision"><strong>本周认识</strong><span>{question.weeklyInsight}</span></p>
    <dl className="kv-weekly-fields">
      <div><dt>场景与瓶颈</dt><dd><p>{question.scene}</p><p>{question.bottleneck}</p></dd></div>
      <div><dt>剩余空间</dt><dd>{question.gap}</dd></div>
    </dl>
    <details className="kv-weekly-detail"><summary>证据与已有工作</summary>
      <div className="kv-weekly-detail-body"><ul className="kv-weekly-evidence">{question.evidence.map((row, index) => <li key={index}>
        <p>{row.finding}</p><Sources ids={row.sourceIds}/><p className="kv-weekly-muted">{row.boundary}</p>
      </li>)}</ul></div>
    </details>
    <details className="kv-weekly-detail"><summary>研究设想与验证方案</summary>
      <div className="kv-weekly-detail-body">
        <p className="kv-weekly-question-meta">{question.classification}</p><h5>{question.title}</h5>
        <dl className="kv-weekly-fields">
          <div className="kv-weekly-hypothesis"><dt>可检验假设</dt><dd>{question.hypothesis}</dd></div>
          <div><dt>怎样做最小验证</dt><dd><dl className="kv-weekly-protocol">{question.minimum.map(row =>
            <div key={row.label}><dt>{row.label}</dt><dd>{row.body}</dd></div>)}</dl></dd></div>
          <div><dt>潜在价值</dt><dd>{question.value}</dd></div>
          <div><dt>实现成本</dt><dd>{question.cost}</dd></div>
          <div><dt>最大不确定性</dt><dd>{question.uncertainty}</dd></div>
        </dl>
        <aside className="kv-weekly-validation" aria-label="相关工作与实验状态">
          <p><strong>相关工作 · {question.relatedWork.checkedAt}</strong></p>
          <p>{question.relatedWork.coverage}</p><p>{question.relatedWork.pending}</p>
          <p><strong>实验状态：</strong>{question.experimentStatus}</p>
        </aside>
      </div>
    </details>
    <nav className="kv-question-history" aria-label="同一问题的跨周判断">
      <h5>同一问题的跨周变化</h5>
      <ol>{weeklyReports.flatMap(item => item.questions.filter(row => row.id === question.id).map(row => <li key={item.week}>
        <Link to={{ search: weeklySearch(query, item.week, row.id) }} aria-current={item.week === report.week ? "page" : undefined}>
          {weekLabel(item.week)}{item.week === report.week && " · 当前周"}
        </Link><p>{row.change}</p>
      </li>))}</ol>
    </nav>
  </article>;
}

function WeeklyEvents({ report }: { report: WeeklyReport }) {
  const events = weeklyEvents(report.week);
  const counts = weeklyEventCounts(events);
  return <section className="kv-weekly-events" aria-labelledby="kv-weekly-events-title">
    <SectionHeading number="04" id="kv-weekly-events-title" title="周内 PR 事件"/>
    <p className="kv-weekly-muted">仅为已收录样本中有明确时间依据的事件。同一 PR 可同时新建和合入；各项按完整仓库与编号去重，不相加作为 PR 总量。机制修订按已核实的区间记录。</p>
    <dl className="kv-weekly-counts">{Object.entries(eventLabels).map(([kind, label]) =>
      <div key={kind}><dt>{label}</dt><dd>{counts[kind as keyof typeof counts]}</dd></div>)}</dl>
    <p className="kv-weekly-muted">0 表示现有证据未记录此类事件，不能据此认定全社区无进展。</p>
    <ul className="kv-weekly-event-list">{events.map(event => {
      const entry = materialFor(event.workId)!;
      return <li key={event.id}>
        <div className="kv-weekly-event-heading"><span>{eventLabels[event.kind]}</span><strong>{entry.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{entry.id.split("#")[1]}</strong>
          <span>{event.day ? <time dateTime={event.day}>{event.day}</time> : <>核对区间 {event.interval}</>}</span></div>
        <p>{entry.title}</p><p className="kv-weekly-muted">{event.note}</p>
        <div className="kv-weekly-links"><a href={entry.url} target="_blank" rel="noreferrer">原始 PR</a><Link to={{ search: materialSearch(entry.id) }}>完整身份与来源版本</Link></div>
      </li>;
    })}</ul>
    <Link to={{ search: "view=evidence" }}>查看全部 {kvCommunity.snapshots.length} 条已收录 PR</Link>
  </section>;
}

function WeeklySources({ report }: { report: WeeklyReport }) {
  const sources = reportSourceIds(report).map(id => weeklySource(id)!);
  const otherVersions = kvWeekly.revisions.filter(row => row.kind !== "mechanism");
  return <section className="kv-weekly-provenance" aria-labelledby="kv-weekly-sources-title">
    <h3 id="kv-weekly-sources-title" tabIndex={-1}>来源与历史记录</h3>
    <details><summary>本周引用的 {sources.length} 项来源与适用范围</summary>
      <p>{kvWeekly.scope}</p><p>{report.note}</p>
      <p>周范围采用北京时间周一 00:00 至下周一 00:00（不含）。材料核对日期与事件发生日期分别记录；PR 的 updatedAt 与 head 变动不自动计为机制进展。</p>
      <ol className="kv-weekly-source-list">{sources.map(source => <li key={source.id}>
        <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a><span> · 核对 {source.checkedAt}</span>
        <p><code>{source.workId}</code></p><p>依据版本 <code>{source.version}</code></p><p>{source.scope}</p>
        {source.readingSearch && <Link to={{ search: source.readingSearch }}>阅读已有解读与适用条件</Link>}
      </li>)}</ol>
    </details>
    <details><summary>尚不能归为周内实质进展的版本线索</summary>
      <p>11/17→11/23 回查发现 {versionChanges.length} 条 head 变化，区间跨周。仅凭最后更新时间不能确定机制变更属于哪周，未将它们自动分配为本周修订。</p>
      <ul>{versionChanges.map(snapshot => <li key={snapshot.id}>
        <a href={snapshot.url} target="_blank" rel="noreferrer">{snapshot.id}</a> · <code>{snapshot.baseline!.headSha.slice(0,7)} → {snapshot.headSha.slice(0,7)}</code>
      </li>)}</ul>
      {report.week === "2026-11-23" && <ul>{otherVersions.map(row => <li key={row.id}>{row.description}</li>)}</ul>}
      <Link to={{ search: "view=report&edition=2026-11-23" }}>阅读原跨周报告及全部回查记录</Link>
    </details>
    <details><summary>原检索条件与未审阅线索</summary>
      <p>{kvCommunity.scopeNote}</p><p>{kvCommunity.search.selectionNote}</p>
      <p>11/23 的检索日期条件按原查询保留，不等同于上海自然周；本次没有重跑检索或扩大为全量社区抓取。11/24 定向补核与 11/25 相关工作核查另记，未覆盖的时段不补造进展。</p>
      <div className="kv-weekly-links"><Link to={{ search: "view=report&edition=2026-11-23" }}>原报告与检索线索</Link><Link to={{ search: "view=report&edition=2026-11-17" }}>11/17 原观察</Link><Link to={{ search: "view=compare&part=kv-wait-diagnosis" }}>调度专项分析</Link></div>
    </details>
    <p className="kv-weekly-muted">周报为离线整理的研究判断；本站未运行研究实验，不在浏览器生成结论。PR 数量用于说明材料范围，不作为研究价值评分。</p>
  </section>;
}

export default function KvCommunityReport() {
  const [query, setQuery] = useSearchParams();
  const selected = resolveWeeklyReport(query);
  if (selected.kind === "archive") return <>
    <aside className="kv-weekly-archive" aria-label="原版报告说明"><strong>原版报告 · {selected.edition}</strong>
      <p>此入口保留原观察、代码版本和后续补核，报告日期不是自然周字段。</p>
      <Link to={{ search: weeklySearch(query, "2026-11-23") }}>返回每周总结</Link>
    </aside>
    {selected.edition === "2026-11-17" ? <KvHistoricalReport /> : <KvCommunityEdition />}
  </>;
  const { report, notice } = selected;
  const index = weeklyReports.indexOf(report);
  const range = weekRange(report.week)!;
  return <article className="kv-study kv-weekly-report" aria-labelledby="kv-weekly-headline">
    <header className="kv-study-intro kv-weekly-hero">
      <p className="kv-direction">社区 PR · 每周总结</p><h2 id="kv-weekly-headline">{report.title}</h2>
      <div className="kv-weekly-period"><strong><time dateTime={range.start}>{range.start}</time> — <time dateTime={range.end}>{range.end}</time></strong>
        <span>北京时间 · 周一至周日</span><span className="kv-weekly-badge">{report.status === "partial" ? "阶段周报" : "回溯整理"}</span></div>
      <nav className="kv-week-switcher" aria-label="选择周报">
        {index > 0 ? <Link to={{ search: weeklySearch(query, weeklyReports[index - 1].week) }}>上一周</Link> : <span aria-disabled="true">上一周</span>}
        <label>选择周<span className="kv-week-select"><select value={report.week} onChange={event => setQuery(weeklySearch(query, event.target.value))}>
          {weeklyReports.map(item => <option key={item.week} value={item.week}>{weekLabel(item.week)}{item.status === "partial" ? " · 阶段周报" : " · 回溯整理"}</option>)}
        </select><ChevronDown size={16} aria-hidden="true"/></span></label>
        {index < weeklyReports.length - 1 ? <Link to={{ search: weeklySearch(query, weeklyReports[index + 1].week) }}>下一周</Link> : <span aria-disabled="true">下一周</span>}
      </nav>
      {notice && <p role="status">{notice}</p>}
      <p className="kv-weekly-summary">{report.summary}</p>
      <p className="kv-weekly-muted">PR 材料截至 <time dateTime={report.materialThrough}>{report.materialThrough}</time>{report.status === "partial" ? " · 本周后续日期尚未覆盖" : " · 周内事件及解读为事后整理"}</p>
    </header>
    <section aria-labelledby="kv-weekly-focus-title">
      <SectionHeading number="01" id="kv-weekly-focus-title" title="本周关注"/>
      <div className="kv-weekly-focus-grid">{report.progress.map(item => <article key={item.id} className="kv-weekly-focus">
        <h4>{item.title}</h4><p>{item.body}</p>
        <Link className="kv-weekly-focus-link" to={{ search: weeklySearch(query, report.week, "kv-weekly-progress-" + item.id) }}>深入解读 <span aria-hidden="true">→</span></Link>
      </article>)}</div>
    </section>
    <section className="kv-weekly-progress" aria-labelledby="kv-weekly-progress-title">
      <SectionHeading number="02" id="kv-weekly-progress-title" title="重点进展解读"/>
      <div className="kv-weekly-feature-stream">{report.progress.map(item => <ProgressCard key={item.id} item={item} report={report}/>)}</div>
    </section>
    <section aria-labelledby="kv-weekly-questions-title">
      <SectionHeading number="03" id="kv-weekly-questions-title" title="持续研究的问题"/>
      {report.questions.length ? report.questions.map(question => <ResearchQuestion key={question.id} question={question} report={report} query={query}/>)
        : <p>现有材料不足以提出新的研究方向；本周只更新证据与待核查事项。</p>}
    </section>
    <WeeklyEvents report={report}/><WeeklySources report={report}/>
  </article>;
}

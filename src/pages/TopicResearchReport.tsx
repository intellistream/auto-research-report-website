import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Download, FileText, GitPullRequest, Sparkles } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { safeTopicSource, loadFrozenVersion, revealTopicPart, reportOverview, sectionLead, type FrozenVersion, type Reference, type ResearchReport } from "./topic-report";
import { EvidenceList, EvidenceTimeline } from "./TopicEvidence";
import { aclGraphReportUpdate } from "./aclgraph-report-update";
import "./topic-research-report.css";
import "./topic-report-update.css";

function ReportJump({ id, children, ...props }: { id: string; children: ReactNode; className?: string; title?: string; "aria-label"?: string; "aria-current"?: "location" }) {
  const [query] = useSearchParams();
  const next = new URLSearchParams(query);
  next.set("part", id);
  return <Link {...props} to={{ search: next.toString() }} onClick={(event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    // Clicking an already selected destination must still reopen/revisit it.
    if (query.get("part") === id) revealTopicPart(document, id, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }}>{children}</Link>;
}

function Citations({ ids, references }: { ids: string[]; references: Reference[] }) {
  return <span className="survey-citations" aria-label="引用来源">{[...new Set(ids)].map((id) => {
    const index = references.findIndex((reference) => reference.id === id);
    return index < 0 ? null : <ReportJump key={id} id={`survey-ref-${id}`} title={`${references[index].evidenceLevel}：${references[index].title}`} aria-label={`参考文献 ${index + 1}：${references[index].title}`}>[{index + 1}]</ReportJump>;
  })}</span>;
}

function Methodology({ report }: { report: ResearchReport }) {
  const methods = report.methodology;
  if (Array.isArray(methods)) return <>{methods.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
  return <><dl className="survey-methods"><dt>综述类型</dt><dd>{methods.type}</dd><dt>检索截止</dt><dd>{methods.searchDate}</dd><dt>研究范围</dt><dd>{methods.scope}</dd><dt>检索策略</dt><dd>{methods.searchStrategy}</dd><dt>综合方法</dt><dd>{methods.synthesis}</dd></dl><div className="survey-criteria"><div><h3>纳入标准</h3><ul>{methods.inclusionCriteria.map((text) => <li key={text}>{text}</li>)}</ul></div><div><h3>排除标准</h3><ul>{methods.exclusionCriteria.map((text) => <li key={text}>{text}</li>)}</ul></div></div></>;
}

function EvidenceDetails({ report }: { report: ResearchReport }) {
  if (!report.evidenceDetails?.length) return null;
  return <details id="survey-evidence" tabIndex={-1} className="survey-details survey-evidence-details">
    <summary><span>{report.centralQuestion ? "附录 A：核心 PR 证据与归因边界" : "局部工程证据对照"}</span><small>{report.evidenceDetails.length} 类测量与验证 · 展开核对版本、工作量和限制</small></summary>
    <p className="survey-muted">每项对照保留原始环境、版本、工作量和失败记录。局部 Kernel、Host 与服务指标对应不同执行层级，不应跨配置拼接或合算加速比。</p>
    {report.evidenceDetails.map((evidence) => <details key={evidence.id} id={`survey-evidence-${evidence.id}`} tabIndex={-1} className="survey-evidence-detail">
      <summary><h3>{evidence.comparison}</h3><span>{evidence.level}</span></summary>
      <table><caption>{evidence.comparison}：条件、结果与证据边界</caption><tbody>{([
        ["机制", evidence.mechanism], ["证据层级", evidence.level], ["环境", evidence.environment],
        ["测试版本", evidence.revision], ["工作量", evidence.workload], ["结果", evidence.result],
        ...(evidence.negativeEvidence ? [["负面结果或失败", evidence.negativeEvidence]] as const : []),
        ["限制", evidence.limitation], ["核验范围", evidence.verification],
        ...(evidence.sourceHead ? [["PR Head", evidence.sourceHead]] as const : []),
        ...(evidence.observedAt ? [["状态观察日", evidence.observedAt]] as const : []),
        ...(evidence.sourceFile ? [["关键变更文件", evidence.sourceFile]] as const : []),
      ] as const).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}<tr><th scope="row">来源</th><td><Citations ids={evidence.sourceIds} references={report.references} /></td></tr></tbody></table>
    </details>)}
  </details>;
}

function IndependentReview({ report }: { report: ResearchReport }) {
  const review = report.reviewSummary;
  if (!review) return null;
  return <section id="survey-review" tabIndex={-1} className="survey-review">
    <div className="survey-kicker">INDEPENDENT REVIEW</div><h2>独立审查摘要</h2>
    <dl className="survey-methods"><dt>审查日期</dt><dd><time dateTime={review.date}>{review.date}</time></dd><dt>审查工具</dt><dd>{review.provider}</dd><dt>审查模型</dt><dd>{review.model}</dd><dt>审查类型</dt><dd>独立审查</dd></dl>
    <p>{review.summary}</p><h3>审查限制与未复现范围</h3><ul>{review.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
    <p className="survey-evidence-note">此处记录独立审查，不表示审查模型生成了全文，也不等于完成全量实验复现。</p>
  </section>;
}

const gapStatus: Record<string, string> = { open: "开放问题", hypothesis: "待验证假设", "evidence-gap": "证据缺口", resolved: "已补充证据" };
const referenceKind: Record<Reference["kind"], string> = { paper: "论文", pr: "工程 PR", documentation: "官方文档与源码", methodology: "综述方法" };

function useFrozenVersion(topicId: string, version: string | null | undefined, expected?: ResearchReport) {
  const [state, setState] = useState<{ key: string; expected?: ResearchReport; data?: FrozenVersion; error?: string }>();
  const key = `${topicId}/${version}`;
  useEffect(() => {
    if (!version) return;
    const controller = new AbortController();
    loadFrozenVersion(topicId, version, controller.signal, expected)
      .then((data) => { if (!controller.signal.aborted) setState({ key, expected, data }); })
      .catch((error: Error) => { if (!controller.signal.aborted) setState({ key, expected, error: error.message }); });
    return () => controller.abort();
  }, [topicId, version, expected, key]);
  return state?.key === key && state.expected === expected ? state : undefined;
}

export function VersionRecord({ version, current = false }: { version: FrozenVersion; current?: boolean }) {
  const { report, hrefs } = version;
  return <div className="survey-version-record"><strong>修订 {report.revision}{current ? " · 当前阅读" : " · 前序冻结稿"}</strong><span>研究截至 <time dateTime={report.asOf}>{report.asOf}</time></span><details><summary>完整版本标识</summary><code>{report.version}</code></details><div className="survey-version-links">{hrefs.html && <a href={hrefs.html} target="_blank" rel="noreferrer">阅读冻结网页 <ArrowUpRight size={12} /></a>}{hrefs.pdf && <a href={hrefs.pdf} download>下载此版 PDF</a>}{hrefs.md && <a href={hrefs.md} download>源稿</a>}{hrefs.json && <a href={hrefs.json} target="_blank" rel="noreferrer">冻结元数据</a>}</div></div>;
}

function PreviousVersions({ topicId, version, newerRevision }: {
  topicId: string;
  version: string;
  newerRevision: number;
}) {
  const frozen = useFrozenVersion(topicId, version);
  if (frozen?.error) return <p role="status">前序版本暂不可读。{frozen.error}</p>;
  if (!frozen?.data) return <p role="status">正在读取历史版本…</p>;
  const { data } = frozen;
  if (data.report.revision >= newerRevision) return <p role="status">前序版本修订号无效。</p>;
  return <>
    <VersionRecord version={data} />
    {data.report.previousVersion && (
      <PreviousVersions topicId={topicId} version={data.report.previousVersion} newerRevision={data.report.revision} />
    )}
  </>;
}

function ReportHistory({ topic, report, current, embedded, requested }: {
  topic: Topic;
  report: ResearchReport;
  current?: FrozenVersion;
  embedded: boolean;
  requested: boolean;
}) {
  const pending = report.pendingEvidence ?? [];
  return <>
    {!embedded && <EvidenceTimeline topic={topic} report={report} />}
    {requested && <div className="survey-version-history" aria-label="冻结版本历史">
      {current && <VersionRecord version={current} current />}
      {report.previousVersion && <PreviousVersions topicId={topic.id} version={report.previousVersion} newerRevision={report.revision} />}
    </div>}
    <h3>修订记录</h3>
    <ol className="survey-changelog">
      {[...report.changelog].reverse().map((change) => (
        <li key={`${change.date}-${change.summary}`}><time dateTime={change.date}>{change.date}</time><p>{change.summary}</p></li>
      ))}
    </ol>
    {report.sourceDelta && <p className="survey-muted survey-delta">
      较上一来源快照新增 {report.sourceDelta.added.length} 条，更新 {report.sourceDelta.changed.length} 条，移除 {report.sourceDelta.removed.length} 条。
    </p>}
    {pending.length > 0 && <details className="survey-pending">
      <summary>{pending.length} 项新证据待综合研究 <ArrowRight size={14} /></summary>
      <p>这些条目已进入取材索引。后续修订将核查它们是否改变已有判断。</p>
      {embedded ? <ReportJump id="survey-appendix">查看 PR 取材索引</ReportJump> : <EvidenceList entries={pending} labels={topic.labels} />}
    </details>}
  </>;
}

function ReportUpdateOverview({ report, topicId }: { report: ResearchReport; topicId: string }) {
  const update = topicId === "aclgraph" && report.version === aclGraphReportUpdate.version ? aclGraphReportUpdate : undefined;
  const latest = report.changelog[report.changelog.length - 1];
  const openGaps = report.gaps.filter((gap) => gap.status !== "resolved");
  const next = update?.next ?? openGaps.slice(0, 3).map((gap) => ({ id: gap.id, label: gap.title }));
  const added = report.sourceDelta?.added.length ?? 0;
  const changed = report.sourceDelta?.changed.length ?? 0;
  const evidenceCount = report.evidenceDetails?.length ?? 0;

  return <>
    <div className="report-brief-overview">
      <section className="report-brief-card report-brief-current">
        <h3>{report.revision === 1 && !report.previousVersion ? "研究起点" : "本次更新"}</h3>
        {(added > 0 || changed > 0 || evidenceCount > 0) && <ul className="report-brief-counts">
          {added > 0 && <li>新增 {added} 条来源</li>}
          {changed > 0 && <li>{update ? "复核" : "更新"} {changed} 条已有来源</li>}
          {evidenceCount > 0 && <li>{evidenceCount} 项证据详情</li>}
        </ul>}
        <p>{update?.summary ?? latest?.summary ?? "本版暂无修订说明。"}</p>
      </section>
      <section className="report-brief-card report-brief-next">
        <h3>接下来验证</h3>
        {next.length > 0 ? <ul>{next.map(({ id, label }) => (
          <li key={id}><ReportJump id={`survey-gap-${id}`}>{label}</ReportJump></li>
        ))}</ul> : <p>本版暂无待验证问题。</p>}
        {openGaps.length > next.length && <ReportJump id="survey-gaps">查看全部 {openGaps.length} 个待验证问题 →</ReportJump>}
      </section>
    </div>

    <section className="report-brief-evidence">
      <h3>{update ? "证据怎样改变判断" : "主要技术路径"}</h3>
      {update ? <div className="report-brief-evidence-grid">
        {update.evidence.map((item) => (
          <article key={item.source}>
            <header><h4>{item.title}</h4><span>{item.source}</span></header>
            <p>{item.change}</p>
            {item.links.map(({ id, label }) => <ReportJump key={id} id={`survey-evidence-${id}`}>{label} →</ReportJump>)}
          </article>
        ))}
      </div> : <div className="report-brief-evidence-grid">
        {report.taxonomy.slice(0, 3).map((route, index) => (
          <article key={index}>
            <header><h4>{route.problem}</h4></header>
            <p>{route.approach}</p>
            <ReportJump id="survey-taxonomy">技术权衡与来源 →</ReportJump>
          </article>
        ))}
      </div>}
    </section>
  </>;
}

export function TopicReportCard({ topic, report }: { topic: Topic; report: ResearchReport }) {
  return <li className="topic-card survey-directory-card"><div className="survey-card-top"><span className="survey-status">动态综述</span><time className="topic-meta" dateTime={report.asOf}>{report.asOf}</time></div><h2><Link to={`/topics/${topic.id}`}>{report.title} <ArrowUpRight size={17} /></Link></h2><p className="survey-card-abstract">{report.abstract}</p><div className="survey-card-question"><span>核心研究问题</span><p>{report.centralQuestion ?? report.researchQuestions[0]}</p></div><div className="survey-card-bottom"><div className="topic-meta"><span>{report.references.filter((ref) => ref.kind === "paper").length} 篇论文</span><span>{report.gaps.length} 个研究方向</span><span>修订 {report.revision}</span></div><Link to={`/topics/${topic.id}`} className="survey-read-link">阅读报告<ArrowRight size={14} /></Link></div></li>;
}

export default function TopicResearchReport({ topic, report, embedded = false }: { topic: Topic; report: ResearchReport; embedded?: boolean }) {
  const [query, setQuery] = useSearchParams();
  const read = query.get("read");
  const mode = read === "full" || (!embedded && read !== "brief") ? "full" : "brief";
  const [analysisOpen, setAnalysisOpen] = useState(mode === "full");
  const [historyRequested, setHistoryRequested] = useState(false);
  useEffect(() => {
    if (mode === "full") setAnalysisOpen(true);
  }, [mode]);
  const current = useFrozenVersion(topic.id, report.version, report);
  const pdf = current?.data?.hrefs.pdf, markdown = current?.data?.hrefs.md;
  const overview = reportOverview(report);
  const part = query.get("part");
  useEffect(() => {
    if (!part?.startsWith("survey-")) return;
    const frame = requestAnimationFrame(() => revealTopicPart(document, part, window.matchMedia("(prefers-reduced-motion: reduce)").matches));
    return () => cancelAnimationFrame(frame);
  }, [part, mode]);
  const papers = report.references.filter((reference) => reference.kind === "paper").length;
  const prs = report.references.filter((reference) => reference.kind === "pr").length;
  const toc = [
    { id: "survey-abstract", title: "摘要与研究问题" }, { id: "survey-methods", title: "范围与研究方法" }, { id: "survey-taxonomy", title: "技术路线与权衡" },
    ...report.sections.map((section, index) => ({ id: `survey-section-${index}`, title: section.title })),
    ...(report.evidenceDetails?.length ? [{ id: "survey-evidence", title: "附录 A：PR 原始证据" }] : []),
    { id: "survey-gaps", title: report.centralQuestion ? "附录 D：Gaps 验证协议" : "Research Gaps" },
    { id: "survey-limitations", title: "局限与证据边界" },
    ...(report.reviewSummary ? [{ id: "survey-review", title: "独立审查摘要" }] : []),
    { id: "survey-references", title: "参考文献" }, { id: "survey-evolution", title: "版本与持续研究" },
    embedded ? { id: "survey-pr-trends", title: "PR 与趋势" } : { id: "survey-appendix", title: "取材证据附录" },
  ];
  const uses = (id: string) => [
    ...report.taxonomy.flatMap((row, index) => row.sourceIds.includes(id) ? [{ id: `survey-route-${index}`, title: `路线 ${index + 1}` }] : []),
    ...report.sections.flatMap((section, index) => section.sourceIds.includes(id) ? [{ id: `survey-section-${index}`, title: section.title }] : []),
    ...report.gaps.flatMap((gap, index) => gap.sourceIds.includes(id) ? [{ id: `survey-gap-${gap.id}`, title: `G${index + 1} ${gap.title}` }] : []),
    ...(report.evidenceDetails ?? []).flatMap((evidence) => evidence.sourceIds.includes(id) ? [{ id: `survey-evidence-${evidence.id}`, title: evidence.comparison }] : []),
  ];
  function changeMode(nextMode: string) {
    const next = new URLSearchParams(query);
    if (embedded || nextMode === "brief") next.set("read", nextMode);
    else next.delete("read");
    next.delete("part");
    setQuery(next, { replace: true });
  }
  const downloads = <div className="survey-downloads">
    {!embedded && topic.academicPaper && <Link to={`/topics/${topic.id}?view=paper`}><BookOpen size={14} />学术综述稿</Link>}
    {markdown && <a href={markdown} download><FileText size={14} />报告源稿</a>}
    {pdf ? (
      <a className="survey-pdf" href={pdf} download={`${topic.id}-review-r${report.revision}-${report.version.slice(0, 12)}.pdf`}>
        <Download size={15} aria-hidden="true" />下载本版 PDF
      </a>
    ) : <button type="button" className="survey-pdf" disabled>
      {!report.pdfPath ? "PDF 尚未生成" : !current ? "正在核验冻结版本…" : "本版 PDF 暂不可用"}
    </button>}
  </div>;
  const modeSwitch = <div className="survey-read-switch" role="group" aria-label="阅读模式">
    <button type="button" aria-pressed={mode === "full"} onClick={() => changeMode("full")}><BookOpen size={14} aria-hidden="true" />精读全文</button>
    <button type="button" aria-pressed={mode === "brief"} onClick={() => changeMode("brief")}><Sparkles size={14} aria-hidden="true" />快速阅读</button>
  </div>;
  const body = (
    <div className="survey-layout"><nav className="survey-toc" aria-label="专题报告目录"><span>本报告</span>{toc.map((part, index) => <ReportJump key={part.id} id={part.id} aria-current={query.get("part") === part.id ? "location" : undefined}><small>{String(index + 1).padStart(2, "0")}</small>{part.title}</ReportJump>)}<div className="survey-toc-note">可按研究问题阅读，引用编号可定位到对应来源。</div></nav><article id="survey-paper" tabIndex={-1} className="survey-paper" aria-label="动态报告正文">
      {embedded && <h2>{report.title}</h2>}
      <section id="survey-abstract" tabIndex={-1} className="survey-abstract"><div className="survey-kicker">OVERVIEW</div><h2>摘要</h2><p>{report.abstract}</p><div className="survey-questions"><h3>这份报告回答什么</h3>{report.centralQuestion && <p className="survey-central-question"><strong>核心研究命题：</strong>{report.centralQuestion}</p>}<ol>{report.researchQuestions.map((question, index) => <li key={question}><span>RQ{index + 1}</span>{question}</li>)}</ol></div></section>
      <details id="survey-methods" className="survey-details" tabIndex={-1}><summary><span>研究范围与方法</span><small>查看检索、纳排标准与证据分级</small></summary><Methodology report={report} /><div className="survey-evidence-guide"><h3>如何使用这些来源</h3><ul><li>官方接口、固定版本文档与固定提交源码：解释对应版本的机制与约束。</li><li>原始系统论文：提供分析背景，其 GPU 结果不作为 Ascend 实测。</li><li>工程 PR 是一手公开记录；日报是二级整理。原文核查范围、历史日期与测试条件见每条来源说明。</li><li>综述方法来源：说明组织与更新原则，不提供性能证明。</li></ul></div><p className="survey-evidence-note">各项工程证据的取材层级以来源标注为准，区分一手原文、固定版本资料与二手日报分析。不同设备、负载和测试口径下的结果不能直接合并为统一加速比。</p></details>
      <section id="survey-taxonomy" tabIndex={-1}><div className="survey-kicker">TECHNICAL LANDSCAPE</div><h2>技术路线与关键权衡</h2><p className="survey-muted">围绕核心问题比较解决路径、适用条件和代价。</p><div className="survey-table-wrap" role="region" aria-label="技术路线比较，可横向滚动" tabIndex={0}><table className="survey-taxonomy"><caption>技术路线按问题、路径与代价比较</caption><thead><tr><th>核心技术问题</th><th>解决路径</th><th>边界与代价</th></tr></thead><tbody>{report.taxonomy.map((row, index) => <tr key={index} id={`survey-route-${index}`} tabIndex={-1}><th scope="row"><span className="survey-route-number">{String(index + 1).padStart(2, "0")}</span>{row.problem}</th><td>{row.approach}<Citations ids={row.sourceIds} references={report.references} /></td><td>{row.tradeoff}</td></tr>)}</tbody></table></div>
        {!!report.bottleneckMigration?.length && <>
          <h3>瓶颈迁移：原始依赖、机制变化与继发代价</h3>
          <div className="survey-table-wrap" role="region" aria-label="推测解码瓶颈迁移" tabIndex={0}>
            <table className="survey-taxonomy"><caption>不同路线并存，箭头表示瓶颈与资源约束转移而非算法先进性排行</caption>
              <thead><tr><th>此前瓶颈</th><th>减少的依赖与新机制</th><th>继发成本</th></tr></thead>
              <tbody>{report.bottleneckMigration.map((row, index) => <tr key={index}><th scope="row">{row.from}</th><td>{row.mechanism}<Citations ids={row.sourceIds} references={report.references} /></td><td>{row.newCost}</td></tr>)}</tbody>
            </table>
          </div>
        </>}
      </section>
      {report.sections.map((section, index) => <details key={`${mode}-${section.id}`} open={mode === "full"} id={`survey-section-${index}`} tabIndex={-1} className="survey-body-section">
        <summary><span className="survey-kicker">ANALYSIS {String(index + 1).padStart(2, "0")}</span><h2>{section.title}</h2>{mode === "brief" && <span className="survey-section-lead">{sectionLead(section.paragraphs[0] ?? "")}<span>展开分析</span></span>}</summary>
        {section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
        {section.subsections?.map((part) => <section key={part.title} className="survey-analytical-subsection">
          <h3>{part.title}</h3>
          {part.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          <div className="survey-section-sources"><span>小节依据</span><Citations ids={part.sourceIds} references={report.references} /></div>
        </section>)}
        {section.conclusion && <p className="survey-chapter-conclusion"><strong>本章综合判断：</strong>{section.conclusion}</p>}
        <div className="survey-section-sources"><span>本章来源</span><Citations ids={section.sourceIds} references={report.references} /></div>
      </details>)}
      <EvidenceDetails report={report} />
      <section id="survey-gaps" tabIndex={-1}><div className="survey-kicker">RESEARCH AGENDA</div><h2>{report.centralQuestion ? "附录 D：Research Gaps 的控制变量与证伪条件" : "未解问题与未来方向"}</h2><p className="survey-muted">以下问题由本报告的证据推导，按可验证的研究假设呈现。证据覆盖不足不等于全领域尚无人解决；验证路径是后续研究方案。</p><div className="survey-gap-list">{report.gaps.map((gap, index) => <div className="survey-gap" key={gap.id} id={`survey-gap-${gap.id}`} tabIndex={-1}><header><span className="survey-gap-number">G{index + 1}</span><h3>{gap.title}</h3><span className={`survey-gap-status ${gap.status === "resolved" ? "resolved" : ""}`}>{gap.researchType === "evaluation-method" ? "统一评估方法" : gap.researchType === "mechanism-gap" ? "机制衔接缺口" : gap.researchType === "hypothesis" ? "可证伪假设" : gapStatus[gap.status] ?? "待研究"}</span></header><dl>{gap.shortSummary && <><dt>问题定位</dt><dd>{gap.shortSummary}</dd></>}<dt>观察与证据边界</dt><dd>{gap.observation}<Citations ids={gap.sourceIds} references={report.references} /></dd><dt>{gap.status === "hypothesis" ? "待验证假设" : "待回答的问题"}</dt><dd>{gap.question}</dd><dt>如何验证（方案）</dt><dd>{gap.validation}</dd>{gap.strongestKnown && <><dt>已有方法</dt><dd>{gap.strongestKnown}</dd></>}{gap.hypothesis && <><dt>精确假设</dt><dd>{gap.hypothesis}</dd></>}{gap.strongBaseline && <><dt>强基线与对照</dt><dd>{gap.strongBaseline}</dd></>}{gap.controls && <><dt>控制变量</dt><dd>{gap.controls}</dd></>}{gap.metrics && <><dt>观测指标</dt><dd>{gap.metrics}</dd></>}{gap.falsification && <><dt>证伪条件</dt><dd>{gap.falsification}</dd></>}</dl></div>)}</div></section>
      <section id="survey-limitations" tabIndex={-1} className="survey-limitations"><h2>局限与证据边界</h2><ul>{report.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
      <IndependentReview report={report} />
      <section id="survey-references" tabIndex={-1}><div className="survey-kicker">REFERENCES</div><h2>参考文献与工程来源</h2><ol className="survey-references">{report.references.map((reference, index) => {
        const href = safeTopicSource(reference.url);
        return <li key={reference.id} id={`survey-ref-${reference.id}`} tabIndex={-1}><span className="survey-reference-number">[{index + 1}]</span><div><div className="topic-meta"><span className={`survey-source-kind ${reference.kind}`}>{reference.kind === "pr" ? <GitPullRequest size={11} /> : <BookOpen size={11} />}{referenceKind[reference.kind]}</span>{reference.year && <span>{reference.year}</span>}<span>{reference.evidenceLevel}</span></div><p>{href ? <a href={href} target="_blank" rel="noreferrer">{reference.title} <ArrowUpRight size={12} /></a> : reference.title}</p>{reference.note && <small>{reference.note}</small>}{reference.kind === "pr" && (() => {
          const archive = topic.entries.find((entry) => entry.workId === reference.workId);
          return archive ? <Link className="survey-archive-link" to={{ pathname: `/reports/${archive.day}`, search: new URLSearchParams({ version: archive.version, section: archive.number }).toString() }}>二级日报记录 · {archive.day} · {archive.number} <ArrowRight size={12} /></Link> : <small>补充来源：不在本页候选日报归档中。</small>;
        })()}<div className="survey-reference-uses"><span>返回引用位置</span>{uses(reference.id).map((use) => <ReportJump key={use.id} id={use.id}>{use.title}</ReportJump>)}</div></div></li>;
      })}</ol></section>
      {!embedded && <section id="survey-evolution" tabIndex={-1}>
        <h2>版本与持续研究</h2>
        <ReportHistory topic={topic} report={report} current={current?.data} embedded={false} requested />
      </section>}
      {!embedded && <details id="survey-appendix" tabIndex={-1} className="survey-details survey-appendix"><summary><span>取材证据附录</span><small>{topic.entries.length} 项归档线索 · 可筛选并回溯日报</small></summary><p className="survey-muted">关键词归类用于发现线索，部分条目可能仅间接相关；报告采用的证据以参考文献和正文引用为准。归档覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}。</p><EvidenceList entries={topic.entries} labels={topic.labels} /></details>}
      <ReportJump id="survey-top">返回报告开头 ↑</ReportJump><footer className="survey-footer">专题报告是研究交付物。可供下游团队引用、评估与继续研究；研究结论随新证据修订。</footer>
    </article></div>
  );
  const previousRevision = topic.id === "aclgraph" && report.version === aclGraphReportUpdate.version ? aclGraphReportUpdate.previousRevision : undefined;

  const updateDate = report.changelog[report.changelog.length - 1]?.date;

  return <div className="survey-page">
    <ReportJump className="survey-skip" id="survey-paper">跳到报告正文</ReportJump>
    {!embedded && <Link className="topic-back" to="/topics"><ArrowLeft size={15} /> 专题研究库</Link>}
    {embedded ? <>
      <header className="report-brief-heading" id="survey-top" tabIndex={-1}>
        <div>
          <h2>动态报告</h2>
          <p className="survey-meta">
            <span>修订 {report.revision}{previousRevision && ` · 对比修订 ${previousRevision}`}</span>
            <span>{updateDate ? "更新于" : "研究截至"} <time dateTime={updateDate ?? report.asOf}>{updateDate ?? report.asOf}</time></span>
          </p>
        </div>
        {downloads}
      </header>
      {current?.error && <p className="survey-artifact-note" role="status">{current.error}</p>}
      <ReportUpdateOverview report={report} topicId={topic.id} />
      <details className="report-brief-disclosure report-pr-trends" id="survey-pr-trends" tabIndex={-1}>
        <summary>PR 与趋势 <span>每日收录与 {topic.entries.length} 条 PR 线索</span></summary>
        <div className="report-brief-disclosure-content">
          <EvidenceTimeline topic={topic} report={report} />
          <section id="survey-appendix" tabIndex={-1} aria-labelledby="report-pr-index">
            <h3 id="report-pr-index">PR 取材索引</h3>
            <p className="survey-muted">覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}。可按社区或子方向筛选，打开原始 PR 或对应日报。</p>
            <EvidenceList entries={topic.entries} labels={topic.labels} />
          </section>
        </div>
      </details>
      <details className="report-brief-disclosure" id="survey-analysis" tabIndex={-1} open={analysisOpen} onToggle={(event) => setAnalysisOpen(event.currentTarget.open)}>
        <summary>具体分析 <span>{report.sections.length} 节正文、证据与引用</span></summary>
        <div className="report-brief-disclosure-content">
          <div className="survey-toolbar">{modeSwitch}</div>
          {body}
        </div>
      </details>
      <details className="report-brief-disclosure" id="survey-evolution" tabIndex={-1} onToggle={(event) => {
        if (event.currentTarget.open) setHistoryRequested(true);
      }}>
        <summary>历史版本 <span>修订记录与各版下载</span></summary>
        <div className="report-brief-disclosure-content">
          <ReportHistory topic={topic} report={report} current={current?.data} embedded requested={historyRequested} />
        </div>
      </details>
    </> : <>
    <header id="survey-top" tabIndex={-1} className="survey-heading"><div className="docx-eyebrow">LIVING TECHNICAL REVIEW <span>持续演进的技术综述</span></div><div className="survey-title-row"><h1>{report.title}</h1><span className="survey-status">研究草稿</span></div><p className="survey-deck">{topic.description}</p><div className="survey-meta"><span>研究截至 <time dateTime={report.asOf}>{report.asOf}</time></span><span>修订 {report.revision}</span><span>{report.references.length} 项来源 · {papers} 篇背景论文 · {prs} 项 PR 证据</span></div>
      <div className="survey-takeaways" aria-label="报告速览"><div><h2>核心问题</h2><p>{overview.problem}</p></div>{overview.conclusion && <div><h2>综合判断</h2><p>{overview.conclusion}<ReportJump id="survey-taxonomy">查看技术权衡</ReportJump></p></div>}{overview.boundary && <div><h2>证据边界</h2><p>{overview.boundary}<ReportJump id="survey-limitations">查看适用范围</ReportJump></p></div>}</div>
      <div className="survey-toolbar">{modeSwitch}{downloads}</div><p className="survey-reading-note" role="status">{mode === "brief" ? "速读：保留摘要、路线比较与研究问题；8节分析可逐节展开。".replace("8", String(report.sections.length)) : "精读：展开全部技术分析；可随时单独折叠。"} 引用编号可跳转来源并返回引用位置。</p><p className="survey-artifact-note" role="status">{current?.error ?? (current?.data ? `已核对网页与冻结稿一致 · 修订 ${report.revision} · ${report.version.slice(0, 12)}。下载文件与此版本绑定。` : "正在核对网页内容与冻结稿；核验完成后提供下载。")}</p></header>
      {body}
    </>}
  </div>;
}

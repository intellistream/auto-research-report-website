import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import {
  aclGraphDynamicReport as report, filterFeaturedPrs, filterTrackedPrs, findTrackedPrByWorkId,
  formatIsoDate, hotspotById, legacyRevisionHrefs, repoLabel, resolveSurveySectionLink, shortSha,
} from "./aclgraph-dynamic-report";
import type {
  BaselineUpdate, DailyReference, FeaturedPr, FeaturedPrFilters, HotspotColorToken, HotspotFilter,
  HotspotId, PrState, RepoFilter, Repository, StatusFilter, TrackedPrFilters, TrackedStatusFilter,
} from "./aclgraph-dynamic-report";
import { safeTopicSource } from "./topic-report";
import "./aclgraph-dynamic-report.css";

const featuredBySlug = new Map(report.featuredPrs.map(pr => [pr.slug, pr]));
const activeBaseline = report.baselineUpdates.filter(pr => pr.changeStatus === "active-commits");
const quietBaseline = report.baselineUpdates.filter(pr => pr.changeStatus !== "active-commits");
const defaultTrackedFilters: TrackedPrFilters = { query: "", repo: "all", hotspot: "all", status: "all" };
const repositories = ["all", "vllm-ascend", "vllm"] as const;
const statusOptions: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部状态" }, { value: "MERGED", label: "已合入" }, { value: "OPEN", label: "开放中" },
];

function readRepo(value: string | null): RepoFilter {
  return value === "vllm-ascend" || value === "vllm" ? value : "all";
}

function readHotspot(value: string | null): HotspotFilter {
  return report.hotspots.find(hotspot => hotspot.id === value)?.id ?? "all";
}

function readStatus(value: string | null): StatusFilter {
  return value === "OPEN" || value === "MERGED" ? value : "all";
}

function RepoBadge({ repository }: { repository: Repository }) {
  return <span className={"acl-pr-repo acl-pr-repo--" + repository}>{repoLabel(repository)}</span>;
}

function StatusBadge({ state, mergedAt }: { state: PrState; mergedAt?: string | null }) {
  return <span className={"acl-pr-status acl-pr-status--" + state.toLowerCase()}>
    {state === "MERGED" ? "已合入" : "开放中"}
    {state === "MERGED" && mergedAt && <><span aria-hidden="true">·</span><time dateTime={mergedAt}>{formatIsoDate(mergedAt).slice(5)}</time></>}
  </span>;
}

function HotspotPill({ id }: { id: HotspotId }) {
  const hotspot = hotspotById(id);
  return hotspot && <span className="acl-radar-hotspot-pill" data-hotspot={hotspot.colorToken}>
    <i className="acl-radar-dot" aria-hidden="true" />{hotspot.shortLabel}
  </span>;
}

function DailyLinks({ references }: { references: DailyReference[] }) {
  return <>{references.map(ref => <Link key={[ref.day, ref.version, ref.number].join(":")}
    to={{ pathname: "/reports/" + ref.day, search: new URLSearchParams({ version: ref.version, section: ref.number }).toString() }}
    title={ref.title}>日报 {ref.day} {ref.number}</Link>)}</>;
}

function FilterPills<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string; color?: HotspotColorToken }[];
  onChange: (value: T) => void;
}) {
  return <fieldset className="acl-radar-filter-group">
    <legend>{label}</legend>
    <div className="acl-radar-pills">{options.map(option => <button type="button" key={option.value}
      className="acl-radar-filter-pill" data-hotspot={option.color} aria-pressed={value === option.value}
      onClick={() => onChange(option.value)}>
      {option.color && <i className="acl-radar-dot" aria-hidden="true" />}{option.label}
    </button>)}</div>
  </fieldset>;
}

function FeaturedCard({ pr, topic }: { pr: FeaturedPr; topic?: Topic }) {
  const surveyLink = resolveSurveySectionLink(pr.surveyConnection.targetSectionHint, topic);
  const githubHref = safeTopicSource(pr.url);
  return <article id={"acl-pr-" + pr.slug} tabIndex={-1} className="acl-pr-card" aria-labelledby={"acl-pr-title-" + pr.slug}>
    <header className="acl-pr-header">
      <div className="acl-radar-meta">
        <RepoBadge repository={pr.repository} /><span className="acl-pr-number">#{pr.number}</span>
        <StatusBadge state={pr.state} mergedAt={pr.mergedAt} /><HotspotPill id={pr.hotspotId} />
        <span className="acl-radar-chip">{pr.changeTag}</span>
      </div>
      <h4 id={"acl-pr-title-" + pr.slug}>{pr.zhTitle}</h4>
      <p className="acl-pr-en-title" lang="en">{pr.title}</p>
    </header>
    <dl className="acl-pr-body">
      <div><dt>改了什么</dt><dd>{pr.whatChanged}</dd></div>
      <div><dt>核心机制</dt><dd>{pr.mechanism}</dd></div>
      <div className="acl-pr-evidence"><dt>实测与边界</dt><dd>{pr.evidenceAndBoundary}</dd></div>
      <div className="acl-pr-survey"><dt>与论文综述的联系</dt><dd>
        <p>{pr.surveyConnection.summary}</p>
        <span className="acl-pr-taxonomy">{pr.surveyConnection.taxonomyBranch}</span>
        <div className="acl-pr-survey-links">
          <Link to={surveyLink.appTo}>阅读论文综述第 {surveyLink.sectionNumber} 节 · {surveyLink.sectionTitle} →</Link>
          {surveyLink.htmlHref && <a href={surveyLink.htmlHref} target="_blank" rel="noreferrer">独立打开对应章节 ↗</a>}
        </div>
      </dd></div>
    </dl>
    <footer className="acl-pr-footer">
      {githubHref && <a className="acl-pr-source" href={githubHref} target="_blank" rel="noreferrer">GitHub PR ↗</a>}
      <span>head <code title={pr.headSha}>{shortSha(pr.headSha)}</code></span>
      <span>{pr.changedFilesCount} 个变更文件</span>
      <span>核对 <time dateTime={report.checkedAt}>{formatIsoDate(report.checkedAt)}</time></span>
      <DailyLinks references={pr.dailyReferences} />
    </footer>
    <details className="acl-pr-more"><summary>核查范围与下一步跟踪</summary>
      <p><strong>核查范围</strong> {pr.readingScope}</p><p><strong>下一步</strong> {pr.nextWatch}</p>
    </details>
  </article>;
}

function BaselineCard({ pr }: { pr: BaselineUpdate }) {
  return <article className="acl-baseline-card">
    <div className="acl-radar-meta">
      <a href={safeTopicSource(pr.url)} target="_blank" rel="noreferrer">vLLM-Ascend #{pr.number} ↗</a>
      <StatusBadge state={pr.currentState} />
      <span className="acl-baseline-delta">+{pr.commitsAfterNov11} 次新提交</span>
      <span className="acl-radar-chip">{pr.baselineEvidenceId === "pending" ? "待综合" : pr.baselineEvidenceId}</span>
    </div>
    <h4>{pr.zhTitle}</h4><p className="acl-pr-en-title" lang="en">{pr.title}</p>
    <div className="acl-baseline-diff">
      <span><code title={pr.baselineHeadSha ?? undefined}>{pr.baselineHeadSha ? shortSha(pr.baselineHeadSha) : "基线未录 SHA"}</code>
        <span aria-label="更新为"> → </span><code title={pr.currentHeadSha}>{shortSha(pr.currentHeadSha)}</code></span>
      <time dateTime={pr.latestCommitDate}>{formatIsoDate(pr.latestCommitDate)}</time>
      <span className="acl-baseline-commit" title={pr.latestCommitMessage} lang="en">{pr.latestCommitMessage}</span>
    </div>
    <p className="acl-baseline-note">{pr.statusNote}</p>
  </article>;
}

function TrackedIndex({ onJump }: { onJump: (slug: string) => void }) {
  const [filters, setFilters] = useState<TrackedPrFilters>(defaultTrackedFilters);
  const prs = filterTrackedPrs(report.allTrackedPrs, filters);
  const filtered = filters.query !== "" || filters.repo !== "all" || filters.hotspot !== "all" || filters.status !== "all";
  const reset = () => setFilters(defaultTrackedFilters);
  return <details className="acl-radar-drawer" id="acl-radar-all-prs">
    <summary><span>完整追踪 PR 索引</span>
      <span className="acl-radar-chip">全部 {report.kpis.trackedPrCount} 条（Ascend {report.kpis.ascendCount} · vLLM {report.kpis.vllmCount}）</span>
    </summary>
    <div className="acl-radar-drawer-body">
      <div className="acl-radar-index-filters" role="group" aria-label="完整 PR 索引筛选">
        <label className="acl-radar-search">搜索 PR
          <input type="search" value={filters.query} placeholder="编号、标题或标签" aria-controls="acl-radar-index-table"
            onChange={event => setFilters({ ...filters, query: event.target.value })} />
        </label>
        <label>仓库<select value={filters.repo} onChange={event => setFilters({ ...filters, repo: readRepo(event.target.value) })}>
          {repositories.map(repo => <option key={repo} value={repo}>{repo === "all" ? "全部仓库" : repoLabel(repo)}</option>)}
        </select></label>
        <label>工程热点<select value={filters.hotspot} onChange={event => setFilters({ ...filters, hotspot: readHotspot(event.target.value) })}>
          <option value="all">全部热点</option>{report.hotspots.map(h => <option key={h.id} value={h.id}>{h.shortLabel}</option>)}
        </select></label>
        <label>状态<select value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value as TrackedStatusFilter })}>
          <option value="all">全部</option><option value="merged-in-window">近两周新合入</option>
          <option value="MERGED">已合入</option><option value="OPEN">开放中</option>
        </select></label>
      </div>
      <div className="acl-radar-result-row"><span role="status" aria-live="polite">匹配 {prs.length} / {report.allTrackedPrs.length} 条 PR</span>
        {filtered && <button type="button" className="acl-radar-reset" onClick={reset}>重置索引筛选</button>}
      </div>
      <div className="acl-radar-table-scroll" tabIndex={0} role="region" aria-label="完整追踪 PR 表，可横向滚动">
        <table className="acl-radar-table" id="acl-radar-index-table">
          <caption className="acl-radar-sr-only">完整追踪工程 PR，当前匹配 {prs.length} 条</caption>
          <thead><tr><th scope="col">仓库 / PR</th><th scope="col">标题</th><th scope="col">工程热点</th>
            <th scope="col">状态 / 日期</th><th scope="col">变更文件</th><th scope="col">日报</th></tr></thead>
          <tbody>{prs.map(pr => <tr key={pr.workId}>
            <td><a className="acl-radar-table-pr" href={safeTopicSource(pr.url)} target="_blank" rel="noreferrer">
              <RepoBadge repository={pr.repository} /><strong>#{pr.number} ↗</strong></a></td>
            <td><p className="acl-radar-table-title" lang="en">{pr.title}</p><div className="acl-radar-meta">
              {pr.isFeatured && pr.featuredSlug && <button type="button" className="acl-radar-inline-button"
                onClick={() => onJump(pr.featuredSlug!)} aria-label={"阅读 PR #" + pr.number + " 的重点解读"}>重点解读 ↑</button>}
              {pr.isBaseline && <span className="acl-radar-chip">基线</span>}{pr.draft && <span className="acl-radar-chip">草稿</span>}
            </div></td>
            <td><HotspotPill id={pr.hotspotId} /></td>
            <td><StatusBadge state={pr.state} /><span className="acl-radar-table-date">{pr.state === "MERGED" ? "合入 " : "更新 "}
              <time dateTime={pr.mergedAt ?? pr.updatedAt}>{formatIsoDate(pr.mergedAt ?? pr.updatedAt)}</time></span></td>
            <td className="acl-radar-table-number">{pr.changedFilesCount}</td>
            <td><div className="acl-radar-table-daily">{pr.dailyReferences.length ? <DailyLinks references={pr.dailyReferences} /> : <span aria-label="无日报引用">—</span>}</div></td>
          </tr>)}</tbody>
        </table>
      </div>
      {!prs.length && <div className="acl-radar-empty"><p>还没有匹配的 PR，试试其他关键词或放宽筛选。</p>
        <button type="button" className="acl-radar-reset" onClick={reset}>重置索引筛选</button></div>}
    </div>
  </details>;
}

function LegacyArchive() {
  return <details className="acl-radar-drawer" id="acl-radar-archive">
    <summary><span>历史修订与旧版工程报告归档</span><span className="acl-radar-chip">Rev 1–3 冻结稿 · 支持切换旧版视图</span></summary>
    <div className="acl-radar-drawer-body">
      <p className="acl-radar-muted">{report.legacyArchive.description}</p>
      <Link className="acl-radar-archive-switch" to={{ pathname: "/topics/aclgraph", search: "view=report&legacy=1" }}>
        切换到旧版静态工程报告视图（Rev 3）→
      </Link>
      <ol className="acl-radar-revisions">{report.legacyArchive.revisions.map(rev => {
        const hrefs = legacyRevisionHrefs(rev.version);
        return <li key={rev.version}>
          <div className="acl-radar-revision-meta"><span className="acl-radar-revision-number">Rev {rev.revision}</span>
            <time dateTime={rev.asOf}>{rev.asOf}</time><code title={rev.version}>{rev.version.slice(0, 8)}</code></div>
          <div><h4>{rev.label}</h4><p>{rev.summary}</p><div className="acl-radar-archive-links">
            {hrefs.html && <a href={hrefs.html} target="_blank" rel="noreferrer">阅读冻结网页 ↗</a>}
            {hrefs.pdf && <a href={hrefs.pdf} download>下载 PDF</a>}
            {hrefs.md && <a href={hrefs.md} download>Markdown 源稿</a>}
            {hrefs.json && <a href={hrefs.json} download>冻结 JSON</a>}
          </div></div>
        </li>;
      })}</ol>
    </div>
  </details>;
}

export default function AclGraphDynamicReport({ topic }: { topic?: Topic }) {
  const [query, setQuery] = useSearchParams();
  // The router is the single source of truth: SSR, shared URLs and Back/Forward agree.
  const repoFilter = readRepo(query.get("repo"));
  const hotspotFilter = readHotspot(query.get("hotspot"));
  const statusFilter = readStatus(query.get("status"));
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const featured = filterFeaturedPrs(report.featuredPrs, { repo: repoFilter, hotspot: hotspotFilter, status: statusFilter });
  const activeHotspot = hotspotFilter === "all" ? undefined : hotspotById(hotspotFilter);
  const filtered = repoFilter !== "all" || hotspotFilter !== "all" || statusFilter !== "all";

  function updateFilters(changes: Partial<FeaturedPrFilters>) {
    setQuery(previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        if (value === "all") next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true, preventScrollReset: true });
  }

  function resetFilters() {
    updateFilters({ repo: "all", hotspot: "all", status: "all" });
  }

  function toggleHotspot(id: HotspotId) {
    updateFilters({ hotspot: hotspotFilter === id ? "all" : id });
  }

  function jumpToFeatured(slug: string) {
    const pr = featuredBySlug.get(slug);
    if (!pr) return;
    const changes: Partial<FeaturedPrFilters> = {};
    if (repoFilter !== "all" && repoFilter !== pr.repository) changes.repo = "all";
    if (hotspotFilter !== "all" && hotspotFilter !== pr.hotspotId) changes.hotspot = "all";
    if (statusFilter !== "all" && statusFilter !== pr.state) changes.status = "all";
    if (Object.keys(changes).length) updateFilters(changes);
    setPendingJump(slug);
  }

  useEffect(() => {
    if (!pendingJump) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById("acl-pr-" + pendingJump);
      // A router transition may commit after the local jump request; retry when its filters arrive.
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      setPendingJump(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingJump, repoFilter, hotspotFilter, statusFilter]);

  const hotspotOptions = [
    { value: "all" as const, label: "全部热点" },
    ...report.hotspots.map(h => ({ value: h.id, label: h.shortLabel, color: h.colorToken })),
  ];

  return <article className="acl-radar" aria-labelledby="acl-radar-headline">
    <header className="acl-radar-hero">
      <div className="acl-radar-edition"><span className="acl-radar-eyebrow">社区 PR 趋势雷达</span>
        <span>观察窗口 <time dateTime={report.periodStart}>{report.periodStart}</time> 至 <time dateTime={report.periodEnd}>{report.periodEnd}</time>
          {" · 本期核对 "}<time dateTime={report.edition}>{report.edition}</time></span>
      </div>
      <h2 id="acl-radar-headline">{report.headline}</h2>
      <p className="acl-radar-tldr">{report.tldr}</p>
      <details className="acl-radar-scope"><summary>数据统计口径</summary><p>{report.scopeSummary}</p></details>
      <dl className="acl-radar-kpis">{report.kpis.cards.map(card => <div key={card.id} className="acl-radar-kpi">
        <dt>{card.label}</dt><dd><strong>{card.value}</strong><span>{card.detail}</span></dd>
      </div>)}</dl>
      <div className="acl-radar-hotspots">
        <div className="acl-radar-hotspots-heading"><div><h3>四大工程热点分布</h3><p>点击色块或图例，直接筛选下方重点 PR</p></div>
          {activeHotspot && <div className="acl-radar-hotspots-active"><span>已选：{activeHotspot.shortLabel}</span>
            <button type="button" className="acl-radar-reset" onClick={() => updateFilters({ hotspot: "all" })}>显示全部</button></div>}
        </div>
        <div className="acl-radar-distribution" role="group" aria-label="四大工程热点占比">
          {report.hotspots.map(h => <button type="button" key={h.id} className="acl-radar-segment" data-hotspot={h.colorToken}
            style={{ width: h.sharePct + "%" }} aria-pressed={hotspotFilter === h.id} aria-controls="acl-radar-featured"
            aria-label={h.shortLabel + "，" + h.sharePct.toFixed(1) + "%，" + h.count + " 条 PR"} onClick={() => toggleHotspot(h.id)}>
            <span>{h.sharePct.toFixed(1) + "%"}</span>
          </button>)}
        </div>
        <div className="acl-radar-legend" role="group" aria-label="按工程热点筛选重点 PR">{report.hotspots.map(h =>
          <button type="button" key={h.id} className="acl-radar-legend-chip" data-hotspot={h.colorToken}
            aria-pressed={hotspotFilter === h.id} aria-controls="acl-radar-featured" onClick={() => toggleHotspot(h.id)}>
            <span className="acl-radar-legend-label"><i className="acl-radar-dot" aria-hidden="true" />{h.shortLabel}</span>
            <span className="acl-radar-legend-figure"><strong>{h.sharePct.toFixed(1) + "%"}</strong><span>{h.count} 条</span></span>
            <span className="acl-radar-legend-split">Ascend {h.ascendCount} · vLLM {h.vllmCount} · 新合入 {h.mergedInWindow}</span>
          </button>)}</div>
        {activeHotspot && <p className="acl-radar-spotlight" data-hotspot={activeHotspot.colorToken} role="status">
          <strong>{activeHotspot.label}</strong><span>{activeHotspot.oneLineSummary}</span>
        </p>}
      </div>
    </header>

    <section id="acl-radar-insights" aria-labelledby="acl-radar-insights-title">
      <div className="acl-radar-section-heading"><span className="acl-radar-section-number" aria-hidden="true">01</span>
        <div><h3 id="acl-radar-insights-title">本期 PR 关注焦点</h3>
          <p>从 {report.kpis.trackedPrCount} 条工程 PR 提炼的 {report.insights.length} 条核心演进信号</p></div></div>
      <div className="acl-radar-insight-grid">{report.insights.map(insight => <article key={insight.id}
        className="acl-radar-insight" data-hotspot={hotspotById(insight.hotspotId)?.colorToken}>
        <div className="acl-radar-meta"><span className="acl-radar-insight-tag">{insight.tag}</span><HotspotPill id={insight.hotspotId} /></div>
        <h4>{insight.title}</h4><p className="acl-radar-insight-summary">{insight.summary}</p>
        <dl className="acl-radar-comparison"><div><dt>昇腾进展</dt><dd>{insight.ascendSignal}</dd></div>
          <div><dt>上游对照</dt><dd>{insight.upstreamBenchmark}</dd></div></dl>
        <p className="acl-radar-takeaway">{insight.takeaway}</p>
        <div className="acl-radar-jump-pills" aria-label="跳转到相关重点 PR">{insight.featuredSlugs.map(slug => {
          const pr = featuredBySlug.get(slug);
          return pr && <button type="button" key={slug} className="acl-radar-jump" onClick={() => jumpToFeatured(slug)}
            title={pr.zhTitle} aria-label={"阅读 #" + pr.number + "：" + pr.zhTitle} aria-controls={"acl-pr-" + slug}>
            <strong>#{pr.number}</strong><span className="acl-radar-jump-label">{pr.zhTitle}</span><span aria-hidden="true">↓</span>
          </button>;
        })}</div>
      </article>)}</div>
    </section>

    <section id="acl-radar-featured" aria-labelledby="acl-radar-featured-title">
      <div className="acl-radar-section-heading"><span className="acl-radar-section-number" aria-hidden="true">02</span>
        <div><h3 id="acl-radar-featured-title">重点 PR 深度解读</h3><p>读懂改动、机制与适用边界，连接论文综述中的研究问题</p></div></div>
      <div className="acl-radar-filters">
        <FilterPills label="仓库" value={repoFilter} options={repositories.map(repo => ({ value: repo,
          label: (repo === "all" ? "全部" : repoLabel(repo)) + "（" + report.featuredPrs.filter(pr => repo === "all" || pr.repository === repo).length + "）",
        }))} onChange={repo => updateFilters({ repo })} />
        <FilterPills<HotspotFilter> label="工程热点" value={hotspotFilter} options={hotspotOptions} onChange={hotspot => updateFilters({ hotspot })} />
        <div className="acl-radar-filter-bottom"><FilterPills label="状态" value={statusFilter} options={statusOptions} onChange={status => updateFilters({ status })} />
          <div className="acl-radar-result-row"><span role="status" aria-live="polite">当前显示 <strong>{featured.length} / {report.featuredPrs.length}</strong> 条重点 PR</span>
            {filtered && <button type="button" className="acl-radar-reset" onClick={resetFilters}>重置筛选</button>}</div>
        </div>
      </div>
      <div className="acl-radar-featured-stream">{featured.map(pr => <FeaturedCard key={pr.slug} pr={pr} topic={topic} />)}</div>
      {!featured.length && <div className="acl-radar-empty"><h4>这个组合暂时没有重点 PR</h4><p>放宽一个筛选条件，就能继续阅读本期进展。</p>
        <button type="button" className="acl-radar-reset" onClick={resetFilters}>重置全部筛选</button></div>}
    </section>

    <section id="acl-radar-baseline" aria-labelledby="acl-radar-baseline-title">
      <div className="acl-radar-section-heading"><span className="acl-radar-section-number" aria-hidden="true">03</span>
        <div><h3 id="acl-radar-baseline-title">既有 {report.baselineUpdates.length} 条跟踪 PR 状态变动</h3><p>接续历史基线，看清哪些工作仍在推进</p></div></div>
      <div className="acl-baseline-summary">
        <span className="acl-baseline-delta">{activeBaseline.length} 条有 11-11 后新提交</span>
        <span className="acl-radar-chip">{quietBaseline.filter(pr => pr.changeStatus === "open-unchanged").length} 条开放未变</span>
        <span className="acl-radar-chip">{quietBaseline.filter(pr => pr.changeStatus === "merged-pre-baseline").length} 条基线前已合入</span>
      </div>
      <p className="acl-baseline-supplement">{report.baselineR3SupplementNote}</p>
      <div className="acl-baseline-grid">{activeBaseline.map(pr => <BaselineCard key={pr.workId} pr={pr} />)}</div>
      <div className="acl-baseline-quiet"><h4>开放未变与基线前已合入</h4>
        <ul className="acl-baseline-list">{quietBaseline.map(pr => <li key={pr.workId}>
          <div className="acl-baseline-list-meta"><a href={safeTopicSource(pr.url)} target="_blank" rel="noreferrer">vLLM-Ascend #{pr.number} ↗</a>
            <StatusBadge state={pr.currentState} /></div>
          <div className="acl-baseline-list-copy"><h4>{pr.zhTitle}</h4><p>{pr.statusNote}</p></div>
          <div className="acl-baseline-list-sha"><code title={pr.currentHeadSha}>{shortSha(pr.currentHeadSha)}</code>
            <span>{pr.mergedAt ? <>合入 <time dateTime={pr.mergedAt}>{formatIsoDate(pr.mergedAt)}</time></> : "SHA 未变"}</span></div>
        </li>)}</ul>
      </div>
    </section>

    <section id="acl-radar-watchlist" aria-labelledby="acl-radar-watchlist-title">
      <div className="acl-radar-section-heading"><span className="acl-radar-section-number" aria-hidden="true">04</span>
        <div><h3 id="acl-radar-watchlist-title">下一轮重点关注</h3><p>沿着具体 PR，继续跟踪值得验证的变化</p></div></div>
      <div className="acl-radar-watch-grid">{report.nextWatchlist.map(item => <article key={item.id} className="acl-radar-watch-card">
        <HotspotPill id={item.hotspotId} /><h4>{item.title}</h4><p>{item.whyItMatters}</p>
        <div className="acl-radar-watch-signal"><strong>跟踪信号</strong><p>{item.signalToWatch}</p></div>
        <div className="acl-radar-jump-pills">{item.watchPrs.map(workId => {
          const pr = findTrackedPrByWorkId(workId);
          const href = pr && safeTopicSource(pr.url);
          return pr && href && <a className="acl-radar-jump" key={workId} href={href} target="_blank" rel="noreferrer" title={pr.title}>
            {repoLabel(pr.repository)} <strong>#{pr.number}</strong> ↗
          </a>;
        })}</div>
      </article>)}</div>
    </section>
    <div className="acl-radar-drawers"><TrackedIndex onJump={jumpToFeatured} /><LegacyArchive /></div>
  </article>;
}

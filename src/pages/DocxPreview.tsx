import { lazy, Suspense, useEffect, useMemo, useRef } from "react";
import { Activity, ArrowRight, ArrowUpRight, Download } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useMatch, useParams, useSearchParams } from "react-router-dom";
import InferenceMap from "./InferenceMap";
import CompleteInferenceFlow from "./CompleteInferenceFlow";
import ReportTrends, { uniquePRs } from "./ReportTrends";
import DirectionDistribution from "./DirectionDistribution";
import type { TopicIndex } from "./TopicPages";
import { selectChapterIntros, type FlowIndex } from "./chapter-intros";
import ReportCounts from "./ReportCounts";
import { historyArchive, localReports, useJson, type Catalog, type Report } from "./report-preview-data";
import "./docx-preview.css";

const DailyReportReader = lazy(() => import("./DailyReportReader"));
const TopicPages = lazy(() => import("./TopicPages"));
const Contributors = lazy(() => import("./Contributors"));
const ResearchQuery = lazy(() => import("./ResearchQuery"));

function FlowOverview({ catalog, days, result }: {
  catalog: Catalog;
  days: string[];
  result?: { data?: FlowIndex; error?: string };
}) {
  const [query, setQuery] = useSearchParams();
  const source = query.get("source") ?? "";
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const data = result?.data;
  const latestDay = days[0];
  const latest = catalog.days[latestDay];
  const latestCounts = latest.versions.find((version) => version.sha256 === latest.current)?.counts;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "from" && value && to && value > to) next.set("to", value);
    if (key === "to" && value && from && value < from) next.set("from", value);
    setQuery(next, { replace: true });
  }
  const chronological = useMemo(() => [...days].reverse(), [days]);
  const scopedDays = useMemo(
    () => days.filter((day) => (!from || day >= from) && (!to || day <= to)),
    [days, from, to],
  );
  const { observations, entries, intros, papers, coveredStages } = useMemo(() => {
    const activeDays = new Set(scopedDays);
    const indexedEntries = Array.isArray(data?.entries) ? data.entries : [];
    const observations = indexedEntries.filter((entry) =>
      activeDays.has(entry.day) && (!source || entry.workId.split("#")[0] === source)
    );
    const entries = uniquePRs(observations);
    const intros = selectChapterIntros(data?.chapters, indexedEntries,
      Object.fromEntries(days.map((day) => [day, catalog.days[day].current])), scopedDays, source);
    const papers = scopedDays.reduce((sum, day) => {
      const record = catalog.days[day];
      return sum + (record.versions.find(({ sha256 }) => sha256 === record.current)?.counts.papers ?? 0);
    }, 0);
    const coveredStages = new Set(entries.map(({ stage }) => stage).filter((stage) => stage !== "classification_conflict")).size;
    return { observations, entries, intros, papers, coveredStages };
  }, [catalog, data, days, scopedDays, source]);
  return (
    <div className="docx-overview">
      <header className="overview-masthead">
        <div className="overview-title">
          <p className="overview-sources" translate="no"><span>vLLM</span><span>vLLM Ascend</span></p>
          <h1>推理性能日报</h1>
          <p className="overview-intro">按日期追踪社区改动，按推理环节查找 PR。</p>
        </div>
        <Link className="overview-latest" to={`/reports/${latestDay}`}>
          <span className="overview-issue-label">{localReports ? "本地最新日报" : "最新一期"}</span>
          <span className="overview-issue-action" aria-hidden="true"><ArrowUpRight size={21} /></span>
          <time dateTime={latestDay}>{latestDay}</time>
          {latestCounts && (
            <div className="overview-issue-counts">
              <span className="overview-issue-legend">
                <span>vLLM <strong>{latestCounts.upstream}</strong></span>
                <span>vLLM Ascend <strong>{latestCounts.ascend}</strong></span>
              </span>
            </div>
          )}
        </Link>
      </header>
      <div className="docx-flow-toolbar" role="group" aria-label="首页统计筛选">
        <div className="docx-flow-filters">
          <label>社区
            <select name="source" value={source} onChange={(event) => filter("source", event.target.value)}>
              <option value="">全部来源</option>
              <option value="github:vllm-project/vllm">vLLM</option>
              <option value="github:vllm-project/vllm-ascend">vLLM Ascend</option>
            </select>
          </label>
          <label>起始日期
            <select name="from" value={from} onChange={(event) => filter("from", event.target.value)}>
              <option value="">不限</option>
              {chronological.map((day) => <option key={day}>{day}</option>)}
            </select>
          </label>
          <label>结束日期
            <select name="to" value={to} onChange={(event) => filter("to", event.target.value)}>
              <option value="">不限</option>
              {chronological.map((day) => <option key={day}>{day}</option>)}
            </select>
          </label>
        </div>
        <span className="overview-scope" role="status">范围内 <strong>{scopedDays.length}</strong> 份日报</span>
      </div>
      {result?.error ? <p role="alert">无法读取 PR 索引。{localReports && "请检查本地日报导入结果。"}</p>
        : !data ? <p role="status">正在读取日报与 PR 分类…</p>
        : data.schemaVersion !== 1 || !Array.isArray(data.entries) ? <p role="alert">PR 索引版本或格式不受支持。</p>
        : <>
          <ReportTrends days={scopedDays} observations={observations} />
          <InferenceMap entries={entries} intros={intros} selection={query.get("stage")} select={(stage) => filter("stage", stage)}
            scope={JSON.stringify([source, from, to])} />
          <details className="overview-flow-reference">
            <summary>查看完整推理流程图<span>请求路径、可选优化与资源复用</span></summary>
            <CompleteInferenceFlow entries={entries} selection={query.get("stage")} onSelect={(stage) => filter("stage", stage)} />
          </details>
          <dl className="docx-flow-summary">
            <div><dt>累计工程 PR</dt><dd>{entries.length}</dd></div>
            <div><dt>已覆盖推理环节</dt><dd>{coveredStages}</dd></div>
            <div><dt>已读取日报</dt><dd>{scopedDays.length} <small>份</small></dd></div>
            <div><dt>同期研究论文 · 不限 PR 来源</dt><dd>{papers} <small>篇</small></dd></div>
          </dl>
          <DirectionDistribution entries={entries} />
          <section className="docx-recent">
            <header><div><h2>阅读日报</h2><p>当前日期范围内的最新日报</p></div><Link to="/reports">全部日报 <ArrowUpRight size={15} /></Link></header>
            {scopedDays.length ? <ul>{scopedDays.slice(0, 3).map((day) => <li key={day}><Link to={`/reports/${day}`}>{day}</Link></li>)}</ul>
              : <p>所选日期范围内没有日报。</p>}
          </section>
        </>}
    </div>
  );
}

function Archive({ catalog, days }: { catalog: Catalog; days: string[] }) {
  return (
    <>
      <header className="archive-heading">
        <div>
          <h1>日报档案</h1>
          <p>共 {days.length} 期，按日期从新到旧排列。</p>
        </div>
        <a className="docx-secondary" href={historyArchive}>
          <Download size={16} aria-hidden /> 历史 Word 原件 ZIP（2026-10-23 至 2026-11-08）
        </a>
      </header>
      <ul className="docx-archive">
        {days.map((day) => {
          const record = catalog.days[day];
          const version = record.versions.find((item) => item.sha256 === record.current);
          return (
            <li key={day}>
              <Link className="archive-row" to={`/reports/${day}`}>
                <time dateTime={day}>{day}</time>
                {version && <ReportCounts counts={version.counts} />}
                <ArrowRight size={17} aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Reader({ catalog, days }: { catalog: Catalog; days: string[] }) {
  const { day = days[0] } = useParams();
  const [query] = useSearchParams();
  const record = catalog.days[day];
  const requested = query.get("version") ?? record?.current;
  const version = record?.versions.find((item) => item.sha256 === requested);
  const result = useJson<Report>(version?.path);
  if (!version) return <p role="alert">没有找到该日期或版本的日报。<Link to="/reports">返回日报档案</Link></p>;
  return (
    <Suspense fallback={<p role="status">正在打开日报…</p>}>
      <DailyReportReader catalog={catalog} days={days} day={day} version={version} result={result} />
    </Suspense>
  );
}

export default function DocxPreview() {
  const result = useJson<Catalog>("catalog.json");
  const catalog = result?.data;
  const days = useMemo(
    () => catalog?.schemaVersion === 1 ? Object.keys(catalog.days).sort().reverse() : [],
    [catalog],
  );
  const { pathname } = useLocation();
  const research = useMatch("/research");
  const previousPath = useRef(pathname);
  const main = useRef<HTMLElement>(null);
  const reading = pathname.startsWith("/reports/");
  const overview = pathname === "/";
  const flow = useJson<FlowIndex>(overview ? "flow-index.json" : undefined);
  const topics = useJson<TopicIndex>(pathname.startsWith("/topics") ? "topics.json" : undefined);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <div className="docx-preview">
      <a className="docx-skip" href="#main-content" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>跳到正文</a>
      <header className="docx-site-header">
        <div className="docx-nav-inner">
          <Link className="docx-brand" to="/" aria-label="社区研报首页">
            <span className="docx-brand-mark"><Activity size={20} aria-hidden /></span>
            社区研报
          </Link>
          <nav className="docx-nav" aria-label="主导航">
            <NavLink to="/" end>优化总览</NavLink>
            <NavLink to="/reports" end>日报档案</NavLink>
            <NavLink to="/topics">技术专题</NavLink>
            <NavLink to="/research">研究查询</NavLink>
            {days[0] && <Link to={`/reports/${days[0]}`} aria-current={reading ? "page" : undefined}>研报阅读</Link>}
            <NavLink to="/contributors">贡献者</NavLink>
          </nav>
        </div>
      </header>
      <div className="docx-workspace">
        <main className={overview ? "docx-main docx-main-wide" : "docx-main"} id="main-content" ref={main} tabIndex={-1}>
          {pathname === "/contributors" ? <Suspense fallback={<p role="status">正在打开贡献者页面…</p>}><Contributors /></Suspense>
            : research ? <Suspense fallback={<p role="status">正在打开研究查询…</p>}><ResearchQuery /></Suspense>
            : result?.error ? <p role="alert">{localReports ? "请先导入本地日报。" : "日报目录加载失败。"}{result.error}</p>
            : !catalog ? <p role="status">正在加载日报索引…</p>
            : !days.length ? <p role="alert">索引为空或版本不支持。</p>
            : (
              <Suspense fallback={<p role="status">正在打开页面…</p>}>
                <Routes>
                  <Route path="/" element={<FlowOverview catalog={catalog} days={days} result={flow} />} />
                  <Route path="/reports" element={<Archive catalog={catalog} days={days} />} />
                  <Route path="/reports/:day" element={<Reader catalog={catalog} days={days} />} />
                  <Route path="/topics/:topicId?" element={<TopicPages index={topics?.data} error={topics?.error} />} />
                  <Route path="*" element={<p>页面不存在。<Link to="/reports">查看历史日报</Link></p>} />
                </Routes>
              </Suspense>
            )}
        </main>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, CalendarDays, Layers } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import InferenceFlow, { type FlowEntry } from "./InferenceFlow";
import InferenceMap, { type IndexedPR } from "./InferenceMap";
import CompleteInferenceFlow from "./CompleteInferenceFlow";
import ReportTrends, { uniquePRs } from "./ReportTrends";
import DirectionDistribution from "./DirectionDistribution";
import "./docx-preview.css";

type Part = { text: string; url?: string };
type Counts = { upstream: number; ascend: number; papers: number };
type Block =
  | { kind: "paragraph"; parts: Part[] }
  | { kind: "group"; title: string }
  | { kind: "entry"; number: string; title: string; workId?: string; paragraphs: Part[][] };
type Report = {
  title: string;
  day: string;
  intro: Part[][];
  original?: string;
  originalName: string;
  counts: Counts;
  warnings: string[];
  sections: { key: string; title: string; figure?: string; blocks: Block[] }[];
};
type Version = { sha256: string; path: string; counts: Counts };
type Catalog = {
  schemaVersion: 1;
  days: Record<string, { current: string; versions: Version[] }>;
};

const localReports = import.meta.env.DEV && import.meta.env.MODE === "docx";
const historyArchive = "https://github.com/intellistream/auto-research-report-website/releases/download/word-report-preview-20261023-20261108/20261023-20261108.zip";

function reportAsset(path: string) {
  return import.meta.env.BASE_URL + (localReports ? "" : "word-reports/") + path;
}

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(reportAsset(path), { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`无法读取 ${path}（HTTP ${response.status}）`);
  return response.json();
}

function useJson<T>(path: string | undefined) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    readJson<T>(path, controller.signal)
      .then((data) => setState({ path, data }))
      .catch((error: Error) => {
        if (!controller.signal.aborted) setState({ path, error: error.message });
      });
    return () => controller.abort();
  }, [path]);
  return state?.path === path ? state : undefined;
}

function CountsLine({ counts }: { counts: Counts }) {
  return (
    <p className="docx-counts">
      <span>vLLM <strong>{counts.upstream}</strong></span>
      <span>vLLM Ascend <strong>{counts.ascend}</strong></span>
      <span>论文 <strong>{counts.papers}</strong></span>
    </p>
  );
}

function Paragraph({ parts }: { parts: Part[] }) {
  return (
    <p className="docx-paragraph">
      {parts.map((part, index) =>
        part.url ? (
          <a key={index} href={part.url} target="_blank" rel="noreferrer">{part.text}</a>
        ) : <span key={index}>{part.text}</span>,
      )}
    </p>
  );
}

function reportFlow(report: Report, version?: string): FlowEntry[] {
  return report.sections.flatMap((section) => section.key === "papers" ? [] : section.blocks.flatMap((block) => {
    if (block.kind !== "entry" || !block.workId) return [];
    const source = block.number.startsWith("A") ? "vLLM Ascend" : "vLLM";
    const query = new URLSearchParams({ section: block.number });
    if (version) query.set("version", version);
    return [{
      stage: section.key,
      id: block.workId,
      label: `${source} #${block.workId.split("#").at(-1)}`,
      title: block.title,
      to: { pathname: `/reports/${report.day}`, search: query.toString() },
    }];
  }));
}

function FlowOverview({ catalog, days }: { catalog: Catalog; days: string[] }) {
  const [query, setQuery] = useSearchParams();
  const source = query.get("source") ?? "";
  const from = query.get("from") ?? "";
  const to = query.get("to") ?? "";
  const result = useJson<{ schemaVersion: 1; entries: IndexedPR[] }>("flow-index.json");
  const data = result?.data;
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "from" && value && to && value > to) next.set("to", value);
    if (key === "to" && value && from && value < from) next.set("from", value);
    setQuery(next, { replace: true });
  }
  const scopedDays = days.filter((day) => (!from || day >= from) && (!to || day <= to));
  const activeDays = new Set(scopedDays);
  const observations = Array.isArray(data?.entries) ? data.entries.filter((entry) =>
    activeDays.has(entry.day) && (!source || entry.workId.split("#")[0] === source)
  ) : [];
  const entries = uniquePRs(observations);
  const chronological = [...days].reverse();
  const papers = scopedDays.reduce((sum, day) => {
    const record = catalog.days[day];
    return sum + (record.versions.find(({ sha256 }) => sha256 === record.current)?.counts.papers ?? 0);
  }, 0);
  return (
    <div className="docx-overview">
      <div className="docx-eyebrow">COMMUNITY TRENDS <span>vLLM / vLLM Ascend</span></div>
      <div className="docx-overview-heading">
        <div><h1>社区优化趋势<span>。</span></h1><p>看哪些环节变化最大，以及这些变化来自哪些 PR。</p></div>
        <Link className="docx-secondary" to="/reports">日报档案 <ArrowUpRight size={15} /></Link>
      </div>
      <div className="docx-flow-toolbar">
        <div><i /> <strong>手工定稿</strong> <span>{scopedDays.length} 份日报</span></div>
        <div className="docx-flow-filters">
          <select aria-label="首页统计来源" value={source} onChange={(event) => filter("source", event.target.value)}>
            <option value="">全部来源</option>
            <option value="github:vllm-project/vllm">vLLM</option>
            <option value="github:vllm-project/vllm-ascend">vLLM Ascend</option>
          </select>
          <select aria-label="起始日期" value={from} onChange={(event) => filter("from", event.target.value)}>
            <option value="">起始日期不限</option>
            {chronological.map((day) => <option key={day}>{day}</option>)}
          </select>
          <span>至</span>
          <select aria-label="结束日期" value={to} onChange={(event) => filter("to", event.target.value)}>
            <option value="">结束日期不限</option>
            {chronological.map((day) => <option key={day}>{day}</option>)}
          </select>
        </div>
      </div>
      {result?.error ? <p role="alert">无法读取 PR 索引。{localReports && "请重新运行 Word 日报导入命令。"}</p>
        : !data ? <p role="status">正在读取日报与 PR 分类…</p>
        : data.schemaVersion !== 1 || !Array.isArray(data.entries) ? <p role="alert">PR 索引版本或格式不受支持。</p>
        : <>
          <ReportTrends days={scopedDays} observations={observations} />
          <CompleteInferenceFlow entries={entries} selection={query.get("stage")} onSelect={(stage) => filter("stage", stage)} />
          <InferenceMap entries={entries} selection={query.get("stage")} select={(stage) => filter("stage", stage)}
            scope={JSON.stringify([source, from, to])} />
          <dl className="docx-flow-summary">
            <div><dt>累计工程 PR</dt><dd>{entries.length}</dd></div>
            <div><dt>已覆盖推理环节</dt><dd>{new Set(entries.map(({ stage }) => stage).filter((stage) => stage !== "classification_conflict")).size}</dd></div>
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
      <h1>历史日报</h1>
      <p>共收录 {days.length} 天，按日期从新到旧排列。</p>
      <p><a href={historyArchive}>下载历史 Word 原件 ZIP（2026-10-23 至 2026-11-08）</a></p>
      <ul className="docx-archive">
        {days.map((day) => {
          const record = catalog.days[day];
          const version = record.versions.find((item) => item.sha256 === record.current);
          return (
            <li key={day}>
              <Link to={`/reports/${day}`}>{day}</Link>
              {version && <CountsLine counts={version.counts} />}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Reader({ catalog, days }: { catalog: Catalog; days: string[] }) {
  const params = useParams();
  const [query] = useSearchParams();
  const day = params.day ?? days[0];
  const record = catalog.days[day];
  const requested = query.get("version") ?? record?.current;
  const version = record?.versions.find((item) => item.sha256 === requested);
  const result = useJson<Report>(version?.path);
  const report = result?.data;
  const section = query.get("section");
  useEffect(() => {
    if (!report) return;
    const frame = requestAnimationFrame(() => {
      if (section) document.getElementById(section)?.scrollIntoView();
      else window.scrollTo(0, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [report, section]);
  if (!version) return <p role="alert">没有找到该日期或版本的日报。</p>;
  if (result?.error) return <p role="alert">{result.error}</p>;
  if (!report) return <p role="status">正在加载日报…</p>;
  const position = days.indexOf(day);
  const reportLink = (anchor: string) => {
    const next = new URLSearchParams(query);
    next.set("section", anchor);
    return { pathname: `/reports/${day}`, search: next.toString() };
  };

  return (
    <>
      <header className="docx-heading">
        <time dateTime={day}>{day}</time>
        <h1>{report.title}</h1>
        <CountsLine counts={report.counts} />
        <nav className="docx-actions" aria-label="日报操作">
          {days[position + 1] && <Link to={`/reports/${days[position + 1]}`}>← 上一期</Link>}
          {days[position - 1] && <Link to={`/reports/${days[position - 1]}`}>下一期 →</Link>}
          {report.original && <a href={reportAsset(report.original)} download={report.originalName}>下载 Word 原件</a>}
          {!report.original && day >= "2026-10-23" && day <= "2026-11-08" && (
            <a href={historyArchive}>下载历史 Word 原件 ZIP</a>
          )}
        </nav>
        {record.versions.length > 1 && (
          <details>
            <summary>查看修订版本</summary>
            <ul>
              {record.versions.map((item, index) => (
                <li key={item.sha256}>
                  <Link to={`/reports/${day}?version=${item.sha256}`}>
                    第 {index + 1} 版 {item.sha256 === record.current ? "（当前版本）" : ""}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>
      <div className="docx-columns">
        <nav className="docx-toc" aria-label="日报目录">
          <strong>本期目录</strong>
          {report.sections.map((item) => (
            <Link key={item.key} to={reportLink(item.key)} aria-current={section === item.key ? "location" : undefined}>
              {item.title}
            </Link>
          ))}
        </nav>
        <article className="docx-article">
          {report.intro.map((parts, index) => <Paragraph key={index} parts={parts} />)}
          {report.sections.map((item) => (
            <section key={item.key} id={item.key}>
              <h2>{item.title}</h2>
              {item.key === "flow" && (
                <InferenceFlow key={version.sha256} entries={reportFlow(report, version.sha256)} />
              )}
              {item.figure && (
                <details className="docx-original-figure">
                  <summary>查看 Word 流程原图</summary>
                  <a className="docx-figure" href={reportAsset(item.figure)} target="_blank" rel="noreferrer">
                    <img src={reportAsset(item.figure)} alt="单个请求的推理主线与优化位置" loading="lazy" />
                  </a>
                </details>
              )}
              {item.blocks.map((block, index) => {
                if (block.kind === "paragraph") return <Paragraph key={index} parts={block.parts} />;
                if (block.kind === "group") return <h3 key={index}>{block.title}</h3>;
                return (
                  <section className="docx-entry" key={block.number} id={block.number}>
                    <h4><Link to={reportLink(block.number)}>{block.number} {block.title}</Link></h4>
                    {block.paragraphs.map((parts, i) => <Paragraph key={i} parts={parts} />)}
                  </section>
                );
              })}
            </section>
          ))}
          {report.warnings.length > 0 && (
            <details>
              <summary>导入待核对项</summary>
              <ul>{report.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>
            </details>
          )}
        </article>
      </div>
    </>
  );
}

export default function DocxPreview() {
  const result = useJson<Catalog>("catalog.json");
  const catalog = result?.data;
  const days = useMemo(
    () => catalog?.schemaVersion === 1 ? Object.keys(catalog.days).sort().reverse() : [],
    [catalog],
  );
  const location = useLocation();
  const reading = location.pathname.startsWith("/reports/");
  return (
    <div className="docx-preview">
      <nav className="docx-nav" aria-label="主导航">
        <Link className="docx-brand" to="/"><i><Layers size={22} /></i><span>社区研报<small>RESEARCH DAILY</small></span></Link>
        <span className="docx-nav-caption">工作空间</span>
        <NavLink to="/" end><Activity size={18} /> 优化总览</NavLink>
        <NavLink to="/reports" end><CalendarDays size={18} /> 日报档案</NavLink>
        {days[0] && <Link to={`/reports/${days[0]}`} aria-current={reading ? "page" : undefined}><BookOpen size={18} /> 研报阅读</Link>}
        <div className="docx-communities">
          <span className="docx-nav-caption">关注社区</span>
          <span>vLLM</span><span>vLLM Ascend</span><span>研究论文</span>
        </div>
      </nav>
      <div className="docx-workspace">
        <main className="docx-main">
        {result?.error ? <p role="alert">{localReports ? "请先运行 Word 日报导入命令。" : "日报目录加载失败。"}{result.error}</p>
          : !catalog ? <p role="status">正在加载日报索引…</p>
          : !days.length ? <p role="alert">索引为空或版本不支持。</p>
          : (
            <Routes>
              <Route path="/" element={<FlowOverview catalog={catalog} days={days} />} />
              <Route path="/reports" element={<Archive catalog={catalog} days={days} />} />
              <Route path="/reports/:day" element={<Reader catalog={catalog} days={days} />} />
              <Route path="*" element={<p>页面不存在。<Link to="/reports">查看历史日报</Link></p>} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  );
}

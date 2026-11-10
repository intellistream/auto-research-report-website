import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, BookOpen, CalendarDays, Layers } from "lucide-react";
import { Link, NavLink, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import InferenceFlow, { type FlowEntry } from "./InferenceFlow";
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
  original: string;
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

async function readJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch("/" + path, { signal, cache: "no-cache" });
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
  const [data, setData] = useState<{ reports: Report[]; failed: number }>();
  useEffect(() => {
    const controller = new AbortController();
    const paths = days.map((day) => {
      const record = catalog.days[day];
      return record.versions.find((version) => version.sha256 === record.current)!.path;
    });
    Promise.allSettled(paths.map((path) => readJson<Report>(path, controller.signal))).then((results) => {
      if (controller.signal.aborted) return;
      const reports = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setData({ reports, failed: results.length - reports.length });
    });
    return () => controller.abort();
  }, [catalog, days]);
  function filter(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "from" && value && to && value > to) next.set("to", value);
    if (key === "to" && value && from && value < from) next.set("from", value);
    setQuery(next, { replace: true });
  }
  const reports = data?.reports.filter(({ day }) => (!from || day >= from) && (!to || day <= to)) ?? [];
  const located = new Map<string, FlowEntry>();
  const conflicts = new Set<string>();
  for (const report of reports) {
    for (const entry of reportFlow(report)) {
      if (source && entry.id.split("#")[0] !== source) continue;
      const existing = located.get(entry.id);
      if (!existing) located.set(entry.id, entry);
      else if (existing.stage !== entry.stage) conflicts.add(entry.id);
    }
  }
  const entries = Array.from(located.values()).filter((entry) => !conflicts.has(entry.id));
  const chronological = [...days].reverse();
  return (
    <div className="docx-overview">
      <div className="docx-eyebrow">INFERENCE FLOW <span>推理流程 / 社区优化</span></div>
      <div className="docx-overview-heading">
        <div><h1>推理流程与社区优化<span>。</span></h1><p>沿着一次推理，看每个环节有哪些社区 PR。</p></div>
        <Link className="docx-secondary" to="/reports">日报档案 <ArrowUpRight size={15} /></Link>
      </div>
      <div className="docx-flow-toolbar">
        <div><i /> <strong>真实材料</strong> <span>{reports.length} 份日报</span></div>
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
      {!data ? <p role="status">正在读取日报条目…</p> : <>
        {!!data.failed && <p role="alert">{data.failed} 份日报读取失败，图中仅显示已读取的 PR。</p>}
        <InferenceFlow entries={entries} />
        <p className="docx-scope">当前范围：{from || chronological[0]} 至 {to || days[0]}。统计限于已收录日报。
          {!!conflicts.size && ` 另有 ${conflicts.size} 个 PR 的跨日分类不一致。`}
        </p>
      </>}
    </div>
  );
}

function Archive({ catalog, days }: { catalog: Catalog; days: string[] }) {
  return (
    <>
      <h1>历史日报</h1>
      <p>共收录 {days.length} 天，按日期从新到旧排列。</p>
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
          <a href={`/${report.original}`} download={report.originalName}>下载 Word 原件</a>
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
                <InferenceFlow key={report.original} entries={reportFlow(report, query.get("version") ?? undefined)} />
              )}
              {item.figure && (
                <details className="docx-original-figure">
                  <summary>查看 Word 流程原图</summary>
                  <a className="docx-figure" href={`/${item.figure}`} target="_blank" rel="noreferrer">
                    <img src={`/${item.figure}`} alt="单个请求的推理主线与优化位置" loading="lazy" />
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
        <header className="docx-topbar"><span>社区研报 › {reading ? "研报阅读" : location.pathname === "/reports" ? "日报档案" : "优化总览"}</span><span>已接入真实材料</span></header>
        <main className="docx-main">
        {result?.error ? <p role="alert">请先运行 Word 日报导入命令。{result.error}</p>
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

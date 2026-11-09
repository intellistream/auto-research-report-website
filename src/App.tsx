import { useEffect, useState, type ReactNode } from "react";
import Dashboard from "./Dashboard";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  FlaskConical,
  GitPullRequest,
  Layers,
  Menu,
  Search,
  ShieldCheck,
  X,
  AlertCircle,
  FolderOpen,
  Link2,
  Activity,
} from "lucide-react";
import {
  loadCatalog,
  loadReport,
  loadRun,
  checkedBytes,
  safeSource,
} from "./data";
import {
  entriesOf,
  latestAvailable,
  sortReports,
  statusText,
  sourceNames,
  chapterKeys,
  type CatalogItem,
  type Catalog,
  type Report,
  type Entry,
  type RunData,
  type Asset,
  type ChapterKey,
} from "./types";
const statusLabels: Record<string, string> = {
  available: "可阅读",
  zero_candidates: "零候选",
  not_generated: "尚未生成",
  failed: "生成失败",
};
const shortChapter: Record<ChapterKey, string> = {
  startup: "模型准备",
  scheduling: "请求调度",
  prefill: "Prefill",
  pd_transfer: "P/D 交接",
  decode: "Decode",
  speculative: "推测解码",
  output_return: "输出返回",
  resource_reclaim: "资源回收",
  papers: "论文",
};
function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}
function State({
  title,
  children,
  error = false,
}: {
  title: string;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div className={"state-box " + (error ? "error" : "")}>
      <span className="state-icon">
        {error ? <AlertCircle size={25} /> : <FolderOpen size={28} />}
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      <Link className="text-link" to="/reports">
        返回日报档案 <ArrowRight size={15} />
      </Link>
    </div>
  );
}
function useBundle(item?: CatalogItem) {
  const [state, setState] = useState<{
    id?: string;
    report?: Report;
    run?: RunData;
    error?: string;
  }>({});
  useEffect(() => {
    let alive = true;
    setState({ id: item?.id });
    if (item?.status === "available")
      Promise.all([loadReport(item), loadRun(item)])
        .then(([report, run]) => {
          if (alive) setState({ id: item.id, report, run });
        })
        .catch((e) => {
          if (alive) setState({ id: item.id, error: String(e.message) });
        });
    return () => {
      alive = false;
    };
  }, [item?.id]);
  return state.id === item?.id ? state : {};
}
function DownloadButton({ asset, label }: { asset?: Asset; label: string }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const download = async () => {
    if (!asset) return;
    setBusy(true);
    setMessage("");
    try {
      const bytes = await checkedBytes(asset);
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.path.split("/").at(-1)!;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="download-wrap">
      <button
        className="button secondary"
        disabled={!asset || busy}
        onClick={download}
        title={!asset ? "该版本未交付此文件" : undefined}
      >
        <Download size={15} />
        {busy ? "正在校验…" : label}
      </button>
      {message && <small role="alert">{message}</small>}
    </span>
  );
}
export default function App() {
  const [catalog, setCatalog] = useState<Catalog>(),
    [error, setError] = useState(""),
    [mobile, setMobile] = useState(false);
  const location = useLocation();
  const routeReportId = location.pathname.split("/")[2];
  const currentReportId = catalog?.items.some(
    (i) => i.id === routeReportId && i.status === "available",
  )
    ? routeReportId
    : (catalog ? latestAvailable(catalog)?.id : undefined) || "normal";
  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  return (
    <div className="app">
      <a
        className="skip"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到正文
      </a>
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <Link
          to="/"
          className="brand"
          aria-label="社区研报首页"
          onClick={() => window.scrollTo(0, 0)}
        >
          <span className="brand-mark">
            <Layers size={22} />
          </span>
          <span>
            社区研报<small>RESEARCH DAILY</small>
          </span>
        </Link>
        <div className="nav-caption">工作空间</div>
        <nav aria-label="主导航">
          <NavLink to="/" end>
            <Activity size={18} />
            优化总览
          </NavLink>
          <NavLink to="/reports" end>
            <CalendarDays size={18} />
            日报档案
          </NavLink>
          <NavLink to={"/reports/" + currentReportId}>
            <BookOpen size={18} />
            研报阅读
          </NavLink>
          <NavLink to={"/runs/" + currentReportId}>
            <Activity size={18} />
            生成情况
          </NavLink>
        </nav>
        <div className="sidebar-section">
          <span className="nav-caption">关注社区</span>
          <div>
            <i className="source-dot teal" />
            vLLM
          </div>
          <div>
            <i className="source-dot purple" />
            vLLM-Ascend
          </div>
          <div>
            <i className="source-dot gray" />
            研究论文
          </div>
        </div>
        <div className="sidebar-bottom">
          <FlaskConical size={20} />
          <strong>第一版 · 本机预览</strong>
          <p>
            {location.pathname === "/" ? (
              <>
                统计仅使用真实交付，
                <br />
                待核查也计入总量。
              </>
            ) : catalog?.items.some((i) => !i.synthetic) ? (
              <>
                真实历史试跑与合成样例
                <br />
                分开展示，状态保留。
              </>
            ) : (
              <>
                所有内容均为合成样例，
                <br />
                不代表真实社区进展。
              </>
            )}
          </p>
          <span>
            只读浏览 <span className="live-dot" />
          </span>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="关闭导航"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="打开导航"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <Link
              to="/"
              aria-label="社区研报首页"
              onClick={() => window.scrollTo(0, 0)}
            >
              社区研报
            </Link>{" "}
            <ChevronRight size={13} />
            <span>
              {location.pathname === "/"
                ? "优化总览"
                : location.pathname === "/reports"
                  ? "日报档案"
                  : location.pathname.startsWith("/runs")
                    ? "生成情况"
                    : location.pathname.startsWith("/items")
                      ? "条目与证据"
                      : "研报阅读"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="preview-chip">
              <FlaskConical size={13} />
              {catalog?.items.some((i) => !i.synthetic)
                ? "已接入真实材料"
                : "合成样例预览"}
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {error ? (
            <State title="日报索引加载失败" error>
              {error}
            </State>
          ) : !catalog ? (
            <div className="loading">正在加载日报档案…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Dashboard catalog={catalog} />} />
              <Route path="/reports" element={<Archive catalog={catalog} />} />
              <Route
                path="/reports/:id"
                element={<Reader catalog={catalog} />}
              />
              <Route
                path="/items/:id/:work"
                element={<Evidence catalog={catalog} />}
              />
              <Route path="/runs/:id" element={<Run catalog={catalog} />} />
              <Route
                path="*"
                element={
                  <State title="找不到这个页面">
                    检查地址，或返回日报档案选择报告。
                  </State>
                }
              />
            </Routes>
          )}
        </main>
        <footer>
          <span>
            社区研报 <span className="footer-dot">·</span>{" "}
            每一条进展，都保留来源
          </span>
          <span>
            Asia/Shanghai <span className="footer-dot">·</span> 只读预览
          </span>
        </footer>
      </div>
    </div>
  );
}
function Archive({ catalog }: { catalog: Catalog }) {
  const [params, setParams] = useSearchParams(),
    [reports, setReports] = useState<Record<string, Report>>({}),
    [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      catalog.items
        .filter((i) => i.status === "available")
        .map(async (i) => {
          try {
            return { id: i.id, report: await loadReport(i) };
          } catch {
            return { id: i.id, report: null };
          }
        }),
    ).then((values) => {
      if (alive) {
        setReports(
          Object.fromEntries(
            values.filter((v) => v.report).map((v) => [v.id, v.report!]),
          ),
        );
        setErrors(values.filter((v) => !v.report).map((v) => v.id));
      }
    });
    return () => {
      alive = false;
    };
  }, [catalog]);
  const q = params.get("q") || "",
    repo = params.get("repo") || "",
    status = params.get("status") || "",
    chapter = params.get("chapter") || "",
    day = params.get("day") || "";
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
  };
  const selected = sortReports(catalog.items).filter((i) => {
    if ((status && i.status !== status) || (day && i.day !== day)) return false;
    const es = reports[i.id] ? entriesOf(reports[i.id]) : [];
    const matches = (e: Entry) =>
      (!repo || e.card.source_type === repo) &&
      (!chapter || e.card.content.chapter === chapter) &&
      (!q ||
        [e.card.content.title_zh, e.card.content.original_title, e.card.work_id]
          .join(" ")
          .toLowerCase()
          .includes(q.toLowerCase()));
    if (repo || chapter) return es.some(matches);
    return (
      !q ||
      [i.day, i.title, i.version].join(" ").includes(q) ||
      es.some(matches)
    );
  });
  return (
    <div className="home page">
      <div className="page-eyebrow">
        REPORT ARCHIVE <span>按日期阅读 / 版本可追溯</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>
            日报档案<span className="accent">。</span>
          </h1>
          <p>查看真实交付与标注清楚的示例，原有报告和状态演示都保留在这里。</p>
        </div>
        <span className="edition">
          VOL. 001 <span>预览版</span>
        </span>
      </div>
      <div className="archive-head">
        <div>
          <h2>
            日报档案 <span>{catalog.items.length}</span>
          </h2>
          <p>选择一个日期，查看报告与对应的处理记录。</p>
        </div>
        <Badge>北京时间</Badge>
      </div>
      <div className="filters">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="搜索日报或 PR"
            placeholder="搜索标题、日期或 PR 编号…"
            value={q}
            onChange={(e) => change("q", e.target.value)}
          />
          {q && (
            <button
              className="icon-button"
              aria-label="清除搜索"
              onClick={() => change("q", "")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <label>
          <span className="sr-only">来源仓库</span>
          <select
            aria-label="来源仓库"
            value={repo}
            onChange={(e) => change("repo", e.target.value)}
          >
            <option value="">全部来源</option>
            <option value="upstream">vLLM</option>
            <option value="ascend">vLLM-Ascend</option>
            <option value="paper">论文</option>
          </select>
        </label>
        <label>
          <span className="sr-only">报告状态</span>
          <select
            aria-label="报告状态"
            value={status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="">全部状态</option>
            {Object.entries(statusLabels).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <details className="more-filters">
          <summary>
            更多筛选 <ChevronDown size={14} />
          </summary>
          <div>
            <label>
              章节
              <select
                aria-label="章节筛选"
                value={chapter}
                onChange={(e) => change("chapter", e.target.value)}
              >
                <option value="">全部章节</option>
                {chapterKeys.map((k) => (
                  <option key={k} value={k}>
                    {shortChapter[k]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              日期
              <input
                aria-label="日期筛选"
                type="date"
                value={day}
                onChange={(e) => change("day", e.target.value)}
              />
            </label>
            <button className="text-link" onClick={() => setParams({})}>
              重置所有筛选
            </button>
          </div>
        </details>
      </div>
      {errors.length > 0 && (
        <div className="notice warning">
          部分报告加载失败，无法用于内容搜索：{errors.join("、")}
          ；请打开对应报告查看。
        </div>
      )}
      <div className="archive-table">
        <div className="table-head">
          <span>日期 / 报告</span>
          <span>内容</span>
          <span>状态</span>
          <span />
        </div>
        {selected.length ? (
          selected.map((i) => (
            <Link to={"/reports/" + i.id} key={i.id} className="report-row">
              <span className="report-date">
                <span className="date-tile">
                  {i.day.slice(8)}
                  <small>{Number(i.day.slice(5, 7))} 月</small>
                </span>
                <span>
                  <strong>{i.title}</strong>
                  <small>
                    {i.day} <span>·</span> {i.version} <span>·</span>{" "}
                    {i.synthetic ? "合成样例" : "历史真实材料"}
                  </small>
                </span>
              </span>
              <span className="row-count">
                {i.status === "available" ? (
                  <>
                    {i.entries} 条{" "}
                    <small>
                      {i.pending ? i.pending + " 条待核查" : "含工程与论文"}
                    </small>
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </span>
              <span>
                <Badge
                  tone={
                    i.status === "available"
                      ? "teal"
                      : i.status === "failed"
                        ? "rose"
                        : i.status === "not_generated"
                          ? "neutral"
                          : "amber"
                  }
                >
                  {errors.includes(i.id) ? "加载失败" : statusLabels[i.status]}
                </Badge>
              </span>
              <ArrowUpRight className="row-arrow" size={18} />
            </Link>
          ))
        ) : (
          <div className="no-results">
            <Search size={24} />
            <h3>没有匹配的日报</h3>
            <p>试试其他关键词，或清除筛选条件。</p>
            <button
              className="button secondary"
              onClick={() => setParams({}, { replace: true })}
            >
              清除筛选
            </button>
          </div>
        )}
      </div>
      <div className="archive-note">
        <ShieldCheck size={16} />
        <span>
          正文与来源按报告版本保存。可阅读、程序检查完成与人工审核是不同状态。
        </span>
      </div>
    </div>
  );
}
function ReportState({ item }: { item: CatalogItem }) {
  const title =
    item.status === "zero_candidates"
      ? "指定范围内没有当天合入的 PR"
      : item.status === "failed"
        ? "报告生成失败"
        : "该日尚未生成报告";
  return (
    <>
      <div className="page narrow">
        <Link to="/reports" className="back">
          <ChevronLeft size={16} />
          日报档案
        </Link>
        <Badge tone="amber">合成状态演示</Badge>
        <State title={title} error={item.status === "failed"}>
          {item.notice}
        </State>
      </div>
    </>
  );
}
function ReportHeader({ item, report }: { item: CatalogItem; report: Report }) {
  return (
    <>
      <Link to="/reports" className="back">
        <ChevronLeft size={15} />
        返回日报档案
      </Link>
      <div className="report-heading">
        <div>
          <div className="page-eyebrow">
            DAILY RESEARCH <span>{item.version}</span>
          </div>
          <h1>社区工程日报</h1>
          <div className="report-meta">
            <span>
              <CalendarDays size={14} />
              {report.day}
            </span>
            <span>北京时间</span>
            <span>{item.entries} 条内容</span>
            <Badge tone={item.synthetic ? "teal" : "amber"}>
              {item.synthetic
                ? "合成样例"
                : item.pending
                  ? "历史真实 PR · 待核查"
                  : "真实 PR 交付"}
            </Badge>
          </div>
        </div>
        <div className="download-actions">
          <DownloadButton asset={item.assets.markdown} label="Markdown" />
          <DownloadButton asset={item.assets.word} label="下载 Word" />
        </div>
      </div>
      <div className="notice">
        <FlaskConical size={17} />
        <span>{report.coverage_notice}</span>
        <Link to={"/runs/" + item.id}>
          生成情况 <ArrowUpRight size={14} />
        </Link>
      </div>
    </>
  );
}
function Reader({ catalog }: { catalog: Catalog }) {
  const { id } = useParams(),
    item = catalog.items.find((i) => i.id === id),
    { report, error } = useBundle(item);
  const [params] = useSearchParams();
  const [tocOpen, setTocOpen] = useState(false);
  useEffect(() => {
    const section = params.get("section");
    if (report && section)
      requestAnimationFrame(() =>
        document.getElementById(section)?.scrollIntoView({ block: "start" }),
      );
  }, [params, report]);
  if (!item) return <State title="报告不存在">此版本未在索引中登记。</State>;
  if (item.status !== "available") return <ReportState item={item} />;
  if (error)
    return (
      <State title="报告加载失败" error>
        {error}
      </State>
    );
  if (!report) return <div className="loading">正在校验并加载报告…</div>;
  const toc = [
    { key: "summary", title: "一 本日归纳" },
    { key: "flow", title: "二 推理流程与优化位置" },
    ...report.chapters,
  ];
  return (
    <div className="page report-page">
      <ReportHeader item={item} report={report} />
      <div className="reader-layout">
        <aside className="toc">
          <button
            type="button"
            className="toc-title"
            aria-label="展开或收起章节目录"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen(!tocOpen)}
          >
            <ClipboardList size={16} />
            本期目录 <span>11</span>
            <ChevronDown size={13} />
          </button>
          <nav className={tocOpen ? "expanded" : ""} aria-label="报告章节">
            {toc.map((c, i) => (
              <Link
                className={params.get("section") === c.key ? "selected" : ""}
                to={"?section=" + c.key}
                key={c.key}
              >
                <span>{String(i + 1).padStart(2, "0")}</span>
                {c.title.replace(/^[一二三四五六七八九十]+ /, "")}
              </Link>
            ))}
          </nav>
          <div className="toc-bottom">
            版本 <strong>{item.version}</strong>
            <br />
            语义质量尚未评估
            <br />
            发布状态未确认
          </div>
        </aside>
        <article className="report-body">
          <section id="summary" className="report-section">
            <div className="chapter-label">
              01 <span>DAILY OVERVIEW</span>
            </div>
            <h2>本日归纳</h2>
            <div className="summary-text preserve">
              {report.summary ||
                "本次没有可用于归纳的已核查条目；待核查内容保留在后续章节。"}
            </div>
          </section>
          <section id="flow" className="report-section">
            <div className="chapter-label">
              02 <span>INFERENCE WORKFLOW</span>
            </div>
            <h2>推理流程与优化位置</h2>
            <p className="section-description">
              按交付章节定位工程条目，点击编号跳转正文；论文单独列于第十一章。
            </p>
            <div className="flow-grid">
              {chapterKeys
                .filter((k) => k !== "papers")
                .map((k, i) => (
                  <div key={k} className="flow-node">
                    <span className="flow-index">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{shortChapter[k]}</strong>
                    <div>
                      {(report.diagram_numbers[k] || []).map((n) => {
                        const entry = entriesOf(report).find(
                          (e) => e.number === n,
                        )!;
                        return (
                          <Link
                            key={n}
                            to={"?section=entry-" + n}
                            className={
                              "number-link " +
                              (entry.card.needs_review ? "pending" : "")
                            }
                          >
                            {n}
                          </Link>
                        );
                      })}
                      {!report.diagram_numbers[k]?.length && (
                        <span className="flow-empty">本期未收录</span>
                      )}
                    </div>
                  </div>
                ))}
            </div>
            {entriesOf(report).some(
              (e) =>
                e.card.content.location_basis &&
                e.card.content.location_basis !== "delivered_chapter",
            ) && (
              <div className="small-note">
                {entriesOf(report)
                  .filter(
                    (e) =>
                      e.card.content.location_basis &&
                      e.card.content.location_basis !== "delivered_chapter",
                  )
                  .map((e) => (
                    <p key={e.number}>
                      {e.number}：沿用上游临时位置（
                      {e.card.content.location_basis === "title_hint"
                        ? "标题线索"
                        : "默认调度"}
                      ），仍待分类核对。
                    </p>
                  ))}
              </div>
            )}
            <p className="small-note">
              图中位置不代表分类已确认；待核查条目的审核状态保持不变。
            </p>
          </section>
          {report.chapters.map((chapter, i) => (
            <section
              id={chapter.key}
              key={chapter.key}
              className="report-section"
            >
              <div className="chapter-label">
                {String(i + 3).padStart(2, "0")}{" "}
                <span>{chapter.key.replaceAll("_", " ").toUpperCase()}</span>
              </div>
              <h2>{chapter.title.replace(/^[一二三四五六七八九十]+ /, "")}</h2>
              {chapter.intro && (
                <p className="chapter-intro preserve">{chapter.intro}</p>
              )}
              {chapter.groups.length ? (
                chapter.groups.map((group, j) => (
                  <div className="entry-group" key={j}>
                    <h3 className="group-heading">{group.title}</h3>
                    {group.entries.map((entry) => (
                      <EntryCard
                        key={entry.card.card_id}
                        entry={entry}
                        item={item}
                      />
                    ))}
                  </div>
                ))
              ) : (
                <p className="empty-chapter">本次交付未收录本章条目。</p>
              )}
            </section>
          ))}
          <div className="report-end">
            <span>本期阅读结束</span>
            <Link to="/reports">
              返回日报档案 <ArrowRight size={15} />
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
function Body({ entry }: { entry: Entry }) {
  const c = entry.card.content;
  return (
    <div className="entry-body">
      {c.body ? (
        <div className="preserve">{c.body}</div>
      ) : (
        <>
          <div>
            <span>问题</span>
            <p className="preserve">{c.problem}</p>
          </div>
          <div>
            <span>优化方法</span>
            <p className="preserve">{c.optimization}</p>
          </div>
          <div>
            <span>效果与边界</span>
            <p className="preserve">{c.effects_and_limits}</p>
          </div>
        </>
      )}
      {entry.card.needs_review &&
        !(c.body || c.effects_and_limits || "").includes("需要人工核查。") && (
          <p className="review-notice">
            <AlertCircle size={14} />
            需要人工核查。
          </p>
        )}
    </div>
  );
}
function EntryCard({ entry, item }: { entry: Entry; item: CatalogItem }) {
  const c = entry.card.content;
  return (
    <div className="entry-card" id={"entry-" + entry.number}>
      <div className="entry-topline">
        <Badge tone={entry.card.source_type === "ascend" ? "purple" : "teal"}>
          {entry.number}
        </Badge>
        <span>{sourceNames[entry.card.source_type]}</span>
        <span className="entry-status">
          {entry.card.needs_review ? (
            <Badge tone="amber">需要人工核查</Badge>
          ) : (
            <Badge>正文已交付</Badge>
          )}
        </span>
      </div>
      <h4>{c.title_zh}</h4>
      {c.title_status === "failed" && (
        <p className="warning-text">
          中文标题未完成 · {c.title_error || "未交付错误代码"}
        </p>
      )}
      <Body entry={entry} />
      <div className="entry-foot">
        <span className="original-title" title={c.original_title || ""}>
          {c.original_title}
        </span>
        <Link
          to={
            "/items/" + item.id + "/" + encodeURIComponent(entry.card.work_id)
          }
          className="text-link"
        >
          查看来源与证据 <ArrowUpRight size={15} />
        </Link>
      </div>
    </div>
  );
}
function Evidence({ catalog }: { catalog: Catalog }) {
  const { id, work } = useParams(),
    item = catalog.items.find((i) => i.id === id),
    { report, run, error } = useBundle(item);
  if (error)
    return (
      <State title="条目加载失败" error>
        {error}
      </State>
    );
  if (!item) return <State title="报告不存在">请返回档案选择报告。</State>;
  if (item.status !== "available") return <ReportState item={item} />;
  if (!report || !run)
    return <div className="loading">正在加载条目与来源…</div>;
  const entry = entriesOf(report).find((e) => e.card.work_id === work);
  if (!entry)
    return (
      <State title="该版本没有这个条目">条目身份必须与所选报告版本一致。</State>
    );
  const c = entry.card.content,
    evidence = run.evidence[entry.card.card_id];
  return (
    <div className="page evidence-page">
      <Link
        className="back"
        to={"/reports/" + id + "?section=entry-" + entry.number}
      >
        <ChevronLeft size={15} />
        返回报告原位置
      </Link>
      <div className="page-eyebrow">
        ITEM & EVIDENCE{" "}
        <span>
          {item.version} / {item.day}
        </span>
      </div>
      <div className="evidence-heading">
        <Badge tone="teal">
          {entry.number} · {sourceNames[entry.card.source_type]}
        </Badge>
        <h1>{c.title_zh}</h1>
        <p className="muted">{c.original_title}</p>
      </div>
      <div className="notice">
        <FlaskConical size={17} />
        <span>
          {item.synthetic
            ? "合成条目与示例来源，不代表真实 PR 的改动或性能结果。"
            : "历史真实 PR 材料；沿用原交付正文，仍需人工核查，不代表当天全量社区更新。"}
        </span>
      </div>
      <div className="evidence-layout">
        <div>
          <section className="panel">
            <div className="panel-heading">
              <FileText size={18} />
              <h2>交付正文</h2>
            </div>
            <Body entry={entry} />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <Link2 size={18} />
              <h2>来源与材料</h2>
              <Badge tone="amber">
                {evidence?.items?.length ? "原始归档来源" : "定位尚未交付"}
              </Badge>
            </div>
            {c.source_links.map((s, i) => (
              <div className="source-row" key={i}>
                <span className="source-label">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <strong>{s.label}</strong>
                  {safeSource(s.url) && (
                    <a
                      href={safeSource(s.url)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {s.url}
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
            <div className="excerpt">
              <span>
                原始材料摘录 · {item.synthetic ? "合成输入" : "历史归档"}
              </span>
              {evidence?.items?.length ? (
                evidence.items.map((source, index) => (
                  <details
                    key={source.id}
                    className="source-detail"
                    open={index === 0}
                  >
                    <summary>
                      {source.kind} · 原始对象 {index + 1}
                    </summary>
                    <p className="small-note break">材料 ID：{source.id}</p>
                    {safeSource(source.url) && (
                      <a
                        className="text-link break"
                        href={safeSource(source.url)!}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        打开来源 <ExternalLink size={12} />
                      </a>
                    )}
                    <blockquote className="preserve">
                      {source.excerpt}
                    </blockquote>
                    {source.truncated && (
                      <p className="warning-text">
                        摘录已截断；完整材料仍保留在原归档。
                      </p>
                    )}
                    <p className="small-note mono break">
                      原文 SHA-256：{source.text_sha256}
                    </p>
                  </details>
                ))
              ) : evidence?.excerpt ? (
                <blockquote className="preserve">{evidence.excerpt}</blockquote>
              ) : (
                <p>该条目没有交付可定位的来源摘录。</p>
              )}
              <p className="small-note">
                {evidence?.note || "来源版本和逐条引用定位尚未交付。"}
              </p>
            </div>
          </section>
        </div>
        <aside className="panel fact-panel">
          <h2>条目信息</h2>
          <dl>
            <dt>报告日期</dt>
            <dd>{item.day}</dd>
            <dt>报告版本</dt>
            <dd>{item.version}</dd>
            <dt>交付章节</dt>
            <dd>{shortChapter[c.chapter]}</dd>
            <dt>审核提示</dt>
            <dd>
              {entry.card.needs_review ? "需要人工核查" : "未交付人工审核记录"}
            </dd>
            <dt>分类核验</dt>
            <dd>
              {run.outcomes?.[entry.card.card_id]?.classification_receipt
                ? "上游已交付分类确认凭据"
                : "核验凭据未交付"}
            </dd>
            <dt>标题状态</dt>
            <dd>
              {c.title_status === "failed"
                ? "生成失败"
                : c.title_status === "generated"
                  ? "已生成"
                  : "沿用交付标题"}
            </dd>
            <dt>归档观察时间</dt>
            <dd>
              {evidence?.observed_at
                ? new Date(evidence.observed_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                    hour12: false,
                  })
                : "尚未交付"}
            </dd>
            <dt>审查 / 写作</dt>
            <dd>
              {statusText(run.outcomes?.[entry.card.card_id]?.review)} /{" "}
              {statusText(run.outcomes?.[entry.card.card_id]?.writing)}
            </dd>
            <dt>稳定身份</dt>
            <dd className="mono break">{entry.card.work_id}</dd>
          </dl>
          <Link className="button secondary" to={"/runs/" + id}>
            <Activity size={15} />
            查看生成情况
          </Link>
        </aside>
      </div>
    </div>
  );
}
function Run({ catalog }: { catalog: Catalog }) {
  const { id } = useParams(),
    item = catalog.items.find((i) => i.id === id),
    { report, run, error } = useBundle(item);
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  if (error)
    return (
      <State title="运行记录加载失败" error>
        {error}
      </State>
    );
  if (!item)
    return <State title="运行记录不存在">请从日报档案选择版本。</State>;
  if (item.status !== "available") return <ReportState item={item} />;
  if (!report || !run) return <div className="loading">正在加载处理记录…</div>;
  const es = entriesOf(report),
    shown = es.filter(
      (e) =>
        filter === "all" ||
        (filter === "pending" && e.card.needs_review) ||
        (filter === "delivered" && !e.card.needs_review),
    );
  return (
    <div className="page run-page">
      <Link to={"/reports/" + id} className="back">
        <ChevronLeft size={15} />
        返回日报
      </Link>
      <div className="page-eyebrow">
        RUN & COVERAGE <span>过程可追溯</span>
      </div>
      <div className="page-heading">
        <div>
          <h1>这份日报，怎样生成</h1>
          <p>
            {item.day} · {item.version} · {run.id}
          </p>
        </div>
        <Badge tone={item.synthetic ? "teal" : "amber"}>
          {item.synthetic ? "合成离线组装" : "真实 PR 历史试跑"}
        </Badge>
      </div>
      <div className="notice warning">
        <AlertCircle size={17} />
        <span>
          {item.synthetic
            ? "样例只验证报告组装；没有执行真实采集、筛选或模型分析，不能计算全候选覆盖率。"
            : run.scope_notice || item.notice}
        </span>
      </div>
      <div className="run-stats">
        <div>
          <span>交付条目</span>
          <strong>
            {es.length}
            <small>条</small>
          </strong>
        </div>
        <div>
          <span>待人工核查</span>
          <strong>
            {es.filter((e) => e.card.needs_review).length}
            <small>条</small>
          </strong>
        </div>
        <div>
          <span>候选发现</span>
          <strong className="stat-text">
            {item.synthetic ? "未执行" : "范围未交付"}
          </strong>
        </div>
        <div>
          <span>语义质量</span>
          <strong className="stat-text">尚未评估</strong>
        </div>
      </div>
      <div className="run-layout">
        <section className="panel">
          <div className="panel-heading">
            <ClipboardList size={18} />
            <h2>条目处理记录</h2>
          </div>
          <div className="tabs" aria-label="记录筛选">
            {[
              ["all", "全部条目"],
              ["pending", "待核查"],
              ["delivered", "其余已交付"],
            ].map(([v, t]) => (
              <button
                key={v}
                className={v === filter ? "active" : ""}
                onClick={() => setParams(v === "all" ? {} : { filter: v })}
              >
                {t}
              </button>
            ))}
          </div>
          {shown.length ? (
            shown.map((e) => (
              <Link
                className="outcome-row"
                key={e.card.card_id}
                to={"/items/" + id + "/" + encodeURIComponent(e.card.work_id)}
              >
                <span className="outcome-number">{e.number}</span>
                <span>
                  <strong>{e.card.content.title_zh}</strong>
                  <small>{e.card.work_id}</small>
                  {run.outcomes?.[e.card.card_id] && (
                    <small>
                      首次分析：
                      {run.outcomes[e.card.card_id].analysis === "failed"
                        ? "失败"
                        : run.outcomes[e.card.card_id].analysis ===
                            "card_delivered"
                          ? "已交付卡片"
                          : "未交付"}{" "}
                      · 审查：{statusText(run.outcomes[e.card.card_id].review)}{" "}
                      · 写作：{statusText(run.outcomes[e.card.card_id].writing)}
                    </small>
                  )}
                </span>
                <Badge tone={e.card.needs_review ? "amber" : "neutral"}>
                  {e.card.needs_review ? "需要人工核查" : "正文已交付"}
                </Badge>
                <ChevronRight size={15} />
              </Link>
            ))
          ) : (
            <p className="empty-chapter">没有匹配的处理记录。</p>
          )}
          {!!report.pending_prs?.length && (
            <div className="notice warning">
              上游另有 {report.pending_prs.length} 项待处理 PR，详见下方记录。
            </div>
          )}
          {report.pending_prs?.map((p, i) => (
            <div key={i} className="outcome-row">
              <span>
                <strong>{p.candidate.title}</strong>
                <small>
                  {p.candidate.repository} #{p.candidate.pr_number} · {p.reason}
                </small>
              </span>
              <Badge tone="amber">待处理</Badge>
            </div>
          ))}
        </section>
        <aside>
          <section className="panel">
            <h2>检查与交付</h2>
            <div className="check-row">
              <Check size={16} />
              {run.program_status === "completed_program_checks"
                ? "报告程序检查完成"
                : run.program_status === "partial_draft"
                  ? "部分草稿 · 仍有未解决项"
                  : run.program_status}
            </div>
            <p className="small-note">程序检查不等于语义正确或人工批准。</p>
            {run.layout_refreshed && (
              <p className="small-note">
                本版仅用当前报告程序刷新历史草稿的图布局，正文、分组及审查状态保持不变，没有新模型调用。
              </p>
            )}
            <div className="check-row neutral">
              <AlertCircle size={16} />
              Word 逐页版式未由运行时检查
            </div>
            <div className="check-row neutral">
              <ShieldCheck size={16} />
              发布状态未确认
            </div>
            <details className="technical">
              <summary>查看检查明细</summary>
              {Object.entries(run.checks).map(([k, v]) => (
                <p key={k}>
                  <code>{k}</code>
                  <span>
                    {v === "passed"
                      ? "程序检查通过"
                      : v === "failed"
                        ? "检查失败"
                        : "未检查"}
                  </span>
                </p>
              ))}
            </details>
          </section>
          <section className="panel">
            <h2>运行说明</h2>
            <p className="small-note">
              {item.synthetic
                ? "日期与相关性筛选回执、分析审查历史、成本和耗时明细尚未交付到本样例。"
                : "已导入历史 Card、来源、写作回执和分析失败记录；全候选发现、筛选历史及费用明细尚未交付。"}
            </p>
            <p className="small-note">
              不以条目数冒充发现候选数，未交付数据不补成零或成功。首次分析失败：
              {run.analysis_failures ?? "未交付"} 项。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

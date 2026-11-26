import { useMemo } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  FileText,
  Filter,
  GitPullRequest,
  Layers,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import CompleteInferenceFlow from "../pages/CompleteInferenceFlow";
import DirectionDistribution from "../pages/DirectionDistribution";
import InferenceMap from "../pages/InferenceMap";
import ReportTrends, { uniquePRs } from "../pages/ReportTrends";
import { selectChapterIntros, type FlowIndex } from "../pages/chapter-intros";
import { localReports, type Catalog } from "../pages/report-preview-data";
import "./overview.css";
import inferenceStages from "../inference-stages.json";
const stageNames: Record<string,string> = inferenceStages;

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function formatWeekday(day: string) {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? "" : weekdays[parsed.getUTCDay()];
}

export default function OverviewPage({
  catalog,
  days,
  result,
}: {
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

  function applyPresetWindow(windowSize: number | null) {
    const next = new URLSearchParams(query);
    if (!windowSize || days.length <= windowSize) {
      next.delete("from");
      next.delete("to");
    } else {
      next.set("from", days[windowSize - 1]);
      next.set("to", days[0]);
    }
    setQuery(next, { replace: true });
  }

  function resetScope() {
    const next = new URLSearchParams(query);
    next.delete("source");
    next.delete("from");
    next.delete("to");
    setQuery(next, { replace: true });
  }

  const chronological = useMemo(() => [...days].reverse(), [days]);
  const scopedDays = useMemo(
    () => days.filter((day) => (!from || day >= from) && (!to || day <= to)),
    [days, from, to],
  );

  const {
    observations,
    entries,
    intros,
    papers,
    coveredStages,
    upstreamCount,
    ascendCount,
    topStage,
  } = useMemo(() => {
    const activeDays = new Set(scopedDays);
    const indexedEntries = Array.isArray(data?.entries) ? data.entries : [];
    const observations = indexedEntries.filter(
      (entry) => activeDays.has(entry.day) && (!source || entry.workId.split("#")[0] === source),
    );
    const entries = uniquePRs(observations);
    const intros = selectChapterIntros(
      data?.chapters,
      indexedEntries,
      Object.fromEntries(days.map((day) => [day, catalog.days[day].current])),
      scopedDays,
      source,
    );
    const papers = scopedDays.reduce((sum, day) => {
      const record = catalog.days[day];
      return sum + (record.versions.find(({ sha256 }) => sha256 === record.current)?.counts.papers ?? 0);
    }, 0);

    let ascendCount = 0;
    const stageCounts = new Map<string, number>();
    for (const item of entries) {
      if (item.workId.includes("vllm-ascend")) ascendCount++;
      if (item.stage !== "classification_conflict") {
        stageCounts.set(item.stage, (stageCounts.get(item.stage) ?? 0) + 1);
      }
    }
    const upstreamCount = entries.length - ascendCount;
    const coveredStages = stageCounts.size;
    let topStage: { key: string; count: number } | undefined;
    for (const [key, count] of stageCounts) {
      if (!topStage || count > topStage.count) topStage = { key, count };
    }

    return {
      observations,
      entries,
      intros,
      papers,
      coveredStages,
      upstreamCount,
      ascendCount,
      topStage,
    };
  }, [catalog, data, days, scopedDays, source]);

  const hasCustomFilter = Boolean(source || from || to);
  const preset7Active = days.length > 7 && from === days[6] && (!to || to === days[0]);
  const preset14Active = days.length > 14 && from === days[13] && (!to || to === days[0]);
  const presetAllActive = !from && !to;

  const latestTotal = latestCounts
    ? latestCounts.upstream + latestCounts.ascend + latestCounts.papers
    : 0;

  return (
    <div className="docx-overview overview-v3">
      {/* Hero Masthead */}
      <section className="overview-hero" aria-label="研报门户导览">
        <div className="overview-hero-copy">
          <div className="overview-badges" translate="no">
            <span className="community-pill vllm">
              <i /> vLLM
            </span>
            <span className="community-pill ascend">
              <i /> vLLM Ascend
            </span>
            <span className="community-pill paper">
              <i /> arXiv Papers
            </span>
          </div>
          <h1>推理性能研报</h1>
          <p className="overview-hero-lead">
            按日期持续追踪大模型推理引擎工程演进，沿<strong>单个请求的全生命周期</strong>拆解优化机制、适用边界与可核验源码证据。
          </p>
          <div className="overview-hero-actions">
            <a
              href="#lifecycle-explorer"
              className="hero-btn primary"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById("lifecycle-explorer")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              探索推理全景工作台 <ArrowDown size={15} aria-hidden />
            </a>
            <Link to="/topics" className="hero-btn secondary">
              <Sparkles size={15} aria-hidden /> 技术专题 <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>

        <Link className="overview-latest-card" to={`/reports/${latestDay}`}>
          <div className="latest-card-top">
            <span className="latest-live-badge">
              <span className="latest-pulse" aria-hidden="true" />
              {localReports ? "本地最新日报" : "最新一期"}
            </span>
            <span className="latest-card-open" aria-hidden="true">
              阅读本期 <ArrowUpRight size={16} />
            </span>
          </div>

          <div className="latest-card-date">
            <time dateTime={latestDay}>{latestDay}</time>
            <span>{formatWeekday(latestDay)}</span>
          </div>

          {latestCounts && (
            <>
              <div className="latest-ratio-bar" aria-hidden="true">
                {latestCounts.upstream > 0 && (
                  <span
                    className="bar-vllm"
                    style={{ width: `${(100 * latestCounts.upstream) / Math.max(1, latestTotal)}%` }}
                  />
                )}
                {latestCounts.ascend > 0 && (
                  <span
                    className="bar-ascend"
                    style={{ width: `${(100 * latestCounts.ascend) / Math.max(1, latestTotal)}%` }}
                  />
                )}
                {latestCounts.papers > 0 && (
                  <span
                    className="bar-paper"
                    style={{ width: `${(100 * latestCounts.papers) / Math.max(1, latestTotal)}%` }}
                  />
                )}
              </div>
              <div className="latest-card-counts">
                <span>
                  <i className="dot-vllm" /> vLLM <strong>{latestCounts.upstream}</strong>
                </span>
                <span>
                  <i className="dot-ascend" /> Ascend <strong>{latestCounts.ascend}</strong>
                </span>
                {latestCounts.papers > 0 && (
                  <span>
                    <i className="dot-paper" /> 论文 <strong>{latestCounts.papers}</strong>
                  </span>
                )}
              </div>
            </>
          )}
        </Link>
      </section>

      {/* Unified Scope Filter Console */}
      <div className="overview-filter-bar" role="group" aria-label="首页统计筛选">
        <div className="filter-group-community" role="group" aria-label="社区来源切换">
          <span className="filter-group-label">
            <Filter size={13} aria-hidden /> 社区
          </span>
          <div className="segmented-pills">
            {(
              [
                ["", "全部来源", ""],
                ["github:vllm-project/vllm", "vLLM", "dot-vllm"],
                ["github:vllm-project/vllm-ascend", "vLLM Ascend", "dot-ascend"],
              ] as const
            ).map(([val, text, dotClass]) => (
              <button
                key={val || "all"}
                type="button"
                aria-pressed={source === val}
                className={source === val ? "pill-btn active" : "pill-btn"}
                onClick={() => filter("source", val)}
              >
                {dotClass && <i className={dotClass} aria-hidden />}
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group-dates">
          <div className="date-presets" role="group" aria-label="快捷日期窗口">
            <button
              type="button"
              className={presetAllActive ? "preset-chip active" : "preset-chip"}
              onClick={() => applyPresetWindow(null)}
            >
              全部期次
            </button>
            {days.length > 7 && (
              <button
                type="button"
                className={preset7Active ? "preset-chip active" : "preset-chip"}
                onClick={() => applyPresetWindow(7)}
              >
                近 7 期
              </button>
            )}
            {days.length > 14 && (
              <button
                type="button"
                className={preset14Active ? "preset-chip active" : "preset-chip"}
                onClick={() => applyPresetWindow(14)}
              >
                近 14 期
              </button>
            )}
          </div>

          <div className="date-selects">
            <label>
              <span>起始</span>
              <select
                name="from"
                aria-label="起始日期"
                value={from}
                onChange={(event) => filter("from", event.target.value)}
              >
                <option value="">不限</option>
                {chronological.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
            <span className="date-sep" aria-hidden="true">
              —
            </span>
            <label>
              <span>截止</span>
              <select
                name="to"
                aria-label="结束日期"
                value={to}
                onChange={(event) => filter("to", event.target.value)}
              >
                <option value="">不限</option>
                {chronological.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {hasCustomFilter && (
            <button type="button" className="filter-reset-btn" onClick={resetScope}>
              <RotateCcw size={13} aria-hidden /> 重置
            </button>
          )}
        </div>

        <div className="overview-scope-pill" role="status">
          范围内 <strong>{scopedDays.length}</strong> 期日报
          {data && (
            <>
              {" · "}
              <strong>{entries.length}</strong> 项去重 PR
            </>
          )}
        </div>
      </div>

      {result?.error ? (
        <div className="overview-status-card error" role="alert">
          无法读取 PR 索引。{localReports && "请检查本地日报导入结果。"}
        </div>
      ) : !data ? (
        <div className="overview-status-card" role="status">
          正在读取日报与推理环节索引…
        </div>
      ) : data.schemaVersion !== 1 || !Array.isArray(data.entries) ? (
        <div className="overview-status-card error" role="alert">
          PR 索引版本或格式不受支持。
        </div>
      ) : (
        <>
          {/* Executive KPI Cards */}
          <dl className="overview-kpi-grid" aria-label="当前筛选范围关键指标">
            <div className="kpi-card">
              <dt>
                <GitPullRequest size={15} aria-hidden /> 累计工程 PR（去重）
              </dt>
              <dd>
                <strong>{entries.length}</strong>
                <small>项</small>
              </dd>
              <div className="kpi-sub">
                <span>vLLM {upstreamCount}</span>
                <span>·</span>
                <span>Ascend {ascendCount}</span>
              </div>
              {entries.length > 0 && (
                <div className="kpi-mini-bar" aria-hidden="true">
                  <span style={{ width: `${(100 * upstreamCount) / entries.length}%` }} className="bar-vllm" />
                  <span style={{ width: `${(100 * ascendCount) / entries.length}%` }} className="bar-ascend" />
                </div>
              )}
            </div>

            <div className="kpi-card">
              <dt>
                <Layers size={15} aria-hidden /> 覆盖推理环节
              </dt>
              <dd>
                <strong>{coveredStages}</strong>
                <small>/ 8 环节</small>
              </dd>
              <div className="kpi-sub">
                {topStage ? (
                  <span>
                    最密集：{stageNames[topStage.key] ?? topStage.key}（{topStage.count}）
                  </span>
                ) : (
                  <span>暂无定位条目</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <dt>
                <CalendarDays size={15} aria-hidden /> 已读取日报期数
              </dt>
              <dd>
                <strong>{scopedDays.length}</strong>
                <small>期</small>
              </dd>
              <div className="kpi-sub">
                {scopedDays.length > 0 ? (
                  <span>
                    {scopedDays.at(-1)} 至 {scopedDays[0]}
                  </span>
                ) : (
                  <span>当前日期窗口无日报</span>
                )}
              </div>
            </div>

            <div className="kpi-card">
              <dt>
                <FileText size={15} aria-hidden /> 同期研究论文
              </dt>
              <dd>
                <strong>{papers}</strong>
                <small>篇</small>
              </dd>
              <div className="kpi-sub">
                <span>独立收录于日报论文专章 · 不限 PR 社区</span>
              </div>
            </div>
          </dl>

          {/* Primary Interactive Lifecycle Explorer */}
          <div id="lifecycle-explorer" className="overview-lifecycle-anchor">
            <InferenceMap
              entries={entries}
              intros={intros}
              selection={query.get("stage")}
              select={(stage) => filter("stage", stage)}
              scope={JSON.stringify([source, from, to])}
            />
          <p className="overview-group-mod-link"><Link to={"/group-mods" + (query.get("stage") ? "?stage=" + encodeURIComponent(query.get("stage")!) : "")}>查看本环节的组内 MOD 与社区对照</Link></p>

            <details className="overview-flow-reference">
              <summary>
                <span className="flow-ref-summary-title">
                  <Layers size={16} aria-hidden />
                  展开完整推理生命周期连线全图
                </span>
                <span className="flow-ref-summary-sub">请求主路径、P/D 分离传输、推测解码与缓存复用拓扑</span>
              </summary>
              <CompleteInferenceFlow
                entries={entries}
                selection={query.get("stage")}
                onSelect={(stage) => filter("stage", stage)}
              />
            </details>
          </div>

          {/* Community Trends & Cumulative Distribution */}
          <ReportTrends days={scopedDays} observations={observations} />
          <DirectionDistribution entries={entries} />

          {/* Bottom Discovery: Recent Reports Grid + Flagship Topic Spotlight */}
          <div className="overview-discovery-grid">
            <section className="overview-recent-panel" aria-labelledby="recent-reports-title">
              <header className="panel-section-head">
                <div>
                  <h2 id="recent-reports-title">近期日报速览</h2>
                  <p>当前日期范围内的最新交付期次，点击直达分章正文</p>
                </div>
                <Link className="panel-more-link" to="/reports">
                  全部 {days.length} 期档案 <ArrowUpRight size={15} aria-hidden />
                </Link>
              </header>

              {scopedDays.length ? (
                <ul className="recent-issues-grid">
                  {scopedDays.slice(0, 6).map((day) => {
                    const rec = catalog.days[day];
                    const ver = rec.versions.find((v) => v.sha256 === rec.current);
                    const c = ver?.counts;
                    const sum = c ? c.upstream + c.ascend + c.papers : 0;
                    return (
                      <li key={day}>
                        <Link className="recent-issue-card" to={`/reports/${day}`}>
                          <div className="recent-issue-top">
                            <time dateTime={day}>{day}</time>
                            <span className="recent-weekday">{formatWeekday(day)}</span>
                            <ArrowUpRight size={15} className="recent-arrow" aria-hidden />
                          </div>
                          {c && (
                            <>
                              <div className="recent-issue-counts">
                                <span>
                                  <i className="dot-vllm" /> vLLM <b>{c.upstream}</b>
                                </span>
                                <span>
                                  <i className="dot-ascend" /> Ascend <b>{c.ascend}</b>
                                </span>
                                {c.papers > 0 && (
                                  <span>
                                    <i className="dot-paper" /> 论文 <b>{c.papers}</b>
                                  </span>
                                )}
                              </div>
                              <div className="recent-mini-track" aria-hidden="true">
                                {c.upstream > 0 && (
                                  <span
                                    className="bar-vllm"
                                    style={{ width: `${(100 * c.upstream) / Math.max(1, sum)}%` }}
                                  />
                                )}
                                {c.ascend > 0 && (
                                  <span
                                    className="bar-ascend"
                                    style={{ width: `${(100 * c.ascend) / Math.max(1, sum)}%` }}
                                  />
                                )}
                                {c.papers > 0 && (
                                  <span
                                    className="bar-paper"
                                    style={{ width: `${(100 * c.papers) / Math.max(1, sum)}%` }}
                                  />
                                )}
                              </div>
                            </>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="overview-empty-note">所选日期范围内没有日报。</p>
              )}
            </section>

            <aside className="overview-topic-spotlight" aria-labelledby="spotlight-topic-title">
              <div className="spotlight-badge">
                <BookOpen size={14} aria-hidden /> 深度技术专题矩阵
              </div>
              <h2 id="spotlight-topic-title">三大核心推理专题</h2>
              <p>
                结合交互式原理导引、技术路线图与多期 PR 证据，深入拆解推理引擎关键子系统。
              </p>
              <div className="spotlight-topic-list">
                <Link to="/topics/aclgraph" className="spotlight-topic-item">
                  <div>
                    <strong>ACL Graph：昇腾推理图执行</strong>
                    <small>导引 · 学术综述 · 动态报告（11 PR）</small>
                  </div>
                  <ArrowRight size={15} aria-hidden />
                </Link>
                <Link to="/topics/kv-cache" className="spotlight-topic-item">
                  <div>
                    <strong>KV Cache：块管理、复用与传输</strong>
                    <small>分页共享 · P/D 搬运 · 分层卸载（73 PR）</small>
                  </div>
                  <ArrowRight size={15} aria-hidden />
                </Link>
                <Link to="/topics/speculative-decoding" className="spotlight-topic-item">
                  <div>
                    <strong>推测解码：草稿生成与并行验证</strong>
                    <small>EAGLE-3 / MTP / DFlash · 图回放（105 PR）</small>
                  </div>
                  <ArrowRight size={15} aria-hidden />
                </Link>
              </div>
              <Link to="/topics" className="spotlight-all-topics">
                进入技术专题总目录 <ArrowUpRight size={14} aria-hidden />
              </Link>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

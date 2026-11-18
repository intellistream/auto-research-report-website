import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Download,
  GitPullRequest,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { FlowIndex } from "../pages/chapter-intros";
import type { IndexedPR } from "../pages/InferenceMap";
import ReportCounts from "../pages/ReportCounts";
import { historyArchive, useJson, type Catalog } from "../pages/report-preview-data";
import "./archive.css";

const stageOptions = [
  ["startup", "模型准备"],
  ["scheduling", "请求调度"],
  ["prefill", "输入处理"],
  ["pd_transfer", "P/D 缓存交接"],
  ["decode", "循环生成"],
  ["speculative", "推测解码"],
  ["output_return", "输出返回"],
  ["resource_reclaim", "资源回收与缓存保留"],
] as const;

const stageMap: Record<string, string> = Object.fromEntries(stageOptions);
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getWeekday(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : weekdays[d.getUTCDay()];
}

export default function ArchivePage({ catalog, days }: { catalog: Catalog; days: string[] }) {
  const [params, setParams] = useSearchParams();
  const flowResult = useJson<FlowIndex>("flow-index.json");

  const q = params.get("q") ?? "";
  const repo = params.get("repo") ?? "";
  const stage = params.get("stage") ?? "";
  const month = params.get("month") ?? "";

  function updateParam(key: string, val: string) {
    const next = new URLSearchParams(params);
    if (val) next.set(key, val);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const months = useMemo(() => [...new Set(days.map((d) => d.slice(0, 7)))], [days]);

  const archiveTotals = useMemo(() => {
    let upstream = 0;
    let ascend = 0;
    let papers = 0;
    for (const day of days) {
      const rec = catalog.days[day];
      const ver = rec.versions.find((v) => v.sha256 === rec.current);
      if (ver) {
        upstream += ver.counts.upstream;
        ascend += ver.counts.ascend;
        papers += ver.counts.papers;
      }
    }
    return { upstream, ascend, papers };
  }, [catalog, days]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, IndexedPR[]>();
    const raw = flowResult?.data?.entries;
    if (!Array.isArray(raw)) return map;
    for (const item of raw) {
      const list = map.get(item.day) ?? [];
      list.push(item);
      map.set(item.day, list);
    }
    return map;
  }, [flowResult?.data]);

  const needle = q.trim().toLowerCase().replace(/^#\s*/, "");
  const isEntryFiltering = Boolean(needle || stage);

  const filteredIssues = useMemo(() => {
    return days.flatMap((day) => {
      if (month && !day.startsWith(month)) return [];
      const rec = catalog.days[day];
      const ver = rec.versions.find((v) => v.sha256 === rec.current);
      if (!ver) return [];

      if (repo === "papers" && ver.counts.papers === 0) return [];
      if (repo === "vllm" && ver.counts.upstream === 0 && !isEntryFiltering) return [];
      if (repo === "ascend" && ver.counts.ascend === 0 && !isEntryFiltering) return [];

      const dayPRs = entriesByDay.get(day) ?? [];
      const matchedPRs = dayPRs.filter((pr) => {
        if (repo === "vllm" && pr.workId.includes("vllm-ascend")) return false;
        if (repo === "ascend" && !pr.workId.includes("vllm-ascend")) return false;
        if (stage && pr.stage !== stage) return false;
        if (needle) {
          const prNum = pr.workId.split("#").at(-1) ?? "";
          const hay = `${pr.title} ${prNum} ${pr.number} ${stageMap[pr.stage] ?? ""}`.toLowerCase();
          return hay.includes(needle) || day.includes(needle);
        }
        return true;
      });

      if (isEntryFiltering) {
        const dateMatchesDirectly = needle && day.includes(needle) && !stage;
        if (!matchedPRs.length && !dateMatchesDirectly) return [];
      }

      return [{ day, record: rec, version: ver, matchedPRs }];
    });
  }, [catalog, days, entriesByDay, isEntryFiltering, month, needle, repo, stage]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, typeof filteredIssues>();
    for (const issue of filteredIssues) {
      const ym = issue.day.slice(0, 7);
      const list = groups.get(ym) ?? [];
      list.push(issue);
      groups.set(ym, list);
    }
    return [...groups.entries()];
  }, [filteredIssues]);

  const totalMatchedPRs = useMemo(
    () => (isEntryFiltering ? filteredIssues.reduce((sum, item) => sum + item.matchedPRs.length, 0) : 0),
    [filteredIssues, isEntryFiltering],
  );

  const hasFilters = Boolean(q || repo || stage || month);

  return (
    <div className="archive-v3">
      {/* Masthead */}
      <header className="archive-hero">
        <div className="archive-hero-copy">
          <span className="docx-eyebrow">
            <CalendarDays size={14} aria-hidden /> REPORT ARCHIVE
          </span>
          <h1>日报档案</h1>
          <p>按北京时间自然日归档每一期社区推理性能研报，支持跨期检索工程 PR 与推理环节。</p>
        </div>

        <a className="docx-secondary archive-zip-btn" href={historyArchive}>
          <Download size={16} aria-hidden />
          <span>历史 Word 原件归档 ZIP（10-23 至 11-08）</span>
        </a>
      </header>

      {/* Archive Summary Strip */}
      <dl className="archive-kpi-strip" aria-label="档案累计规模">
        <div>
          <dt>累计发布期次</dt>
          <dd>
            <strong>{days.length}</strong> <small>期</small>
          </dd>
        </div>
        <div>
          <dt>vLLM 工程条目</dt>
          <dd>
            <strong className="tone-vllm">{archiveTotals.upstream}</strong> <small>项</small>
          </dd>
        </div>
        <div>
          <dt>vLLM Ascend 条目</dt>
          <dd>
            <strong className="tone-ascend">{archiveTotals.ascend}</strong> <small>项</small>
          </dd>
        </div>
        <div>
          <dt>arXiv 研究论文</dt>
          <dd>
            <strong className="tone-paper">{archiveTotals.papers}</strong> <small>篇</small>
          </dd>
        </div>
      </dl>

      {/* Interactive Search & Filter Console */}
      <section className="archive-toolbar" aria-label="档案检索与筛选">
        <div className="archive-search-row">
          <label className="archive-search-box">
            <Search size={17} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(event) => updateParam("q", event.target.value)}
              placeholder="跨期搜索日期、PR 标题或 #编号（如 #21519、FlashAttn、推测解码）…"
              aria-label="搜索日报或 PR"
              autoComplete="off"
            />
            {q && (
              <button
                type="button"
                className="archive-clear-input"
                aria-label="清空搜索词"
                onClick={() => updateParam("q", "")}
              >
                <X size={14} />
              </button>
            )}
          </label>

          <select
            aria-label="按推理环节筛选"
            className="archive-stage-select"
            value={stage}
            onChange={(event) => updateParam("stage", event.target.value)}
          >
            <option value="">全部推理环节</option>
            {stageOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="archive-filter-pills">
          <div className="segmented-pills" role="group" aria-label="社区与内容类型">
            {(
              [
                ["", "全部期次"],
                ["vllm", "vLLM"],
                ["ascend", "vLLM Ascend"],
                ["papers", "含研究论文"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val || "all"}
                type="button"
                aria-pressed={repo === val}
                className={repo === val ? "pill-btn active" : "pill-btn"}
                onClick={() => updateParam("repo", val)}
              >
                {label}
              </button>
            ))}
          </div>

          {months.length > 1 && (
            <div className="archive-month-pills" role="group" aria-label="月份筛选">
              <button
                type="button"
                className={!month ? "preset-chip active" : "preset-chip"}
                onClick={() => updateParam("month", "")}
              >
                全部月份
              </button>
              {months.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={month === m ? "preset-chip active" : "preset-chip"}
                  onClick={() => updateParam("month", m)}
                >
                  {m.replace("-", " 年 ")} 月
                </button>
              ))}
            </div>
          )}

          <div className="archive-result-meta" role="status">
            {isEntryFiltering ? (
              <span>
                匹配 <strong>{filteredIssues.length}</strong> 期日报 · <strong>{totalMatchedPRs}</strong> 条 PR
              </span>
            ) : (
              <span>
                显示 <strong>{filteredIssues.length}</strong> / {days.length} 期
              </span>
            )}
            {hasFilters && (
              <button type="button" className="filter-reset-btn" onClick={() => setParams({}, { replace: true })}>
                <RotateCcw size={13} aria-hidden /> 重置筛选
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Month-Grouped Archive Timeline */}
      {filteredIssues.length === 0 ? (
        <div className="archive-empty-box">
          <Search size={26} aria-hidden />
          <h2>没有找到匹配的日报或 PR</h2>
          <p>请尝试更换搜索词、推理环节或清除当前筛选条件。</p>
          <button type="button" className="docx-secondary" onClick={() => setParams({}, { replace: true })}>
            清除全部筛选
          </button>
        </div>
      ) : (
        <div className="archive-month-groups">
          {groupedByMonth.map(([ym, issues]) => {
            const [year, mon] = ym.split("-");
            return (
              <section key={ym} className="archive-month-section" aria-label={`${year} 年 ${Number(mon)} 月`}>
                <div className="archive-month-header">
                  <h2>
                    {year} 年 {Number(mon)} 月
                  </h2>
                  <span>{issues.length} 期日报</span>
                </div>

                <ul className="docx-archive archive-list-v3">
                  {issues.map(({ day, record, version, matchedPRs }) => {
                    const c = version.counts;
                    const total = c.upstream + c.ascend + c.papers;
                    return (
                      <li key={day} className="archive-issue-item">
                        <Link className="archive-row archive-row-v3" to={`/reports/${day}`}>
                          <div className="archive-date-badge">
                            <strong>{day.slice(8)}</strong>
                            <small>{getWeekday(day)}</small>
                          </div>

                          <div className="archive-issue-main">
                            <div className="archive-issue-title-line">
                              <time dateTime={day}>{day}</time>
                              <span className="archive-issue-name">推理性能日报</span>
                              {record.versions.length > 1 && (
                                <span className="archive-rev-chip">修订版 v{record.versions.length}</span>
                              )}
                            </div>

                            <div className="archive-bar-and-counts">
                              <ReportCounts counts={c} />
                              {total > 0 && (
                                <div className="archive-ratio-bar" aria-hidden="true">
                                  {c.upstream > 0 && (
                                    <span
                                      className="bar-vllm"
                                      style={{ width: `${(100 * c.upstream) / total}%` }}
                                    />
                                  )}
                                  {c.ascend > 0 && (
                                    <span
                                      className="bar-ascend"
                                      style={{ width: `${(100 * c.ascend) / total}%` }}
                                    />
                                  )}
                                  {c.papers > 0 && (
                                    <span
                                      className="bar-paper"
                                      style={{ width: `${(100 * c.papers) / total}%` }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="archive-issue-cta">
                            <span>共 {total} 项</span>
                            <ArrowRight size={17} aria-hidden />
                          </div>
                        </Link>

                        {isEntryFiltering && matchedPRs.length > 0 && (
                          <ul className="archive-matched-prs" aria-label={`${day} 匹配的工程 PR`}>
                            {matchedPRs.slice(0, 10).map((pr) => {
                              const isAscend = pr.workId.includes("vllm-ascend");
                              const prNum = pr.workId.split("#").at(-1);
                              const search = new URLSearchParams({
                                section: pr.number,
                                version: pr.version,
                              });
                              return (
                                <li key={pr.workId + pr.number}>
                                  <Link
                                    className="archive-pr-hit"
                                    to={{ pathname: `/reports/${day}`, search: search.toString() }}
                                  >
                                    <GitPullRequest
                                      size={14}
                                      className={isAscend ? "tone-ascend" : "tone-vllm"}
                                      aria-hidden
                                    />
                                    <span className={isAscend ? "hit-repo ascend" : "hit-repo vllm"}>
                                      {isAscend ? "Ascend" : "vLLM"} #{prNum}
                                    </span>
                                    <span className="hit-title">{pr.title}</span>
                                    {stageMap[pr.stage] && (
                                      <span className="hit-stage">{stageMap[pr.stage]}</span>
                                    )}
                                    <ArrowUpRight size={14} className="hit-arrow" aria-hidden />
                                  </Link>
                                </li>
                              );
                            })}
                            {matchedPRs.length > 10 && (
                              <li className="archive-pr-more">
                                <Link to={`/reports/${day}`}>
                                  打开当日日报查看其余 {matchedPRs.length - 10} 条匹配项 →
                                </Link>
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

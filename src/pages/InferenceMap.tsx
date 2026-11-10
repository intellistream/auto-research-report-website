import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Box, Cable, ChevronLeft, ChevronRight, Recycle, RotateCcw, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { StageArt } from "./InferenceFlow";
import "./inference-map.css";

const labels = {
  startup: "模型准备", scheduling: "请求调度", prefill: "输入处理", pd_transfer: "P/D 缓存交接",
  decode: "循环生成", speculative: "推测解码", output_return: "输出返回",
  resource_reclaim: "资源回收与缓存保留", classification_conflict: "分类不一致",
} as const;

type Stage = keyof typeof labels;
export type IndexedPR = { day: string; version: string; stage: string; number: string; workId: string; title: string };

const stages = ["startup", "scheduling", "prefill", "pd_transfer", "decode", "speculative", "output_return", "resource_reclaim"] as const;
const mainArt = {
  scheduling: "多条请求汇成一批",
  prefill: "输入块生成 KV 缓存",
  decode: "逐个生成 token",
  output_return: "结果流式返回",
} as const;
const supportArt = {
  startup: { icon: Box, note: "服务启动时" },
  pd_transfer: { icon: Cable, note: "可选 · Prefill → Decode" },
  speculative: { icon: Sparkles, note: "可选 · 草稿验证" },
  resource_reclaim: { icon: Recycle, note: "请求结束后" },
} as const;

function isAscend({ workId }: IndexedPR) {
  return workId.startsWith("github:vllm-project/vllm-ascend#");
}

function StageVolume({ total, ascend, max }: { total: number; ascend: number; max: number }) {
  const upstream = total - ascend;
  return (
    <span className="map-v2-volume">
      <span className="map-v2-count" aria-hidden="true"><b>{total}</b> PR</span>
      <span className="map-v2-sr-only">{total} 个 PR，vLLM {upstream} 个，vLLM Ascend {ascend} 个</span>
      <span className="map-v2-track" aria-hidden="true" title={`vLLM ${upstream} · vLLM Ascend ${ascend}`}>
        <span className="map-v2-upstream" style={{ width: 100 * upstream / max + "%" }} />
        <span className="map-v2-ascend" style={{ width: 100 * ascend / max + "%" }} />
      </span>
    </span>
  );
}

function PRList({ stage, items, panel, returnToStage }: { stage: Stage; items: IndexedPR[]; panel: string; returnToStage: () => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const size = 8;
  const needle = query.trim().toLowerCase().replace(/^#\s*/, "");
  const matching = items.filter(({ title, workId }) => `${title} ${workId}`.toLowerCase().includes(needle));
  const pages = Math.ceil(matching.length / size);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <section id={panel} className="map-v2-details" aria-labelledby={panel + "-title"}>
      <div className="map-v2-detail-heading">
        <div>
          <h3 id={panel + "-title"} tabIndex={-1}>{labels[stage]} <span>{items.length} 个 PR</span></h3>
          <button type="button" className="map-v2-return" onClick={returnToStage}><ArrowUp size={14} aria-hidden />返回所选环节</button>
        </div>
        <label className="map-v2-search">
          <Search size={16} aria-hidden />
          <input type="search" aria-label="搜索所选环节 PR" placeholder="搜索标题或 PR 编号" value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        </label>
      </div>
      <div className="map-v2-pr-list" aria-live="polite">
        {matching.slice(current * size, (current + 1) * size).map((item) => {
          const ascend = isAscend(item);
          const search = new URLSearchParams({ section: item.number, version: item.version });
          return (
            <Link key={item.workId} className="map-v2-pr-row" to={{ pathname: `/reports/${item.day}`, search: search.toString() }}>
              <span className="map-v2-repo">{ascend ? "vLLM Ascend" : "vLLM"} <b>#{item.workId.split("#").at(-1)}</b></span>
              <span className="map-v2-pr-title"><strong>{item.title}</strong></span>
              <time dateTime={item.day}>{item.day}</time>
              <ArrowUpRight size={16} aria-hidden />
            </Link>
          );
        })}
        {!matching.length && <p className="map-v2-empty">{needle ? "没有匹配的 PR，试试其他关键词。" : "当前日期与来源范围内，这个环节没有收录 PR。"}</p>}
      </div>
      {pages > 0 && <div className="map-v2-pagination">
        <span role="status">共 {matching.length} 个 · 第 {current + 1} / {pages} 页</span>
        <div>
          <button type="button" aria-label="上一页 PR" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft size={17} /></button>
          <button type="button" aria-label="下一页 PR" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight size={17} /></button>
        </div>
      </div>}
    </section>
  );
}

export default function InferenceMap({ entries, selection, select, scope }: {
  entries: IndexedPR[]; selection: string | null; select: (stage: Stage) => void; scope: string;
}) {
  const layout = useRef<HTMLDivElement>(null);
  const [jumpTo, setJumpTo] = useState<{ stage: Stage }>();
  const panel = useId();
  const grouped = new Map<string, { items: IndexedPR[]; ascend: number }>();
  for (const entry of entries) {
    const group = grouped.get(entry.stage) ?? { items: [], ascend: 0 };
    group.items.push(entry);
    if (isAscend(entry)) group.ascend++;
    grouped.set(entry.stage, group);
  }
  const count = (stage: Stage) => grouped.get(stage)?.items.length ?? 0;
  const busiest = stages.reduce((best, stage) => count(stage) > count(best) ? stage : best);
  const max = Math.max(1, count(busiest));
  const selected = selection && Object.hasOwn(labels, selection)
    ? selection as Stage
    : count(busiest) ? busiest : undefined;
  const conflicts = count("classification_conflict");

  useLayoutEffect(() => {
    if (!jumpTo || selected !== jumpTo.stage) return;
    const heading = document.getElementById(panel + "-title");
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
    setJumpTo(undefined);
  }, [jumpTo, panel, selected]);

  function choose(stage: Stage) {
    select(stage);
    if (layout.current && getComputedStyle(layout.current).getPropertyValue("--map-panel-inline").trim() === "1") return;
    setJumpTo({ stage });
  }

  function stageButton(stage: Stage, content: ReactNode, main = false) {
    return (
      <button type="button" id={panel + "-" + stage}
        className={main ? "map-v2-node map-v2-primary" : "map-v2-node"}
        aria-pressed={selected === stage} aria-controls={panel} onClick={() => choose(stage)}>
        {content}
      </button>
    );
  }

  return (
    <section className="inference-map-v2" aria-labelledby={panel + "-map-title"}>
      <header className="map-v2-heading">
        <div>
          <h2 id={panel + "-map-title"}>沿着推理流程，查看社区改动</h2>
          <p>选择环节查看 PR。条越长，收录的 PR 越多。</p>
        </div>
        <div className="map-v2-communities" aria-label="社区图例">
          <span><i className="map-v2-upstream" />vLLM</span>
          <span><i className="map-v2-ascend" />vLLM Ascend</span>
        </div>
      </header>
      <div className="map-v2-layout" ref={layout}>
        <div className="map-v2-diagram" role="group" aria-label="推理流程与社区改动" aria-describedby={panel + "-flow-description"}>
          <p id={panel + "-flow-description"} className="map-v2-sr-only">
            服务启动时准备模型。请求依次经过调度、输入处理、循环生成和输出返回。
            P/D 分离时，输入处理经由缓存交接进入循环生成。推测解码是循环生成的可选分支。
            请求结束后回收资源，保留可供后续请求复用的缓存。
          </p>
          <div className="map-v2-flow">
            {stages.map((stage) => {
              const volume = <StageVolume total={count(stage)} ascend={grouped.get(stage)?.ascend ?? 0} max={max} />;
              if (stage in mainArt) {
                const main = stage as keyof typeof mainArt;
                return (
                  <div key={main} className={`map-v2-stage map-v2-main-step map-v2-${main}`}>
                    {stageButton(main, <>
                      <strong className="map-v2-node-name">{labels[main]}</strong>
                      <span className="map-v2-art"><StageArt stage={main} /></span>
                      <span className="map-v2-sr-only">{mainArt[main]}</span>
                      {volume}
                    </>, true)}
                  </div>
                );
              }

              const support = stage as keyof typeof supportArt;
              const { icon: Icon, note } = supportArt[support];
              return (
                <div key={support} className={`map-v2-stage map-v2-support-step map-v2-${support}`}>
                  {stageButton(support, <>
                    <span className="map-v2-support-label">
                      <Icon size={18} aria-hidden />
                      <span><strong className="map-v2-node-name">{labels[support]}</strong><small>{note}</small></span>
                    </span>
                    {volume}
                  </>)}
                  {support === "pd_transfer" && <svg className="map-v2-detour" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
                    <path d="M24 24V12Q24 10 26 10H34Q36 10 36 8V0 M64 0V8Q64 10 66 10H74Q76 10 76 12V24" />
                  </svg>}
                  {support === "resource_reclaim" && <span className="map-v2-reuse"><RotateCcw size={13} aria-hidden />缓存复用</span>}
                </div>
              );
            })}
          </div>
          {!!(conflicts || selected === "classification_conflict") && (
            <div className="map-v2-unplaced">
              {stageButton("classification_conflict", <><span>分类不一致</span><strong>{conflicts} PR</strong></>)}
            </div>
          )}
        </div>
        <span className="map-v2-sr-only map-v2-inline-status" role="status">
          {selected ? labels[selected] + "，" + count(selected) + " 个 PR" : "当前范围内暂无已定位的 PR"}
        </span>
        {selected ? (
          <PRList key={selected + scope} stage={selected} items={grouped.get(selected)?.items ?? []} panel={panel}
            returnToStage={() => document.getElementById(panel + "-" + selected)?.focus()} />
        ) : <div id={panel} className="map-v2-empty-panel">
          <h3>当前范围内暂无已定位的 PR</h3>
          <p>{conflicts ? "选择「分类不一致」查看未定位的条目。" : "可调整首页的来源或日期筛选。"}</p>
        </div>}
      </div>
      <p className="map-v2-footnote">数量按所选日期与来源内的不同 PR 统计，分类沿用日报一级标题。</p>
    </section>
  );
}

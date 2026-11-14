import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, ArrowUpRight, Box, Cable, ChevronDown, ChevronLeft, ChevronRight, List, Recycle, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import InferenceStageDemo from "./InferenceStageDemo";
import ChapterSummary from "./ChapterSummary";
import type { ChapterSummaries } from "./chapter-summaries";
import "./inference-map.css";

const labels = {
  startup: "模型准备", scheduling: "请求调度", prefill: "输入处理", pd_transfer: "P/D 缓存交接",
  decode: "循环生成", speculative: "推测解码", output_return: "输出返回",
  resource_reclaim: "资源回收与缓存保留", classification_conflict: "分类不一致",
} as const;

type Stage = keyof typeof labels;
export type IndexedPR = { day: string; version: string; stage: string; number: string; workId: string; title: string };

const stages = ["startup", "scheduling", "prefill", "pd_transfer", "decode", "speculative", "output_return", "resource_reclaim"] as const;
const main = [
  { key: "scheduling", action: "排队 → 成批" },
  { key: "prefill", action: "输入 → KV 缓存" },
  { key: "decode", action: "生成 → 再生成" },
  { key: "output_return", action: "边生成 → 边返回" },
] as const;
const supportArt = {
  startup: { icon: Box, note: "服务启动时" },
  pd_transfer: { icon: Cable, note: "可选 · 从输入到生成" },
  speculative: { icon: Sparkles, note: "可选 · 草稿 → 验证" },
  resource_reclaim: { icon: Recycle, note: "请求结束后 · 缓存可复用" },
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

function PRList({ items }: { items: IndexedPR[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const size = 8;
  const needle = query.trim().toLowerCase().replace(/^#\s*/, "");
  const matching = items.filter(({ title, workId }) => `${title} ${workId}`.toLowerCase().includes(needle));
  const pages = Math.ceil(matching.length / size);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <div className="map-v2-details">
      <div className="map-v2-detail-heading">
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
    </div>
  );
}

export default function InferenceMap({ entries, summaries = {}, selection, select, scope }: {
  entries: IndexedPR[]; summaries?: ChapterSummaries; selection: string | null; select: (stage: Stage) => void; scope: string;
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
    const compact = layout.current && getComputedStyle(layout.current).getPropertyValue("--map-compact").trim() === "1";
    if (compact) heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: compact ? "start" : "nearest" });
    setJumpTo(undefined);
  }, [jumpTo, panel, selected]);

  function choose(stage: Stage) {
    select(stage);
    setJumpTo({ stage });
  }

  function stageButton(stage: Stage, content: ReactNode, main = false) {
    return (
      <button type="button" id={panel + "-" + stage}
        className={(main ? "map-v2-node map-v2-primary" : "map-v2-node") + (summaries[stage] ? " map-v2-node-with-summary" : "")}
        aria-pressed={selected === stage} aria-controls={panel} onClick={() => choose(stage)}>
        {content}
        <ChapterSummary summary={summaries[stage]} compact />
      </button>
    );
  }

  return (
    <section className="inference-map-v2" aria-labelledby={panel + "-map-title"}>
      <header className="map-v2-heading">
        <div>
          <h2 id={panel + "-map-title"}>沿着推理流程，查看社区改动</h2>
          <p>点选环节，看它如何处理请求，再查看该环节的实际 PR。</p>
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
              const step = main.findIndex(({ key }) => key === stage);
              if (step >= 0) {
                return (
                  <div key={stage} className={`map-v2-stage map-v2-main-step map-v2-${stage}`}>
                    {stageButton(stage, <>
                      <span className="map-v2-main-label">
                        <span className="map-v2-order" aria-hidden="true">0{step + 1}</span>
                        <span><strong className="map-v2-node-name">{labels[stage]}</strong><small>{main[step].action}</small></span>
                      </span>
                      {volume}
                    </>, true)}
                  </div>
                );
              }

              const { icon: Icon, note } = supportArt[stage as keyof typeof supportArt];
              return (
                <div key={stage} className={`map-v2-stage map-v2-support-step map-v2-${stage}`}>
                  {stageButton(stage, <>
                    <span className="map-v2-support-label">
                      <Icon size={17} aria-hidden />
                      <span><strong className="map-v2-node-name">{labels[stage]}</strong><small>{note}</small></span>
                    </span>
                    {volume}
                  </>)}
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
        <span className="map-v2-sr-only" role="status">
          {selected ? labels[selected] + "，" + count(selected) + " 个 PR" : "当前范围内暂无已定位的 PR"}
        </span>
        <section id={panel} className="map-v2-workbench" aria-labelledby={panel + "-title"}>
          <header className="map-v2-workbench-heading">
            <div>
              {selected && selected !== "classification_conflict" && <span className="map-v2-example">流程示意</span>}
              <h3 id={panel + "-title"} tabIndex={-1}>{selected ? labels[selected] : "当前范围内暂无已定位的 PR"}</h3>
            </div>
            {selected && <button type="button" className="map-v2-return"
              onClick={() => document.getElementById(panel + "-" + selected)?.focus()}><ArrowUp size={14} aria-hidden />返回所选环节</button>}
          </header>
          {selected && selected !== "classification_conflict" && <ChapterSummary summary={summaries[selected]} />}
          {selected && selected !== "classification_conflict" && <InferenceStageDemo key={selected} stage={selected} />}
          {selected ? (
            <details key={selected + scope} className="map-v2-evidence">
              <summary><List size={16} aria-hidden />查看 {count(selected)} 条实际 PR <ChevronDown size={17} aria-hidden /></summary>
              <PRList items={grouped.get(selected)?.items ?? []} />
            </details>
          ) : <p className="map-v2-empty">可选择任一环节播放演示，或调整来源与日期查看实际 PR。</p>}
        </section>
      </div>
      <p className="map-v2-footnote">数量按所选日期与来源内的不同 PR 统计，分类沿用日报一级标题。问题总结为范围内最近一日的适用原文，点击板块可阅读全文及依据；不代表多日汇总结论。</p>
    </section>
  );
}

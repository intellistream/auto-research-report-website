import { useId } from "react";
import {
  ArrowUpRight,
  Box,
  Cable,
  MoveHorizontal,
  Recycle,
  Sparkles,
} from "lucide-react";
import type { IndexedPR } from "./InferenceMap";
import ChapterSummary from "./ChapterSummary";
import type { ChapterSummaries } from "./chapter-summaries";
import "./complete-inference-flow.css";

const stages = [
  {
    key: "startup",
    label: "模型准备",
    detail: "加载权重，准备运行环境",
    kind: "startup",
    icon: Box,
    x: 40,
    y: 65,
    width: 170,
    height: 110,
  },
  {
    key: "scheduling",
    label: "请求调度",
    detail: "接收请求，组成执行批次",
    kind: "main",
    step: "01",
    term: "Scheduling",
    x: 40,
    y: 280,
    width: 170,
    height: 152,
  },
  {
    key: "prefill",
    label: "输入处理",
    detail: "处理输入，建立 KV 缓存",
    kind: "main",
    step: "02",
    term: "Prefill",
    x: 240,
    y: 280,
    width: 170,
    height: 152,
  },
  {
    key: "pd_transfer",
    label: "P/D 缓存交接",
    detail: "分离部署时，将 KV 交给 Decode",
    kind: "optional",
    icon: Cable,
    x: 240,
    y: 65,
    width: 170,
    height: 110,
  },
  {
    key: "decode",
    label: "循环生成",
    detail: "读取 KV，逐个生成 token",
    kind: "main",
    step: "03",
    term: "Decode",
    x: 440,
    y: 280,
    width: 170,
    height: 152,
  },
  {
    key: "speculative",
    label: "推测解码",
    detail: "生成草稿，再由主模型验证",
    kind: "optional",
    icon: Sparkles,
    x: 440,
    y: 65,
    width: 170,
    height: 110,
  },
  {
    key: "output_return",
    label: "输出返回",
    detail: "流式返回结果，更新请求状态",
    kind: "main",
    step: "04",
    term: "Output",
    x: 640,
    y: 280,
    width: 170,
    height: 152,
  },
  {
    key: "resource_reclaim",
    label: "资源回收与缓存保留",
    detail: "释放请求占用，保留可复用的缓存",
    kind: "resource",
    icon: Recycle,
    x: 240,
    y: 496,
    width: 370,
    height: 92,
  },
] as const;
type FlowStage = (typeof stages)[number]["key"];

export default function CompleteInferenceFlow({
  entries,
  summaries = {},
  selection,
  onSelect,
}: {
  entries: IndexedPR[];
  summaries?: ChapterSummaries;
  selection: string | null;
  onSelect: (stage: FlowStage) => void;
}) {
  const id = useId();
  const extra = stages.some((stage) => summaries[stage.key]) ? 80 : 0;
  const counts = new Map<string, number>();
  for (const entry of entries)
    counts.set(entry.stage, (counts.get(entry.stage) ?? 0) + 1);
  const count = (stage: string) => counts.get(stage) ?? 0;
  const busiest = stages.reduce((best, stage) =>
    count(stage.key) > count(best.key) ? stage : best,
  );
  const selected = selection
    ? stages.find((stage) => stage.key === selection)?.key
    : count(busiest.key)
      ? busiest.key
      : undefined;
  const located = stages.reduce((sum, stage) => sum + count(stage.key), 0);
  const unplaced = entries.length - located;

  function choose(stage: FlowStage) {
    onSelect(stage);
    requestAnimationFrame(() => {
      const workbench = document.querySelector<HTMLElement>(
        ".inference-map-v2 .map-v2-workbench",
      );
      workbench
        ?.querySelector<HTMLElement>("h3")
        ?.focus({ preventScroll: true });
      workbench?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <section
      className="complete-inference-flow"
      aria-labelledby={id + "-title"}
    >
      <header className="complete-flow-heading">
        <div>
          <span className="complete-flow-eyebrow">INFERENCE LIFECYCLE</span>
          <h2 id={id + "-title"}>推理流程全图</h2>
          <p>看清主路径、可选优化与资源复用，再深入查看每个环节。</p>
        </div>
        <span className="complete-flow-total">
          <strong>{located}</strong> 个 PR 已定位
        </span>
      </header>
      <div className="complete-flow-toolbar">
        <div className="complete-flow-legend" aria-label="连线图例">
          <span>
            <i className="complete-flow-main-line" />
            请求主路径
          </span>
          <span>
            <i className="complete-flow-option-line" />
            可选路径
          </span>
          <span>
            <i className="complete-flow-reuse-line" />
            资源复用
          </span>
        </div>
        <span className="complete-flow-hint">
          <MoveHorizontal size={14} aria-hidden />
          左右滑动查看全图
        </span>
      </div>
      <p id={id + "-description"} className="complete-flow-sr-only">
        模型准备在服务启动时完成。请求依次经过请求调度、输入处理、循环生成、输出返回。
        P/D
        分离部署时，输入处理经缓存交接进入循环生成。推测解码是循环生成的可选往返路径。
        请求结束后回收资源，保留可供后续请求复用的缓存。点击任一环节，可查看下方交互演示与实际
        PR。
      </p>
      <div
        className="complete-flow-scroll"
        role="group"
        aria-label="完整推理流程图，可横向滚动"
        aria-describedby={id + "-description"}
        tabIndex={0}
      >
        <div className="complete-flow-canvas" style={{ height: 626 + 3 * extra }}>
          <svg
            className="complete-flow-wires"
            viewBox={`0 0 880 ${626 + 3 * extra}`}
            style={{ height: 626 + 3 * extra }}
            aria-hidden="true"
          >
            <defs>
              {[
                ["main", "#44876f"],
                ["option", "#927eae"],
                ["reuse", "#af9056"],
              ].map(([key, color]) => (
                <marker
                  key={key}
                  id={id + "-" + key}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                  markerUnits="userSpaceOnUse"
                >
                  <path d="M0 0 L8 4 L0 8 Z" fill={color} />
                </marker>
              ))}
            </defs>
            <g
              className="complete-flow-main-wire"
              markerEnd={`url(#${id}-main)`}
            >
              <path d={`M125 ${179 + extra} V${276 + extra}`} />
              <path d={`M214 ${356 + 1.5 * extra} H236`} />
              <path d={`M414 ${356 + 1.5 * extra} H436`} />
              <path d={`M614 ${356 + 1.5 * extra} H636`} />
            </g>
            <g
              className="complete-flow-option-wire"
              markerEnd={`url(#${id}-option)`}
            >
              <path d={`M285 ${276 + extra} V${179 + extra}`} />
              <path d={`M360 ${179 + extra} V${204 + extra} Q360 ${218 + extra} 374 ${218 + extra} H446 Q460 ${218 + extra} 460 ${232 + extra} V${276 + extra}`} />
              <path d={`M489 ${276 + extra} V${179 + extra}`} />
              <path d={`M561 ${179 + extra} V${276 + extra}`} />
            </g>
            <g
              className="complete-flow-reuse-wire"
              markerEnd={`url(#${id}-reuse)`}
            >
              <path d={`M814 ${356 + 1.5 * extra} H836 Q850 ${356 + 1.5 * extra} 850 ${370 + 1.5 * extra} V${528 + 2.5 * extra} Q850 ${542 + 2.5 * extra} 836 ${542 + 2.5 * extra} H614`} />
              <path d={`M236 ${542 + 2.5 * extra} H26 Q12 ${542 + 2.5 * extra} 12 ${528 + 2.5 * extra} V${370 + 1.5 * extra} Q12 ${356 + 1.5 * extra} 26 ${356 + 1.5 * extra} H36`} />
            </g>
          </svg>
          <span className="complete-flow-wire-note complete-flow-ready" style={{ top: 211 + extra }}>
            服务就绪
          </span>
          <span className="complete-flow-wire-note complete-flow-draft" style={{ top: 211 + extra }}>
            提出草稿
          </span>
          <span className="complete-flow-wire-note complete-flow-verify" style={{ top: 211 + extra }}>
            返回结果
          </span>
          <span className="complete-flow-wire-note complete-flow-end" style={{ top: 505 + 2.5 * extra }}>
            请求结束
          </span>
          <span className="complete-flow-wire-note complete-flow-reuse" style={{ top: 505 + 2.5 * extra }}>
            供后续请求使用
          </span>
          {stages.map((stage) => {
            const Icon = "icon" in stage ? stage.icon : undefined;
            return (
              <button
                key={stage.key}
                type="button"
                className={`complete-flow-card complete-flow-${stage.kind}`}
                style={{
                  left: stage.x,
                  top: stage.y + (stage.kind === "resource" ? 2 * extra : stage.kind === "main" ? extra : 0),
                  width: stage.width,
                  height: stage.height + extra,
                }}
                data-stage={stage.key}
                aria-pressed={selected === stage.key}
                aria-describedby={summaries[stage.key] ? `${id}-${stage.key}-summary` : undefined}
                aria-label={`${stage.label}，${count(stage.key)} 个 PR，查看交互演示与实际 PR`}
                onClick={() => choose(stage.key)}
              >
                {stage.kind === "resource" ? (
                  <>
                    {Icon && (
                      <Icon
                        className="complete-flow-resource-icon"
                        size={25}
                        aria-hidden
                      />
                    )}
                    <span className="complete-flow-resource-copy">
                      <strong>{stage.label}</strong>
                      <small>{stage.detail}</small>
                      <ChapterSummary summary={summaries[stage.key]} compact id={`${id}-${stage.key}-summary`} />
                    </span>
                    <span className="complete-flow-pr-count">
                      <b>{count(stage.key)}</b>
                      <small>PR</small>
                    </span>
                    <ArrowUpRight size={15} aria-hidden />
                  </>
                ) : (
                  <>
                    <span className="complete-flow-card-top">
                      {"step" in stage ? (
                        <>
                          <span className="complete-flow-step">
                            {stage.step}
                          </span>
                          <span>{stage.term}</span>
                        </>
                      ) : (
                        <>
                          {Icon && <Icon size={16} aria-hidden />}
                          <span>
                            {stage.kind === "startup" ? "启动准备" : "可选优化"}
                          </span>
                          <span className="complete-flow-support-count">
                            {count(stage.key)} PR
                          </span>
                        </>
                      )}
                    </span>
                    <strong className="complete-flow-card-title">
                      {stage.label}
                    </strong>
                    {!summaries[stage.key] && <span className="complete-flow-card-detail">
                      {stage.detail}
                    </span>}
                    <ChapterSummary summary={summaries[stage.key]} compact id={`${id}-${stage.key}-summary`} />
                    {stage.kind === "main" && (
                      <span className="complete-flow-card-bottom">
                        <span className="complete-flow-pr-count">
                          <b>{count(stage.key)}</b>
                          <small>PR</small>
                        </span>
                        <ArrowUpRight size={15} aria-hidden />
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="complete-flow-footnote">
        点击环节，查看完整问题总结、章原文与实际 PR；数量随首页来源和日期筛选变化。
        问题总结为范围内最近一日的适用原文，按句旁日期、版本及本章来源阅读。
        {unplaced > 0 &&
          `另有 ${unplaced} 个 PR 分类待核对，保留在页面总数中。`}
      </p>
    </section>
  );
}

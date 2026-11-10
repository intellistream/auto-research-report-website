import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Box, Cable, ChevronLeft, ChevronRight, MousePointer2, Recycle, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { StageArt } from "./InferenceFlow";
import "./inference-map.css";

const labels = {
  startup: "模型准备", scheduling: "请求调度", prefill: "输入处理", decode: "循环生成",
  output_return: "输出返回", pd_transfer: "P/D 缓存交接", speculative: "推测解码",
  resource_reclaim: "资源回收与缓存保留", classification_conflict: "分类不一致",
} as const;

type Stage = keyof typeof labels;
export type IndexedPR = { day: string; version: string; stage: string; number: string; workId: string; title: string };
const main = [
  { key: "scheduling", term: "Scheduling", description: "接收请求，组织执行批次" },
  { key: "prefill", term: "Prefill", description: "处理输入，建立 KV 缓存" },
  { key: "decode", term: "Decode", description: "逐个生成 token，直到结束" },
  { key: "output_return", term: "Output", description: "流式返回结果，更新请求状态" },
] as const;
const options = [
  { key: "pd_transfer", description: "分离部署时，将 KV 交给 Decode", icon: Cable },
  { key: "speculative", description: "生成草稿，再由主模型验证", icon: Sparkles },
] as const;
const stageOrder = ["startup", ...main.map(({ key }) => key), ...options.map(({ key }) => key), "resource_reclaim"] as const;
const colors = { main: "#39836b", option: "#8b78af", reuse: "#ad8b52" };

function Wires({ board }: { board: { current: HTMLDivElement | null } }) {
  const id = useId();
  const [drawing, setDrawing] = useState<{ paths: { tone: keyof typeof colors; d: string }[]; labels: { text: string; left: number; top: number }[] }>();
  useEffect(() => {
    const element = board.current;
    if (!element) return;
    function measure() {
      if (!element) return;
      const frame = element.getBoundingClientRect();
      const rect = (key: Stage) => {
        const box = element.querySelector(`[data-flow-stage="${key}"]`)!.getBoundingClientRect();
        return { left: box.left - frame.left, right: box.right - frame.left, top: box.top - frame.top,
          bottom: box.bottom - frame.top, x: (box.left + box.right) / 2 - frame.left, y: (box.top + box.bottom) / 2 - frame.top };
      };
      const [schedule, prefill, decode, output] = main.map(({ key }) => rect(key));
      const transfer = rect("pd_transfer"), draft = rect("speculative"), reclaim = rect("resource_reclaim");
      const left = 12, right = frame.width - 12;
      const prefillPort = Math.max(transfer.left + 24, Math.min(prefill.x, transfer.right - 24));
      const decodePort = decode.left + (decode.right - decode.left) * 0.26;
      const draftPort = decode.left + (decode.right - decode.left) * 0.76;
      const draftStart = Math.max(draft.left + 24, Math.min(draftPort, draft.right - 24));
      setDrawing({
        paths: [
          ...[[schedule, prefill], [prefill, decode], [decode, output]].map(([a, b]) =>
            ({ tone: "main" as const, d: `M${a.right + 3} ${a.y}H${b.left - 5}` })),
          { tone: "option", d: `M${prefill.x} ${prefill.top - 4}V${transfer.bottom + 34}H${prefillPort}V${transfer.bottom + 5}` },
          { tone: "option", d: `M${transfer.left + transfer.right - prefillPort} ${transfer.bottom + 4}V${transfer.bottom + 20}H${decodePort}V${decode.top - 5}` },
          { tone: "option", d: `M${draftStart} ${draft.bottom + 4}V${draft.bottom + 34}H${draftPort}V${decode.top - 5}` },
          { tone: "reuse", d: `M${output.right + 3} ${output.y}H${right}V${reclaim.y}H${reclaim.right + 5}` },
          { tone: "reuse", d: `M${reclaim.left - 3} ${reclaim.y}H${left}V${schedule.y}H${schedule.left - 5}` },
        ],
        labels: [
          { text: "资源与缓存复用", left: (left + reclaim.left) / 2, top: reclaim.y - 30 },
          { text: "请求结束", left: (right + reclaim.right) / 2, top: reclaim.y - 30 },
        ],
      });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [board]);
  return <>
    <svg className="map-v2-wires" aria-hidden="true">
      <defs>{Object.entries(colors).map(([tone, color]) => (
        <marker key={tone} id={id + tone} markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
          <path d="M0 0L8 4L0 8Z" fill={color} />
        </marker>
      ))}</defs>
      {drawing?.paths.map(({ tone, d }, index) => (
        <path key={index} className={`map-v2-wire map-v2-${tone}-wire`} d={d} markerEnd={`url(#${id + tone})`} />
      ))}
    </svg>
    {drawing?.labels.map(({ text, left, top }) => <span key={text} className="map-v2-return-label" style={{ left, top }}>{text}</span>)}
  </>;
}

function PRList({ stage, items, panel }: { stage: Stage; items: IndexedPR[]; panel: string }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const size = 8;
  const needle = query.trim().toLowerCase().replace(/^#\s*/, "");
  const matching = items.filter(({ title, workId }) => `${title} ${workId}`.toLowerCase().includes(needle));
  const pages = Math.ceil(matching.length / size);
  const current = Math.min(page, Math.max(0, pages - 1));
  return (
    <section id={panel} className="map-v2-details" tabIndex={-1} aria-labelledby={panel + "-title"}>
      <div className="map-v2-detail-heading">
        <div>
          <span className="map-v2-caption">所选环节</span>
          <h3 id={panel + "-title"}>{labels[stage]} <span>{items.length} 个 PR</span></h3>
          <p>按日报日期从新到旧排列，点击标题阅读完整原文。</p>
        </div>
        <label className="map-v2-search">
          <Search size={16} aria-hidden />
          <input type="search" aria-label="搜索所选环节 PR" placeholder="搜索标题或 PR 编号" value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
        </label>
      </div>
      <div className="map-v2-pr-list" aria-live="polite">
        {matching.slice(current * size, (current + 1) * size).map((item) => {
          const ascend = item.workId.startsWith("github:vllm-project/vllm-ascend#");
          const search = new URLSearchParams({ section: item.number, version: item.version });
          return (
            <Link key={item.workId} className="map-v2-pr-row" to={{ pathname: `/reports/${item.day}`, search: search.toString() }}>
              <span className={ascend ? "map-v2-repo ascend" : "map-v2-repo"}>{ascend ? "vLLM Ascend" : "vLLM"} <b>#{item.workId.split("#").at(-1)}</b></span>
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
  const board = useRef<HTMLDivElement>(null);
  const panel = useId();
  const grouped = new Map<string, IndexedPR[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.stage) ?? [];
    group.push(entry);
    grouped.set(entry.stage, group);
  }
  const selected = selection && Object.hasOwn(labels, selection) ? selection as Stage : undefined;
  const count = (stage: Stage) => grouped.get(stage)?.length ?? 0;
  const badge = (stage: Stage, className = "map-v2-inline-count") => (
    <span className={className}><b>{count(stage)}</b> PR</span>
  );
  function button(stage: Stage, className: string, content: ReactNode, onBoard = false) {
    return (
      <button type="button" className={className} data-flow-stage={onBoard ? stage : undefined}
        aria-pressed={selected === stage} aria-controls={panel} onClick={() => {
          select(stage);
          requestAnimationFrame(() => document.getElementById(panel)?.scrollIntoView({ block: "nearest" }));
        }}>{content}</button>
    );
  }
  const conflicts = count("classification_conflict");
  return (
    <section className="inference-map-v2" aria-label="推理流程">
      <div className="map-v2-heading">
        <div><h2>沿着推理流程，查看社区改动</h2><p>选择一个环节，在下方阅读对应 PR。</p></div>
        <span className="map-v2-total"><strong>{entries.length - conflicts}</strong> 个 PR 已定位</span>
      </div>
      <div className="map-v2-startup">
        <div className="map-v2-context"><span>启动准备</span><small>服务启动时</small></div>
        {button("startup", "map-v2-setup-button", <><Box size={22} aria-hidden /><span><strong>{labels.startup}</strong><small>加载权重，准备运行环境</small></span>{badge("startup")}<ChevronRight size={17} aria-hidden /></>)}
        <span className="map-v2-ready">服务就绪后接收请求</span>
      </div>
      <div className="map-v2-path-heading">
        <span>请求主路径</span>
        <div className="map-v2-legend"><span><i />主路径</span><span><i className="optional" />可选路径</span><span><i className="reuse" />资源复用</span></div>
      </div>
      <p className="map-v2-mobile-hint">左右滑动看完整流程，或直接选择下面的环节。</p>
      <div className="map-v2-scroll" role="group" aria-label="推理流程图，可横向滚动" tabIndex={0}>
        <div className="map-v2-board" ref={board}>
          <Wires board={board} />
          <div className="map-v2-options">
            {options.map(({ key, icon: Icon, description }) => <div key={key}>
              {button(key, "map-v2-option", <><Icon size={23} aria-hidden /><span><strong>{labels[key]}</strong><small>{description}</small></span><em>可选</em>{badge(key, "map-v2-option-count")}</>, true)}
            </div>)}
          </div>
          <div className="map-v2-main-stages">
            {main.map(({ key, term, description }, index) => <div key={key}>
              {button(key, "map-v2-main-stage", <>
                <span className="map-v2-node-top"><span className="map-v2-step">STEP 0{index + 1}</span>{term}</span>
                <strong className="map-v2-node-title">{labels[key]}</strong>
                <StageArt stage={key} />
                <span className="map-v2-node-bottom">{badge(key, "")}<ChevronRight size={17} aria-hidden /></span>
              </>, true)}
              <p className="map-v2-stage-description">{description}</p>
            </div>)}
          </div>
          {button("resource_reclaim", "map-v2-reclaim", <>
            <Recycle size={24} aria-hidden /><span><strong>{labels.resource_reclaim}</strong><small>释放占用，为后续请求保留可复用缓存</small></span>
            {badge("resource_reclaim")}<ChevronRight size={17} aria-hidden />
          </>, true)}
        </div>
      </div>
      <div className="map-v2-mobile-index" aria-label="快速选择推理环节">
        {stageOrder.map((key) => <div key={key}>{button(key, "map-v2-index-button", <><span>{labels[key]}</span><b>{count(key)}</b></>)}</div>)}
      </div>
      {!!conflicts && <div className="map-v2-unplaced">{button("classification_conflict", "map-v2-index-button", <><span>分类不一致</span><b>{conflicts}</b></>)}</div>}
      <p className="map-v2-footnote">数量按所选日期与来源内的不同 PR 统计，分类沿用日报一级标题。</p>
      {selected ? <PRList key={selected + scope} stage={selected} items={grouped.get(selected) ?? []} panel={panel} /> : (
        <div id={panel} className="map-v2-prompt"><MousePointer2 size={24} aria-hidden /><div>
          <strong>想看哪个环节在改进？</strong><p>点击上方的环节，查看完整标题、日报日期和原文。</p>
        </div></div>
      )}
    </section>
  );
}

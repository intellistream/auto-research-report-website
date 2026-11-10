import { useId, useRef, useState } from "react";
import { ArrowUpRight, Box, Cable, Recycle, Sparkles, X } from "lucide-react";
import { Link, type To } from "react-router-dom";
import "./inference-flow.css";

const stages = {
  startup: ["加载模型", "准备权重与运行环境"],
  scheduling: ["请求排队", "接收请求，组成待执行的批次"],
  prefill: ["读懂输入", "Prefill · 并行处理输入，建立 KV 缓存"],
  pd_transfer: ["搬运 KV 缓存", "P/D 分离部署时，交给 Decode 节点"],
  decode: ["循环生成", "Decode · 逐 token 循环，直到结束"],
  speculative: ["先猜，再验证", "推测解码 · 草稿 token 经验证后输出"],
  output_return: ["返回结果", "流式返回 token，更新请求状态"],
  resource_reclaim: ["释放资源，复用缓存", "请求结束后，为后续请求腾出空间"],
} as const;

type Stage = keyof typeof stages;
export type FlowEntry = { stage: string; id: string; label: string; title: string; to: To };
const main = ["scheduling", "prefill", "decode", "output_return"] as const;
const support = [
  { key: "startup", icon: Box, note: "服务启动时" },
  { key: "pd_transfer", icon: Cable, note: "可选" },
  { key: "speculative", icon: Sparkles, note: "可选" },
] as const;
const wires = [
  { name: "main", color: "#32806a", paths: ["M152 126V146", "M216 205H348", "M485 205H617", "M754 205H886"] },
  { name: "branch", color: "#8b78af", paths: ["M420 148V129H400V112", "M587 112V129H670V148", "M808 112V139H731V148"] },
  { name: "return", color: "#ae8950", paths: ["M1030 205H1090V407H824", "M297 407H20V205H80"] },
];

function Connections() {
  const id = useId();
  return (
    <svg className="flow-connections" viewBox="0 0 1120 460" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {wires.map(({ name, color }) => (
          <marker key={name} id={id + name} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0 0 7 3.5 0 7Z" fill={color} />
          </marker>
        ))}
      </defs>
      {wires.flatMap(({ name, color, paths }) => paths.map((d) => (
        <path key={d} className={`flow-${name}-path`} d={d} stroke={color} markerEnd={`url(#${id + name})`} />
      )))}
      <path className="flow-moving-path" d="M216 205H335M485 205H604M754 205H873" />
      <g className="flow-wire-label">
        <text x="282" y="193">批次</text>
        <text x="551" y="193">KV 缓存</text>
        <text x="820" y="193">新 token</text>
      </g>
      <g className="flow-wire-label flow-return-label">
        <text x="1010" y="361">请求结束</text>
        <text x="217" y="390">资源 / 缓存复用</text>
      </g>
    </svg>
  );
}

export function StageArt({ stage }: { stage: typeof main[number] }) {
  return (
    <svg className="flow-art" viewBox="0 0 128 64" aria-hidden="true">
      {stage === "scheduling" && <>
        <rect x="10" y="8" width="28" height="19" rx="5" />
        <rect x="10" y="34" width="28" height="19" rx="5" />
        <path d="M17 15h13M17 21h8M17 41h13M17 47h8M43 18h12v26H43M55 31h13" />
        <rect x="72" y="7" width="47" height="48" rx="7" className="flow-art-fill" />
        <path d="M81 18h29M81 30h29M81 42h29" />
        <circle cx="87" cy="18" r="3" className="flow-art-solid" />
        <circle cx="101" cy="30" r="3" className="flow-art-solid" />
        <circle cx="92" cy="42" r="3" className="flow-art-solid" />
      </>}
      {stage === "prefill" && <>
        {[8, 36, 64, 92].map((x) => <g key={x}>
          <rect x={x} y="6" width="22" height="17" rx="4" className="flow-art-fill" />
          <path d={`M${x + 11} 28v9`} />
        </g>)}
        <rect x="7" y="41" width="108" height="15" rx="4" />
        <path d="M29 42v13M51 42v13M73 42v13M95 42v13" />
      </>}
      {stage === "decode" && <>
        <rect x="8" y="15" width="26" height="26" rx="5" className="flow-art-fill" />
        <path d="M14 12V7M22 12V7M30 12V7M14 44v5M22 44v5M30 44v5M37 28h13" />
        <rect x="55" y="18" width="17" height="19" rx="4" className="flow-art-solid" />
        <rect x="78" y="18" width="17" height="19" rx="4" className="flow-art-fill" />
        <rect x="101" y="18" width="17" height="19" rx="4" strokeDasharray="3 3" />
        <path d="M109 43c0 18-46 18-46 0m-4 5 4-5 4 5" />
      </>}
      {stage === "output_return" && <>
        <path d="M5 15h17M5 28h25M5 41h17M28 14l5 1-5 2" />
        <path d="M44 7h66a7 7 0 0 1 7 7v28a7 7 0 0 1-7 7H60L47 58V49h-3a7 7 0 0 1-7-7V14a7 7 0 0 1 7-7Z" className="flow-art-fill" />
        <path d="M49 20h48M49 30h34M89 28v9" />
      </>}
    </svg>
  );
}

function Card({ entry }: { entry: FlowEntry }) {
  return (
    <Link className="flow-pr" to={entry.to}>
      <span className="flow-pr-meta"><strong>{entry.label}</strong><ArrowUpRight size={12} aria-hidden /></span>
      <span className="flow-pr-title" title={entry.title}>{entry.title}</span>
    </Link>
  );
}

export default function InferenceFlow({ entries }: { entries: FlowEntry[] }) {
  const [open, setOpen] = useState<Stage>();
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useId();
  const grouped = new Map<string, FlowEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.stage) ?? [];
    group.push(entry);
    grouped.set(entry.stage, group);
  }
  function stageCards(stage: Stage) {
    const items = grouped.get(stage) ?? [];
    return (
      <div className="flow-stage-prs">
        {items[0] ? <Card entry={items[0]} /> : <span className="flow-no-pr">当前范围暂无 PR</span>}
        {items.length > 1 && (
          <button className="flow-more-button" type="button"
            aria-expanded={open === stage} aria-controls={panel}
            aria-label={`查看${stages[stage][0]}的全部 ${items.length} 个 PR`}
            onClick={(event) => {
              opener.current = event.currentTarget;
              setOpen(stage);
              requestAnimationFrame(() => {
                const list = document.getElementById(panel);
                list?.focus({ preventScroll: true });
                list?.scrollIntoView({ block: "nearest" });
              });
            }}>+{items.length - 1}</button>
        )}
      </div>
    );
  }
  const expanded = open ? grouped.get(open) ?? [] : [];
  return (
    <section className="inference-flow" aria-label="推理流程">
      <div className="flow-heading">
        <h2>一次请求，怎样变成回答</h2>
        <span className="flow-count">{entries.length} 个 PR 已定位</span>
      </div>
      <div className="flow-legend">
        <span><i />请求主路径</span><span><i className="flow-legend-branch" />可选路径</span>
        <span><i className="flow-legend-return" />结束与资源复用</span>
        <small className="flow-scroll-hint">左右滑动查看完整流程 →</small>
      </div>
      <div className="flow-scroll" tabIndex={0} role="group" aria-label="推理流程图，可横向滚动">
        <div className="flow-board">
          <Connections />
          {support.map(({ key, icon: Icon, note }) => (
            <div className="flow-stage flow-support-stage" key={key} data-stage={key}>
              <div className="flow-support-title"><Icon size={20} aria-hidden /><h3>{stages[key][0]}</h3><span>{note}</span></div>
              <p>{stages[key][1]}</p>
              {stageCards(key)}
            </div>
          ))}
          {main.map((key, index) => (
            <div className="flow-stage flow-main-stage" key={key} data-stage={key}>
              <h3><span>{index + 1}</span>{stages[key][0]}</h3>
              <StageArt stage={key} />
              <p>{stages[key][1]}</p>
              {stageCards(key)}
            </div>
          ))}
          <div className="flow-stage flow-reclaim" data-stage="resource_reclaim">
            <div><div className="flow-support-title"><Recycle size={24} aria-hidden /><h3>{stages.resource_reclaim[0]}</h3></div>
              <p>{stages.resource_reclaim[1]}</p></div>
            {stageCards("resource_reclaim")}
          </div>
        </div>
      </div>
      {open && expanded.length > 0 && (
        <div id={panel} className="flow-expanded" tabIndex={-1} role="region" aria-label={`${stages[open][0]}的 PR`}>
          <div className="flow-heading">
            <h3>{stages[open][0]} · {expanded.length} 个 PR</h3>
            <button type="button" aria-label="收起 PR 列表" onClick={() => {
              setOpen(undefined);
              opener.current?.focus();
            }}><X size={16} /></button>
          </div>
          <div className="flow-expanded-list">{expanded.map((entry) => <Card key={entry.id} entry={entry} />)}</div>
        </div>
      )}
    </section>
  );
}

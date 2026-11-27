import { useState } from "react";

// Fixture replayed against ProgramThrottling at f2ba1bb: on_request, tick, release(Q), tick.
const frames = [
  { label: "首次检查", a: 600, resumed: false, caption: "合计余量 1,200，单台最多 600。P 需要 800，放不进任何一台，留在队列。" },
  { label: "Q 释放", a: 900, resumed: false, caption: "A 上的 Q 结束，释放 200 上下文 + 100 预留。A 现在能容纳 P；release(Q) 只归还预算，P 仍在队列。" },
  { label: "下次 tick", a: 100, resumed: true, caption: "tick 选择余量最大的 A。P 从队列移出并标记 ACTIVE；A 扣除 800，剩余 100，B 保持 600。" },
];
const width = 336;
function BudgetBar({ name, free, y, admitted }: { name: string; free: number; y: number; admitted: boolean }) {
  const scaled = (tokens: number) => tokens * width / 1200;
  return <g transform={`translate(0 ${y})`}>
    <text x="24" y="20" className="cp-title">引擎 {name}</text>
    <rect x="104" y="0" width={width} height="28" rx="4" fill="#426057"/>
    <rect x="104" y="0" width={scaled(free)} height="28" rx="4" fill="#9ae8bf"/>
    {admitted && <rect x={104+scaled(free)} y="0" width={scaled(800)} height="28" fill="#82bce6"/>}
    {admitted && <text x="208" y="20" style={{fill:"#153a3a"}}>P · 800</text>}
    <text x="455" y="20" className="cp-label">余 {free}</text>
  </g>;
}
export default function ControlPlaneResume() {
  const [index, setIndex] = useState(0);
  const frame = frames[index];
  return <section className="acl-guide cp-resume" aria-label="P 等待与恢复"><div className="acl-guide-overview">
    <div className="cp-map-heading"><div><p className="acl-mini-label">请求控制器 · 单实例 token 预算</p><h2>集群还有余量，P 为什么要等？</h2></div>
    <div className="acl-guide-toggle" role="group" aria-label="选择调度时刻">{frames.map((item,i) =>
      <button key={item.label} type="button" aria-pressed={i===index} onClick={()=>setIndex(i)}>{i+1} · {item.label}</button>)}</div></div>
    <div className="cp-map-scroll" tabIndex={0} aria-label="实例预算和等待队列，窄屏可横向滚动">
    <svg viewBox="0 0 800 250" className="cp-map" role="img" aria-label={`A 余 ${frame.a}，B 余 600，P ${frame.resumed ? "恢复至 A" : "等待"}`}>
      <text x="24" y="37" className="cp-label">P 需要 800 tokens</text><text x="224" y="37" className="cp-small">700 上下文 ＋ 100 预留</text>
      <path d="M24 52H774" stroke="#426057"/>
      <BudgetBar name="A" free={frame.a} y={83} admitted={frame.resumed}/>
      <BudgetBar name="B" free={600} y={148} admitted={false}/>
      <path d="M328 67V183" stroke="#f5cf87" strokeDasharray="3 3"/><text x="328" y="202" textAnchor="middle" className="cp-feedback-text">单台放行门槛 800</text>
      <rect x="566" y="77" width="208" height="104" rx="10" fill="#1b493e" stroke={frame.resumed?"#9ae8bf":"#f5cf87"}/>
      <text x="584" y="106" className="cp-small">等待队列　{frame.resumed?"[ ]":"[ P ]"}</text>
      <text x="584" y="140" className="cp-title">{frame.resumed?"P → 引擎 A":"P · PAUSED"}</text>
      <text x="584" y="163" className="cp-small">{["单台余量不足","已有容量，等待 tick","ACTIVE · 移出队列"][index]}</text>
      <text x="24" y="232" className="cp-small">每台总预算 1,200　　绿色：剩余　　灰色：其他活跃 program　　蓝色：P</text>
    </svg></div>
    <p aria-live="polite">{frame.caption}</p>
    <details><summary>预算口径与实现</summary><p>教学输入，P 是唯一等待者。余量 = 实例容量 − 所有 ACTIVE program 的（上下文 + 每个 program 的预留）。图中使用默认预留 100 tokens；显示的是调度器账面预算。恢复时先以总余量筛选候选，再逐个检查能否放入单台实例。</p>
    <a href="https://github.com/vLLM-HUST/request-throttling-controller/blob/f2ba1bb17562a5036c4a1986e1d8b2805f247085/src/thunderagent_controller_mod/_runtime/controller/program_throttling.py#L285">查看恢复逻辑 ↗</a></details>
  </div></section>;
}

import ControlPlaneDiagram from "./ControlPlaneDiagram";
import { useState } from "react";
import { Server } from "lucide-react";
import "./aclgraph-guide.css";

const spec = "https://github.com/vLLM-HUST/ride/blob/071976ebcaa0fa9ae3553adb512693f1326ce24d/docs/reference/FRAMEWORK_SPEC.md";
const loop = "https://github.com/vLLM-HUST/request-throttling-controller/blob/f2ba1bb17562a5036c4a1986e1d8b2805f247085/src/thunderagent_controller_mod/_runtime/controller/controller_loop.py";

// One decision per 60-second window. A slot can complete multiple steps in a window.
const windows = [
  { a: 8, b: 6, completed: 9 },
  { a: 4, b: 8, completed: 12 },
  { a: 9, b: 8, completed: 10 },
];

function simulate() {
  const rate = { A: 1, B: 1 };
  return windows.map(({ a, b, completed }) => {
    const estimates = { A: a * rate.A, B: b * rate.B };
    const target: keyof typeof estimates = estimates.A >= estimates.B ? "A" : "B";
    const slots = target === "A" ? a : b;
    const before = rate[target];
    rate[target] = (before + completed / slots) / 2;
    return { a, b, estimates, target, before, after: rate[target], slots, completed };
  });
}
const history = simulate();

export default function ControlPlaneLoop() {
  const [index, setIndex] = useState(0);
  const row = history[index];
  const fmt = (v: number) => Number(v.toFixed(2));
  const selectedY = row.target === "A" ? 137 : 248;
  return <section className="acl-guide cp-loop" aria-label="RIDE 控制器决策闭环"><div className="acl-guide-overview">
    <div className="cp-map-heading"><div><p className="acl-mini-label">RIDE 请求限流控制器 · 预测选址示意</p><h2>下一组请求交给谁？</h2></div>
      <div className="acl-guide-toggle" role="group" aria-label="选择决策窗口">{history.map((_, i) =>
        <button key={i} type="button" aria-pressed={i === index} onClick={() => setIndex(i)}>第 {i + 1} 分钟</button>)}</div></div>
    <ControlPlaneDiagram label="双实例控制回路，窄屏可横向滚动">
    <svg className="cp-map" viewBox="0 0 816 370" role="img" aria-label={`第 ${index + 1} 分钟：选择实例 ${row.target}，实际新增完成 ${row.completed} 步`}>
      <defs>{(["observe","action","feedback"] as const).map(kind =>
        <marker key={kind} id={"cp-tip-"+kind} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path className={kind} d="M0 0 10 5 0 10Z"/></marker>)}</defs>
      <rect className="cp-boundary" x="301" y="66" width="489" height="219" rx="17"/>
      <text x="321" y="95" className="cp-label">RIDE · 请求控制器</text>
      <path className="cp-wire action" d={`M698 125 V34 H22 V${selectedY} H56`} markerEnd="url(#cp-tip-action)"/>
      <rect x="166" y="20" width="153" height="25" rx="10" fill="#123c33"/><text x="242" y="38" textAnchor="middle" className="cp-action-text">执行 API · 放行至 {row.target}</text>
      {(["A","B"] as const).map((name,i) => {
        const slots = name === "A" ? row.a : row.b;
        const y = i === 0 ? 103 : 214;
        return <g key={name}><rect className={name === row.target ? "cp-engine selected" : "cp-engine"} x="57" y={y} width="162" height="75" rx="10"/>
          <Server x="68" y={y+9} width="20" height="20" color="#ade7d4"/><text x="96" y={y+24} className="cp-title">引擎 {name}</text>
          {Array.from({length:9},(_,j)=><rect key={j} x={69+j*10} y={y+43} width="7" height="12" rx="2" fill={j<slots?"#78dfbd":"#365950"}/>)}
          <text x="164" y={y+55} className="cp-small">{slots} 空槽</text>
          <path className="cp-wire observe" d={`M219 ${y+31} H${i ? 268 : 253} V${i ? 200 : 164} H326`} markerEnd="url(#cp-tip-observe)"/></g>;
      })}
      <text x="230" y="122" className="cp-small">上报</text>
      <rect className="cp-module" x="328" y="125" width="225" height="125" rx="11"/>
      <text x="344" y="151" className="cp-title">模型</text><text x="344" y="173" className="cp-small">预测增量 · steps/min</text>
      {(["A","B"] as const).map((name,i)=><g key={name}><text x="344" y={199+i*27}>{name}</text><rect x="365" y={188+i*27} width={row.estimates[name]*10} height="12" rx="3" fill={row.target===name?"#86e8bd":"#729a94"}/><text x="479" y={200+i*27}>{fmt(row.estimates[name])}</text></g>)}
      <path className="cp-wire observe" d="M553 187 H603" markerEnd="url(#cp-tip-observe)"/>
      <rect className="cp-module" x="606" y="125" width="160" height="125" rx="11"/>
      <text x="622" y="151" className="cp-title">策略</text><text x="622" y="176" className="cp-small">最大化完成步数</text>
      <text x="622" y="221" className="cp-result">选 {row.target}</text>
      <path className="cp-wire feedback" d={`M197 ${selectedY+41} H233 V329 H442 V252`} markerEnd="url(#cp-tip-feedback)"/>
      <rect x="246" y="312" width="181" height="31" rx="9" fill="#123c33"/><text x="336" y="332" textAnchor="middle" className="cp-feedback-text">回执 · 完成 {row.completed} 步</text>
      <text x="456" y="325" className="cp-feedback-text">校准 {row.target} 的每槽完成率</text>
      <text x="456" y="348" className="cp-label">{fmt(row.before)} → {fmt(row.after)} 步 / 槽 / 分钟</text>
    </svg></ControlPlaneDiagram>
    <p className="cp-map-caption" aria-live="polite">{index === 2 ? "A 的空槽更多，B 的预测吞吐更高。前两分钟的执行反馈改变了这次选址。" : `第 ${index+1} 分钟，模型预计 ${row.target} 每分钟可多完成 ${fmt(row.estimates[row.target])} 步，策略将这批请求送往 ${row.target}。`}</p>
    <details><summary>模型假设与策略演进</summary><p>教学数值。固定设备预算，假设两种选址均满足等待 P99 与失败率约束。预测增量等于空闲槽数乘以每槽完成率，回执与原估计等权更新。长期策略演进的设计路径为：记录决策 → 提出候选 → 配对验证 → 晋级或回退。</p>
    <nav className="acl-source-links"><a href={spec}>RIDE 控制器协议 ↗</a><a href={loop}>请求控制器实现 ↗</a></nav></details>
  </div></section>;
}

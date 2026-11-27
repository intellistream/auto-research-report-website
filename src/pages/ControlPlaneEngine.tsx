import ControlPlaneDiagram from "./ControlPlaneDiagram";
import { useState } from "react";

const prefix = ["P1", "P2", "P3", "P4"];
const other = ["Q1", "Q2", "Q3", "Q4"];
const fill = { P: "#9ae8bf", Q: "#89c9ee", new: "#ddf4af", busy: "#435e57", free: "#184139" };

function Blocks({ cells, y, evicted = 0 }: { cells: string[]; y: number; evicted?: number }) {
  return <g>{cells.map((label, i) => {
    const lost = label.startsWith("Q") && Number(label.slice(1)) > 4 - evicted;
    const color = label === "空" ? fill.free : label === "占" ? fill.busy
      : label.startsWith("Q") ? fill.Q : Number(label.slice(1)) > 4 ? fill.new : fill.P;
    return <g key={i} transform={`translate(${129 + i * 46} ${y})`}>
      <rect width="39" height="38" rx="5" fill={color} stroke={lost ? "#ffa965" : "#71988c"} strokeWidth={lost ? 3 : 1}/>
      <text x="19.5" y="24" textAnchor="middle" style={{fill: ["空","占"].includes(label) ? "#d0e5dc" : "#14382e", fontWeight: 650}}>{label}</text>
      {lost && <path d="M2 35 L37 3" stroke="#a14b17" strokeWidth="2.5"/>}
    </g>;
  })}</g>;
}

export default function ControlPlaneEngine() {
  const [pressure, setPressure] = useState(true);
  const initial = [...prefix, ...other, "空", ...Array(3).fill(pressure ? "占" : "空")];
  const final = pressure ? [...prefix, "Q1","P8","P7","P6","P5","占","占","占"] : [...prefix,...other,"P5","P6","P7","P8"];
  const lost = pressure ? 3 : 0;
  return <section className="acl-guide cp-engine-view" aria-label="引擎内部 KV 块变化"><div className="acl-guide-overview">
    <div className="cp-map-heading"><div><p className="acl-mini-label">引擎内部 · KV 块</p><h2>P 命中了前缀，谁为新增上下文腾空间？</h2></div>
    <div className="acl-guide-toggle" role="group" aria-label="切换缓存压力">{[false,true].map(value =>
      <button type="button" key={String(value)} aria-pressed={pressure === value} onClick={()=>setPressure(value)}>{value ? "空间紧张" : "空间充足"}</button>)}</div></div>
    <ControlPlaneDiagram label="KV 块变化图，窄屏可横向滚动">
    <svg viewBox="0 0 740 310" className="cp-map" role="img" aria-label={`P 复用 4 块，新增 4 块，Q 下次返回需重算 ${lost} 块`}>
      <text x="22" y="36" className="cp-label">续轮 P</text>
      <text x="130" y="36" className="cp-action-text">复用 P1–P4</text><text x="284" y="36">＋</text><text x="315" y="36" className="cp-action-text">新增 P5–P8</text>
      <text x="676" y="36" textAnchor="end" className="cp-small">实例容量固定 · 12 块</text>
      <path d="M22 54H704" stroke="#41685c"/>
      <text x="22" y="95" className="cp-title">放行前</text><Blocks cells={initial} y={70} evicted={lost}/>
      <path d="M229 117V149m-5 -6 5 6 5 -6" fill="none" stroke="#99debc" strokeWidth="2"/>
      <text x="246" y="138" className="cp-small">{pressure ? "用 1 个空块，回收 Q 的 3 个尾块" : "直接分配 4 个空块"}</text>
      <text x="22" y="190" className="cp-title">放行后</text><Blocks cells={final} y={165}/>
      <path d="M22 223H704" stroke="#41685c"/>
      <text x="22" y="259" className="cp-title">Q 再返回</text>
      {other.map((label,i)=><g key={label}><rect x={129+i*46} y="235" width="39" height="38" rx="5" fill={i<4-lost ? fill.Q : "#ffd19c"}/>
        <text x={148+i*46} y="260" textAnchor="middle" style={{fill:"#183e36"}}>{label}</text></g>)}
      <text x="337" y="259" className="cp-label">命中 {4-lost} 块 · 重算 {lost} 块</text>
      <text x="129" y="294" className="cp-small">蓝色：Q 的可复用前缀　　橙色：Q 需重新 prefill 的历史</text>
    </svg></ControlPlaneDiagram>
    <p aria-live="polite">{pressure ? "P 的 4 块历史全部命中，Q 却在下一轮多算 3 块。路由只看 P 的 locality，会漏掉这笔代价。" : "P 同样命中 4 块。空闲容量足够，Q 的 4 块历史也都能保留。"}</p>
    <details><summary>教学假设</summary><p>固定同一引擎、两条请求和块大小。「占」是其他在途请求固定的块；Q 正在等待工具，本例允许按尾部优先回收它的缓存。假设没有其他副本或卸载备份，Q 返回前也无其他驱逐。格子代表物理槽位，编号代表各请求的逻辑顺序。单次驱逐与重算只是一次代价，反复发生才构成 KV thrashing。</p></details>
  </div></section>;
}

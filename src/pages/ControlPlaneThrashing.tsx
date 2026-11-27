import ControlPlaneDiagram from "./ControlPlaneDiagram";
import { useState } from "react";

export default function ControlPlaneThrashing() {
  const [tight, setTight] = useState(true);
  const order = ["A", "B", "A", "B"];
  const work = order.flatMap((name, i) => tight && i > 0
    ? [{ name, rebuild: true }, { name, rebuild: false }]
    : [{ name, rebuild: false }]);
  let offset = 0;
  return <section className="acl-guide cp-thrashing"><div className="acl-guide-overview">
    <div className="cp-map-heading"><div><p className="acl-mini-label">教学示意 · 固定四次续轮</p><h2>同样推进四步，算力花在哪里？</h2></div>
      <div className="acl-guide-toggle" role="group" aria-label="KV 可容纳的历史前缀数">{[false,true].map(value =>
        <button key={String(value)} type="button" aria-pressed={tight === value} onClick={()=>setTight(value)}>{value ? "只能留一份前缀" : "两份都能留住"}</button>)}</div></div>
    <ControlPlaneDiagram label="请求切换与历史重算时间线">
    <svg className="cp-map" viewBox="0 0 800 264" role="img" aria-label={`四次续轮，重算历史 ${tight ? 3 : 0} 次`}>
      <text x="18" y="52" className="cp-small">续轮到达</text><text x="18" y="102" className="cp-small">执行后驻留</text>
      {order.map((name,i) => <g key={i} transform={`translate(${124+163*i} 23)`}>
        <rect width="132" height="42" rx="7" fill="#245747"/><text x="66" y="27" textAnchor="middle" className="cp-title">{name} · 第 {Math.floor(i/2)+1} 步</text>
        {i<3 && <text x="140" y="27">→</text>}
        <text x="66" y="77" textAnchor="middle">{tight ? name : "A + B"}</text>
        {tight && i>0 && <text x="66" y="101" textAnchor="middle" className="cp-feedback-text">挤出 {order[i-1]}</text>}
      </g>)}
      <path d="M18 141H778" stroke="#487266"/>
      <text x="18" y="179" className="cp-small">引擎时间 →</text>
      {work.map(({name,rebuild},i) => {
        const x = 124 + offset;
        const width = rebuild ? 132 : 53;
        offset += width;
        return <g key={i}><rect x={x} y="153" width={width-2} height="45" rx="4" fill={rebuild ? "#ffd09a" : "#97e6bd"}/>
          <text x={x+(width-2)/2} y="181" textAnchor="middle" style={{fill:"#153c31",fontWeight:650}}>{rebuild ? "重算 "+name+" 历史" : name+" 推进"}</text></g>;
      })}
      <text x="124" y="235" className="cp-action-text">有效推进 4 步</text><text x="321" y="235" className="cp-feedback-text">重复 prefill {tight ? 3 : 0} 次</text>
    </svg></ControlPlaneDiagram>
    <p aria-live="polite">{tight ? "A 返回时，它的历史已被 B 挤出；恢复 A 又挤出 B。下一轮还要为同一段历史付费。" : "请求照样交替到达。两份前缀都能保留，每次返回只需处理新增工作。"}</p>
    <small>两份历史均已计算过，第一步 A 命中；假设没有卸载副本。块宽用于比较开销，非实测耗时。</small>
  </div></section>;
}

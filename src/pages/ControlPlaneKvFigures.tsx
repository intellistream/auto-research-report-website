import { useState } from "react";
import TimeBlock from "./TimeBlock";

export function KvResidenceFigure() {
  const [stage, setStage] = useState(0);
  const cost = stage === 0 ? 2 : 3;
  const layers = ["P · L1", "P · L2", "Q · L1", "Q · L2"];
  const device = stage === 2 ? [0, 3] : [0, 1, 2, 3];
  const demand = device.length * cost;
  return <figure className="acl-guide cp-kv-residency"><div className="acl-guide-overview">
    <figcaption><strong>同一实例，两个请求，各取两层观察</strong></figcaption>
    <div className="acl-guide-toggle" role="group" aria-label="查看驻留方案">{["早期 decode", "上下文增长", "更新驻留"].map((item,i)=>
      <button type="button" key={item} aria-pressed={stage===i} onClick={()=>setStage(i)}>{item}</button>)}</div>
    <div className="cp-map-scroll" tabIndex={0} aria-label="设备与主机驻留图，窄屏可横向滚动">
    <svg className="cp-map" viewBox="0 0 760 200" role="img" aria-label={`设备驻留需求 ${demand}，预算 9`}>
      <text x="18" y="42" className="cp-title">设备 HBM</text><text x="18" y="111" className="cp-title">主机内存</text>
      {layers.map((label,i)=>{
        const y=device.includes(i)?18:88;
        return <g key={label} transform={`translate(${145+i*143} ${y})`}>
          <rect width="130" height="48" rx="7" fill={i<2?"#9ae8bf":"#89c9ee"}/>
          <text x="65" y="30" textAnchor="middle" style={{fill:"#12392e"}}>{label} · {cost} 块</text></g>;
      })}
      <path d="M18 77H725" stroke="#487266"/>
      <text x="18" y="169" className="cp-feedback-text">驻留需求 {demand} / 固定预算 9 块</text>
      <text x="327" y="169">{stage===1?"超出 3 块 · 旧计划无法继续":stage===2?"空出 3 块 · 可预取一层":"旧计划可行"}</text>
    </svg></div>
    <small>教学示意。增长阶段画的是旧计划所需空间。设备预算固定为 9 块，P、Q 始终在同一实例执行。</small>
  </div></figure>;
}

export function KvOverlapFigure() {
  const [slow,setSlow]=useState(true);
  const ready=slow?6:3;
  const start=Math.max(4,ready);
  return <figure className="acl-guide cp-kv-overlap"><div className="acl-guide-overview">
    <figcaption><strong>预取与计算同时开始，下一层还要等多久？</strong></figcaption>
    <div className="acl-guide-toggle" role="group" aria-label="选择传输耗时">{["搬运 3 格","搬运 6 格"].map((label,i)=><button type="button" key={label} aria-pressed={Number(slow)===i} onClick={()=>setSlow(i===1)}>{label}</button>)}</div>
    <div className="acl-execution">
      <div className="acl-execution-row"><span className="acl-device-label">预取</span><div className="acl-time-track acl-device-track cp-eight"><TimeBlock start={0} end={ready} label="下一层 KV：主机 → 设备"/></div></div>
      <div className="acl-execution-row"><span className="acl-device-label">计算</span><div className="acl-time-track acl-device-track cp-eight"><TimeBlock start={0} end={4} label="当前层"/>{slow && <TimeBlock start={4} end={6} label="等 KV" waiting/>}<TimeBlock start={start} end={start+2} label="下一层"/></div></div>
    </div>
    <p aria-live="polite">暴露在关键路径上的等待为 {Math.max(0,ready-4)} 格，两层合计 {start+2} 格。时间从左向右，块宽代表相对耗时。</p>
  </div></figure>;
}

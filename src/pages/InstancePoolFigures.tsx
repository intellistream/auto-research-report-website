import { useState } from "react";

function Switch({ labels, selected, onChange, name }: { labels: string[]; selected: number; onChange: (i: number) => void; name: string }) {
  return <div className="acl-guide-toggle" role="group" aria-label={name}>{labels.map((label,i) =>
    <button key={label} type="button" aria-pressed={i===selected} onClick={()=>onChange(i)}>{label}</button>)}</div>;
}

export function PoolPressure() {
  const [mode,setMode]=useState(1);
  const queue=mode ? [2,7,9,10] : [2,7,3,2];
  const trigger=queue.findIndex((n,i)=>i>0 && n>4 && queue[i-1]>4);
  return <figure className="acl-guide cp-pool-pressure"><div className="acl-guide-overview">
    <figcaption><strong>队列越线一次，还是连续两个采样点？</strong></figcaption>
    <Switch labels={["短暂突发","持续积压"]} name="到达负载" selected={mode} onChange={setMode}/>
    <div className="cp-map-scroll" tabIndex={0} aria-label="等待队列随时间变化"><svg className="cp-map" viewBox="0 0 760 230" role="img" aria-label={trigger<0?"目标维持一台":"20 秒决定增加 B"}>
      <text x="18" y="26" className="cp-small">等待请求数</text>
      <path d="M80 40V164H680" className="cp-wire observe"/>
      <path d="M80 120H680" stroke="#f4c784" strokeDasharray="5 5"/>
      <text x="16" y="125" className="cp-feedback-text">阈值 4</text>
      <polyline points={queue.map((n,i)=>[123+160*i,164-11*n].join(",")).join(" ")} fill="none" stroke="#96efbf" strokeWidth="4"/>
      {queue.map((n,i)=><g key={i}><circle cx={123+160*i} cy={164-11*n} r="5" fill="#aeffd1"/><text x={123+160*i} y={151-11*n} textAnchor="middle">{n}</text><text x={123+160*i} y="187" textAnchor="middle">{10*i} s</text></g>)}
      <text x="80" y="218" className="cp-label">{trigger<0?"目标副本数 1 → 1":"20 s：目标副本数 1 → 2，B 开始启动"}</text>
    </svg></div><small>教学策略：每 10 秒采样，连续两次超过 4 才增加一个副本；已有扩容在途时不重复申请。</small>
  </div></figure>;
}

const checkpoints = [
  { t:20, event:"发出扩容决定", status:"启动 / 加载", ready:1, first:"尚未接单" },
  { t:50, event:"模型通过就绪检查", status:"就绪", ready:2, first:"尚未接单" },
  { t:55, event:"路由端点更新", status:"可分流", ready:2, first:"尚未接单" },
  { t:60, event:"B 收到第一个请求", status:"服务中", ready:2, first:"接单 1 次" },
];
export function PoolFirstRequest() {
  const [i,set]=useState(3);
  const s=checkpoints[i];
  return <figure className="acl-guide cp-pool-first"><div className="acl-guide-overview">
    <figcaption><strong>从决定扩容到 B 首次接单，经过了什么？</strong></figcaption>
    <Switch name="查看扩容回执" labels={checkpoints.map(x=>x.t+" s")} selected={i} onChange={set}/>
    <div className="cp-map-scroll" tabIndex={0} aria-label="副本状态和请求流向"><svg className="cp-map" viewBox="0 0 760 215" role="img" aria-label={s.event}>
      <text x="24" y="28" className="cp-small">目标副本 2　·　已就绪 {s.ready}　·　实际接过请求 {i===3?2:1}</text>
      <rect x="26" y="75" width="135" height="65" rx="8" className="cp-module"/><text x="93" y="113" textAnchor="middle">请求路由</text>
      {[0,1].map((v)=>{const y=v?147:68;const live=v===0||i===3;return <g key={v}>
        <path d={`M161 107H220V${y}H303`} fill="none" stroke={live?"#9eeec3":"#77998c"} strokeWidth="3" strokeDasharray={live?undefined:"6 5"}/>
        <text x="293" y={y+5}>{live?"▶":""}</text><rect x="315" y={y-23} width="144" height="46" rx="8" className="cp-engine"/>
        <text x="387" y={y+5} textAnchor="middle">实例 {v?"B":"A"}</text>
        <text x="486" y={y+5}>{v?s.status+" · "+s.first:"已就绪 · 持续接单"}</text>
      </g>;})}
      <text x="26" y="202" className="cp-label">{s.t} s · {s.event}</text>
    </svg></div><small>承接上图的持续积压情形。时间为教学假设。B 的首个请求在扩容决定后 40 秒到达；请求完成时间另行记录。</small>
  </div></figure>;
}

export function PoolScaleIn() {
  const [long,setLong]=useState(1);
  const remaining=long?10:2;
  const release=3;
  return <figure className="acl-guide cp-pool-in"><div className="acl-guide-overview">
    <figcaption><strong>B 已停止接新请求，最后一条流怎样收尾？</strong></figcaption>
    <Switch name="在途流剩余时间" labels={["短尾 · 2 秒","长尾 · 10 秒"]} selected={long} onChange={setLong}/>
    <div className="cp-map-scroll" tabIndex={0} aria-label="自然排空与迁移共用时间轴"><svg className="cp-map" viewBox="0 0 790 236" role="img" aria-label={`排空在 ${remaining} 秒释放 B，迁移在 3 秒释放 B`}>
      <text x="16" y="29" className="cp-small">从 B 停止接单起计时　·　每格 1 秒</text>
      {Array.from({length:14},(_,i)=><path key={i} d={`M${116+i*45} 47v129`} stroke="#41675b"/>)}
      <text x="15" y="79">自然排空</text><text x="15" y="146">状态迁移</text>
      <rect x="116" y="53" width={remaining*45} height="41" rx="4" fill="#9ae8bf"/><text x="125" y="79" style={{fill:"#12392e"}}>B 续算</text>
      <text x={116+remaining*45} y="113" textAnchor="middle" className="cp-small">{remaining} s 释放 B</text>
      <rect x="116" y="121" width={release*45} height="40" rx="4" fill="#ffd09a"/><text x="126" y="147" style={{fill:"#12392e"}}>复制 KV · 交接</text>
      <rect x={116+release*45} y="121" width={remaining*45} height="40" rx="4" fill="#99cdda"/><text x="260" y="147" style={{fill:"#12392e"}}>A 续算</text>
      <text x="251" y="185" textAnchor="middle" className="cp-small">3 s 释放 B</text>
      <text x="16" y="222" className="cp-label">流完成：排空 {remaining} s　/　迁移 {remaining+release} s</text>
    </svg></div><p>{long?"迁移让 B 提早 7 秒释放；该流多等 3 秒。若输出间隔约束承受不了这段停顿，仍可选排空。":"自然排空在 2 秒时就能释放 B，比迁移更早，流也更早结束。"}</p>
    <small>固定终止接单时刻，假设 A 有足够容量、两端计算速度相同。图示采用暂停后复制，交接获确认才释放源端；支持预拷贝的引擎可缩短停顿。</small>
  </div></figure>;
}

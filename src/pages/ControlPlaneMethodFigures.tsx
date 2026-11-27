import type { ReactNode } from "react";

const mint = "#79dec0";
const gold = "#ffc681";
const muted = "#486b63";

function Panel({ name, note, children }: { name: string; note: string; children: ReactNode }) {
  return <div className="cp-method-panel"><strong>{name}</strong>
    <svg viewBox="0 0 240 132" role="img" aria-label={name + "。" + note}>{children}</svg>
    <small>{note}</small>
  </div>;
}

function Label({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <text x={x} y={y} textAnchor="middle" fill="#ecfff7" fontSize="12">{children}</text>;
}

function Arrow({ path, x, y, color = mint }: { path: string; x: number; y: number; color?: string }) {
  return <g fill={color}><path d={path} fill="none" stroke={color} strokeWidth="2.5"/>
    <path d={`M${x-6} ${y-4}l7 4-7 4z`}/></g>;
}

function Queue({ y, count, name }: { y: number; count: number; name: string }) {
  return <g><rect x="156" y={y} width="72" height="30" rx="5" fill="#244d43" stroke={muted}/>
    <Label x={170} y={y+20}>{name}</Label>
    {Array.from({length:count},(_,i)=><rect key={i} x={182+i*10} y={y+9} width="7" height="12" rx="2" fill={gold}/>)}</g>;
}

function Route({ mode }: { mode: "affinity" | "route" | "wait" }) {
  return <><Queue y={22} count={4} name="A"/><Queue y={85} count={1} name="B"/>
    <circle cx="28" cy="68" r="14" fill="#285d50"/><Label x={28} y={72}>P</Label>
    {mode === "wait" ? <><Arrow path="M44 68H76" x={76} y={68}/>
      <rect x="84" y="54" width="45" height="28" rx="4" fill="none" stroke={gold}/><Label x={106} y={72}>等待</Label>
      <path d="M130 67Q143 66 153 39" stroke={muted} strokeWidth="2" strokeDasharray="3 4" fill="none"/></>
      : <Arrow path={mode === "affinity" ? "M44 68H77Q89 68 102 49T150 37" : "M44 68H77Q89 68 102 87T150 100"} x={150} y={mode === "affinity" ? 37 : 100}/>}
    <Label x={82} y={18}>{mode === "affinity" ? "已有前缀" : mode === "route" ? "比较命中与排队" : "预算不足"}</Label>
  </>;
}

function Layers({ mode }: { mode: "static" | "adaptive" }) {

  return <>{[0,1].map(row=><g key={row}>
    <Label x={38} y={row ? 106 : 43}>{row ? "主机" : "设备"}</Label>
    {Array.from({length:6},(_,i)=>{
      const resident = i < (mode === "adaptive" ? 4 : 2);
      const active = row ? !resident : resident;
      return <rect key={i} x={69+i*25} y={row ? 88 : 25} width="19" height="24" rx="3"
        fill={active ? (row ? gold : mint) : "none"} stroke={active ? "none" : muted}/>;
    })}</g>)}
    {mode !== "static" && <g stroke={mint} strokeWidth="2" fill="none">
      <path d="M144 85V53m-4 5 4-6 4 6"/></g>}
    <Label x={90} y={74}>{mode === "adaptive" ? "调整驻留层" : "固定分界"}</Label>
  </>;
}

function RemotePrefix() {
  return <>
    <rect x="8" y="40" width="75" height="52" rx="12" fill="#345044" stroke={gold}/>
    <Label x={46} y={61}>远端缓存</Label><Label x={46} y={80}>前缀 P</Label>
    <Arrow path="M87 66H147" x={147} y={66}/>
    <Label x={117} y={48}>传输</Label>
    <rect x="152" y="40" width="82" height="52" rx="12" fill="#245448" stroke={mint}/>
    <Label x={193} y={61}>目标实例</Label><Label x={193} y={80}>复用 P</Label>
  </>;
}

function CapacityTimeline() {
  return <figure className="cp-method-plate"><figcaption>从队列积压到首个请求，哪一步可以提前？</figcaption>
    <ol className="cp-event-flow">
      <li><strong>决定扩容</strong><span>Ray Serve 根据副本负载调整目标数量。</span></li>
      <li><strong>加载模型</strong><span>ServerlessLLM 利用权重位置与分层加载缩短启动。</span></li>
      <li><strong>实例就绪</strong><span>健康检查通过，路由层发现可用端点。</span></li>
      <li><strong>首次接单</strong><span>新副本开始分担队列，检查波峰还剩多久。</span></li>
    </ol>
    <div className="cp-method-key">固定热副本在波峰前已就绪，代价是低谷仍占用设备。动态副本可以同时采用负载触发与加载优化。图中间距表示事件顺序。</div>
  </figure>;
}

export default function ControlPlaneMethodFigures({ direction }: { direction: "scheduling" | "kv" | "instances" }) {
  const request = direction === "scheduling";
  if (direction === "instances") return <CapacityTimeline />;
  return <figure className="cp-method-plate"><figcaption>{request ? "同一轮请求，可以直接发、换实例，也可以等" : "层放在哪里，前缀从哪里来？"}</figcaption>
    <div className="cp-method-panels">{request ? <>
      <Panel name="基线 · 固定亲和" note="P 回到有历史前缀的 A，并加入已有队列。"><Route mode="affinity"/></Panel>
      <Panel name="Dynamo · 到达时选址" note="若 A 的排队代价超过命中收益，可选较空闲的 B。"><Route mode="route"/></Panel>
      <Panel name="ThunderAgent · 轮间放行" note="实例预算不足时先等待，待预算释放后再恢复。"><Route mode="wait"/></Panel>
    </> : <>
      <Panel name="基线 · 静态分层" note="按预设计划把部分层留在设备，其余放在主机。"><Layers mode="static"/></Panel>
      <Panel name="OrbitFlow · 逐层重配" note="请求留在原实例，随生成进度重新选择设备驻留层。"><Layers mode="adaptive"/></Panel>
      <Panel name="Mooncake · 跨节点复用" note="目标实例取回远端已有的前缀块，支付传输成本。"><RemotePrefix/></Panel>
    </>}</div>
    <div className="cp-method-key">{request ? "P 为返回的请求，方块为实例上已有的工作。箭头表示本例所选路径。" : "前两幅图每格表示同一请求的一层 KV。右图沿网络追踪前缀 P；取回后，目标实例仍需决定各层的驻留位置。"} </div>
  </figure>;
}

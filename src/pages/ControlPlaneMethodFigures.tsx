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

function Layers({ mode }: { mode: "static" | "adaptive" | "remote" }) {
  const remote = mode === "remote";
  return <>{[0,1].map(row=><g key={row}>
    <Label x={38} y={row ? 106 : 43}>{row ? (remote ? "远端" : "主机") : "设备"}</Label>
    {Array.from({length:6},(_,i)=>{
      const resident = remote ? i < 3 : i < (mode === "adaptive" ? 4 : 2);
      const active = row ? !resident : resident;
      return <rect key={i} x={69+i*25} y={row ? 88 : 25} width="19" height="24" rx="3"
        fill={active ? (row ? gold : mint) : "none"} stroke={active ? "none" : muted}/>;
    })}</g>)}
    {mode !== "static" && <g stroke={mode === "remote" ? gold : mint} strokeWidth="2" fill="none">
      <path d={remote ? "M179 85V53m-4 5 4-6 4 6" : "M144 85V53m-4 5 4-6 4 6"}/></g>}
    <Label x={90} y={74}>{remote ? "取回前缀" : mode === "adaptive" ? "调整驻留层" : "固定分界"}</Label>
  </>;
}

function Replicas({ mode }: { mode: "fixed" | "scale" | "startup" }) {
  const start = mode === "startup" ? 104 : 166;
  return <><rect x="135" y="19" width="63" height="91" fill="#665138" opacity=".62"/>
    <Label x={165} y={15}>流量高峰</Label>
    <Label x={19} y={49}>A</Label><Label x={19} y={87}>B</Label>
    <rect x="36" y="37" width="188" height="12" rx="3" fill={mint}/>
    {mode === "fixed" ? <rect x="36" y="75" width="188" height="12" rx="3" fill={mint}/>
      : <><rect x="69" y="75" width={start-69} height="12" rx="3" fill={gold}/>
        <rect x={start} y="75" width={224-start} height="12" rx="3" fill={mint}/></>}
    <Arrow path="M36 112H224" x={224} y={112} color={muted}/><Label x={84} y={129}>时间</Label>
  </>;
}

export default function ControlPlaneMethodFigures({ direction }: { direction: "scheduling" | "kv" | "instances" }) {
  const request = direction === "scheduling";
  const kv = direction === "kv";
  return <figure className="cp-method-plate"><figcaption>{request ? "同一轮请求，可以直接发、换实例，也可以等" : kv ? "同一份历史，改变驻留计划或取回路径" : "同一波流量，第二个副本何时开始接单？"}</figcaption>
    <div className="cp-method-panels">{request ? <>
      <Panel name="基线 · 固定亲和" note="P 回到有历史前缀的 A，并加入已有队列。"><Route mode="affinity"/></Panel>
      <Panel name="Dynamo · 到达时选址" note="若 A 的排队代价超过命中收益，可选较空闲的 B。"><Route mode="route"/></Panel>
      <Panel name="ThunderAgent · 轮间放行" note="实例预算不足时先等待，待预算释放后再恢复。"><Route mode="wait"/></Panel>
    </> : kv ? <>
      <Panel name="基线 · 静态分层" note="按预设计划把部分层留在设备，其余放在主机。"><Layers mode="static"/></Panel>
      <Panel name="OrbitFlow · 逐层重配" note="请求留在原实例，随生成进度重新选择设备驻留层。"><Layers mode="adaptive"/></Panel>
      <Panel name="Mooncake · 跨节点复用" note="目标实例取回远端已有的前缀块，支付传输成本。"><Layers mode="remote"/></Panel>
    </> : <>
      <Panel name="基线 · 固定热副本" note="A、B 在波峰前都可接单，低谷也持续占用设备。"><Replicas mode="fixed"/></Panel>
      <Panel name="Ray Serve · 按需扩容" note="本例中 B 在峰内才接单，启动期间仍由 A 承担流量。"><Replicas mode="scale"/></Panel>
      <Panel name="ServerlessLLM · 优化启动" note="示意同一启动时刻，利用本地权重缩短加载，让 B 更早接单。"><Replicas mode="startup"/></Panel>
    </>}</div>
    <div className="cp-method-key">{request ? "P 为返回的请求，方块为实例上已有的工作。箭头表示本例所选路径。" : kv ? "上排为设备，下排为主机或远端。前两图每格表示一层的 KV，右图每格表示前缀块。" : "绿色为可接单时段，橙色为启动时段，阴影为同一波峰。时间轴为机制示意。"} </div>
  </figure>;
}

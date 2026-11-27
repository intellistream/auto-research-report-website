import { useHref } from "react-router-dom";
import { Boxes, Database, GitBranch, Server } from "lucide-react";

const controllers = [
  { id:"scheduling", title:"请求限流控制器", icon:GitBranch, signal:"队列、前缀局部性、可用预算", action:"放行 / 等待 / 恢复、实例选址", api:"请求路由接口", effect:"转发请求 · 回传完成状态" },
  { id:"kv", title:"KV 重配置控制器", icon:Database, signal:"显存余量、层级 KV、搬运等待", action:"选择驻留层、卸载与预取时机", api:"引擎 KV 管理接口", effect:"提交驻留计划 · 回读执行耗时" },
  { id:"instances", title:"实例池控制器", icon:Boxes, signal:"持续积压、就绪副本、在途流", action:"扩容、排空或发起迁移", api:"部署与引擎生命周期接口", effect:"调整副本 · 排空 / 交接确认" },
] as const;

function Branch({ item, x }: { item: typeof controllers[number]; x: number }) {
  const href = useHref({search:"view="+item.id});
  const Icon=item.icon;
  return <g transform={`translate(${x} 0)`}>
    <path d="M136 78v24 M136 248v21 M136 328v24" className="cp-arch-line" markerEnd="url(#arch-down)"/>
    <a href={href} className="cp-arch-link" aria-label={"进入"+item.title+"专题"}>
      <rect x="0" y="108" width="272" height="136" rx="10" className="cp-arch-node"/>
      <Icon x="13" y="123" size={21}/><text x="43" y="140" className="cp-title">{item.title}</text><text x="244" y="140" className="cp-action-text">↗</text>
      <path d="M13 155H259" stroke="#477164"/>
      <text x="14" y="182" className="cp-small">观察</text><text x="55" y="182">{item.signal}</text>
      <text x="14" y="216" className="cp-small">决策</text><text x="55" y="216">{item.action}</text>
    </a>
    <rect x="0" y="272" width="272" height="55" rx="6" fill="#214f42" stroke="#658c7d"/>
    <text x="136" y="295" textAnchor="middle" className="cp-label">{item.api}</text>
    <text x="136" y="316" textAnchor="middle" className="cp-small">{item.effect}</text>
  </g>;
}

export default function ControlPlaneArchitecture() {
  return <figure className="acl-guide cp-architecture"><div className="acl-guide-overview">
    <figcaption><h2>RIDE 如何管控一个分布式推理实例池？</h2></figcaption>
    <div className="cp-map-scroll" tabIndex={0} aria-label="分层架构图，窄屏可横向滚动"><svg className="cp-map cp-arch-map" viewBox="0 0 1030 484" aria-labelledby="cp-arch-title" role="group">
      <title id="cp-arch-title">RIDE 承载三个控制器，各经执行接口作用于共享实例池，观测与回执返回控制面。点击控制器可查看细节。</title>
      <defs><marker id="arch-down" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#9ae8bf"/></marker>
      <marker id="arch-back" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 8 4 0 8Z" fill="#fac783"/></marker></defs>
      <rect x="19" y="18" width="888" height="62" rx="11" className="cp-arch-node"/>
      <text x="37" y="56" style={{fontSize:23,fontWeight:700}}>RIDE 控制面</text>
      <text x="215" y="55">承载控制器 · 汇集运行状态与执行回执</text>
      <text x="603" y="55" className="cp-action-text">优化目标：固定资源下提高有效吞吐</text>
      {controllers.map((item,i)=><Branch key={item.id} item={item} x={19+i*308}/>)}
      <rect x="19" y="357" width="888" height="97" rx="11" className="cp-boundary"/>
      <text x="38" y="385" className="cp-title">共享推理实例池</text>
      {["A","B","N"].map((n,i)=><g transform={`translate(${70+i*303} 398)`} key={n}>
        <rect width="185" height="40" rx="6" fill="#163d34" stroke="#779889"/><Server x="20" y="10" size={20}/><text x="58" y="26">引擎实例 {n}</text></g>)}
      <text x="613" y="426">···</text>
      <path d="M907 407h48V50h-46" fill="none" stroke="#fac783" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#arch-back)"/>
      <text x="976" y="255" transform="rotate(-90 976 255)" textAnchor="middle" className="cp-feedback-text">队列 · KV · 副本状态 · 动作回执</text>
    </svg></div>
    <small>点击控制器进入专题。已附真机配对回执：请求限流、主机 KV 回载与远端拉取、副本扩缩；待验证：逐层动态 KV 驻留引擎接入与缩容在线迁移对照。</small>
  </div></figure>;
}

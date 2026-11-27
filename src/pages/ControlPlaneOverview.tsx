import { ArrowDown, ArrowRight, Boxes, Database, GitBranch, Layers, Network, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./control-plane-overview.css";

export const directions = [
  ["scheduling", "分布式请求调度"],
  ["kv", "分布式 KV 优化"],
  ["instances", "分布式多实例优化"],
] as const;

function Node({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="cp-node"><Icon aria-hidden size={20}/><strong>{title}</strong><small>{detail}</small></div>;
}

export default function ControlPlaneOverview({ selected }: { selected?: string }) {
  return <div className="cp-overview">
    {(!selected || selected === "scheduling") && <section className="topic-card">
      <h2>分布式请求调度</h2>
      <p>一个 program 从工具调用返回。实例 A 保留了它的长前缀，但还有请求排队；实例 B 空闲，却要重算前缀。请求控制器决定何时放行、在哪台实例执行下一轮。</p>
      <figure><div className="cp-flow">
        <Node icon={Layers} title="客户端" detail="提交下一轮请求"/><ArrowRight className="cp-arrow"/>
        <Node icon={GitBranch} title="请求控制器" detail="等待或放行 · 选择实例"/><ArrowRight className="cp-arrow"/>
        <div className="cp-stack"><Node icon={Server} title="实例 A" detail="前缀命中 · 有排队"/><Node icon={Server} title="实例 B" detail="空闲 · 需 prefill"/></div>
      </div><figcaption>比较两条路径从工具返回到首个输出 token 的时间，同时观察其他 program 的 P99 请求延迟。</figcaption></figure>
    </section>}
    {(!selected || selected === "kv") && <section className="topic-card">
      <h2>分布式 KV 优化</h2>
      <p>请求已确定在实例 B 恢复。若长前缀的 KV 仍在 A，B 可以重算，也可以通过引擎接口取回可复用的 KV 块。选择取决于命中长度、传输带宽以及 B 端可用的缓存空间。</p>
      <figure><div className="cp-flow">
        <Node icon={Database} title="实例 A · KV 缓存" detail="持有历史前缀的块"/><ArrowRight className="cp-arrow"/>
        <Node icon={Network} title="跨实例传输" detail="仅传 B 缺少的可复用块"/><ArrowRight className="cp-arrow"/>
        <Node icon={Database} title="实例 B · 引擎" detail="装入 KV，再计算新增后缀"/>
      </div><figcaption>图示为引擎支持 KV 传输时的一条路径。对照 B 本地重算，记录传输字节、传输耗时、实际 prefill tokens 和首 token 延迟。</figcaption></figure>
    </section>}
    {(!selected || selected === "instances") && <section className="topic-card">
      <h2>分布式多实例优化</h2>
      <p>当负载持续变化，控制面还要调整整个实例池的容量。新增实例完成模型加载并通过就绪检查后才能分流；缩容时先停止分派新请求，等在途请求排空后再释放资源。</p>
      <figure><div className="cp-lifecycle">
        <Node icon={Boxes} title="RIDE 控制面" detail="观察各实例负载，调整副本数"/><ArrowDown className="cp-down"/>
        <div className="cp-states"><Node icon={Server} title="实例 A · 服务中" detail="继续承接流量"/><Node icon={Server} title="实例 B · 扩容" detail="加载 → 就绪 → 接流量"/><Node icon={Server} title="实例 C · 缩容" detail="停止接新 → 排空 → 释放"/></div>
      </div><figcaption>图示为实例池的调节过程。用就绪副本数、扩容就绪时间、排空耗时与设备卡时衡量容量变化的收益和代价。</figcaption></figure>
    </section>}
  </div>;
}

import { ArrowDown, ArrowRight, Boxes, Database, GitBranch, Layers, Network, Server } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import "./control-plane-overview.css";
import { analysis } from "./control-plane-analysis";

export const directions = [
  ["scheduling", "分布式请求调度"],
  ["kv", "分布式 KV 优化"],
  ["instances", "分布式多实例优化"],
] as const;

function Node({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return <div className="cp-node"><Icon aria-hidden size={20}/><strong>{title}</strong><small>{detail}</small></div>;
}

function Analysis({ direction }: { direction: keyof typeof analysis }) {
  return <div className="cp-questions">{analysis[direction].map(question =>
    <section key={question.title}>
      <h3>{question.title}</h3>
      <p>{question.mechanism}</p>
      <p>{question.evidence}</p>
      <div className="cp-experiment"><h4>怎样验证</h4><p>{question.test}</p></div>
      <div className="acl-topic-card-sections">{question.sources.map(([label, href]) =>
        <a key={href} href={href}>{label} ↗</a>)}</div>
    </section>)}</div>;
}

export default function ControlPlaneOverview({ selected }: { selected?: string }) {
  return <div className="cp-overview">
    {!selected && <aside className="cp-intro">
      <h2>从一次工具返回读懂三个板块</h2>
      <p>设一个 agent 已完成第一轮生成，正在等测试工具返回。此时模型没有为它生成 token，历史前缀仍可能留在实例 A。等工具返回，客户端会把历史和新的工具结果一起发来。这一刻有三个不同时间尺度的决定。</p>
      <ol>
        <li><strong>按请求决定去向。</strong>在转发前比较 A 的排队和 B 的重算成本。客户端关心从工具返回到看到下一步输出经过多久。</li>
        <li><strong>按缓存块决定复用方式。</strong>若选 B，检查它能否取得 A 留下的 KV，以及获取这些块比重新 prefill 节省多少时间。</li>
        <li><strong>按负载变化调整实例池。</strong>若队列持续增长，才涉及增配副本或调节 prefill/decode 容量。扩容的收益要从新副本实际接到流量时算起。</li>
      </ol>
      <p>下文的机制图标出决策和执行位置。已有 RIDE 实测集中在请求限流；跨实例 KV 传输、在线迁移与自动扩缩分别引用对应系统的实现和论文。</p>
    </aside>}
    {(!selected || selected === "scheduling") && <section className="topic-card">
      <h2>分布式请求调度</h2>
      <p>一个 program 从工具调用返回。实例 A 保留了它的长前缀，但还有请求排队；实例 B 空闲，却要重算前缀。请求控制器决定何时放行、在哪台实例执行下一轮。</p>
      <figure><div className="cp-flow">
        <Node icon={Layers} title="客户端" detail="提交下一轮请求"/><ArrowRight className="cp-arrow"/>
        <Node icon={GitBranch} title="请求控制器" detail="等待或放行 · 选择实例"/><ArrowRight className="cp-arrow"/>
        <div className="cp-stack"><Node icon={Server} title="实例 A" detail="前缀命中 · 有排队"/><Node icon={Server} title="实例 B" detail="空闲 · 需 prefill"/></div>
      </div><figcaption>比较两条路径从工具返回到首个输出 token 的时间，同时观察其他 program 的 P99 请求延迟。</figcaption></figure>
      <Analysis direction="scheduling" />
    </section>}
    {(!selected || selected === "kv") && <section className="topic-card">
      <h2>分布式 KV 优化</h2>
      <p>请求已确定在实例 B 恢复。若长前缀的 KV 仍在 A，B 可以重算，也可以通过引擎接口取回可复用的 KV 块。选择取决于命中长度、传输带宽以及 B 端可用的缓存空间。</p>
      <figure><div className="cp-flow">
        <Node icon={Database} title="实例 A · KV 缓存" detail="持有历史前缀的块"/><ArrowRight className="cp-arrow"/>
        <Node icon={Network} title="跨实例传输" detail="仅传 B 缺少的可复用块"/><ArrowRight className="cp-arrow"/>
        <Node icon={Database} title="实例 B · 引擎" detail="装入 KV，再计算新增后缀"/>
      </div><figcaption>图示为引擎支持 KV 传输时的一条路径。对照 B 本地重算，记录传输字节、传输耗时、实际 prefill tokens 和首 token 延迟。</figcaption></figure>
      <Analysis direction="kv" />
    </section>}
    {(!selected || selected === "instances") && <section className="topic-card">
      <h2>分布式多实例优化</h2>
      <p>当负载持续变化，控制面还要调整整个实例池的容量。新增实例完成模型加载并通过就绪检查后才能分流；缩容时先停止分派新请求，等在途请求排空后再释放资源。</p>
      <figure><div className="cp-lifecycle">
        <Node icon={Boxes} title="RIDE 控制面" detail="观察各实例负载，调整副本数"/><ArrowDown className="cp-down"/>
        <div className="cp-states"><Node icon={Server} title="实例 A · 服务中" detail="继续承接流量"/><Node icon={Server} title="实例 B · 扩容" detail="加载 → 就绪 → 接流量"/><Node icon={Server} title="实例 C · 缩容" detail="停止接新 → 排空 → 释放"/></div>
      </div><figcaption>图示为实例池的调节过程。用就绪副本数、扩容就绪时间、排空耗时与设备卡时衡量容量变化的收益和代价。</figcaption></figure>
      <Analysis direction="instances" />
    </section>}
  </div>;
}

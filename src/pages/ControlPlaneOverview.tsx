import ControlPlaneResume from "./ControlPlaneResume";
import ControlPlaneEngine from "./ControlPlaneEngine";
import ControlPlaneLoop from "./ControlPlaneLoop";
import ControlPlaneTimeline from "./ControlPlaneTimeline";
import "./control-plane-overview.css";
import { analysis } from "./control-plane-analysis";

export const directions = [
  ["scheduling", "分布式请求调度"],
  ["kv", "分布式 KV 优化"],
  ["instances", "分布式多实例优化"],
] as const;

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
    {!selected && <><ControlPlaneLoop /><ControlPlaneResume /><ControlPlaneEngine /></>}
    {!selected && <aside className="cp-intro">
      <h2>从一次工具返回读懂三个板块</h2>
      <p>设一个 agent 已完成第一轮生成，正在等测试工具返回。此时模型没有为它生成 token，历史前缀仍可能留在实例 A。等工具返回，客户端会把历史和新的工具结果一起发来。这一刻有三个控制对象和执行位置不同的决定。</p>
      <ol>
        <li><strong>按请求决定去向。</strong>在转发前比较 A 的排队和 B 的重算成本。客户端关心从工具返回到看到下一步输出经过多久。</li>
        <li><strong>按请求和模型层调整 KV 驻留。</strong>固定请求已在 B 执行。随着上下文增长，决定哪些层留在设备、哪些卸载到主机，以及何时预取。</li>
        <li><strong>按负载变化调整实例池。</strong>若队列持续增长，才涉及增配副本或调节 prefill/decode 容量。扩容的收益要从新副本实际接到流量时算起。</li>
      </ol>
      <p>下文的机制图标出决策和执行位置。已有 RIDE 实测集中在请求限流；跨实例 KV 传输、在线迁移与自动扩缩分别引用对应系统的实现和论文。</p>
    </aside>}
    {(!selected || selected === "scheduling") && <section className="topic-card">
      <h2>分布式请求调度</h2>
      <p>请求控制器决定哪些 program 可以放行、何时恢复、送往哪台实例。locality 描述回原实例可复用多少工作；capacity 取决于排队、prefill/decode 负载以及能容纳的活跃工作集。连续放行可能让 program 反复驱逐彼此的前缀，造成 KV thrashing。应联看驱逐后的重算量、等待时间和完成步数。</p>
      <ControlPlaneTimeline direction="scheduling" />
      <Analysis direction="scheduling" />
    </section>}
    {(!selected || selected === "kv") && <section className="topic-card">
      <h2>分布式 KV 优化</h2>
      <p>这一层改变 KV 的物理驻留配置。先固定请求集合、目标实例和显存预算，再考察 decode 期间哪些层驻留设备，哪些层需要从主机预取。引擎负责落实计划。扩展到独立副本时，还要处理远端块的位置、所有权和传输。</p>
      <ControlPlaneTimeline direction="kv" />
      <Analysis direction="kv" />
    </section>}
    {(!selected || selected === "instances") && <section className="topic-card">
      <h2>分布式多实例优化</h2>
      <p>当负载持续变化，控制面还要调整整个实例池的容量。新增实例完成模型加载并通过就绪检查后才能分流；缩容时先停止分派新请求，等在途请求排空后再释放资源。</p>
      <ControlPlaneTimeline direction="instances" />
      <Analysis direction="instances" />
    </section>}
  </div>;
}

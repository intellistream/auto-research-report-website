import ControlPlaneBatchChart from "./ControlPlaneBatchChart";
import ControlPlaneResume from "./ControlPlaneResume";
import ControlPlaneEngine from "./ControlPlaneEngine";
import ControlPlaneLoop from "./ControlPlaneLoop";
import ControlPlaneTimeline from "./ControlPlaneTimeline";
import "./control-plane-overview.css";
import { analysis } from "./control-plane-analysis";

const reportBase = "https://github.com/vLLM-HUST/vllm-hust-benchmark/tree/ac1d5ed516112c019c1acb63481154aabb90409c/reports/";

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
    {(!selected || selected === "scheduling") && <section className="topic-card cp-story">
      <h2>分布式请求调度</h2>
      <section><h3>问题是什么？多轮请求何时放行，交给哪台实例？</h3>
        <p>一个 agent 调完工具，带着更长的历史返回。A 保留了它的前缀，却正在排队；B 有计算余量，但需要重算历史。即使全集群仍有空间，单台实例也可能装不下这个 program。控制器要在“送 A、送 B、继续等”之间作决定。</p>
        <ControlPlaneTimeline direction="scheduling" />
      </section>
      <section><h3>为什么重要？一次放行会改变其他 program 的后续成本。</h3>
        <p>并发放得太多，活跃前缀可能反复被驱逐并重算；收得太紧，又会让本可前进的 program 等待。固定设备预算下，我们关心整批多久完成、每分钟完成多少步，以及收益是否以长等待为代价。</p>
        <ControlPlaneBatchChart />
        <p>单实例收紧预算后，实算 prefill 从 585 万降到 236 万 tokens，整批加速 2.12×。双 devbox 的默认限流组则慢了 3.67%，两臂前缀命中增量均为零，也未观察到业务暂停和恢复。<a href={reportBase + "controller-35b-c48-budget-20261126"}>单实例原件 ↗</a> · <a href={reportBase + "controller-35b-two-devbox-20261125"}>双实例原件 ↗</a></p>
        <p>两组工况各自配对、每臂一次。另一次单实例 600 秒窗口中，收紧预算后完成步数从 50 增至 221，但只有 18/48 个 program 完成首轮；窗口步数和整批完成时间应分别报告。</p>
      </section>
      <section><h3>我们怎么做？按 program 记账，在请求边界选址、等待和恢复。</h3>
        <p>现有控制器跟踪每台健康实例的预算。新 program 在能容纳它的实例中优先选择已用预算较少者；需要等待的请求留在队列。调度检查时，只有单台剩余预算容得下整个上下文和预留量，P 才能恢复。下图用现有控制器回放，逐次显示释放预算与恢复请求之间的状态变化。</p>
        <ControlPlaneResume />
        <details><summary>扩展图：预测选址、KV 驱逐与相关研究</summary>
          <ControlPlaneLoop /><ControlPlaneEngine /><Analysis direction="scheduling" />
        </details>
      </section>
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

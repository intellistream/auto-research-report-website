import { Link } from "react-router-dom";
import ControlPlaneThrashing from "./ControlPlaneThrashing";
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
      <section><h3>为什么重要？高负载下，反复重算历史会挤占推理时间。</h3>
        <p>多个长上下文 program 交替返回时，如果活跃前缀的总量超过 KV 容量，刚算好的历史可能在下一轮用到前就被驱逐。引擎一遍遍做 prefill，同样的时间里能推进的 agent 步数随之减少。</p>
        <ControlPlaneThrashing />
      </section>
      <section><h3>我们怎么做？让能容纳的 program 连续推进。</h3>
        <p>RIDE 请求限流控制器跟踪每台引擎的可用预算，在请求边界决定何时放行、送往哪里。余量不足时暂缓下一轮，预算释放后再恢复，让活跃 program 有机会复用前缀。</p>
        <ControlPlaneLoop />
        <ControlPlaneBatchChart />
        <p>这组回放中，两臂各输出 36,046 tokens，实际计算的 prefill 从 585 万降至 236 万 tokens。<a href={reportBase + "controller-35b-c48-budget-20261126"}>查看配置与原始回执 ↗</a></p>
        <details><summary>恢复规则、引擎内驱逐与其他配对结果</summary>
          <p>控制器图中的预测选址是教学模型。下图按现有调度代码回放等待与恢复。默认预算与双实例配对见<Link to="?view=evidence">实测与工程证据</Link>。</p>
          <ControlPlaneResume /><ControlPlaneEngine /><Analysis direction="scheduling" />
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

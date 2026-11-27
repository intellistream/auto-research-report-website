import { KvMeasurements, PoolMeasurements } from "./ControlPlaneMeasurements";
import { PoolPressure, PoolFirstRequest, PoolScaleIn } from "./InstancePoolFigures";
import { KvResidenceFigure, KvOverlapFigure } from "./ControlPlaneKvFigures";
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
      <div className="topic-section-links">{question.sources.map(([label, href]) =>
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
    {(!selected || selected === "kv") && <section className="topic-card cp-story cp-kv-story">
      <h2>分布式 KV 优化</h2>
      <p>把路由固定下来：请求 P、Q 始终在同一引擎实例执行，设备显存预算也固定。这里研究引擎如何随 decode 进度改变每个请求、每个模型层的 KV 驻留位置。</p>
      <section><h3>有什么问题？请求留在原地，原驻留计划却会失效。</h3>
        <p>每生成一个 token，各层都要为它追加 KV。即使并发数一直是二，早期放得下的工作集也会逐渐超过设备预算。切换下面三个时刻，看同一份逻辑 KV 如何在设备与主机间重新分布。</p>
        <KvResidenceFigure />
      </section>
      <section><h3>为什么重要？KV 赶不上计算，下一层就要停下来等。</h3>
        <p>上一层计算可以掩盖下一层的预取。当前缀增长、搬运时间超过可重叠的计算窗口，多出来的时间会直接推迟 token 生成。反复出现这种空档，会抬高 TPOT，也可能让用户可见的 token 间隔 TBT 超出目标。</p>
        <KvOverlapFigure />
      </section>
      <section><h3>我们怎么做？观测传输与计算，判断何时更新驻留。</h3>
        <p>参考 OrbitFlow：引擎采样 decode 耗时，模型预测与实测偏离或当前放置将失效时，规划器在显存约束下用整数规划选择每个请求各层的驻留方案，引擎据此卸载、预取。论文的多卡验证包括单节点 TP2、TP4。<a href="https://arxiv.org/pdf/2601.10729v2">OrbitFlow 原文与图 11 ↗</a></p>
        <p>若旧计划已超预算，先恢复可行性。若新旧方案都可行，我们用下面的教学模型说明选择条件：预计剩余步数 × 每步可省的关键路径等待，大于一次重配置成本时，切换才有净收益。实际还需满足逐 token 延迟目标。</p>
        <ControlPlaneTimeline direction="kv" />
        <KvMeasurements />
        <details><summary>研究依据、工程接口与适用边界</summary>
          <p>三图为机制示意。回本判据用于说明取舍；OrbitFlow 的求解目标包含延迟 SLO。这一设计在 RIDE 上的执行与收益仍待引擎接入验证。</p><Analysis direction="kv" /></details>
      </section>
    </section>}
    {(!selected || selected === "instances") && <section className="topic-card cp-story cp-pool-story">
      <h2>分布式多实例优化</h2>
      <section><h3>有什么问题？队列在涨，什么时候值得启动第二台实例？</h3>
        <p>初始只有 A 接流量。短尖峰可能在新实例就绪前消退；持续积压才可能用上新增容量。图中控制器跟踪等待队列并设置持续时间条件，先改变目标副本数，再等待部署回执。</p><PoolPressure /></section>
      <section><h3>为什么重要？目标副本增加，排队的请求还要等。</h3>
        <p>部署层接受扩容、模型通过健康检查、路由发现端点、引擎收到首个请求，是四个可独立计时的事件。只看目标副本数会高估此刻的服务能力。沿同一次扩容观察 A 和 B 分别何时承接流量。</p><PoolFirstRequest /><PoolMeasurements /></section>
      <section><h3>我们怎么做？高峰补容量，低谷按在途请求决定如何回收。</h3>
        <p>控制器观察队列、就绪实例与在途流。低负载持续且剩余池能承接新流量时，把 B 移出新请求路由：短尾流可以自然排空；长尾流可比较迁移代价与提前释放设备的收益。迁移还要求引擎支持状态交接、目标容量充足，并确认输出连续。</p><PoolScaleIn />
        <details><summary>研究依据与验证方法</summary><p>三张机制图采用教学阈值与时间。上面的真机对照覆盖副本扩缩；自然排空与在线迁移仍缺同输入性能对照。扩缩参考 Ray Serve，运行中迁移参考 Llumnix。验收时将目标、就绪、首个接单、排空和设备释放的回执与请求 P99、流失败率、设备卡时对齐。</p><Analysis direction="instances" /></details>
      </section>
    </section>}
  </div>;
}

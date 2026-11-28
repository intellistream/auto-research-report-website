import { useState } from "react";
import { BookOpen, CircleCheck, Cpu, GitBranch, Layers, Network, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import {
  PIPELINE_PATH, PIPELINE_PROBLEMS, buildPipelineSchedule, pipelineScenarios,
  type PipelineScenario, type PipelineTask,
} from "./pipeline-reordering";

function Timeline({ overlap, compute, communication, penalty, scale }: { overlap: boolean; compute: number; communication: number; penalty: number; scale: number }) {
  const schedule = buildPipelineSchedule(compute, communication, overlap, penalty);
  return <figure className="pipeline-timeline">
    <figcaption><div><span>{overlap ? "允许独立微批交叠" : "按微批串行推进"}</span><h4>{overlap ? "重排后" : "重排前"}</h4></div><strong>{schedule.total}<small> 时间单位</small></strong></figcaption>
    <div className="pipeline-chart-scroll" role="region" tabIndex={0} aria-label={overlap ? "重排后计算与通信时间线，可横向滚动" : "重排前计算与通信时间线，可横向滚动"}>
      <div className="pipeline-chart">
        <div className="pipeline-chart-axis"><span>同一刻度</span><div>{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ left: (i * 25) + "%" }}>{Number((scale * i / 4).toFixed(1))}</span>)}</div></div>
        {(["compute", "communication"] as const).map(lane => <div className="pipeline-chart-row" key={lane}>
          <span className="pipeline-lane-label">{lane === "compute" ? <Cpu size={15} aria-hidden="true" /> : <Network size={15} aria-hidden="true" />}{lane === "compute" ? "计算" : "通信"}</span>
          <div className="pipeline-track">
            {!overlap && lane === "compute" && <span className="pipeline-wait" style={{ left: (compute / scale * 100) + "%", width: (communication / scale * 100) + "%" }}>等待</span>}
            {schedule.tasks.filter(t => t.lane === lane).map((task: PipelineTask) => <span
              key={task.id}
              className={"pipeline-task pipeline-task-" + lane + " pipeline-batch-" + task.batch.toLowerCase()}
              style={{ left: (task.start / scale * 100) + "%", width: ((task.end - task.start) / scale * 100) + "%" }}
              title={"微批 " + task.batch + " · " + (lane === "compute" ? "计算" : "通信") + "：" + task.start + "–" + task.end}
            >{task.batch}<small>{task.end - task.start}</small></span>)}
          </div>
        </div>)}
      </div>
    </div>
    <p className="pipeline-chart-caption">{overlap ? "A 的通信启动后，B 可以开始独立计算；两次通信仍按序执行。" : "A 的计算与通信全部完成后，B 才开始，计算资源在中间等待。"}</p>
  </figure>;
}

export function PipelineOverlapExperiment() {
  const [scenario, setScenario] = useState<PipelineScenario>("balanced");
  const [communication, setCommunication] = useState<number>(pipelineScenarios.balanced.communication);
  const config = pipelineScenarios[scenario];
  const serial = buildPipelineSchedule(config.compute, communication, false);
  const overlap = buildPipelineSchedule(config.compute, communication, true, config.penalty);
  const saved = serial.total - overlap.total;
  const scale = Math.max(serial.total, overlap.total);
  function selectScenario(next: PipelineScenario) {
    setScenario(next);
    setCommunication(pipelineScenarios[next].communication);
  }
  return <section className="pipeline-experiment" aria-labelledby="pipeline-experiment-title">
    <header className="pipeline-section-heading"><div><p className="pipeline-eyebrow">交互示意 · 两个独立微批，同一组工作</p><h3 id="pipeline-experiment-title">换一个执行时机，能省掉多少等待？</h3></div><Timer size={25} aria-hidden="true" /></header>
    <p className="pipeline-experiment-intro">把一批输入分成 A、B 两个微批。每个微批都先计算、再通信；B 的计算不需要 A 的通信结果，因此可以提前开始。</p>
    <div className="pipeline-scenario-tabs" role="group" aria-label="选择流水线场景">
      {(Object.keys(pipelineScenarios) as PipelineScenario[]).map(key => <button key={key} type="button" aria-pressed={scenario === key} onClick={() => selectScenario(key)}>{pipelineScenarios[key].label}</button>)}
    </div>
    <div className="pipeline-experiment-control"><label htmlFor="pipeline-communication">每个微批的通信耗时</label><input id="pipeline-communication" type="range" min={1} max={8} step={1} value={communication} onChange={e => setCommunication(Number(e.target.value))} /><output htmlFor="pipeline-communication">{communication} 时间单位</output></div>
    <div className="pipeline-timeline-grid">
      <Timeline overlap={false} compute={config.compute} communication={communication} penalty={0} scale={scale} />
      <Timeline overlap compute={config.compute} communication={communication} penalty={config.penalty} scale={scale} />
    </div>
    <div className={"pipeline-result" + (saved < 0 ? " pipeline-result-regression" : "")} aria-live="polite" aria-atomic="true">
      <strong>{saved > 0 ? "示意节省 " + saved + " 个时间单位" : saved < 0 ? "示意回退 " + (-saved) + " 个时间单位" : "本次重叠没有净收益"}</strong>
      <p>{scenario === "contention"
        ? "为表示资源争用，示意将 B 的计算从 " + config.compute + " 增至 " + (config.compute + config.penalty) + " 个时间单位。提前开始带来的收益，可能被并发降速抵消。"
        : scenario === "communication"
          ? "通信流仍按序处理 A 和 B。部分计算可以被覆盖，剩余通信仍在关键路径上，继续拆批未必更快。"
          : "单个任务的耗时没有变化，减少的是 A 通信期间的计算空闲；两条微批各自的计算到通信依赖仍然保留。"}</p>
    </div>
    <p className="pipeline-model-note">教学模型，时间为任意单位，不是硬件测量。假设单条计算流、单条通信流、两个独立微批；未计入拆批、图切换、额外访存和同步开销。实际收益需用同配置端到端实验核验。</p>
  </section>;
}

export default function PipelineReorderingGuide() {
  return <div className="pipeline-guide">
    <section className="pipeline-intro">
      <p className="pipeline-eyebrow">PIPELINE REORDERING · 导引</p>
      <h2>算子没有少算，<br className="pipeline-desktop-break" />等待能不能更少？</h2>
      <p>一次推理要经过主机准备、设备计算和跨卡通信。流水线重排先找出哪些工作相互依赖，再把已经就绪、可以独立推进的工作安排到等待区间，缩短整步的完成时间。</p>
      <div className="pipeline-principles">
        <span><CircleCheck size={17} aria-hidden="true" /> 保留数据依赖</span>
        <span><GitBranch size={17} aria-hidden="true" /> 调整执行时机</span>
        <span><Layers size={17} aria-hidden="true" /> 核对资源与状态</span>
      </div>
    </section>

    <PipelineOverlapExperiment />

    <section aria-labelledby="pipeline-questions-title">
      <header className="pipeline-section-heading"><div><p className="pipeline-eyebrow">专题问题地图</p><h3 id="pipeline-questions-title">从哪里等，追到为什么等</h3></div></header>
      <div className="pipeline-question-grid">{PIPELINE_PROBLEMS.map(problem => <Link
        className="pipeline-question-card" key={problem.id}
        to={PIPELINE_PATH + "?view=analysis&problem=" + problem.id}
      ><span className="pipeline-question-tag">{problem.shortTitle}</span><h4>{problem.title}</h4><p>{problem.gap.keyTakeaway}</p><span className="pipeline-question-meta">{problem.papers.length > 0 && (problem.papers.length + " 篇论文 · ")}{problem.prs.length} 条 PR<span>查看剖析</span></span></Link>)}</div>
    </section>

    <section className="pipeline-boundaries" aria-labelledby="pipeline-boundaries-title">
      <header className="pipeline-section-heading"><div><p className="pipeline-eyebrow">从图示走向真实系统</p><h3 id="pipeline-boundaries-title">每次重排，都要同时回答三个问题</h3></div></header>
      <div className="pipeline-boundary-grid">
        <article><h4>输入真的就绪了吗？</h4><p>消费者只能读取本步已完成的结果。主机提前构建下一步时，前一步尚在上传的元数据也必须继续保留。</p></article>
        <article><h4>资源足够同时执行吗？</h4><p>计算和通信可能争用执行单元与带宽。对比串行、只拆批、拆批并重叠，才能区分隐藏等待与并发降速。</p></article>
        <article><h4>各卡能按同一协议推进吗？</h4><p>空闲卡、填充行与不同图桶都有具体规则。先保持通信参与和顺序一致，再评估本地执行的调整空间。</p></article>
      </div>
    </section>

    <aside className="pipeline-reading-note">
      <BookOpen size={21} aria-hidden="true" /><div><h3>与图重放结合看</h3><p>图重放复用捕获的任务和依赖，减少重复提交；流水线重排关注任务何时执行、怎样交叠。把重排计划放进图中，还要核对捕获能力、动态状态与流间依赖。</p><Link to="/topics/aclgraph">阅读 ACL Graph 导引</Link><Link to={PIPELINE_PATH + "?view=analysis"}>进入流水线重排剖析</Link></div>
    </aside>
  </div>;
}

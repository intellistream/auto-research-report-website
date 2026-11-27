import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { EvidenceList } from "./TopicEvidence";
import "./aclgraph-topic.css";
import ControlPlaneArchitecture from "./ControlPlaneArchitecture";
import ControlPlaneOverview, { ControlPlaneMethods, directions } from "./ControlPlaneOverview";

const path = "/topics/distributed-inference-control-plane";

const benchmark = "https://github.com/vLLM-HUST/vllm-hust-benchmark/tree/ac1d5ed516112c019c1acb63481154aabb90409c/reports/";
const systems = [
  ["Ray Serve", "实例生命周期", "控制器协调部署与副本状态；路由和模型执行在独立组件中进行。扩容时要等模型就绪，缩容时要处理在途请求。观察已就绪副本数比仅看目标副本数更接近真实服务能力。", "https://docs.ray.io/en/latest/serve/architecture.html"],
  ["ThunderAgent", "program 级放行与恢复", "新 program 在容量足够的健康副本中优先选活跃 token 较少者。全局等待队列允许暂停过的 program 在其他副本恢复。论文假设暂停后原 KV 已被驱逐；若旧副本仍有可复用状态，跨实例恢复的成本就取决于目的地。", "https://arxiv.org/html/2602.13692v1#S4"],
  ["NVIDIA Dynamo", "KV 感知路由", "路由器结合前缀重叠与副本负载选择目的地。对一个返回的长上下文请求，需要同时估计本地命中能节省多少 prefill，以及该副本已有多少工作在等待。", "https://docs.nvidia.com/dynamo/knowledge-base/concepts/system-architecture/kv-aware-routing"],
  ["Llumnix · OSDI 2024", "执行期间重调度", "借助引擎迁移在途请求和内存状态，在执行期间重新分配工作。与下一轮重新选址相比，这一动作还要承担复制 KV、同步进度及切换执行所有者的成本。", "https://www.usenix.org/conference/osdi24/presentation/sun-biao"],
  ["DistServe · OSDI 2024", "prefill 与 decode 分离", "分别为 prefill 与 decode 配置资源，降低两阶段干扰。一次请求跨越两个资源池，KV 交接的带宽和等待时间随之进入首 token 延迟与输出间隔的权衡。", "https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin"],
  ["OrbitFlow · PVLDB 2026", "引擎内 KV 重配置", "固定请求的执行位置，按请求和模型层调整设备与主机间的驻留计划。图 11 评估了单节点张量并行。", "https://arxiv.org/pdf/2601.10729v2"],
  ["MORI", "工具等待期间的 KV 分层", "按 program 近期等待工具的时间占比决定哪些 KV 留在 HBM、哪些移至主机内存。作者改动了 ThunderAgent 调度器和 SGLang HiCache；移植到其他引擎需要可执行的分层驱逐与恢复接口。", "https://arxiv.org/html/2606.00866v2#S5"],
];

export function ControlPlaneCard({ topic }: { topic: Topic }) {
  return <li className="topic-card survey-directory-card">
    <h2><Link to={path}>{topic.title} <ArrowUpRight size={16} aria-hidden /></Link></h2>
    <p>{topic.description}</p>
    <div className="acl-topic-card-sections">{directions.map(([id, label]) =>
      <Link key={id} to={{ pathname: path, search: "view=" + id }}>{label}</Link>)}</div>
  </li>;
}

export default function ControlPlaneTopic({ topic }: { topic: Topic }) {
  const [query] = useSearchParams();
  const view = query.get("view");
  const selected = directions.find(([id]) => id === view)?.[0];
  const methods = query.get("page") === "methods";
  useEffect(() => {
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  }, [view, methods]);
  return <article className="acl-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden /> 专题目录</Link>
    <header className="acl-topic-header"><h1>{topic.title}</h1>
      <p className="acl-topic-subtitle">推理引擎负责计算下一个 token。多台引擎一起服务时，还要决定哪台接请求、历史缓存放在哪里，以及何时增加或回收副本。一次决定可能省下重算，也可能让另一条请求等得更久。</p></header>
    {(!view || view === "guide") && <ControlPlaneArchitecture />}
    <nav className="acl-topic-nav" aria-label="分布式推理控制面专题分区">{directions.map(([id, label]) =>
      <Link key={id} to={{ pathname: path, search: "view=" + id }} aria-current={view === id ? "page" : undefined}>{label}</Link>)}</nav>
    {selected && <>
      <nav className="acl-topic-card-sections" aria-label="当前研究方向">
        <Link to={"?view=" + selected} aria-current={!methods ? "page" : undefined}>开放问题与配图</Link>
        <Link to={"?view=" + selected + "&page=methods"} aria-current={methods ? "page" : undefined}>已有方案与对照基线</Link>
      </nav>
      {methods ? <ControlPlaneMethods selected={selected} /> : <ControlPlaneOverview selected={selected} />}
    </>}
    {!selected && view !== "systems" && view !== "evidence" && <section className="topic-card"><h2>三个开放问题</h2>
      <h3><Link to="?view=scheduling">有热前缀的实例正在排队，下一轮请求该往哪里走？</Link></h3><p>在路由时选择实例、在轮次之间限制并发、在执行中迁移，各自能利用哪些信息？比较它们对整批吞吐和慢请求的影响。</p>
      <h3><Link to="?view=kv">请求留在原实例，什么时候值得改变 KV 驻留位置？</Link></h3><p>显存放不下全部上下文时，可以从主机或远端取回历史，也可以重算。分界取决于数据何时再用，以及传输能否被计算掩盖。</p>
      <h3><Link to="?view=instances">新增副本赶得上波峰吗，回收副本又要等多久？</Link></h3><p>把流量持续时间与启动、首次接单、最后一条流结束的时间放在同一条时间线上，比较用户等待与设备卡时。</p>
    </section>}
    {view === "systems" && <section className="topic-card"><h2>调度对象、执行位置与代价</h2>
      {systems.map(([name, scope, text, source]) => <section key={name}><h3>{name} · {scope}</h3><p>{text} <a href={source}>原文与机制说明 ↗</a></p></section>)}
    </section>}
    {view === "evidence" && <><section className="topic-card"><h2>同一个 35B 模型，两种不同的对照</h2>
      <h3>一个 TP2 热实例：收紧预算后，整批吞吐提高</h3>
      <p>Qwen3.5-35B-A3B BF16，48 个 program，三轮，首轮约 40k tokens。直接访问模型、默认限流层、限流层预算收紧到 327,680 tokens，整批分别耗时 1514.55、1492.48、713.45 秒。每臂输出均为 36,046 tokens，候选相对直连加速 2.12×。引擎物理 KV 容量保持 1,869,824 tokens。输入 token 的缓存复用率分别为 0%、3.92%、59.59%，实算 prefill 从直连的 5,849,715 tokens 降到收紧预算后的 2,364,019 tokens。这组回放固定续轮历史，改变的是限流层放行额度。</p>
      <p>另取 16 轮负载，各组续接自身输出。前 600 秒内，直连完成 50 步，收紧预算组完成 221 步，但后者仅有 18/48 个 program 完成首轮。高步数吞吐与新 program 等待可以同时发生。每臂一次。<a href={benchmark + "controller-35b-c48-budget-20261126"}>三臂报告与原件 ↗</a></p>
      <h3>两个 devbox、每台一个 TP2：默认限流层慢了 3.67%</h3>
      <p>112 个 program 各三轮。直连和默认限流层均完成 336 个请求，耗时分别为 654.91、678.96 秒。两臂前缀命中增量均为零，业务日志未观测到暂停或恢复。这个固定顺序配对可以衡量本次转发与调度的整体效果：整批耗时从 654.91 秒增至 678.96 秒（+3.67%），未观察到业务 program 的 pause/resume，无法单独评定跨副本恢复策略。<a href={benchmark + "controller-35b-two-devbox-20261125"}>逐请求证据与分层图 ↗</a></p>
      <h3>待验证：最佳恢复位置会反转吗？</h3><p>固定 P 的输入和工具返回时刻，让 A 持有相同的热前缀，B 保持冷缓存。只改变 A 上已有的 decode 流数，每一档分别让 P 去 A 和 B。先核验两端实际 cached tokens，再比较 P 的首次有效输出延迟与老流的 P99 chunk 间隔。若最佳目的地始终相同，该条件下固定路由就足够。</p>
    </section><section className="topic-card"><h2>日报中的工程证据</h2><EvidenceList entries={topic.entries} labels={topic.labels} /></section></>}
    <footer className="acl-topic-card-sections"><Link to={path}>三个板块总览</Link><Link to="?view=systems">论文与实现</Link><Link to="?view=evidence">实测与工程证据</Link></footer>
  </article>;
}

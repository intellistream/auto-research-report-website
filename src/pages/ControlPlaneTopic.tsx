import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { EvidenceList } from "./TopicEvidence";
import "./aclgraph-topic.css";

const path = "/topics/distributed-inference-control-plane";
const tabs = [["guide", "请求路径"], ["systems", "论文与实现"], ["evidence", "实测与工程证据"]] as const;
const benchmark = "https://github.com/vLLM-HUST/vllm-hust-benchmark/tree/ac1d5ed516112c019c1acb63481154aabb90409c/reports/";
const systems = [
  ["Ray Serve", "实例生命周期", "控制器协调部署与副本状态；路由和模型执行在独立组件中进行。扩容时要等模型就绪，缩容时要处理在途请求。观察已就绪副本数比仅看目标副本数更接近真实服务能力。", "https://docs.ray.io/en/latest/serve/architecture.html"],
  ["ThunderAgent", "program 级放行与恢复", "新 program 在容量足够的健康副本中优先选活跃 token 较少者。全局等待队列允许暂停过的 program 在其他副本恢复。论文假设暂停后原 KV 已被驱逐；若旧副本仍有可复用状态，跨实例恢复的成本就取决于目的地。", "https://arxiv.org/html/2602.13692v1#S4"],
  ["NVIDIA Dynamo", "KV 感知路由", "路由器结合前缀重叠与副本负载选择目的地。对一个返回的长上下文请求，需要同时估计本地命中能节省多少 prefill，以及该副本已有多少工作在等待。", "https://docs.nvidia.com/dynamo/knowledge-base/concepts/system-architecture/kv-aware-routing"],
  ["Llumnix · OSDI 2024", "执行期间重调度", "借助引擎迁移在途请求和内存状态，在执行期间重新分配工作。与下一轮重新选址相比，这一动作还要承担复制 KV、同步进度及切换执行所有者的成本。", "https://www.usenix.org/conference/osdi24/presentation/sun-biao"],
  ["DistServe · OSDI 2024", "prefill 与 decode 分离", "分别为 prefill 与 decode 配置资源，降低两阶段干扰。一次请求跨越两个资源池，KV 交接的带宽和等待时间随之进入首 token 延迟与输出间隔的权衡。", "https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin"],
  ["MORI", "工具等待期间的 KV 分层", "按 program 近期等待工具的时间占比决定哪些 KV 留在 HBM、哪些移至主机内存。作者改动了 ThunderAgent 调度器和 SGLang HiCache；移植到其他引擎需要可执行的分层驱逐与恢复接口。", "https://arxiv.org/html/2606.00866v2#S5"],
];

export function ControlPlaneCard({ topic }: { topic: Topic }) {
  return <li className="topic-card survey-directory-card">
    <h2><Link to={path}>{topic.title} <ArrowUpRight size={16} aria-hidden /></Link></h2>
    <p>{topic.description}</p>
    <div className="acl-topic-card-sections">{tabs.map(([id, label]) =>
      <Link key={id} to={{ pathname: path, search: "view=" + id }}>{label}</Link>)}</div>
  </li>;
}

export default function ControlPlaneTopic({ topic }: { topic: Topic }) {
  const [query] = useSearchParams();
  const view = tabs.find(([id]) => id === query.get("view"))?.[0] ?? "guide";
  return <article className="acl-topic">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden /> 专题目录</Link>
    <header className="acl-topic-header"><h1>{topic.title}</h1>
      <p className="acl-topic-subtitle">一个 agent 从工具调用返回，原副本保有它的长前缀，却正在为其他用户生成输出。另一个副本空闲，但要重新 prefill。控制面如何选择？</p></header>
    <nav className="acl-topic-nav" aria-label="分布式推理控制面专题分区">{tabs.map(([id, label]) =>
      <Link key={id} to={{ pathname: path, search: "view=" + id }} aria-current={view === id ? "page" : undefined}>{label}</Link>)}</nav>
    {view === "guide" && <section className="topic-card">
      <h2>沿一次多轮请求看控制面</h2>
      <p>客户端提交 program P 的下一轮 → RIDE 下的限流层决定等待或放行、选择模型实例 → 实例执行 prefill 和 decode → 客户端接收输出并调用工具 → P 携带历史返回。管理路径上的 RIDE 与 Ray 负责组织服务生命周期，模型实例持有实际 KV 块。<a href="https://github.com/vLLM-HUST/ride">RIDE 项目</a></p>
      <h3>观察：还有空间，是否也有算力？</h3>
      <p>在每个副本并排观察 KV 容量、命中前缀长度、等待中的 prefill 和活跃 decode。两台实例即使具有相同的剩余 token 预算，也可能分别在等显存、等计算。还需记录指标的采样时间，避免根据过期的空闲读数连续放行。</p>
      <h3>决策：等待、回到原副本，还是重新放置？</h3>
      <p>原副本的排队时间可能抵消一次前缀命中。冷副本能立即开始，却需要补算历史。比较从“工具结果就绪”到“下一步有效输出”的耗时，并记录既有用户的输出间隔；按请求数平分无法回答这两个问题。</p>
      <h3>执行：谁能落实决定？</h3>
      <p>限流层可以在转发前等待、选择健康端点，并在 program 结束时释放关联。执行中迁移还需要引擎交出 KV 和解码进度。对外转发已经开始的流若在途中断开，控制面还要识别已交付的输出，避免重试产生重复结果。</p>
      <h3>生命周期：什么时候可以移除一个副本？</h3>
      <p>副本从发现、加载模型、就绪到接流量需要不同的回执。计划缩容时先停止接收新请求，再排空已有请求并核对 program 的去向；异常退出时还要区分可重建的请求、已流出的响应和丢失的缓存。<Link to="?view=evidence">查看排空与断连的社区记录</Link></p>
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
  </article>;
}

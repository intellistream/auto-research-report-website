const catalog = "https://docs.dynamo.nvidia.com/dynamo/research-publications";

// Curated from the catalog's Deep dives. Check the primary paper before adding a reading.
const groups = [
  {
    question: "先读全局：控制面可以决定什么？",
    papers: [
      ["2609.23130", "From Inference Engine to Inference Control Plane", "Twinkll Sisodia", "综述 · 2026", "从单引擎优化读到路由、状态放置与扩缩，适合作为三个方向的共同入口。"],
      ["2601.06288", "AIConfigurator", "Tianhao Xu 等", "配置模型 · 2026", "当框架、并行度与部署组合很多时，怎样利用算子性能模型筛选值得上机验证的配置？"],
    ],
  },
  {
    question: "请求调度：怎样兼顾多轮局部性与实例负载？",
    papers: [
      ["2607.08565", "SMetric", "Jiahao Wang 等", "会话路由 · 2026", "首轮优先均衡负载，续轮利用本地 KV 命中。读它时关注路由器从请求里究竟能观察到什么。"],
      ["2602.13692", "ThunderAgent", "Hao Kang 等", "Program 调度 · 2026", "把同一 agent 的多轮推理和工具调用连起来看，考察放行粒度如何改变活跃工作集。"],
    ],
  },
  {
    question: "KV 管理：缓存命中以后，数据能及时到达吗？",
    papers: [
      ["2605.22850", "ObjectCache", "Yu Zhu 等", "逐层读取 · 2026", "从对象存储按 GPU 消费顺序取 KV。关注短上下文与长上下文分别能用多少计算掩盖传输。"],
      ["2512.18194", "TraCT", "Dongha Yoon 等", "机架共享内存 · 2025", "作者在 Dynamo 上用 CXL 共享内存交接 KV。把省下的网络传输与新增的同步、一致性要求一起看。"],
    ],
  },
  {
    question: "实例池：负载变化或故障后，可服务容量何时恢复？",
    papers: [
      ["2602.12151", "OServe", "Youhe Jiang 等", "ICML 2026", "请求组成随时间改变。比较沿用静态部署与切换部署，留意预测到的负载变化能否抵消切换成本。"],
      ["2609.25451", "Fast Recovery for LLM Serving via Decoupled Device Memory Lifetime in Dynamo", "Schwinn Saereesitthipitak 等（NVIDIA）", "故障恢复 · 2026", "把设备内存的生命周期与引擎进程分开。阅读时区分幸存权重、替代运行时与恢复服务所需的额外显存。"],
    ],
  },
] as const;

export default function DynamoReadingList() {
  return <section className="topic-card cp-readings" aria-labelledby="dynamo-readings">
    <h2 id="dynamo-readings">控制面延伸阅读 · NVIDIA Dynamo 研究目录</h2>
    <p>从官方 Deep dives 中选读：既有 NVIDIA 团队的研究，也有其他团队使用、扩展或评测 Dynamo 及相关组件的工作。按你关心的问题进入，每篇链接直达原文。</p>
    {groups.map(({question, papers}) => <section key={question}>
      <h3>{question}</h3>
      <ul>{papers.map(([id, title, authors, tag, guide]) => <li key={id}>
        <a href={"https://arxiv.org/abs/" + id}>{title} ↗</a>
        <small>{authors} · {tag}</small>
        <p>{guide}</p>
      </li>)}</ul>
    </section>)}
    <p>选目核对于 2026-11-27。官方另列仅在相关工作中引用 Dynamo 的论文。 <a href={catalog}>查看完整目录与后续新增 ↗</a></p>
  </section>;
}

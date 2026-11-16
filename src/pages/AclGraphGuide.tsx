import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import "./aclgraph-guide.css";

const sources = {
  design: "https://github.com/vllm-project/vllm-ascend/blob/main/docs/source/developer_guide/Design_Documents/ACL_Graph.md",
  mode: "https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/graph_mode.html",
  cann: "https://www.hiascend.com/doc_center/source/zh/canncommercial/900/programug/acldevg/runtime_doc_dev_0032.html",
  padding: "https://github.com/vllm-project/vllm-ascend/pull/18750",
  local: "https://github.com/vllm-project/vllm-ascend/pull/19034",
  sglang: "https://github.com/sgl-project/sglang/pull/43733",
  grace: "https://www.usenix.org/conference/osdi26/presentation/ghosh",
  pla: "https://proceedings.mlsys.org/paper_files/paper/2026/hash/bbb7506579431a85861a05fff048d3e1-Abstract-Conference.html",
  foundry: "https://arxiv.org/abs/2604.06664",
  sarathi: "https://www.usenix.org/conference/osdi24/presentation/agrawal",
  agentReplay: "https://arxiv.org/abs/2609.32283",
  toolWaiting: "https://arxiv.org/abs/2609.34663",
  cachePressure: "https://arxiv.org/abs/2611.02543",
} as const;

function Source({ id, children }: { id: keyof typeof sources; children: string }) {
  return <a href={sources[id]} target="_blank" rel="noreferrer">{children} <ArrowUpRight size={12} aria-hidden="true" /></a>;
}

const stages = [
  ["组批", "调度器选择本轮请求，确定实际 token 数，再按可用图规格分桶和补齐。"],
  ["选执行路径", "按批次描述和注意力后端能力，选择整图、分段或即时执行。"],
  ["准备本轮状态", "写入输入和 KV 索引；需要时更新图任务参数，保证执行流读取的是本轮状态。"],
  ["回放或回退", "提交已捕获的任务；不符合执行条件时按框架支持的路径回退。"],
];

const paths = [
  ["FULL", "模型前向整段捕获；有些注意力后端仍需在回放前更新参数。", "适合已获后端支持的批次。均匀解码是常见情形。"],
  ["PIECEWISE", "捕获稳定片段；遇到切分点（如部分注意力实现）仍执行图外代码。", "覆盖更多动态情况，但图段之间仍有提交和等待。"],
  ["NONE", "即时执行，每轮照常提交算子。", "用于不支持的路径，也是定位图收益和正确性问题的基线。"],
];

const related = [
  ["长度分桶与组批", "pla", "PLA-Serve", "长度感知的分桶、等待和图选择已有方案；对比时应允许调整 token 桶与调度。"],
  ["图收益判断", "grace", "GraCE", "参数拷贝能抵消启动收益；既有方法已按子图比较即时执行、图和参数间接访问。"],
  ["复用图模板", "foundry", "Foundry", "同拓扑模板与执行上下文恢复已有先例，主要研究服务冷启动。"],
  ["历史长度变化", "sglang", "SGLang #43733", "在特定 DeepSeek-V4.1 / SM100 配置中，动态索引放在图外，固定容量消费者留在图内。"],
  ["混合批干扰", "sarathi", "Sarathi-Serve", "分块 prefill 和优先照顾正在生成的请求是强调度基线。"],
] as const;

export default function AclGraphGuide({ topic }: { topic: Topic }) {
  const colon = topic.title.indexOf("：") + 1;
  return <article className="acl-guide">
    <Link className="topic-back" to="/topics"><ArrowLeft size={16} aria-hidden="true" /> 专题目录</Link>
    <header className="acl-guide-hero">
      <p className="acl-kicker">技术专题 · 阅读导引 <time dateTime="2026-11-16">2026-11-16</time></p>
      <h1 aria-label={topic.title}>{colon ? <>{topic.title.slice(0, colon)}<span>{topic.title.slice(colon)}</span></> : topic.title}</h1>
      <p className="acl-deck">把一串 NPU 任务记录下来，下次条件满足时整段提交。这样能省掉重复提交的开销，但每一轮请求的输入、缓存位置和依赖仍要准备正确。</p>
      <nav className="acl-guide-actions" aria-label="ACLGraph 专题阅读入口">
        <Link to={{ search: "view=paper" }}>阅读学术综述全文 <ArrowRight size={16} aria-hidden="true" /></Link>
        {topic.report && <Link to={{ search: "view=report" }}>查看动态报告、PR 与趋势 <ArrowRight size={16} aria-hidden="true" /></Link>}
      </nav>
    </header>

    <section aria-labelledby="acl-step-title">
      <p className="acl-kicker">01 · 从请求到回放</p>
      <h2 id="acl-step-title">一次前向怎样用上 ACLGraph？</h2>
      <p>一次前向就是模型处理当前批次的一轮计算。<strong>Prefill</strong> 处理新增输入并建立 KV 缓存；<strong>Decode</strong> 利用已缓存的历史继续生成。在线组批时，两类请求可以进入同一轮。</p>
      <p>vLLM 决定本轮怎么组批、用哪种图模式；vLLM Ascend 通过 <code>torch.npu.NPUGraph</code> 使用 CANN 的捕获与回放。编译阶段改写 FX 计算图，运行时 ACLGraph 复用已记录的设备任务，两者可组合。<Source id="design">实现设计</Source> · <Source id="mode">图模式文档</Source></p>
      <ol className="acl-steps">
        {stages.map(([title, body]) => <li key={title}><strong>{title}</strong><p>{body}</p></li>)}
      </ol>
      <div className="acl-modes">
        {paths.map(([name, how, when]) => <div key={name}><h3><code>{name}</code></h3><p>{how}</p><p>{when}</p></div>)}
      </div>
      <p className="acl-note"><code>FULL_AND_PIECEWISE</code> 是一种组合配置，可为不同批次分派不同路径。实际选择取决于版本、模型和注意力后端。FULL 通常指模型前向的覆盖范围；组批、采样和 HTTP 返回仍各有成本。</p>
    </section>

    <section aria-labelledby="acl-state-title">
      <p className="acl-kicker">02 · 复用边界</p>
      <h2 id="acl-state-title">同样是 64 个 token，为什么还要检查状态？</h2>
      <p>举例：两轮都是 3 路解码加 1 个 61-token 的输入片段，都落入 64-token 桶。第二轮若读到更长的历史，KV 页表、工作区甚至算子路径可能不同。<strong>落入同一个桶只是复用的一个条件。</strong></p>
      <dl className="acl-conditions">
        <div><dt>值变了</dt><dd>输入和索引可按契约写到固定地址；支持时也可更新已捕获任务。CANN 任务组更新要求任务数量与类型对齐，并用事件保证更新先于消费。<Source id="cann">CANN 任务组更新</Source></dd></div>
        <div><dt>范围变了</dt><dd>补齐后的请求数、局部段数和有效范围必须一致。Ascend 已分别修复 FULL 回放元数据按实际请求数分配、上下文并行局部段超过容量的问题。<Source id="padding">Ascend #18750</Source> · <Source id="local">Ascend #19034</Source></dd></div>
        <div><dt>路径变了</dt><dd>若任务序列、容量或同步顺序无法沿用，可把变化部分移到图外，或选另一张图、回到即时执行。SGLang 有将随上下文变化的索引移到图外的实际案例。<Source id="sglang">SGLang #43733</Source></dd></div>
      </dl>
    </section>

    <section aria-labelledby="acl-payoff-title">
      <p className="acl-kicker">03 · 怎样判断收益</p>
      <h2 id="acl-payoff-title">回放次数多，用户就一定等得更少吗？</h2>
      <p>图主要减少主机重复提交。需要把节省的时间与每轮复制、更新、补齐计算和等待相比，再计入启动捕获和常驻内存。更新与计算如果重叠，就只能按关键路径计贡献。增加图容量还可能挤占 KV 缓存。</p>
      <table className="acl-evidence-table">
        <caption>从证据到能支持的结论</caption>
        <thead><tr><th scope="col">手头的证据</th><th scope="col">先回答什么</th></tr></thead>
        <tbody>
          <tr><th scope="row">API 文档、已合并 PR</th><td>什么能做、什么条件必须成立？PR 中的收益只适用于其明确的对照。</td></tr>
          <tr><th scope="row">同前态对照、两卡时间线</th><td>回放是否安全？减少的是 API 时间、设备时间，还是确实处于关键路径的等待？</td></tr>
          <tr><th scope="row">在线请求与工具轨迹</th><td>首 token、逐 token 间隔、首次完整可执行动作和任务完成时间有没有一起改善？其他会话是否被拖慢？</td></tr>
        </tbody>
      </table>
    </section>

    <section aria-labelledby="acl-research-title">
      <p className="acl-kicker">04 · 从综述到研究</p>
      <h2 id="acl-research-title">还值得验证什么？</h2>
      <p className="acl-question"><span>待验证问题</span>工具返回后，Agent 把新增内容送回模型，可能和其他会话的解码一起组批。在合理分桶、已有参数更新和图外准备都用上的前提下，是否仍有可重复的开销落在下一次可执行工具调用或完整回答的关键路径上？</p>
      <p>先区分三个原因：请求没轮到、历史 KV 未命中、图执行本身有额外准备或同步。工具等待与静态分桶、前缀缓存压力、如何公平回放轨迹都已有研究。它们为排除混杂因素提供了现成对照。<Source id="toolWaiting">工具回返研究</Source> · <Source id="cachePressure">缓存压力研究</Source> · <Source id="agentReplay">AgentReplay</Source></p>
      <details className="acl-related" open>
        <summary>最接近的工作，已经覆盖到哪一步？</summary>
        <dl className="acl-conditions">
          {related.map(([area, id, name, implication]) => <div key={id}><dt>{area}</dt><dd><Source id={id}>{name}</Source>：{implication}</dd></div>)}
        </dl>
      </details>
      <p className="acl-note">判断门槛：同请求、同前态下先验证安全复用；在线再确认仍有延迟损失，且图方案在算入准备、内存和其他会话影响后仍能改善。满足这两步之后，才有依据讨论现有机制为何还不够。</p>
      {topic.report && <p><Link to={{ search: "view=report&part=survey-gaps" }}>查看动态报告中的未解问题与验证方案 <ArrowRight size={14} aria-hidden="true" /></Link></p>}
    </section>
  </article>;
}

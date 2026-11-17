import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import "./aclgraph-guide.css";

// Primary sources only. A PR is evidence of a proposed implementation and its
// reported validation, not evidence that the code is merged or deployed.
const sources = {
  vllm: "https://docs.vllm.ai/en/latest/features/speculative_decoding/",
  ascend: "https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html",
  speculators: "https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/",
  sglang: "https://docs.sglang.io/docs/advanced_features/speculative_decoding",
  sampling: "https://proceedings.mlr.press/v202/leviathan23a.html",
  blockwise: "https://papers.nips.cc/paper/8212-blockwise-parallel-decoding-for-deep-autoregressive-models",
  eagle3: "https://papers.neurips.cc/paper_files/paper/2025/hash/c7b5a35ea98b62512a869c19ea7b03cb-Abstract-Conference.html",
  dflash: "https://proceedings.mlr.press/v306/chen26bv.html",
  dspark: "https://arxiv.org/abs/2607.05147",
  hybridspec: "https://arxiv.org/abs/2611.04055",
  draftLoop: "https://github.com/vllm-project/vllm/pull/63096",
  draftGraph: "https://github.com/vllm-project/vllm-ascend/pull/19512",
  draftPrefill: "https://github.com/vllm-project/vllm/pull/62784",
  draftCache: "https://github.com/vllm-project/vllm/pull/64109",
  adaptive: "https://github.com/vllm-project/vllm/pull/63421",
  verifyAttention: "https://github.com/vllm-project/vllm/pull/63801",
  verifyGraph: "https://github.com/vllm-project/vllm/pull/64915",
  rejectGraph: "https://github.com/vllm-project/vllm-ascend/pull/20254",
  samplerOOM: "https://github.com/vllm-project/vllm-ascend/pull/20006",
  ssmReplay: "https://github.com/vllm-project/vllm/pull/66595",
  ssmAsync: "https://github.com/vllm-project/vllm-ascend/pull/21430",
  gdnMetadata: "https://github.com/vllm-project/vllm-ascend/pull/19954",
  lookahead: "https://github.com/vllm-project/vllm/pull/61589",
} as const;

function Source({ id, children }: { id: keyof typeof sources; children: string }) {
  return <a href={sources[id]} target="_blank" rel="noreferrer">{children} <ArrowUpRight size={12} aria-hidden="true" /></a>;
}

const round = [
  ["提案 Draft", "使用历史匹配、轻量模型或目标特征，生成长度为 K 的候选。降低候选成本，不等于提高接受率。"],
  ["验证 Verify", "Target 一次处理多 token，并在各位置给出条件分布。注意力、GDN/KDA 状态与图模式必须支持这个形状。"],
  ["接受 Acceptance", "按正确的前缀顺序接受或拒绝候选；随机采样需要匹配目标分布的拒绝/残差采样规则。"],
  ["提交 Commit", "只保留合法的输出前缀，并更新 KV、循环状态和下一轮调度所需的记录；拒绝位置不能污染后续轮次。"],
];

const approaches = [
  ["无额外草稿权重", "N-gram、Suffix/Prompt Lookup", "容易接入；命中质量高度依赖重复性，长尾请求未必有效。", "vllm"],
  ["逐步草稿", "独立小模型、EAGLE-3、原生 MTP", "可利用条件依赖改善草稿；逐步 Draft、KV 与图回放仍有成本。", "eagle3"],
  ["并行块草稿", "DFlash：一次 Forward 提议一块", "降低草稿的顺序深度；若后段候选关联弱，接受率随深度降低。", "dflash"],
  ["半自回归草稿", "DSpark：并行 Backbone + Markov Head", "增加块内依赖；轻量序列采样及置信度估计自身也占时间。", "dspark"],
  ["动态验证预算", "Adaptive Verification / HybridSpec", "按接受概率、设备成本与动态 Batch 调节验证长度；不是固定加大 K。", "hybridspec"],
] as const;

export default function SpecDecGuide({ topic }: { topic: Topic }) {
  return <article className="acl-guide" aria-label="推测解码机制导引">
    <header className="topic-heading acl-guide-intro">
      <div className="docx-eyebrow">技术专题 · 机制导引</div>
      <h2>从候选生成到有效提交</h2>
      <p className="acl-deck">先理解一次推测轮次的正确性与成本，再沿着论文、官方实现和原始 PR 追踪工程机制。这里是研究导引，不是已完成的学术综述或性能复现。</p>
      <p className="topic-coverage">当前社区索引 {topic.entries.length} 条候选；来源归档覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}。候选不等于已审定的研究结论。</p>
      <p><Link to={{ search: "view=evidence" }}>查看 PR 与日报原文 <ArrowRight size={14} aria-hidden="true" /></Link></p>
    </header>

    <section aria-labelledby="spec-round-title">
      <p className="acl-kicker">01 · 正确性合同</p>
      <h3 id="spec-round-title">一次 Speculative Round 到底在做什么？</h3>
      <p>常规自回归必须沿着已确认的前缀继续生成；推测解码允许提前计算候选，利用 Target 对多个候选位置的并行验证减少昂贵的顺序轮次。它不取消条件概率依赖。思想起点见 <Source id="blockwise">Blockwise Decoding</Source>，经典无损概率采样推导见 <Source id="sampling">Leviathan 等（2023）</Source>。</p>
      <ol className="acl-steps">{round.map(([name, body]) => <li key={name}><strong>{name}</strong><p>{body}</p></li>)}</ol>
      <p className="acl-note"><strong>正确性不能混用：</strong>greedy 要比较最终 Token ID；temperature 非零时要区分输出分布相同与某个 seed 下序列完全一致；允许近似的 lossy 路径应单独标注。尤其对于 Hybrid 模型，Target 的合法输出和内部 Recurrent State 必须在相同的 accepted prefix 上成立。<Source id="ssmReplay">vLLM #66595</Source></p>
    </section>

    <section aria-labelledby="spec-methods-title">
      <p className="acl-kicker">02 · 方法演进</p>
      <h3 id="spec-methods-title">为什么有这么多种 Drafter？</h3>
      <p>方法不是按模型名称排列，而是按<strong>候选的依赖深度、产生成本和后续验证浪费</strong>划分。先对照 <Source id="speculators">vLLM Speculators 算法决策指南</Source> 和 <Source id="vllm">vLLM 官方 SpecDec 文档</Source>。</p>
      <table className="acl-evidence-table">
        <caption>主要路线：机制与边界</caption>
        <thead><tr><th scope="col">问题</th><th scope="col">代表实现</th><th scope="col">代价或限制</th></tr></thead>
        <tbody>{approaches.map(([problem, method, boundary, source]) => <tr key={problem}><th scope="row">{problem}</th><td>{method} · <Source id={source}>原始来源</Source></td><td>{boundary}</td></tr>)}</tbody>
      </table>
      <p>代表性论文沿着 <Source id="eagle3">EAGLE-3</Source> → <Source id="dflash">DFlash</Source> → <Source id="dspark">DSpark</Source>，展示了从逐步 Draft、并行块 Draft 到块内依赖与按置信度验证的演进；<Source id="hybridspec">HybridSpec</Source> 进一步把 GDN/MoE Target 的实际 Verify 成本纳入预算。不同论文的模型、硬件、负载和基线并不相同，不能把作者给出的 speedup 直接横向排名。</p>
    </section>

    <section aria-labelledby="spec-community-title">
      <p className="acl-kicker">03 · 社区实现</p>
      <h3 id="spec-community-title">论文机制如何落到 Serving Runtime？</h3>
      <p>优先看社区的一手实现，而不是以日报关键词推断技术归属。vLLM 是推测执行的核心控制路径，vLLM-Ascend 还必须处理设备侧 Graph、FlashAttention 和混合状态；SGLang 提供另一套重要的运行时对照。<Source id="vllm">vLLM</Source> · <Source id="ascend">vLLM Ascend</Source> · <Source id="sglang">SGLang</Source></p>
      <dl className="acl-conditions">
        <div><dt>Draft 的执行开销</dt><dd>多步 Draft 能否在单张图内完成？<Source id="draftLoop">vLLM #63096</Source>。Ascend 的 DFlash2 草稿能否 Full ACLGraph Replay？<Source id="draftGraph">Ascend #19512</Source>。在 Prefill-only worker 上是否应跳过永远不会被消费的 Draft？<Source id="draftPrefill">vLLM #62784</Source>。</dd></div>
        <div><dt>Verify 的计算形状</dt><dd>验证宽度变化如何影响 Attention、Graph 和历史 KV 预取？<Source id="verifyAttention">vLLM #63801</Source> · <Source id="verifyGraph">vLLM #64915（已关闭，未合入）</Source>。验证长度决策应考虑设备成本，而非只看接受率。<Source id="adaptive">vLLM #63421</Source></dd></div>
        <div><dt>Acceptance 的代价</dt><dd>Target Logits 的采样与 rejection kernel 也在关键路径；多个小 kernel 的 Host Launch 与高并发排序内存可能抵消收益。<Source id="rejectGraph">Ascend #20254</Source> · <Source id="samplerOOM">Ascend #20006</Source></dd></div>
        <div><dt>Accepted State</dt><dd>EAGLE/MTP 的 KV Prefix 可能需要额外 Lookahead 身份；GDN/Mamba/KDA 不能把被拒绝的候选状态当作合法历史。<Source id="lookahead">vLLM #61589</Source> · <Source id="ssmReplay">vLLM #66595</Source> · <Source id="ssmAsync">Ascend #21430</Source> · <Source id="gdnMetadata">Ascend #19954</Source></dd></div>
        <div><dt>Draft KV 占用</dt><dd>Drafter 的 Sliding Window 并不要求保留全部 Prefix KV；需要和 Target 的缓存布局、命中及回写语义区分。<Source id="draftCache">vLLM #64109</Source></dd></div>
      </dl>
      <p className="acl-note">这些 PR 是可追溯的实现证据，并不自动代表已经合入、已在所有硬件上可用，或在本网站上复现过作者数据。平台和版本的适配结论必须重新核验。</p>
    </section>

    <section aria-labelledby="spec-research-title">
      <p className="acl-kicker">04 · 性能与研究判断</p>
      <h3 id="spec-research-title">接受更多 Token，为什么不一定更快？</h3>
      <p>直观上，每轮有效输出越多、固定 Target 调用越少可能越有利；但更长的 Verify 同时增加 Attention、MoE、GDN State 更新、Graph Shape 以及无效候选计算。简化的顺序执行近似是 <code>T_per_token ≈ T_round / E[committed_tokens]</code>。存在异步重叠与持续组批时，应以实际关键路径和服务指标替代简单求和。</p>
      <table className="acl-evidence-table">
        <caption>什么证据才支持“SpecDec 加速”</caption>
        <thead><tr><th scope="col">层级</th><th scope="col">需要判断</th></tr></thead>
        <tbody>
          <tr><th scope="row">正确性</th><td>Greedy Token ID / 采样分布、accepted prefix、KV 与循环状态 commit，拒绝和混合批后续是否正确。</td></tr>
          <tr><th scope="row">机制性能</th><td>Draft 时间、Verify 宽度与时间、Acceptance Length、Sampling/Graph/State Overhead；同版本、同负载配对。</td></tr>
          <tr><th scope="row">Serving 性能</th><td>TTFT、TPOT/ITL、TPS、并发下 Goodput、KV/图显存以及无 SpecDec 的 AR 对照；不能只看 Kernel 微基准。</td></tr>
        </tbody>
      </table>
      <p className="acl-question"><span>下一步可验证的问题</span>给定 Target、设备与请求并发，能否把每轮 Drafter 信心、验证成本与 Recurrent State Commit 纳入统一决策，在保持正确性的同时改善真实 TPOT/Goodput？先用现有 Adaptive Verification 与 HybridSpec 机制作为强基线。</p>
      <p className="acl-note">此页只提供机制导引和一手来源入口。动态研究报告、版本化综述和 PDF 尚未发布；后续将仅在证据与冻结产物具备时加入，不以占位下载或待核验的实验结果充数。</p>
      <p><Link to={{ search: "view=report" }}>阅读动态研究报告：技术路线、工程证据与待验证问题 <ArrowRight size={14} aria-hidden="true" /></Link></p>
      <p><Link to={{ search: "view=evidence" }}>继续查看 {topic.entries.length} 条社区 PR 候选与日报回溯 <ArrowRight size={14} aria-hidden="true" /></Link></p>
    </section>
  </article>;
}

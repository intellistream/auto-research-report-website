import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import "./specdec.css";

const official = [
  { name: "vLLM · Speculative Decoding", url: "https://docs.vllm.ai/en/latest/features/speculative_decoding/" },
  { name: "vLLM Ascend · Speculative Decoding", url: "https://docs.vllm.ai/projects/ascend/en/main/user_guide/feature_guide/speculative_decoding.html" },
  { name: "Speculators · Algorithm Guide", url: "https://docs.vllm.ai/projects/speculators/en/latest/user_guide/algorithms/decision_guide/" },
] as const;

export default function SpecDecGuide({ topic }: { topic: Topic }) {
  return <article className="specdec-guide">
    <section className="specdec-guide-hero" aria-labelledby="specdec-round-heading">
      <h2 id="specdec-round-heading">一次 Target 前向，能确认几个 token？</h2>
      <p>自回归解码每轮依赖前一枚已确定 token。推测解码先用廉价 Drafter 提出候选，再让 Target 并行检查多个位置；仅接受符合验证规则的连续前缀。</p>
      <div className="specdec-round-grid" aria-label="自回归与推测解码的执行顺序示意">
        <div className="specdec-round-card">
          <h3>常规自回归</h3>
          <div className="specdec-round-track"><span>Target 1</span><span>→</span><span>Target 2</span><span>→</span><span>Target 3</span></div>
          <p>三个已确认 token 依次经过三轮 Target。</p>
        </div>
        <div className="specdec-round-card specdec-round-spec">
          <h3>推测解码</h3>
          <div className="specdec-round-track"><span>Draft d₁ d₂ d₃</span><span>→</span><span>Target Verify</span></div>
          <div className="specdec-verify-track"><span>p₁</span><span>p₂</span><span>p₃</span><span>p₄</span></div>
          <p>一次多位置验证；实际提交数由接受/拒绝与 bonus token 决定。</p>
        </div>
      </div>
      <p className="specdec-guide-footnote">核心约束是 <strong>正确的输出前缀</strong>。对于随机采样，需要保持 Target 的采样分布；对于 GDN/Mamba 等模型，还需同步正确的递归状态。<a href="https://proceedings.mlr.press/v202/leviathan23a.html" target="_blank" rel="noreferrer">经典推测采样论文 ↗</a></p>
    </section>

    <section className="specdec-guide-strategies" aria-labelledby="specdec-strategies-heading">
      <h2 id="specdec-strategies-heading">候选从哪里来？</h2>
      <p>提案方法决定了候选质量、草稿开销和硬件适配性。三条主要路径：</p>
      <div className="specdec-strategy-grid">
        <div><h3>Lookup</h3><p>利用 Prompt、Suffix 或历史 N-gram 的重复片段，不额外运行 Drafter 模型。</p></div>
        <div><h3>EAGLE / MTP</h3><p>利用独立模块或 Target 特征逐步预测候选，保留一定的序列依赖。</p></div>
        <div><h3>DFlash / DSpark</h3><p>并行预测一组候选；DSpark 加入轻量 Markov 与 Confidence Head。</p></div>
      </div>
    </section>

    <section className="specdec-guide-reading" aria-label="建议阅读路径">
      <h2>从零开始，如何阅读本专题？</h2>
      <ol>
        <li><strong>先理解机制。</strong> 在本页区分 Draft、Target、Accepted Prefix 与 Bonus；正确性是后续所有优化的前提。</li>
        <li><strong>再阅读完整综述。</strong> 从历史方法、条件依赖、验证预算走向 GDN/MoE State 与 Runtime。</li>
        <li><strong>最后核对工程判断。</strong> 动态报告保留原始 PR 版本、工作负载、负结果和跨层结论，随新证据修订。</li>
      </ol>
      <p><Link to={{ search: "view=paper" }}>阅读学术综述全文 →</Link>{" · "}<Link to={{ search: "view=report&read=full" }}>阅读八章动态研究报告 →</Link></p>
    </section>

    <details className="specdec-guide-docs">
      <summary>官方实现与进一步阅读</summary>
      <ul>{official.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a></li>)}</ul>
      <p>算法结构、模型权重、Runtime Proposer 和具体设备后端应分别核对；文档 latest 不代表任意旧版本自动支持。</p>
      <Link to={{ search: "view=paper" }}>阅读技术路线与综述 →</Link>
    </details>

    {topic.report && <section className="specdec-guide-question">
      <h2>待验证的问题</h2>
      <p>候选接受率提高之后，Target 的多 token 验证、图执行与 GDN/MoE 状态提交，会不会反而增加每个有效 token 的开销？</p>
      <Link to={{ search: "view=report&part=survey-gaps" }}>查看 Research Gaps 与验证路径 →</Link>
    </section>}
  </article>;
}

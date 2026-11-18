import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { specDecSurvey } from "./specdec-survey-content";
import "./specdec.css";

const routes = [
  {
    name: "候选生成",
    problem: "如何以低成本得到高质量的条件候选？",
    steps: ["Target 前缀", "Lookup / AR / Parallel Draft", "候选 Token + 置信度"],
    evidence: "EAGLE-3、MTP、DFlash、DSpark",
    question: "提高候选质量的额外 Draft 成本何时能由减少的 Verify 轮次抵消？",
    chapter: "drafting",
  },
  {
    name: "Target 验证预算",
    problem: "更宽的 Verify 为什么可能更慢？",
    steps: ["候选存活概率", "Shape / MoE 成本估计", "选择 Verify Length"],
    evidence: "Adaptive Verification、HybridSpec",
    question: "怎样在动态批次中同时考虑 Confidence、Router 负载和 Runtime Cost？",
    chapter: "verification",
  },
  {
    name: "Accepted State",
    problem: "被拒绝候选的 KV/GDN 中间态如何隔离？",
    steps: ["合法 Checkpoint", "投机 Verify", "恢复并提交 Accepted Prefix"],
    evidence: "Lookahead Hash、RecoverSSM、GDN State",
    question: "Reject、Prefix Hit 与 Preemption 发生时，如何证明下一轮只读取合法状态？",
    chapter: "state",
  },
  {
    name: "Serving Runtime",
    problem: "局部 Kernel 优化如何传递到 TPOT 与 Goodput？",
    steps: ["Draft / Verify Shape", "Graph / Cache / Scheduler", "端到端关键路径"],
    evidence: "vLLM Model Runner、ACL Graph、KV/SSM 生命周期",
    question: "在相同资源预算下，什么时候 SpecDec 比普通自回归更划算？",
    chapter: "runtime",
  },
] as const;

export default function SpecDecSurvey({ topic }: { topic: Topic }) {
  const [selected, setSelected] = useState(0);
  const route = routes[selected];
  const references = topic.report?.references ?? [];
  const cited = new Set(specDecSurvey.chapters.flatMap(chapter => chapter.sections.flatMap(section => section.sourceIds)));
  const sources = references.filter(source => cited.has(source.id));

  function cite(ids: readonly string[]) {
    return <span className="specdec-citation" aria-label="本节参考来源">
      {ids.map(id => {
        const source = references.find(item => item.id === id);
        return source ? <a key={id} href={source.url} target="_blank" rel="noreferrer" title={source.title}>[{id}]</a> : null;
      })}
    </span>;
  }
  function jump(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
  }

  return <div className="specdec-survey">
    <header className="specdec-paper-intro">
      <p className="specdec-paper-meta">TECHNICAL SURVEY · 技术综述研究稿 · 文献更新至 {topic.report?.asOf ?? "2026-11"}</p>
      <h2>{specDecSurvey.title}</h2>
      <p lang="en">{specDecSurvey.subtitle}</p>
      <p>技术路线、核心研究问题与完整正文。此稿与持续收集的工程 PR 证据分开组织，方法与结论可独立修订。</p>
    </header>

    <section className="specdec-map" aria-labelledby="specdec-map-title">
      <h3 id="specdec-map-title">技术路线与待验证问题</h3>
      <div className="specdec-map-grid">
        <ul className="specdec-map-list">{routes.map((item, index) => <li key={item.chapter}>
          <button type="button" aria-pressed={selected === index} aria-controls="specdec-map-panel" onClick={() => setSelected(index)}>
            <strong>{item.name}</strong><small>{item.problem}</small>
          </button>
        </li>)}</ul>
        <div className="specdec-map-panel" id="specdec-map-panel">
          <h4>{route.name}</h4>
          <p className="specdec-paper-meta">已有技术路径</p>
          <ol className="specdec-map-steps">{route.steps.map(step => <li key={step}>{step}</li>)}</ol>
          <p>{route.evidence}</p>
          <div className="specdec-map-question"><strong>研究问题</strong><p>{route.question}</p></div>
          <button type="button" onClick={() => jump(`specdec-survey-${route.chapter}`)}>读正文中的机制与权衡 →</button>
        </div>
      </div>
    </section>

    <article className="specdec-manuscript" aria-label="推测解码技术综述全文">
      <h2>摘要</h2>
      <p>{specDecSurvey.abstract}</p>
      <p className="specdec-paper-meta">关键词：{specDecSurvey.keywords.join(" · ")}</p>
      <details><summary>研究范围与材料</summary><p>{specDecSurvey.scope}</p></details>
      <section className="specdec-round-example" aria-labelledby="specdec-k3-heading">
        <h2 id="specdec-k3-heading">一轮 K=3：真正输出了什么？</h2>
        <p>下例是 Greedy 的手工示意：在已确认前缀 P 上，Drafter 连续提议 A、B、C；Target 同时计算各位置分布，顺次给出 A、B、D。</p>
        <div className="specdec-example-flow" aria-label="推测轮次的提案、验证与最终提交">
          <div><small>Draft K=3</small><strong>A · B · C</strong></div>
          <div><small>Target 验证</small><strong>A · B · D</strong></div>
          <div><small>接受决策</small><strong>✓ A · ✓ B · ✕ C</strong></div>
          <div><small>合法输出</small><strong>A · B · D</strong></div>
        </div>
        <p>第 3 个候选被拒绝后，用 Target 给出的 D 修正。设备可能把 D 留为下一轮待计算的 Pending Token，不能把候选 C 的 KV/递归状态当成 D 的历史。若三枚均被接受且有额外 Target 分布，才按规则产生 Bonus Token。</p>
        <p>概率采样不同于 Greedy：若 q(A,B,C)=(0.5,0.3,0.2)、p(A,B,C)=(0.4,0.4,0.2)，候选 A 的接受概率为 0.8；若拒绝 A，正残差 (p−q)₊ 只在 B 上有质量，因此修正为 B。该数字是数学示例，不是模型测量。</p>
        <table className="specdec-contract-table">
          <caption>推测解码必须分别检查的四种合同</caption>
          <thead><tr><th>合同</th><th>不变量</th><th>必要对照</th></tr></thead>
          <tbody>
            <tr><th>目标分布</th><td>精确采样的接受/残差分布与 Target 一致</td><td>概率核验；不能仅对比相同 Seed 的输出</td></tr>
            <tr><th>Token / Prefix</th><td>只提交合法连续前缀，Greedy 与 AR Oracle 一致</td><td>第 1/2/3 枚拒绝、全接受、Bonus、EOS</td></tr>
            <tr><th>KV / SSM State</th><td>所有可见状态对应 Accepted Prefix</td><td>逐层 State 对照、Reject 后多轮续推</td></tr>
            <tr><th>时序与资源</th><td>Producer/Consumer 有序，复用槽位不串代</td><td>Preemption、Prefix Hit、Graph Replay、P/D</td></tr>
          </tbody>
        </table>
        <p className="specdec-equation">E[committed/round] = 1 + Σᵢ₌₁ᴷ Pr(前 i 个候选全部接受) （无 EOS 截断）</p>
        <p><strong>成本坐标：</strong>Draft K ≠ 动态 Verify Budget ≠ 实际 Target Query Rows。异步重叠时，阶段计时不可直接相加；应测量每轮 Critical Path 与有效输出、TPOT 和 Goodput。</p>
      </section>
      <h2>目录</h2>
      <ol className="specdec-toc">{specDecSurvey.chapters.map(chapter => <li key={chapter.id}>
        <button type="button" onClick={() => jump(`specdec-survey-${chapter.id}`)}>{chapter.title}</button>
      </li>)}</ol>
      {specDecSurvey.chapters.map(chapter =>
        <section key={chapter.id} id={`specdec-survey-${chapter.id}`} tabIndex={-1}>
          <h2>{chapter.title}</h2>
          {chapter.sections.map(section => <section key={section.title}>
            <h3>{section.title}</h3>
            {section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            {"equation" in section && section.equation && <pre className="specdec-equation">{section.equation}</pre>}
            {cite(section.sourceIds)}
          </section>)}
        </section>)}
      <section id="specdec-survey-references">
        <h2>参考文献与原始工程来源</h2>
        <p>正文引用沿用专题动态报告的来源标识；工程变更的原始日期、合入状态和条件可在来源页进一步核查。</p>
        <ol className="specdec-sources">{sources.map(source => <li key={source.id}>
          <strong>[{source.id}]</strong> <a href={source.url} target="_blank" rel="noreferrer">{source.title} <ArrowUpRight size={12} aria-hidden="true" /></a>
        </li>)}</ol>
      </section>
      <p><Link to={{ search: "view=report&part=survey-gaps" }}>研究缺口的增量证据和验证路径见动态报告 →</Link></p>
    </article>
  </div>;
}

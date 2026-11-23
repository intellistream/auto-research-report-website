import { useState } from "react";
import { Link } from "react-router-dom";
import { CacheExample } from "./KvCacheStudy";
import { kvResearch } from "./kv-research";
import { estimateKVBytes } from "./kv-basics";

const phases = {
  prefill: {
    label: "预填充 Prefill",
    title: "先处理输入，把每层的 K 和 V 保存下来",
    text: "模型先把输入拆成 token，再逐层计算。每个位置产生 Query（查询）、Key（键）和 Value（值）；查询与允许访问的 Key 计算相关程度，再加权汇总 Value。输入处理完成后，各层的历史 K、V 留在缓存中，模型得到生成下一个 token 所需的输出。",
    input: "输入的多个 token", cache: "写入输入位置的 K、V", result: "得到第一个输出 token",
  },
  decode: {
    label: "逐 token 生成 Decode",
    title: "新 token 读取历史 KV，再追加自己的 K 和 V",
    text: "下一轮把刚生成的 token 送回模型。在每一层，它产生新的 Q、K、V：Q 读取已有历史和当前位置的 K、V，新的 K、V 追加到缓存。随后采样下一个 token，重复这个过程，直到请求结束。缓存省下历史位置 K、V 的重复计算，读取历史和新 token 的计算仍然需要执行。",
    input: "上轮生成的一个 token", cache: "读取历史 KV，并追加新 KV", result: "生成下一个 token",
  },
};

function KVProcess() {
  const [phase, setPhase] = useState<keyof typeof phases>("prefill");
  const current = phases[phase];
  return <section id="kv-basics-process" tabIndex={-1}>
    <h3>一个请求怎样使用 KV？</h3>
    <p>下面以因果自注意力、逐 token 生成的普通流程为例。每一层有自己的 KV，后续位置通过注意力读取允许访问的历史。</p>
    <div className="kv-state-controls" role="group" aria-label="查看推理阶段">
      {(Object.keys(phases) as (keyof typeof phases)[]).map(key =>
        <button key={key} type="button" aria-pressed={phase === key} onClick={() => setPhase(key)}>{phases[key].label}</button>)}
    </div>
    <div className="kv-basics-phase" aria-live="polite" aria-atomic="true">
      <h4>{current.title}</h4><p>{current.text}</p>
      <ol className="kv-basics-flow">
        <li><span>本轮输入</span><strong>{current.input}</strong></li>
        <li><span>逐层注意力</span><strong>{current.cache}</strong></li>
        <li><span>本轮输出</span><strong>{current.result}</strong></li>
      </ol>
    </div>
    <p className="kv-muted">示意 · 未运行模型。Query 用于当前这一步的注意力计算；后续生成复用的是历史 Key 和 Value。</p>
  </section>;
}

function KVMemory() {
  const [tokens, setTokens] = useState(8192);
  const [sequences, setSequences] = useState(4);
  const gib = estimateKVBytes(tokens, sequences) / 2 ** 30;
  return <section id="kv-basics-memory" className="kv-basics-memory" tabIndex={-1}>
    <h3>为什么上下文一长，并发一多，缓存就变大？</h3>
    <p>每多保留一个 token，就要多存一份各层的 K、V。多个独立请求同时运行时，各自保留历史。模型使用的 KV 头数、头维度、层数和每个数值的字节数，也会改变缓存占用。</p>
    <div className="kv-memory-calculator">
      <div className="kv-memory-controls">
        <label htmlFor="kv-context-length">每个请求保留的 token 数 <output htmlFor="kv-context-length">{tokens.toLocaleString("en-US")}</output></label>
        <input id="kv-context-length" type="range" min="1024" max="32768" step="1024" value={tokens} onChange={e => setTokens(Number(e.target.value))} />
        <label htmlFor="kv-concurrent-sequences">同时驻留的请求数 <output htmlFor="kv-concurrent-sequences">{sequences}</output></label>
        <input id="kv-concurrent-sequences" type="range" min="1" max="16" step="1" value={sequences} onChange={e => setSequences(Number(e.target.value))} />
      </div>
      <div className="kv-memory-result" aria-live="polite" aria-atomic="true"><span>估算 KV 存储量</span><strong>{gib.toFixed(2)} <small>GiB</small></strong><span>理论存储示意</span></div>
    </div>
    <p className="kv-muted">假设各请求等长、完整注意力、32 层、8 个 KV 头、每头 128 维、BF16（每值 2 字节），各请求的 KV 独立存储。1 GiB = 2³⁰ 字节。</p>
    <details className="kv-basics-formula"><summary>查看公式与适用范围</summary>
      <p>总字节数 = 2（K 与 V）× 请求数 × token 数 × 层数 × KV 头数 × 头维度 × 每值字节数。</p>
      <p>GQA / MQA 使用的 KV 头数通常少于 Query 头数，公式应填实际 KV 头数。该示意不包含模型权重、激活、分配留空、量化辅助数据和分布式副本，也不直接适用于 MLA、滑动窗口或混合状态模型。共享前缀和各层不同布局需另算。</p>
    </details>
    <div className="kv-basics-next"><Link to={{search:"view=survey&topic=representation"}}>比较分页、淘汰和量化怎样减少占用</Link></div>
  </section>;
}

export default function KvBasics() {
  return <article className="kv-study kv-basics">
    <header className="kv-study-intro">
      <p className="kv-direction">KV 入门</p>
      <h2>KV Cache 缓存了什么，为什么会成为推理瓶颈？</h2>
      <p>KV Cache 保存注意力层已经计算好的 Key / Value 张量。先看它在一次生成中怎样被写入和读取，再理解容量、复用与搬运带来的问题。</p>
    </header>
    <nav className="kv-basics-outline" aria-label="入门阅读路径">
      <Link to={{search:"view=guide&part=kv-basics-process"}}>理解生成流程</Link>
      <Link to={{search:"view=guide&part=kv-basics-memory"}}>估算缓存占用</Link>
      <Link to={{search:"view=guide&part=kv-basics-lifecycle"}}>认识复用与释放</Link>
      <Link to={{search:"view=guide&part=kv-basics-questions"}}>选择研究问题</Link>
    </nav>
    <KVProcess /><KVMemory />
    <section id="kv-basics-lifecycle" tabIndex={-1}>
      <h3>一次生成结束后，KV 会发生什么？</h3>
      <p>请求生成期间，系统持续追加 KV，并保护当前计算仍会读取的缓存块。请求结束后释放引用；开启前缀缓存时，一部分块可以继续保留，供后续请求匹配，需要腾出空间时再淘汰。</p>
      <p>跨请求复用还要求计算身份一致、前缀匹配、缓存实际存在。模型、LoRA、多模态输入等都会影响身份；仅仅输入文本相同，不足以判断所有配置下都能复用。</p>
      <div className="kv-basics-terms"><p><strong>一次生成中的历史读取</strong>：后续 token 读取同一请求已产生的 KV。</p><p><strong>请求之间的前缀复用</strong>：新请求接入可复用的前缀块，减少输入部分的重复计算。</p></div>
      <p>缓存也可以移到 CPU、外部存储或其他实例。命中这些位置时，还需要恢复数据、准备设备空间，再安排计算。预填充与解码分离时，两个阶段之间同样需要交接 KV。</p>
    </section>
    <CacheExample />
    <section id="kv-basics-questions" tabIndex={-1}>
      <h3>从这些瓶颈出发，可以研究什么？</h3>
      <p>容量决定能保留多少历史；读取和搬运影响每步执行时间；复用和调度决定哪些计算可以省下、哪些请求先运行。下面五组问题连接论文方法与社区实现。</p>
      <div className="kv-question-grid">{kvResearch.taxonomy.map(question => <article className="kv-question-card" key={question.id}>
        <span className="kv-direction">{question.label}</span><h4>{question.question}</h4><p>{question.description}</p>
        <div className="kv-question-links">
          <Link to={{search:`view=survey&topic=${question.id}`}}>比较代表方法</Link>
          <Link to={{search:`view=evidence&topic=${question.id}`}}>查看社区 PR</Link>
        </div>
      </article>)}</div>
    </section>
    <section className="kv-basics-reading">
      <div><h3>接下来读论文</h3><p>从推荐先读的六篇入手，再按研究问题比较机制与限制。</p><Link to={{search:"view=papers"}}>进入论文板块</Link></div>
      <div><h3>接下来跟踪实现</h3><p>查看近期社区改动、已有验证和仍需继续跟踪的问题。</p><Link to={{search:"view=report"}}>阅读社区动态报告</Link></div>
    </section>
    <footer className="kv-basics-sources"><p>基础说明参考 PagedAttention 的 KV 管理背景、KIVI 的缓存表示分析及 vLLM 前缀缓存设计。交互图和容量计算用于解释机制。</p><div className="kv-sources">
      <Link to={{search:"view=papers&part=kv-paper-pagedattention"}}>PagedAttention 解读与原文</Link>
      <Link to={{search:"view=papers&part=kv-paper-kivi"}}>KIVI 解读与原文</Link>
      <a href="https://docs.vllm.ai/en/latest/design/prefix_caching/" target="_blank" rel="noreferrer">vLLM 前缀缓存设计</a>
    </div></footer>
  </article>;
}

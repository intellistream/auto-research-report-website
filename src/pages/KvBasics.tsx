import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigationType, useSearchParams } from "react-router-dom";
import { CacheExample } from "./KvCacheStudy";
import { kvResearch } from "./kv-research";
import type { MemoryLoad, MemoryAction, MemoryComparison } from "./kv-basics";
import KvLinearAttention from "./KvLinearAttention";
import { KvGuideLink } from "./KvGuideLink";
import KvGeneration from "./KvGeneration";
import KvMemory from "./KvMemory";
import { KvGuideChapterHeading, KvGuideChapterEnd } from "./KvGuideChapter";
import "./kv-guide-layout.css";
import { parseKvGuideState, withKvGuideState, shouldResetKvPosition, kvGuideFieldLabels } from "./kv-guide-state";


const researchConnections: Record<string, { object: string; mechanism: string }> = {
  representation: { object: "改变数值的精度与表示", mechanism: "KIVI 用低位表示减少每个值的字节数；需权衡精度，并计入量化元数据与残留缓存。" },
  lifecycle: { object: "改变保留的位置，或缓存块的分配", mechanism: "H₂O 淘汰部分历史，可能损失信息；PagedAttention 用分页减少分配浪费，需管理块表。分页本身不会缩小同一逻辑 KV 的原始字节数。" },
  reuse: { object: "复用另一个请求已算好的前缀", mechanism: "SGLang 匹配已有前缀，省下输入计算；缓存必须实际存在且计算身份一致，保留缓存也要占用空间。" },
  movement: { object: "改变 KV 的存放位置与传输方式", mechanism: "命中 CPU 或外部存储后，要准备设备空间、传回数据再计算；收益取决于带宽、传输量与并发条件。" },
  scheduling: { object: "改变哪些请求先运行", mechanism: "k-LPM 利用前缀命中机会安排请求，同时考虑等待时间；命中更多不等于所有请求的延迟都更低。" },
};

export default function KvBasics() {
  const [query, setQuery] = useSearchParams();
  const location = useLocation();
  const navigationType = useNavigationType();
  const parsed = parseKvGuideState(query);
  const memory: MemoryLoad = { modelId: parsed.state.modelId, tokens: parsed.state.tokens, sequences: parsed.state.sequences };
  const [comparison, setComparison] = useState<MemoryComparison | null>(null);
  // This is a reset request, not the current cursor. A position-only URL replacement
  // must not feed back into initialStep and reset the child's phase.
  const [linearExample, setLinearExample] = useState({ step: parsed.state.position, revision: 0 });
  const [parameterNotice, setParameterNotice] = useState(parsed.invalid);
  const callbackPosition = useRef<number | null>(null);
  const entryIdentity = `${location.key}:${location.search}`;
  const previousEntry = useRef(entryIdentity);

  useEffect(() => {
    if (previousEntry.current !== entryIdentity) {
      previousEntry.current = entryIdentity;
      if (shouldResetKvPosition(navigationType, location.state)) {
        if (callbackPosition.current !== parsed.state.position) {
          setLinearExample(value => ({ step: parsed.state.position, revision: value.revision + 1 }));
        }
        if (navigationType === "POP") setComparison(null);
      }
      callbackPosition.current = null;
      if ((location.state as { kvGuideNavigation?: string } | null)?.kvGuideNavigation !== "normalize") setParameterNotice(parsed.invalid);
    }
    const normalized = withKvGuideState(query, parsed.state);
    if (normalized.toString() !== query.toString()) {
      setQuery(normalized, { replace: true, state: { kvGuideNavigation: "normalize" } });
    }
  }, [entryIdentity, navigationType, location.state, query, setQuery, parsed.state.position]);

  const updateMemory = (change: Partial<MemoryLoad>, action?: MemoryAction) => {
    const next = { ...memory, ...change };
    setParameterNotice([]);
    setComparison(action ? { before: memory, after: next, action } : null);
    if (next.modelId === memory.modelId && next.tokens === memory.tokens && next.sequences === memory.sequences) return;
    setQuery(withKvGuideState(query, { ...parsed.state, ...next }), { replace: true, state: { kvGuideNavigation: "explore" } });
  };
  const selectLinearPosition = (step: number) => {
    callbackPosition.current = step;
    setLinearExample(value => ({ step, revision: value.revision + 1 }));
  };
  const updatePosition = useCallback((position: number) => {
    // Ignore the old cursor reported while an external/explicit reset is pending.
    if (previousEntry.current !== entryIdentity && shouldResetKvPosition(navigationType, location.state)) return;
    if (position === parseKvGuideState(query).state.position) return;
    setQuery(withKvGuideState(query, { ...parseKvGuideState(query).state, position }), { replace: true, state: { kvGuideNavigation: "explore" } });
  }, [query, setQuery, entryIdentity, navigationType, location.state]);
  const activePart = query.get("part") ?? "kv-basics-process";
  const primaryChapters = [
    { part: "kv-basics-process", number: "01", label: "生成与保存" },
    { part: "kv-basics-memory", number: "02", label: "估算容量" },
    { part: "kv-basics-lifecycle", number: "03", label: "复用与释放" },
  ];
  return <article className="kv-study kv-basics kv-guide">
    <header className="kv-study-intro kv-guide-intro" id="kv-guide-start" tabIndex={-1}>
      <h2>从生成到复用，读懂 <span>KV Cache</span></h2>
      <p>先看 KV 怎样产生，再估算它的空间，最后看请求结束后的复用。线性注意力与混合模型放在选读中。</p>
    </header>
    {parameterNotice.length > 0 && <p className="kv-guide-parameter-notice" role="status">链接中的{parameterNotice.map(field => kvGuideFieldLabels[field]).join("、")}无效，已逐项恢复默认值；其余有效配置保留。地址已规范化，刷新使用修正后的配置。</p>}
    <div className="kv-guide-layout">
      <aside className="kv-guide-rail">
        <nav className="kv-basics-outline" aria-label="入门阅读路径">
          <p className="kv-guide-nav-label">基础必读</p>
          <ol>{primaryChapters.map(chapter => <li key={chapter.part}><KvGuideLink part={chapter.part} ariaCurrent={activePart === chapter.part ? "location" : undefined}><span className="kv-guide-nav-number">{chapter.number}</span>{chapter.label}</KvGuideLink></li>)}</ol>
          <p className="kv-guide-nav-label kv-guide-nav-secondary">之后再读</p>
          <ul>
            <li><KvGuideLink part="kv-basics-linear-attention" ariaCurrent={activePart === "kv-basics-linear-attention" ? "location" : undefined}><span className="kv-guide-nav-tag">选读</span>其他保存方式</KvGuideLink></li>
            <li><KvGuideLink part="kv-basics-questions" ariaCurrent={activePart === "kv-basics-questions" ? "location" : undefined}><span className="kv-guide-nav-tag">研究</span>从问题出发</KvGuideLink></li>
          </ul>
        </nav>
      </aside>
      <div className="kv-guide-content">
        <KvGeneration onCompare={selectLinearPosition} />
        <KvMemory load={memory} comparison={comparison && comparison.after.modelId === memory.modelId && comparison.after.tokens === memory.tokens && comparison.after.sequences === memory.sequences ? comparison : null} onChange={updateMemory} />
        <section id="kv-basics-lifecycle" className="kv-guide-chapter" tabIndex={-1}>
          <KvGuideChapterHeading number="03" category="复用与释放" title="请求结束后，哪些缓存还能继续使用？">生成期间保留计算仍需读取的 KV；请求结束后释放引用。开启前缀缓存时，一部分块可以留下，供后续请求匹配，需要空间时再淘汰。</KvGuideChapterHeading>
          <div className="kv-basics-terms"><p><strong>同一请求内读取历史</strong>后续 token 使用该请求已经产生的 KV。</p><p><strong>不同请求间复用前缀</strong>新请求接入可复用的前缀块，减少重复的输入计算。</p></div>
          <p>跨请求复用要求计算身份一致、前缀匹配，而且缓存实际存在。模型、LoRA、多模态输入等都会影响身份，仅有相同文本还不够。</p>
          <p>命中 CPU、外部存储或其他实例时，还要恢复数据、准备设备空间，再安排计算。预填充与解码分离时，两个阶段之间也需要交接 KV。</p>
          <p className="kv-guide-example-intro">下面换到第二个请求的块管理示意，观察不同缓存位置的下一步；它不是前面三个输入位置的实际分块结果。</p>
          <CacheExample headingLevel={4} />
          <KvGuideChapterEnd part="kv-basics-questions" label="继续：选择研究问题">能否复用取决于身份、前缀、实际保留的缓存和所在位置。命中后仍可能需要传输与等待。</KvGuideChapterEnd>
        </section>
        <details className="kv-guide-extension">
          <summary><span className="kv-guide-extension-label">选读</span><strong>历史也可以保存为递推状态</strong><span className="kv-guide-extension-note">比较线性注意力与混合模型</span></summary>
          <div className="kv-guide-extension-body">
            <KvLinearAttention initialStep={linearExample.step} resetToken={linearExample.revision} onPositionChange={updatePosition} onSelectHybrid={() => setComparison({ before: memory, after: { ...memory, modelId: "qwen3.5-35b-a3b" }, action: "model" })} />
          </div>
        </details>
        <section id="kv-basics-questions" className="kv-guide-chapter kv-guide-research" tabIndex={-1}>
          <KvGuideChapterHeading category="继续研究" title="你想减少哪一部分开销？">按你想改变的对象选择问题，再读对应论文与社区实现。收录数量不表示问题已经解决。</KvGuideChapterHeading>
          <ul className="kv-guide-research-list">{kvResearch.taxonomy.map(question => <li key={question.id}>
            <span className="kv-direction">{question.label}</span>
            <div><h4>{question.question}</h4><p>{researchConnections[question.id]?.object}</p>
              <details className="kv-guide-method-note"><summary>方法与边界</summary><p>{researchConnections[question.id]?.mechanism ?? question.description}</p></details>
            </div>
            <div className="kv-question-links"><Link to={{search:`view=survey&topic=${question.id}`}}>比较代表方法</Link><Link to={{search:`view=evidence&topic=${question.id}`}}>查看社区 PR</Link></div>
          </li>)}</ul>
          <div className="kv-basics-reading">
            <div><h4>接下来读论文</h4><p>从推荐先读的六篇入手，比较方法与适用条件。</p><Link to={{search:"view=papers"}}>进入论文板块 →</Link></div>
            <div><h4>接下来跟踪实现</h4><p>查看近期社区改动、已有验证与待跟踪问题。</p><Link to={{search:"view=report"}}>阅读社区动态报告 →</Link></div>
          </div>
        </section>
        <footer className="kv-basics-sources"><details><summary>基础资料与出处</summary><p>生成与容量说明参考 PagedAttention 的 KV 管理背景和 KIVI 的缓存表示分析；前缀缓存、线性注意力与模型配置的依据放在对应章节。</p><div className="kv-sources"><Link to={{search:"view=papers&part=kv-paper-pagedattention"}}>PagedAttention 解读与原文</Link><Link to={{search:"view=papers&part=kv-paper-kivi"}}>KIVI 解读与原文</Link></div></details></footer>
      </div>
    </div>
  </article>;
}

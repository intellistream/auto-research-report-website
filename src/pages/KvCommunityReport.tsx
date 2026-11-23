import { Link, useSearchParams } from "react-router-dom";
import {
  baselineSnapshots, communityDate, kvCommunity, prState, prStateLabels,
  snapshotFor, stateChanges, versionChanges,
} from "./kv-community";
import { synthesisPaper, synthesisPaperLink } from "./kv-synthesis";

export default function KvCommunityReport() {
  const [query] = useSearchParams();
  const knownCandidates = new Set(kvCommunity.newEntries.map(entry => entry.url));
  const remaining = kvCommunity.search.candidates.filter(item => !knownCandidates.has(item.url));
  return <article className="kv-study kv-community-report">
    <header className="kv-study-intro">
      <p className="kv-direction">社区 PR · 动态报告</p>
      <h2>{kvCommunity.title}</h2>
      <p>{kvCommunity.summary}</p>
      <div className="kv-edition-meta">
        <span>观察窗口 <time>{kvCommunity.periodStart}</time> 至 <time>{kvCommunity.periodEnd}</time></span>
        <span>本期核对 <time>{kvCommunity.edition}</time> · 北京时间</span>
      </div>
      <Link to={{search:"view=report&edition=2026-11-17"}}>阅读上一版：11 月 17 日调度观察</Link>
    </header>
    {query.get("edition") && query.get("edition") !== kvCommunity.edition && <p role="status">未找到该期报告，当前展示 {kvCommunity.edition} 版。</p>}
    <dl className="kv-review-summary">
      <div><dt>既有 PR 状态回查</dt><dd>{baselineSnapshots.length}</dd></div>
      <div><dt>代码版本发生变化</dt><dd>{versionChanges.length}</dd></div>
      <div><dt>本期新纳入 PR</dt><dd>{kvCommunity.newEntries.length}</dd></div>
    </dl>
    <details className="kv-report-scope"><summary>本期覆盖范围与证据说明</summary>
      <p>{kvCommunity.scopeNote}</p><p>{kvCommunity.verification}</p>
      <p>检索返回 {kvCommunity.search.returned} 条记录，去重为 {kvCommunity.search.unique} 条线索，本期选读 {kvCommunity.newEntries.length} 条新 PR。其余线索尚未逐条判断相关性或形成分析，不计入已收录 PR。</p>
      <p>网页展示已整理的报告快照。来源修订时间、状态核对日期与内容分析范围分别标明；本期不代表实时监控或完整社区覆盖。</p>
    </details>
    <section aria-labelledby="kv-edition-observations">
      <h3 id="kv-edition-observations">本期材料改变了哪些认识？</h3>
      <div className="kv-edition-observations">{kvCommunity.observations.map(observation => <article key={observation.title}>
        <h4>{observation.title}</h4><p>{observation.body}</p>
        <div className="kv-sources">{observation.storySlugs.map(slug => {
          const story = kvCommunity.stories.find(item => item.slug === slug)!;
          const snapshot = snapshotFor(story.id)!;
          return <Link key={slug} to={{search:`view=report&part=kv-update-${slug}`}}>{snapshot.repository === "vllm" ? "vLLM" : "Ascend"} #{snapshot.number} 解读</Link>;
        })}</div>
      </article>)}</div>
    </section>
    <section aria-labelledby="kv-edition-stories">
      <div className="kv-section-heading"><h3 id="kv-edition-stories">重点进展与分析</h3><Link to={{search:"view=evidence&review=edition"}}>查看本期分析涉及的 PR</Link></div>
      <div className="kv-community-stories">{kvCommunity.stories.map(story => {
        const snapshot = snapshotFor(story.id)!;
        return <article key={story.slug} id={`kv-update-${story.slug}`} className="kv-community-story" tabIndex={-1}>
          <div className="kv-story-meta"><span>{story.change}</span><span>{snapshot.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{snapshot.number}</span><span className={`kv-pr-status ${prState(snapshot)}`}>{prStateLabels[prState(snapshot)]}</span></div>
          <h4>{story.title}</h4>
          <dl className="kv-story-fields">
            <div><dt>发生了什么</dt><dd>{story.changeText}</dd></div>
            <div><dt>具体怎样处理</dt><dd>{story.mechanism}</dd></div>
            <div><dt>证据与边界</dt><dd>{story.evidence}</dd></div>
            <div className="kv-story-analysis"><dt>我们的分析</dt><dd>{story.analysis}</dd></div>
            <div><dt>继续跟踪</dt><dd>{story.next}</dd></div>
          </dl>
          <div className="kv-story-links"><a href={snapshot.url} target="_blank" rel="noreferrer">原始 PR</a>
            <Link to={{search:`view=evidence&q=${snapshot.number}`}}>查看 PR 记录</Link>
            <Link to={{search:`view=survey&topic=${story.topic}`}}>相关论文方法比较</Link>
          </div>
          <details className="kv-story-source"><summary>来源版本与相关论文</summary>
            <p>{story.basis} {story.readingScope}</p>
            <p>状态及来源核对：{snapshot.checkedAt} · PR 更新：{communityDate(snapshot.updatedAt)} · head <code>{snapshot.headSha}</code></p>
            <div className="kv-sources">{story.paperSlugs.map(slug =>
              <Link key={slug} to={synthesisPaperLink(slug)}>{synthesisPaper(slug)?.paper.shortName ?? slug}</Link>)}</div>
            <p>论文按研究问题关联，不表示该 PR 实现或复现了这些论文。</p>
          </details>
        </article>;
      })}</div>
    </section>
    <section aria-labelledby="kv-edition-changes">
      <h3 id="kv-edition-changes">相较 {kvCommunity.baselineDate}，既有 PR 有哪些变化？</h3>
      <p>已回查 {baselineSnapshots.length} 条既有记录。其中 {versionChanges.length} 条代码版本变化，{stateChanges.length} 条状态变化；两者存在重叠。版本变动先作为复核线索，具体机制变化需要另看补丁。</p>
      <div className="kv-version-changes">{versionChanges.map(snapshot => <article key={snapshot.id}>
        <h4><a href={snapshot.url} target="_blank" rel="noreferrer">{snapshot.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{snapshot.number}</a></h4>
        <p>{snapshot.title}</p>
        <p><span>{prStateLabels[prState(snapshot.baseline!)]}</span> → <strong>{prStateLabels[prState(snapshot)]}</strong>{snapshot.mergedAt && <> · 合入于 {communityDate(snapshot.mergedAt)}</>}</p>
        <p className="kv-muted">代码版本 {snapshot.baseline!.headSha.slice(0,7)} → {snapshot.headSha.slice(0,7)}</p>
        {kvCommunity.stories.some(story => story.id === snapshot.id)
          ? <Link to={{search:`view=report&part=kv-update-${kvCommunity.stories.find(story => story.id === snapshot.id)!.slug}`}}>阅读本期分析</Link>
          : <p className="kv-muted">本期已核对状态和版本，机制及结果变化待补充分析。</p>}
      </article>)}</div>
      <details className="kv-report-scope"><summary>查看全部 {baselineSnapshots.length} 条回查记录</summary>
        <ul className="kv-snapshot-list">{baselineSnapshots.map(snapshot => <li key={snapshot.id}>
          <a href={snapshot.url} target="_blank" rel="noreferrer">{snapshot.repository === "vllm" ? "vLLM" : "Ascend"} #{snapshot.number}</a>
          <span>{prStateLabels[prState(snapshot)]}</span><code>{snapshot.headSha.slice(0,7)}</code>
          <span>{snapshot.headSha === snapshot.baseline!.headSha ? "版本未变" : "版本变化"}</span>
        </li>)}</ul>
      </details>
    </section>
    <section className="kv-community-archive">
      <p className="kv-direction">继续跟踪 · 前缀感知调度</p>
      <h3>原有四条调度 PR，本期没有新版本</h3>
      <p>#54625、#66361、#66558、#66705 的状态、head 与说明和 11 月 17 日一致，讨论中也未发现此后的新增记录。继续保留对缓存命中、回载、等待和公平性的判断，等待新的实现或验证证据。</p>
      <div className="kv-story-links"><Link to={{search:"view=compare"}}>阅读四条 PR 的专项分析</Link><Link to={{search:"view=report&edition=2026-11-17"}}>查看上一版观察与验证设想</Link></div>
    </section>
    <section aria-labelledby="kv-community-next"><h3 id="kv-community-next">下一轮重点跟踪</h3>
      <div className="kv-community-followups">{kvCommunity.followUps.map(item => <article key={item.title}><h4>{item.title}</h4><p>{item.body}</p>
        <div className="kv-sources">{item.ids.map(id => {const s=snapshotFor(id)!;return <a key={id} href={s.url} target="_blank" rel="noreferrer">{s.repository === "vllm" ? "vLLM" : "Ascend"} #{s.number}</a>;})}</div>
      </article>)}</div>
    </section>
    <details className="kv-report-scope"><summary>本轮其余检索线索（{remaining.length} 条，尚未逐条分析）</summary>
      <p>以下是标题关键词匹配结果，可能包含与 KV 不直接相关的工作。尚未作为本期技术判断或趋势统计的依据。</p>
      <ul className="kv-candidate-list">{remaining.map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></li>)}</ul>
    </details>
    <p className="kv-muted">本期编辑：{kvCommunity.edition}。社区 PR 状态以本期核对快照为准；后续变化在下一版报告中更新。</p>
  </article>;
}

import { Link, useSearchParams } from "react-router-dom";
import {
  baselineSnapshots, checksWithNewVersion, communityDate, evidenceCheckFor, kvCommunity, prState, prStateLabels,
  snapshotFor, stateChanges, versionChanges,
} from "./kv-community";
import { synthesisPaper, synthesisPaperLink } from "./kv-synthesis";
import "./kv-community-evidence.css";

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
      <div><dt>既有 PR 状态与 head 回查</dt><dd>{baselineSnapshots.length}</dd></div>
      <div><dt>代码版本发生变化</dt><dd>{versionChanges.length}</dd></div>
      <div><dt>本期新纳入 PR</dt><dd>{kvCommunity.newEntries.length}</dd></div>
    </dl>
    <section className="kv-scope-summary" aria-labelledby="kv-community-scope">
      <h3 id="kv-community-scope">本期取材范围：有上限的检索与精选</h3>
      <p>{kvCommunity.scopeNote}</p>
      <p><strong>55 条状态/head 回查不等于 55 条代码重审；4 条新纳入不等于社区净新增。</strong></p>
      <p>{kvCommunity.search.selectionNote}</p>
    </section>
    <details className="kv-report-scope"><summary>检索条件与核查深度</summary>
      <p>{kvCommunity.verification}</p>
      <ul>{kvCommunity.search.queries.map(item => <li key={item.query}><code>{item.query}</code> · 返回 {item.returned}/{item.limit}{item.truncated ? "（达到上限，已截断）" : ""}</li>)}</ul>
      <p>两个仓库合并检索，排序：{kvCommunity.search.sort}。查询日期条件按原查询保留；列表和时间图以 Asia/Shanghai 换算创建日。</p>
      <p>检索返回 {kvCommunity.search.returned} 条记录，去重为 {kvCommunity.search.unique} 条线索，本期选读 {kvCommunity.newEntries.length} 条新 PR。其余线索尚未逐条判断相关性或形成分析，不计入已收录 PR。</p>
      <p>网页展示已整理的报告快照。来源修订时间、状态核对日期与内容分析范围分别标明；本期不代表实时监控或完整社区覆盖。</p>
    </details>
    <section className="kv-source-check" aria-labelledby="kv-community-check">
      <h3 id="kv-community-check">{kvCommunity.evidenceReview.checkedAt} 专项补核：与本期快照分开</h3>
      <p>{kvCommunity.evidenceReview.scope}</p><p>{kvCommunity.evidenceReview.verification}</p>
      <ul>{checksWithNewVersion.map(check => <li key={check.id}>
        <a href={check.url} target="_blank" rel="noreferrer">{check.id.includes("vllm-ascend") ? "Ascend" : "vLLM"} #{check.number}</a>
        <p>{check.note}</p>
        <p>本期 <code>{check.previousHeadSha.slice(0,7)}</code> → 补核 <code>{check.headSha.slice(0,7)}</code> · <a href={check.codeUrl} target="_blank" rel="noreferrer">后续固定版本</a></p>
      </li>)}</ul>
      <Link to={{search:"view=compare&part=kv-wait-diagnosis"}}>主案例：命中后为何等待，先测什么？</Link>
    </section>
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
        const check = evidenceCheckFor(story.id);
        return <article key={story.slug} id={`kv-update-${story.slug}`} className="kv-community-story" tabIndex={-1}>
          <div className="kv-story-meta"><span>{story.change}</span><span>{snapshot.repository === "vllm" ? "vLLM" : "vLLM Ascend"} #{snapshot.number}</span><span className={`kv-pr-status ${prState(snapshot)}`}>{prStateLabels[prState(snapshot)]}</span></div>
          <h4>{story.title}</h4>
          <p className="kv-claim-range">原报告解读：{story.sourceCheckedAt} · head <code>{story.sourceVersion.slice(0,7)}</code>。以下测试与性能数字为提交方报告，本站未复现。</p>
          <dl className="kv-story-fields">
            <div><dt>发生了什么</dt><dd>{story.changeText}</dd></div>
            <div><dt>具体怎样处理</dt><dd>{story.mechanism}</dd></div>
            <div><dt>证据与边界</dt><dd>{story.evidence}</dd></div>
            <div className="kv-story-analysis"><dt>我们的分析</dt><dd>{story.analysis}</dd></div>
            <div><dt>继续跟踪</dt><dd>{story.next}</dd></div>
          </dl>
          {check && check.headSha !== story.sourceVersion && <aside className="kv-source-check" aria-label="后续版本与旧实验归属">
            <strong>{check.checkedAt} 后续版本补核</strong><p>{check.note}</p>
            <a href={check.codeUrl} target="_blank" rel="noreferrer">查看后续固定版本 {check.headSha.slice(0,7)}</a>
          </aside>}
          <div className="kv-story-links"><a href={snapshot.url} target="_blank" rel="noreferrer">原始 PR</a>
            <Link to={{search:`view=evidence&q=${snapshot.number}`}}>查看 PR 记录</Link>
            <Link to={{search:`view=survey&topic=${story.topic}`}}>相关论文方法比较</Link>
          </div>
          <div className="kv-sources">{story.claimSources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</div>
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
      <h3>原有四条调度 PR：保留本期快照，后续修订单列</h3>
      <p>11 月 23 日回查时，#54625、#66361、#66558、#66705 的状态、head 与说明和 11 月 17 日一致。11 月 24 日补核发现 #66361 新增测试修订，已在上方单列；旧实验保留原版本归属。四项机制没有联合验证。</p>
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
    <p className="kv-muted">报告期次：{kvCommunity.edition} · 表述修订与来源补核：{kvCommunity.evidenceReview.checkedAt}。社区 PR 状态以本期核对快照为准；11 月 24 日定向补核单列展示，没有覆盖或重算本期统计。</p>
  </article>;
}

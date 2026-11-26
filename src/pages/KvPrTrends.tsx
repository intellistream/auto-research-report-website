import { kvCommunity } from "./kv-community";
import { trendDays, trendStats as stats, trendTopics, trendWindow } from "./kv-trends";
import "./kv-trends.css";

export default function KvPrTrends() {
  const chartMax = Math.max(1, ...trendDays.flatMap(day => [day.created, day.merged]));
  const movement = trendTopics.find(topic => topic.id === "movement")!;
  const lifecycle = trendTopics.find(topic => topic.id === "lifecycle")!;
  const leadingShare = (100 * (movement.count + lifecycle.count) / Math.max(1, stats.total)).toFixed(1);

  return <article className="kv-trends" aria-label="KV Cache PR 趋势分析">
    <header className="kv-trend-hero">
      <div className="kv-trend-eyebrow">
        <span>社区 PR 趋势分析</span>
        <p>观察窗口 {trendWindow.start} 至 {trendWindow.end} · 状态快照 {kvCommunity.edition}</p>
      </div>
      <h2>KV 缓存 PR 主要集中在数据传输与生命周期管理</h2>
      <p className="kv-trend-lead">已收录的 {stats.total} 条 PR 中，放置与传输 {movement.count} 条、容量与生命周期 {lifecycle.count} 条，
        合计占 {leadingShare}%。本期新纳入的 {stats.added} 条也集中在这两个方向，分别为 {movement.added} 条和 {lifecycle.added} 条：
        关注点包括跨层与跨实例的数据交接、异步读取期间的块保护，以及外部缓存对象的容量分配。
        窗口内 {stats.merged} 条合入均属于放置与传输方向。其余方向本轮没有新纳入材料，不能据此判断社区活跃度下降。</p>
      <p className="kv-trend-scope-note">基于精选样本观察，不代表全社区趋势；head 变化只表示代码版本不同，不等于已确认的机制改进。</p>
      <details className="kv-trend-scope">
        <summary>数据统计口径与覆盖范围</summary>
        <div>
          <p>{stats.baseline} 条基线 + {stats.added} 条新纳入，按仓库与 PR 编号去重。方向分布只计主分类，每条 PR 计一次；论文与未审阅候选不计入。</p>
          <p>{kvCommunity.scopeNote} {kvCommunity.search.selectionNote}</p>
          <p>创建与合入事件分别取 createdAt / mergedAt，统一按 Asia/Shanghai（上海时区）划日。两类事件分别计数，同一条 PR 可以出现在两类事件中；updatedAt 不用于判定机制变化。</p>
          <p>{kvCommunity.baselineDate} → {kvCommunity.edition} 的 head 对比只覆盖既有 {stats.baseline} 条，不能把状态回查当作逐条代码重审。
            {kvCommunity.evidenceReview.checkedAt} 仅对 {kvCommunity.evidenceReview.checks.length} 项材料专项来源补核，未全量刷新状态或重新检索。</p>
        </div>
      </details>
      <dl className="kv-trend-kpis">
        <div><dt>纳入分析的工程 PR</dt><dd><strong>{stats.total}</strong><span>vLLM {stats.vllm} · Ascend {stats.ascend}<br />本期精选新纳入 {stats.added} 条</span></dd></div>
        <div><dt>观察窗口内合入</dt><dd><strong>{stats.merged}</strong><span>{trendWindow.start.slice(5)} 至 {trendWindow.end.slice(5)}<br />按上海时区的合入日统计</span></dd></div>
        <div><dt>基线 PR 代码版本变化</dt><dd><strong>{stats.changed}<small> / {stats.baseline}</small></strong><span>对比两次状态 / head 快照<br />不含后续定向补核</span></dd></div>
        <div><dt>工程问题方向</dt><dd><strong>{trendTopics.length}</strong><span>放置传输与容量生命周期<br />合计 {leadingShare}% 的已收录样本</span></dd></div>
      </dl>
      <section className="kv-trend-distribution" aria-labelledby="kv-trend-distribution-title">
        <div className="kv-trend-section-top">
          <h3 id="kv-trend-distribution-title">五个工程方向分布</h3>
          <p>按主分类统计，占比以全部 {stats.total} 条已收录 PR 为分母。</p>
        </div>
        <div className="kv-trend-segments" aria-hidden="true">
          {trendTopics.map(topic => <span key={topic.id} data-direction={topic.id} style={{ flex: topic.count }}>
            <span>{topic.share.toFixed(1)}%</span>
          </span>)}
        </div>
        <ul className="kv-trend-topic-cards">
          {trendTopics.map(topic => <li key={topic.id} className="kv-trend-topic-card" data-direction={topic.id}>
            <span className="kv-trend-topic-name"><i />{topic.shortLabel}</span>
            <span className="kv-trend-topic-figure"><strong>{topic.share.toFixed(1)}%</strong><span>{topic.count} 条</span></span>
            <span className="kv-trend-topic-detail">vLLM {topic.vllm} · Ascend {topic.ascend}<br />本期新纳入 {topic.added} · 窗口内合入 {topic.merged}</span>
          </li>)}
        </ul>
      </section>
    </header>

    <section className="kv-trend-events" aria-labelledby="kv-trend-events-title">
      <div className="kv-trend-section-top">
        <h3 id="kv-trend-events-title">观察窗口内的创建与合入</h3>
        <p>已收录样本中新建 {stats.created} 条、合入 {stats.merged} 条；当前窗口较短，不能据此判断持续增长或下降。</p>
      </div>
      <div className="kv-trend-chart-heading"><span>{trendWindow.start} — {trendWindow.end} · 上海时区</span>
        <div><span><i className="is-created" />新建</span><span><i className="is-merged" />合入</span></div>
      </div>
      <ul className="kv-trend-chart" aria-label="按日期统计的创建与合入数量">
        {trendDays.map(day => <li key={day.day} aria-label={day.day + "：新建 " + day.created + " 条，合入 " + day.merged + " 条"}>
          <span className="kv-trend-bar-pair" aria-hidden="true">
            <span className="kv-trend-bar-column"><span>{day.created}</span><i className="is-created" style={{ height: 72 * day.created / chartMax + "px" }} /></span>
            <span className="kv-trend-bar-column"><span>{day.merged}</span><i className="is-merged" style={{ height: 72 * day.merged / chartMax + "px" }} /></span>
          </span>
          <time dateTime={day.day}>{day.day.slice(8)} 日</time>
        </li>)}
      </ul>
      <p className="kv-trend-event-note">零值仅表示已收录样本中没有该日事件。两次快照之间的 head 变化无法定位到具体一天，未计入事件图。</p>
    </section>
  </article>;
}

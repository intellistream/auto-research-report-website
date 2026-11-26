import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { safeTopicSource } from "./topic-report";
import { readingSurvey, surveyReportLink, validatedSurvey, type PlatformExample } from "./topic-survey";
import "./aclgraph-survey-map.css";

type SurveyWork = { label: string; reference: number; context?: string };
type SurveyScenario = {
  id: string; title: string; paperSection: string; paperAnchor: string;
  workload: string; dynamicity: string; impact: string; strategy: string; works: SurveyWork[];
};

const nonemptyText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

function validWork(value: unknown): value is SurveyWork {
  if (!value || typeof value !== "object") return false;
  const work = value as Partial<SurveyWork>;
  return nonemptyText(work.label) && typeof work.reference === "number"
    && Number.isInteger(work.reference) && work.reference > 0 && work.reference <= 74
    && (work.context === undefined || nonemptyText(work.context));
}

function validScenarios(value: unknown): value is SurveyScenario[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!value.every((item): item is SurveyScenario => item && typeof item === "object"
    && [item.id, item.title, item.workload, item.dynamicity, item.impact, item.strategy].every(nonemptyText)
    && typeof item.paperSection === "string" && /^3\.[1-4]$/.test(item.paperSection)
    && item.paperAnchor === `section-${item.paperSection.replaceAll(".", "-")}`
    && Array.isArray(item.works) && item.works.length > 0
    && item.works.every((work: unknown) => validWork(work) && nonemptyText(work.context)))) return false;
  const references = value.flatMap((item) => item.works.map((work) => work.reference));
  return new Set(value.map((item) => item.id)).size === value.length
    && new Set(references).size === references.length;
}

function WorkCitations({ works, htmlHref, showContext = false }: { works: SurveyWork[]; htmlHref: string; showContext?: boolean }) {
  return <>{works.map((work, index) => <span className="acl-taxonomy-work" key={`${work.reference}-${work.label}`}>
    {index > 0 && !showContext && "；"}{work.label} <a className="acl-taxonomy-citation" href={`${htmlHref}#ref-${work.reference}`} target="_blank" rel="noreferrer" aria-label={`${work.label}，参考文献 ${work.reference}`}>[{work.reference}]</a>
    {showContext && <small className="acl-scenario-work-context">{work.context}</small>}
  </span>)}</>;
}

function ExampleCell({ platform, example }: { platform: string; example: PlatformExample }) {
  return <div className="acl-taxonomy-example">
    <span className="acl-platform-label">{platform}</span>
    {typeof example === "string" ? example : <>
      <div className="acl-example-works">{example.works.map((work) =>
        <a key={work.url} href={safeTopicSource(work.url)} target="_blank" rel="noreferrer">{work.label}</a>
      )}</div>
      <div className="acl-example-detail">{example.detail}</div>
    </>}
  </div>;
}

export default function AclGraphSurveyMap({ topic, htmlHref, revealSection, showTaxonomy }: {
  topic: Topic;
  htmlHref: string;
  revealSection: (id: string) => boolean;
  showTaxonomy: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const survey = readingSurvey(topic);
  const report = topic.report;
  if (!survey || !report || !survey.routes.length) return null;
  const selectedIndex = Math.min(selected, survey.routes.length - 1);
  const route = survey.routes[selectedIndex];
  const gaps = report.gaps.filter((item) => route.gapIds.includes(item.id));
  const checked = validatedSurvey(topic);
  const paperAnchor = checked?.paperVersion === topic.academicPaper?.version ? route.paperAnchor : undefined;
  const scenarioData = (survey as { scenarios?: unknown }).scenarios;
  const scenarios = checked && checked.paperVersion === topic.academicPaper?.version && validScenarios(scenarioData)
    ? scenarioData : undefined;
  const scenarioTitle = scenarios
    ? `视角一：推理负载的动态性与图适配（${scenarios.length} 类变化 · ${scenarios.flatMap((item) => item.works).length} 项相关工作）`
    : "";
  const hasSubcategories = survey.routes.every((item) => item.subcategories?.length
    && item.subcategories.every((subcategory) => subcategory.works.every(validWork))
    && typeof item.paperAnchor === "string" && /^section-\d+(?:-\d+)*$/.test(item.paperAnchor));

  const engineeringDetails = <>
      <p className="acl-survey-version">依据动态报告修订 {report.revision} · 证据截至 {report.asOf}{!checked && " · 本版按正文组织，简明导读待复核"}</p>
      <div className="acl-survey-map-grid">
        <ul className="acl-survey-route-list">
          {survey.routes.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-pressed={selectedIndex === index} aria-controls="acl-survey-route" onClick={() => setSelected(index)}>
                <strong>{item.title}</strong><span>{item.problem}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="acl-survey-route" id="acl-survey-route" aria-labelledby="acl-survey-route-heading">
          <h4 id="acl-survey-route-heading">{route.title}</h4>
          <p className="acl-survey-label">已有做法</p>
          <ol className="acl-survey-flow" aria-label="机制流程" style={{ "--flow-columns": Math.min(route.mechanism.length, 3) } as CSSProperties}>
            {route.mechanism.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <div className="acl-survey-assessment"><span className="acl-survey-label">证据支持到哪里</span><p>{route.assessment}</p></div>
          <details key={route.id} className="acl-survey-boundary">
            <summary>局限、验证方案与来源</summary>
            <p>{route.limitation}</p>
            {gaps.map((gap) => <div key={gap.id} className="acl-survey-research">
              <span className="acl-survey-label">待验证</span><p>{gap.question}</p>
              <Link to={surveyReportLink(topic.id, `survey-gap-${gap.id}`)}>查看判别方案 →</Link>
            </div>)}
            <div className="acl-survey-evidence-links">{route.evidenceIds.map((id) => {
              const item = report.evidenceDetails?.find((entry) => entry.id === id);
              return item ? <Link key={id} to={surveyReportLink(topic.id, `survey-evidence-${id}`)}>{item.comparison} →</Link> : null;
            })}</div>
            <ul className="acl-survey-sources">{route.sourceIds.map((id) => {
              const source = report.references.find((item) => item.id === id);
              if (!source) return null;
              const href = safeTopicSource(source.url);
              return <li key={id}>{href ? <a href={href} target="_blank" rel="noreferrer">{source.title}</a> : source.title}<small>{source.evidenceLevel}</small></li>;
            })}</ul>
          </details>
          {paperAnchor && <a className="acl-survey-section-link" href={`${htmlHref}#${encodeURIComponent(paperAnchor)}`} target="_blank" rel="noreferrer" onClick={(event) => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            if (revealSection(paperAnchor)) event.preventDefault();
          }}>读正文第 {route.paperSection} 节 <span aria-hidden="true">→</span></a>}
          {!paperAnchor && <Link className="acl-survey-section-link" to={surveyReportLink(topic.id, "survey-taxonomy")}>阅读本版技术路线与权衡 →</Link>}
        </div>
      </div>
  </>;

  return <section className="acl-survey-map" aria-labelledby="acl-survey-map-heading">
    {showTaxonomy ? <>
      <figure className="acl-taxonomy">
        <figcaption>
          <h3 id="acl-survey-map-heading">ACLGraph 综述研究版图总览</h3>
          <p className="acl-taxonomy-subtitle" id="acl-taxonomy-subtitle">从负载变化追踪执行图的适配需求，再按系统机制查阅实现。章节与参考文献链接对应当前原稿；全篇收录 74 项文献来源。</p>
        </figcaption>
        {scenarios && <section className="acl-taxonomy-view acl-taxonomy-scenarios" aria-labelledby="acl-taxonomy-scenarios-heading">
          <header className="acl-taxonomy-view-header">
            <span className="acl-taxonomy-view-label" aria-hidden="true">视角一 · 负载动态性</span>
            <h4 id="acl-taxonomy-scenarios-heading">{scenarioTitle}</h4>
            <p className="acl-taxonomy-view-note" id="acl-scenario-note">按主要变化来源组织，各类可同时出现。图适配思路为综述归纳；末列注明各项工作的研究对象。</p>
          </header>
          <div className="acl-taxonomy-table-scroll" role="region" aria-label="典型推理场景表，可横向滚动" tabIndex={0}>
            <table className="acl-taxonomy-table" aria-labelledby="acl-taxonomy-scenarios-heading" aria-describedby="acl-scenario-note">
              <colgroup><col className="acl-taxonomy-major" /><col className="acl-taxonomy-minor" /><col className="acl-scenario-impact" /><col className="acl-scenario-adaptation" /><col /></colgroup>
              <thead><tr><th scope="col">变化维度与典型负载</th><th scope="col">动态性来源</th><th scope="col">对执行图的影响</th><th scope="col">图适配思路</th><th scope="col">相关工作及研究对象</th></tr></thead>
              <tbody>{scenarios.map((item) => <tr key={item.id}>
                <th scope="row">
                  <strong>{item.title}</strong>
                  <span className="acl-scenario-workload">{item.workload}</span>
                  <a href={`${htmlHref}#${item.paperAnchor}`} target="_blank" rel="noreferrer" onClick={(event) => {
                    if (!event.button && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && revealSection(item.paperAnchor)) event.preventDefault();
                  }}><span className="acl-taxonomy-section">参阅原稿第 {item.paperSection} 节</span></a>
                </th>
                <td className="acl-scenario-strategy"><p>{item.dynamicity}</p></td>
                <td className="acl-scenario-strategy"><p>{item.impact}</p></td>
                <td className="acl-scenario-strategy"><p>{item.strategy}</p></td>
                <td className="acl-scenario-works"><WorkCitations works={item.works} htmlHref={htmlHref} showContext /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>}
        {hasSubcategories ? <section className="acl-taxonomy-view acl-taxonomy-mechanisms" aria-labelledby="acl-taxonomy-mechanisms-heading">
          <header className="acl-taxonomy-view-header">
            <span className="acl-taxonomy-view-label" aria-hidden="true">视角二 · 系统原语</span>
            <h4 id="acl-taxonomy-mechanisms-heading">视角二：通用执行图系统核心机制版图（第 4 章 · 4 大机制 · 33 项代表工作）</h4>
          </header>
          <div className="acl-taxonomy-table-scroll" role="region" aria-label="核心系统机制表，可横向滚动" tabIndex={0}>
            <table className="acl-taxonomy-table" aria-labelledby="acl-taxonomy-mechanisms-heading" aria-describedby="acl-taxonomy-subtitle">
              <colgroup><col className="acl-taxonomy-major" /><col className="acl-taxonomy-minor" /><col /></colgroup>
              <thead><tr><th scope="col">核心系统机制（正文章节）</th><th scope="col">细粒度机制分组（10 组）</th><th scope="col">代表系统工作（33 项，点击编号直达参考文献）</th></tr></thead>
              {survey.routes.map((item) => <tbody key={item.id}>
                {item.subcategories!.map((subcategory, index) => <tr key={subcategory.title}>
                  {index === 0 && <th scope="rowgroup" rowSpan={item.subcategories!.length}>
                    <a href={`${htmlHref}#${encodeURIComponent(item.paperAnchor!)}`} target="_blank" rel="noreferrer" onClick={(event) => {
                      if (!event.button && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && revealSection(item.paperAnchor!)) event.preventDefault();
                    }}>{item.title}<span className="acl-taxonomy-section">第 {item.paperSection} 节</span></a>
                  </th>}
                  <th scope="row">{subcategory.title}</th>
                  <td><WorkCitations works={subcategory.works} htmlHref={htmlHref} /></td>
                </tr>)}
              </tbody>)}
            </table>
          </div>
        </section> : <>
        <div className="acl-taxonomy-columns" aria-hidden="true"><span>类别与判据</span><span>昇腾直接工作</span><span>可借鉴的 GPU 工作</span></div>
        <ol className="acl-taxonomy-branches">{survey.routes.map((item) =>
          <li key={item.id}>
            <a href={htmlHref + "#" + encodeURIComponent(item.paperAnchor!)} target="_blank" rel="noreferrer" onClick={(event) => {
              if (!event.button && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && revealSection(item.paperAnchor!)) event.preventDefault();
            }}><strong>{item.title}</strong><span>{item.problem}</span></a>
            <ExampleCell platform="昇腾直接工作" example={item.examples?.ascend ?? "昇腾接口映射及适用条件待核验。"} />
            <ExampleCell platform="可借鉴的 GPU 工作" example={item.examples?.gpu ?? "代表工作与迁移条件待补充。"} />
          </li>
        )}</ol>
        </>}
      </figure>
      <details className="acl-taxonomy-evidence"><summary>分章查看工程证据与待验证问题</summary>{engineeringDetails}</details>
    </> : <>
      <h3 id="acl-survey-map-heading">技术路线与待验证问题</h3>
      <p className="acl-survey-thesis">{survey.thesis}</p>
      {engineeringDetails}
    </>}
  </section>;
}

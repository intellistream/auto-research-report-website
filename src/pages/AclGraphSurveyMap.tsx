import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Topic } from "./TopicPages";
import { safeTopicSource } from "./topic-report";
import { readingSurvey, surveyReportLink, validatedSurvey, type PlatformExample } from "./topic-survey";
import "./aclgraph-survey-map.css";

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
          <h3 id="acl-survey-map-heading">ACLGraph 技术分类总图</h3>
        </figcaption>
        <div className="acl-taxonomy-columns" aria-hidden="true"><span>类别与判据</span><span>昇腾直接工作</span><span>可借鉴的 GPU 工作</span></div>
        <ol className="acl-taxonomy-branches">{survey.routes.map((item) =>
          <li key={item.id}>
            <a href={htmlHref + "#" + encodeURIComponent(item.paperAnchor!)} target="_blank" rel="noreferrer" onClick={(event) => {
              if (!event.button && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && revealSection(item.paperAnchor!)) event.preventDefault();
            }}><strong>{item.title}</strong><span>{item.problem}</span></a>
            <ExampleCell platform="昇腾直接工作" example={item.examples!.ascend} />
            <ExampleCell platform="可借鉴的 GPU 工作" example={item.examples!.gpu} />
          </li>
        )}</ol>
      </figure>
      <details className="acl-taxonomy-evidence"><summary>分章查看工程证据与待验证问题</summary>{engineeringDetails}</details>
    </> : <>
      <h3 id="acl-survey-map-heading">技术路线与待验证问题</h3>
      <p className="acl-survey-thesis">{survey.thesis}</p>
      {engineeringDetails}
    </>}
  </section>;
}

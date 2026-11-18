import { useState } from "react";
import "./aclgraph-survey-map.css";

// The summaries and section IDs below describe this frozen manuscript.
export const aclGraphSurveyVersion = "c2e049495b12bf5dec36e89bedcabdf9c9f9324c2674cdf42aa557360985db75";

const routes = [
  {
    name: "更新回放状态",
    problem: "换了请求，图仍需读取本轮状态",
    steps: ["准备本轮参数", "更新参数并记录事件", "图内任务等待后读取"],
    examples: "CANN 任务组更新、vLLM Ascend、SGLang",
    question: "换请求、复用槽位或切回即时执行时，怎样低开销地发现过期状态？",
    section: "7.1",
    anchor: "可组合的状态有效性契约",
  },
  {
    name: "分桶与图族管理",
    problem: "输入形状变化，填充和持图都占资源",
    steps: ["划分输入形状桶", "捕获常用规格", "回放匹配图或回退"],
    examples: "vLLM、xLLM、Hybrid JIT",
    question: "请求分布变化后，如何在同等显存预算下决定建哪些图、留哪些图？",
    section: "7.2",
    anchor: "图族维护与资源调度的联合选择",
  },
  {
    name: "生成与共享元数据",
    problem: "逐层重复准备注意力元数据",
    steps: ["生成长度与布局计划", "放入设备工作区", "兼容的层读取同一计划"],
    examples: "FlashInfer 的 plan/run，另见 Ascend #21281、#21259 的设备生产路径",
    question: "层间布局或工作区不同时，哪些计划字段仍可共享？共享能缩短多少关键路径？",
    section: "7.3",
    anchor: "计划生成位置与跨消费者共享",
  },
  {
    name: "跨算子资源调度",
    problem: "计算、访存和通信互相等待",
    steps: ["拆分批次与算子阶段", "分配资源和执行顺序", "重叠可并行的工作"],
    examples: "NanoFlow 的跨算子流水，POD-Attention 的算子内资源分配",
    question: "图切换和工作区共享都受限时，联合调度还能缩短哪些等待？",
    section: "7.4",
    anchor: "跨图与多算子的资源和状态约束",
  },
  {
    name: "恢复已捕获的图",
    problem: "重启时重复捕获，延长服务准备时间",
    steps: ["归档图和所需环境信息", "恢复地址与算子绑定", "复用兼容的图资产"],
    examples: "Medusa 的绑定恢复，Foundry 的执行环境重建",
    question: "只改变算子二进制或预留容量时，哪些图资产仍可安全复用？",
    section: "7.5",
    anchor: "恢复兼容性与部分失效处理",
  },
] as const;

export default function AclGraphSurveyMap({ htmlHref, revealSection }: {
  htmlHref: string;
  revealSection: (id: string) => boolean;
}) {
  const [selected, setSelected] = useState(0);
  const route = routes[selected];

  return (
    <section className="acl-survey-map" aria-labelledby="acl-survey-map-heading">
      <h3 id="acl-survey-map-heading">技术路线与待验证问题</h3>
      <div className="acl-survey-map-grid">
        <ul className="acl-survey-route-list">
          {routes.map((item, index) => (
            <li key={item.anchor}>
              <button
                type="button"
                aria-pressed={selected === index}
                aria-controls="acl-survey-route"
                onClick={() => setSelected(index)}
              >
                <strong>{item.name}</strong>
                <span>{item.problem}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="acl-survey-route" id="acl-survey-route" aria-labelledby="acl-survey-route-heading">
          <h4 id="acl-survey-route-heading">{route.name}</h4>
          <p className="acl-survey-label">已有做法</p>
          <ol className="acl-survey-flow" aria-label="机制流程">
            {route.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="acl-survey-examples">{route.examples}</p>
          <div className="acl-survey-research">
            <span className="acl-survey-label">待验证</span>
            <p>{route.question}</p>
          </div>
          <a
            className="acl-survey-section-link"
            href={`${htmlHref}#${encodeURIComponent(route.anchor)}`}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              if (revealSection(route.anchor)) event.preventDefault();
            }}
          >读正文第 {route.section} 节 <span aria-hidden="true">→</span></a>
        </div>
      </div>
    </section>
  );
}

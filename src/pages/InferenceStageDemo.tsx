import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, Database, Layers, Pause, Play, RotateCcw, X } from "lucide-react";
import { inferenceDemos, type DemoStage, type DemoCell } from "./inference-demo-data";
import "./inference-demo.css";

const stateLabels = { pending: "待就绪", ready: "已有", active: "本步处理", accepted: "已确认", rejected: "不采用", released: "已释放占用", moved: "已进入执行" };

export default function InferenceStageDemo({ stage, onSelect }: { stage: DemoStage; onSelect?: (stage: DemoStage) => void }) {
  const scenario = inferenceDemos[stage];
  const [step, setStep] = useState(0);
  const [playback, setPlayback] = useState<"idle" | "playing" | "paused" | "complete">("idle");
  const [run, setRun] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const timeline = useRef({ key: "", remaining: 0 });
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const last = scenario.steps.length - 1;
  const frame = scenario.steps[step];
  const playing = playback === "playing";

  useEffect(() => {
    if (!playing) return;
    const key = `${run}:${step}`;
    if (timeline.current.key !== key) timeline.current = { key, remaining: frame.duration };
    const clock = timeline.current;
    const started = performance.now();
    const timer = window.setTimeout(() => {
      if (step === last) setPlayback("complete");
      else setStep(step + 1);
    }, clock.remaining);
    return () => {
      window.clearTimeout(timer);
      clock.remaining = Math.max(0, clock.remaining - (performance.now() - started));
    };
  }, [frame.duration, last, playing, run, step]);

  useEffect(() => {
    const pause = () => setPlayback(current => current === "playing" ? "paused" : current);
    const hidden = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", hidden);
    // A demonstration should not finish while the reader is elsewhere on the page.
    const observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", hidden); };
  }, []);

  function chooseStep(index: number) {
    setPlayback("idle");
    setStep(index);
    setRun(current => current + 1);
  }

  function replay() {
    setStep(0);
    setRun(current => current + 1);
    setPlayback("playing");
  }

  function togglePlayback() {
    if (playing) setPlayback("paused");
    else if (playback === "paused") setPlayback("playing");
    else if (step === last) replay();
    else { setRun(current => current + 1); setPlayback("playing"); }
  }

  function renderCell(cell: DemoCell | undefined, index: number, lane: number) {
    const previous = scenario.steps[Math.max(0, step - 1)].rows[lane].cells.find(item => item.id === cell?.id);
    const changed = !!cell && (step === 0 || !previous || previous.state === "pending" || previous.text !== cell.text
      || (cell.state !== "ready" && previous.state !== cell.state));
    const parallel = stage === "prefill" && step === 1;
    return <span key={index} className="flow-demo-slot">
      <span key={`${run}:${cell?.id}:${cell?.state}`} className="flow-demo-cell"
        role={cell ? "img" : undefined}
        data-state={cell?.state ?? "empty"} data-enter={changed && cell?.state !== "pending" ? "true" : undefined}
        style={{ "--cell-delay": `${parallel ? lane * 60 : (stage === "output_return" ? lane * 160 : 0) + index * 50}ms` } as CSSProperties}
        aria-label={cell ? `${cell.state === "pending" ? "" : cell.text + "，"}${stateLabels[cell.state]}` : undefined}
        aria-hidden={!cell ? true : undefined}>
        {cell?.state === "accepted" && <Check size={13} aria-hidden />}
        {cell?.state === "rejected" && <X size={13} aria-hidden />}
        <span>{cell?.state === "pending" ? "—" : cell?.text ?? "\u00a0"}</span>
      </span>
    </span>;
  }

  return <div className="flow-demo" ref={root} data-stage={stage} data-playback={playback}
    style={{ "--step-duration": `${frame.duration}ms` } as CSSProperties}>
    <p className="flow-demo-context">{scenario.context}</p>
    <div className="flow-demo-steps" role="group" aria-label="演示步骤">
      {scenario.steps.map((item, index) => <button key={item.title} type="button" aria-current={index === step ? "step" : undefined}
        aria-controls={id + "-scene"} onClick={() => chooseStep(index)} data-state={index === step ? "active" : index < step ? "done" : "pending"}>
        <span className="flow-demo-number">{index < step ? <Check size={14} aria-label="已查看" /> : index + 1}</span>
        <span>{item.title}</span>
        <span className="flow-demo-progress" aria-hidden><i key={`${run}:${index === step}`} /></span>
      </button>)}
    </div>
    <div id={id + "-scene"} className="flow-demo-scene" role="group" aria-label={frame.title}>
      <div className="flow-demo-board">
        {scenario.lanes.map((label, lane) => {
          const slots = Math.max(...scenario.steps.map(item => item.rows[lane].cells.length));
          const Icon = label.includes("KV") || label.includes("缓存") ? Database : Layers;
          return <div className="flow-demo-lane" key={label}>
            <div className="flow-demo-lane-heading"><Icon size={16} aria-hidden /><strong>{label}</strong></div>
            <div className="flow-demo-cells" style={{ "--slots": slots } as CSSProperties}>
              {Array.from({ length: slots }, (_, index) => renderCell(frame.rows[lane].cells[index], index, lane))}
            </div>
            <span className="flow-demo-lane-status">{frame.rows[lane].status}</span>
            {lane < 2 && <ArrowRight className="flow-demo-connector" size={18} aria-hidden />}
          </div>;
        })}
      </div>
    </div>
    <div className="flow-demo-controls">
      <button type="button" className="flow-demo-play" onClick={togglePlayback}>
        {playing ? <Pause size={15} aria-hidden /> : step === last && playback !== "paused" ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
        {playing ? "暂停" : playback === "paused" ? "继续" : step === last ? "重播" : "播放"}
      </button>
      <div className="flow-demo-seek">
        <button type="button" aria-label="上一步" title="上一步" disabled={step === 0} onClick={() => chooseStep(step - 1)}><ArrowLeft size={15} aria-hidden /></button>
        <button type="button" aria-label="下一步" title="下一步" disabled={step === last} onClick={() => chooseStep(step + 1)}><ArrowRight size={15} aria-hidden /></button>
      </div>
      <span className="flow-demo-position" role="status">{step + 1} / {scenario.steps.length}<span className="map-v2-sr-only">，{frame.title}，{playing ? "播放中" : playback === "paused" ? "已暂停" : playback === "complete" ? "播放完毕" : "逐步阅读"}</span></span>
      <button type="button" className="flow-demo-explain" aria-expanded={expanded} aria-controls={id + "-details"} onClick={() => {
        setExpanded(current => !current);
        if (!expanded) setPlayback(current => current === "playing" ? "paused" : current);
      }}>{expanded ? "收起说明" : "原理说明"}</button>
    </div>
    <section className="flow-demo-note" id={id + "-details"} hidden={!expanded} aria-label="原理说明"><p>{scenario.purpose}</p>
      <ol>{scenario.steps.map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.explanation}</p></li>)}</ol>
      <p>{scenario.result}</p><p>{scenario.note}</p><p>动画仅为流程示意。<a href={scenario.reference.url} target="_blank" rel="noreferrer">{scenario.reference.label} ↗</a></p>
      {onSelect && <button type="button" onClick={() => onSelect(scenario.next.stage)}>{scenario.next.action ?? "继续看"}：{scenario.next.label}<ArrowRight size={15} aria-hidden /></button>}
    </section>
  </div>;
}

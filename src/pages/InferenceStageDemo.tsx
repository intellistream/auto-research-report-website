import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Check, Pause, Play, RotateCcw, X } from "lucide-react";
import { inferenceDemos, type DemoStage, type DemoCell } from "./inference-demo-data";
import "./inference-demo.css";

const stateLabels = { pending: "待就绪", ready: "已有", active: "本步处理", accepted: "已确认", rejected: "不采用", released: "已释放占用", moved: "已进入执行" };

export default function InferenceStageDemo({ stage, onSelect }: { stage: DemoStage; onSelect?: (stage: DemoStage) => void }) {
  const scenario = inferenceDemos[stage];
  const [step, setStep] = useState(0);
  const [playback, setPlayback] = useState<"idle" | "playing" | "paused" | "complete">("idle");
  const [run, setRun] = useState(0);
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
        style={{ "--cell-delay": `${parallel ? lane * 100 : (stage === "output_return" ? lane * 320 : 0) + index * 90}ms` } as CSSProperties}
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
    <div className="flow-demo-intro"><span>{scenario.context}</span><p>{scenario.purpose}</p></div>
    <div className="flow-demo-steps" role="group" aria-label="演示步骤">
      {scenario.steps.map((item, index) => <button key={item.title} type="button" aria-current={index === step ? "step" : undefined}
        aria-controls={id + "-scene"} onClick={() => chooseStep(index)} data-state={index === step ? "active" : index < step ? "done" : "pending"}>
        <span className="flow-demo-number">{index < step ? <Check size={14} aria-label="已查看" /> : index + 1}</span>
        <span>{item.title}</span>
        <span className="flow-demo-progress" aria-hidden><i key={`${run}:${index === step}`} /></span>
      </button>)}
    </div>
    <div id={id + "-scene"} className="flow-demo-scene" role="group" aria-label={frame.title}>
      <div className="flow-demo-narration">
        {scenario.steps.map((item, index) => <p key={item.title} aria-hidden={index !== step ? true : undefined} data-visible={index === step}>
          <span>第 {index + 1} 步</span>{item.explanation}
        </p>)}
      </div>
      <div className="flow-demo-board">
        {scenario.lanes.map((label, lane) => {
          const slots = Math.max(...scenario.steps.map(item => item.rows[lane].cells.length));
          return <div className="flow-demo-lane" key={label}>
            <div className="flow-demo-lane-heading"><strong>{label}</strong><span>{frame.rows[lane].status}</span></div>
            <div className="flow-demo-cells" style={{ "--slots": slots } as CSSProperties}>
              {Array.from({ length: slots }, (_, index) => renderCell(frame.rows[lane].cells[index], index, lane))}
            </div>
          </div>;
        })}
      </div>
      <div className="flow-demo-legend" role="group" aria-label="图示说明"><span><i data-kind="existing" />已有内容</span><span><i data-kind="changing" />本步变化</span><span>虚线格：尚未就绪</span></div>
    </div>
    <div className="flow-demo-controls">
      <button type="button" className="flow-demo-play" onClick={togglePlayback}>
        {playing ? <Pause size={15} aria-hidden /> : step === last && playback !== "paused" ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
        {playing ? "暂停" : playback === "paused" ? "继续播放" : step === last ? "重播讲解" : "播放讲解"}
      </button>
      <div className="flow-demo-seek">
        <button type="button" disabled={step === 0} onClick={() => chooseStep(step - 1)}><ArrowLeft size={15} aria-hidden />上一步</button>
        <button type="button" disabled={step === last} onClick={() => chooseStep(step + 1)}>下一步<ArrowRight size={15} aria-hidden /></button>
      </div>
      <button type="button" className="flow-demo-restart" onClick={replay} aria-label="从头播放讲解" title="从头播放"><RotateCcw size={16} aria-hidden /></button>
      <span className="flow-demo-position" role="status">{step + 1} / {scenario.steps.length} · {playing ? "播放中" : playback === "paused" ? "已暂停" : playback === "complete" ? "播放完毕" : "逐步阅读"}<span className="map-v2-sr-only">，{frame.title}</span></span>
    </div>
    <div className="flow-demo-takeaway"><div><span>结果与去向</span><p>{scenario.result}</p></div>
      {onSelect && <button type="button" onClick={() => onSelect(scenario.next.stage)}>{scenario.next.action ?? "继续看"}：{scenario.next.label}<ArrowRight size={15} aria-hidden /></button>}
    </div>
    <details className="flow-demo-note"><summary>示意说明与技术依据</summary><p>{scenario.note}</p><p>动画按阅读节奏播放，不表示实际耗时。<a href={scenario.reference.url} target="_blank" rel="noreferrer">{scenario.reference.label} ↗</a></p></details>
  </div>;
}

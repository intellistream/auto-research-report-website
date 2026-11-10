import { useEffect, useState } from "react";
import {
  ArrowDownToLine, ArrowRight, ArrowUpRight, Check, CircleCheck, Cpu, Database, HardDrive,
  Layers, ListOrdered, MessageSquare, Pause, Play, Recycle, RotateCcw, Send, Sparkles, X,
  type LucideIcon,
} from "lucide-react";

type Token = string | { text: string; result: "keep" | "drop" };
type Frame = { label: string; icon: LucideIcon; tokens: Token[] };

const examples = {
  startup: [
    { label: "读取模型权重", icon: HardDrive, tokens: ["权重 ①", "权重 ②", "权重 ③"] },
    { label: "装入 GPU 显存", icon: Cpu, tokens: ["GPU 0 · 权重 ①②", "GPU 1 · 权重 ③"] },
    { label: "服务就绪", icon: CircleCheck, tokens: ["开始接收请求"] },
  ],
  scheduling: [
    { label: "请求进入队列", icon: ListOrdered, tokens: ["请求 A", "请求 B", "请求 C"] },
    { label: "从队列组成一批", icon: Layers, tokens: ["本批：A + B", "仍排队：C"] },
    { label: "把批次交给 GPU", icon: Cpu, tokens: ["GPU 批次：A + B"] },
  ],
  prefill: [
    { label: "把输入切成 token", icon: Layers, tokens: ["写", "一", "首", "诗"] },
    { label: "GPU 并行处理输入", icon: Cpu, tokens: ["位置 1", "位置 2", "位置 3", "位置 4"] },
    { label: "保存每个位置的 KV", icon: Database, tokens: ["KV₁", "KV₂", "KV₃", "KV₄"] },
  ],
  pd_transfer: [
    { label: "Prefill 节点生成 KV", icon: Database, tokens: ["Prefill · KV₁", "Prefill · KV₂"] },
    { label: "把 KV 发给 Decode 节点", icon: Send, tokens: ["KV₁ →", "KV₂ →"] },
    { label: "Decode 节点读取 KV", icon: ArrowDownToLine, tokens: ["Decode · KV₁", "Decode · KV₂"] },
  ],
  decode: [
    { label: "读取输入的 KV 缓存", icon: Database, tokens: ["KV₁", "KV₂", "KV₃", "KV₄"] },
    { label: "生成下一个 token", icon: Cpu, tokens: ["春"] },
    { label: "带着「春」继续生成", icon: RotateCcw, tokens: ["春", { text: "风", result: "keep" }] },
  ],
  speculative: [
    { label: "草稿模型提出候选", icon: Sparkles, tokens: ["春", "风", "海"] },
    { label: "主模型验证候选", icon: Cpu, tokens: [
      { text: "春", result: "keep" }, { text: "风", result: "keep" }, { text: "海", result: "drop" },
    ] },
    { label: "接受前两项，补上新 token", icon: CircleCheck, tokens: ["春", "风", { text: "入", result: "keep" }] },
  ],
  output_return: [
    { label: "服务端产生 token", icon: Cpu, tokens: ["春", "风", "入", "梦"] },
    { label: "逐段发送给客户端", icon: Send, tokens: ["春 →", "风 →", "入 →", "梦 →"] },
    { label: "客户端边收到边显示", icon: MessageSquare, tokens: ["春风入梦"] },
  ],
  resource_reclaim: [
    { label: "请求结束", icon: CircleCheck, tokens: ["请求占用的 KV", "可复用的前缀 KV"] },
    { label: "释放该请求的资源", icon: Recycle, tokens: [{ text: "请求占用", result: "drop" }, "空闲空间 ↑"] },
    { label: "保留可复用的前缀", icon: Database, tokens: [{ text: "前缀 KV", result: "keep" }, "下次命中可直接读"] },
  ],
} satisfies Record<string, [Frame, Frame, Frame]>;

export default function InferenceStageDemo({ stage }: { stage: keyof typeof examples }) {
  const frames: Frame[] = examples[stage];
  const last = frames.length - 1;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing || step === last) return;
    const timer = window.setTimeout(() => {
      setStep(step + 1);
      if (step + 1 === last) setPlaying(false);
    }, 1150);
    return () => window.clearTimeout(timer);
  }, [last, playing, step]);

  function togglePlayback() {
    if (playing) {
      setPlaying(false);
    } else {
      if (step === last) setStep(0);
      setPlaying(true);
    }
  }

  return (
    <>
      <div className="map-demo-frames" role="group" aria-label="演示步骤">
        {frames.map(({ label, icon: Icon, tokens }, index) => (
          <div className="map-demo-phase" key={label}>
            <button type="button" className="map-demo-frame" data-state={index === step ? "active" : index < step ? "done" : "pending"}
              aria-current={index === step ? "step" : undefined} onClick={() => { setPlaying(false); setStep(index); }}>
              <span className="map-demo-frame-head"><span className="map-demo-number">{index + 1}</span><strong>{label}</strong></span>
              <span className="map-demo-scene">
                <Icon size={29} strokeWidth={1.6} aria-hidden />
                {index <= step ? <span className="map-demo-tokens">
                  {tokens.map((token) => typeof token === "string"
                    ? <span className="map-demo-token" key={token}>{token}</span>
                    : <span className="map-demo-token" key={token.text} data-result={token.result}>
                      {token.result === "keep" ? <Check size={13} aria-label="保留" /> : <X size={13} aria-label="丢弃" />}
                      {token.text}
                    </span>)}
                </span> : <span className="map-demo-placeholder" aria-hidden />}
              </span>
            </button>
            {index < last && <ArrowRight className="map-demo-arrow" size={20} aria-hidden />}
          </div>
        ))}
      </div>
      <div className="map-demo-controls">
        <span className="map-v2-sr-only" role="status">第 {step + 1} 步，{frames[step].label}</span>
        <button type="button" onClick={togglePlayback}>
          {playing ? <Pause size={15} aria-hidden /> : step === last ? <RotateCcw size={15} aria-hidden /> : <Play size={15} aria-hidden />}
          {playing ? "暂停" : step === last ? "重播" : "播放演示"}
        </button>
        <button type="button" disabled={step === last} onClick={() => { setPlaying(false); setStep(step + 1); }}>
          下一步 <ArrowUpRight size={15} aria-hidden />
        </button>
      </div>
    </>
  );
}

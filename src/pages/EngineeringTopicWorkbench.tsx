import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  Check,
  Cpu,
  Database,
  GitPullRequest,
  HardDrive,
  Layers,
  Network,
  RotateCcw,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import TopicDetailLayout from "./TopicDetailLayout";
import TopicDirectoryCard from "./TopicDirectoryCard";
import { revealTopicPart } from "./topic-report";
import type { Entry, Topic } from "./TopicPages";
import "./engineering-topic.css";

const workbenchSections = [
  { id: "guide", label: "原理导引", target: "topic-visual-guide" },
  { id: "routes", label: "技术路线图", target: "topic-route-map" },
  { id: "trends", label: "演进趋势与环节分布", target: "topic-analytics" },
  { id: "evidence", label: "工程证据库", target: "topic-evidence-workbench" },
] as const;

function revealWorkbenchSection(target: string) {
  revealTopicPart(document, target, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

const communityNames: Record<Entry["repository"], string> = {
  vllm: "vLLM",
  "vllm-ascend": "vLLM Ascend",
};

const stageLabels: Record<string, string> = {
  startup: "模型准备",
  scheduling: "请求调度",
  prefill: "输入处理",
  pd_transfer: "P/D 缓存交接",
  decode: "循环生成",
  speculative: "推测解码",
  output_return: "输出返回",
  resource_reclaim: "资源回收与缓存保留",
};

type RouteSpec = {
  id: string;
  title: string;
  problem: string;
  flow: string[];
  tradeoff: string;
  keywords: string[];
};

const kvCacheRoutes: RouteSpec[] = [
  {
    id: "management",
    title: "块与容量管理",
    problem:
      "服务启动期的图捕获预热、稀疏索引分数矩阵与多进程显存占用若按静态上限预留，极易触发启动 OOM 或低估运行时真实可用块数。",
    flow: ["探测真实设备空闲预算", "捕获前按单请求收缩物理块", "运行期按预算扩展与分块计算"],
    tradeoff:
      "需区分独立未分区加速卡与共享设备场景；预热临时 KV 块必须在图固化或正式服务前按序释放。",
    keywords: ["VRAM 定容", "预热收缩", "稀疏分块预算", "按层流水写入"],
  },
  {
    id: "reuse",
    title: "前缀复用",
    problem:
      "多轮对话与 Agent 工具调用共享大量公共前缀，但混合状态模型（Mamba + Attention）、异构 TP 切分及多级缓存池破坏了传统定长块直接命中。",
    flow: ["对齐跨级前缀与状态快照边界", "调度队首按未命中词元重排", "最小公倍数分片或共享池直读"],
    tradeoff:
      "线性注意力与状态空间层必须在合法词元边界保存可恢复检查点，不能仅按常规注意力块任意截断。",
    keywords: ["Prefix Caching", "Mamba 状态快照", "异构 TP 共享", "缓存感知调度"],
  },
  {
    id: "transfer",
    title: "跨实例传输",
    problem:
      "P/D 分离部署中，逐碎块注册描述符与频繁跨节点握手会放大传输尾延迟，尤其当 Prefill 与 Decode 并行度不对称或叠加草稿模型时。",
    flow: ["兼容布局按整行合并注册", "流水线逐层异步推送/拉取", "断链优雅排空与自动重握手"],
    tradeoff:
      "两端 TP/DCP 不一致或启用推测解码时，需分别规定目标 KV 条带分片与草稿上下文副本传输策略。",
    keywords: ["NIXL", "Mooncake", "P/D 分离", "整行 RDMA/HCCS 搬运"],
  },
  {
    id: "offload",
    title: "卸载与分层存储",
    problem:
      "大容量主机内存映射与页锁定在启动时同步执行会阻塞引擎就绪；运行期仅凭访问频次淘汰又会误删高重算代价的多会话公共分叉点。",
    flow: ["统一主机映射与后台节流锁页", "融合算子顺带写回主机缓存池", "按会话演进与重算代价淘汰"],
    tradeoff:
      "后台预触页全部就绪前须门控卸载读路径；多连接器共存时需同步最小有效块数以防越界拷贝。",
    keywords: ["CPU Offload", "HugeTLB 后台锁页", "MLAPO 融合写回", "分叉感知淘汰"],
  },
  {
    id: "layout",
    title: "布局与量化",
    problem:
      "长上下文解码受限于 HBM 访存带宽，MLA 潜变量压缩、FP8/MXFP4 低比特缓存与跨 DCP 条带映射需要兼顾容量收益与算子原生步长。",
    flow: ["压缩潜变量与低精度块布局", "跨 DCP 条带求交映射块表", "对齐硬件注意力核原生头宽"],
    tradeoff:
      "紧凑存储格式依赖特定后端内核（如 FlashMLA、AITER、CANN FIA）对块大小与缩放因子的原生支持。",
    keywords: ["MLA 潜变量", "FP8 / MXFP4 KV", "DCP 条带映射", "块表对齐"],
  },
];

const speculativeRoutes: RouteSpec[] = [
  {
    id: "methods",
    title: "方法与模型适配",
    problem:
      "EAGLE-3、DeepSeek MTP、GLM DFlash、DSpark 等草稿机制在隐藏状态提取、共享词表、位置编码与并行切分上差异显著，通用路径易引入主机同步与冗余拷贝。",
    flow: ["提取目标模型多层辅助隐藏状态", "融合草稿归一化与多步连续采样", "同步 TP/DCP 预算并裁剪填充行"],
    tradeoff:
      "概率草稿采样与 LMHead 张量并行共存时，须在集合通信前补齐行并在采样前裁除冗余行，确保采样分布严格一致。",
    keywords: ["EAGLE-3", "MTP", "DFlash / DSpark", "LMHead TP 概率采样"],
  },
  {
    id: "verification",
    title: "候选生成与验证",
    problem:
      "草稿链或候选树增长后，验证阶段的可见 KV 窗口打包、残差边界归约与已接受词元状态写回若分散为碎小算子，将抵消并行验证带来的步数缩减。",
    flow: ["按本轮有效预算紧凑打包 KV 窗口", "融合验证注意力与边界规约内核", "将已接受词元并入下一轮状态回放"],
    tradeoff:
      "草稿与目标模型须对齐核块大小与精度语义以避免接受率退化；跨缓存块或请求切出执行器前必须提交回放检查点。",
    keywords: ["FlashMLA 窗口验证", "拒绝采样对齐", "延迟状态回放", "多步草稿图"],
  },
  {
    id: "runtime",
    title: "执行与部署",
    problem:
      "动态草稿接受长度、不规则混合批次与静态图模式（CUDA Graph / ACLGraph）存在张力；高并发大批次下额外验证算力还可能导致吞吐回退。",
    flow: ["预热期准备静态工作区与整图捕获", "按批大小与均匀度分派专用低延迟层", "超出收益门槛自动回退常规解码"],
    tradeoff:
      "专用融合路径与全图回放通常针对中小批量（如 1–16 并发）优化，工程评估须同时报告单请求延迟与高水位吞吐边界。",
    keywords: ["MRV2 / ACLGraph", "小批量专用层", "不规则批次分块", "自适应回退"],
  },
];

function KvCacheVisualGuide() {
  const [scenario, setScenario] = useState<"paged" | "transfer" | "offload">("paged");

  return (
    <section className="eng-guide-shell" aria-labelledby="kv-guide-title">
      <div className="eng-console-card">
        <div className="eng-console-top">
          <div>
            <span className="eng-console-kicker">MECHANISM WALKTHROUGH · 核心机制图解</span>
            <h2 id="kv-guide-title">一次推理请求中，KV Cache 怎样省空间、免重算、跨卡搬运？</h2>
          </div>
          <div className="eng-scenario-tabs" role="tablist" aria-label="KV Cache 核心机制切换">
            {(
              [
                ["paged", "01 分页块表与前缀共享"],
                ["transfer", "02 P/D 异构整行搬运"],
                ["offload", "03 多级存储卸载淘汰"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={scenario === key}
                className={scenario === key ? "eng-tab-btn active" : "eng-tab-btn"}
                onClick={() => setScenario(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {scenario === "paged" && (
          <div className="eng-diagram-grid two-col">
            <div className="eng-diagram-pane">
              <h3>逻辑序列视图（按需申请定长块，消除尾部预留碎片）</h3>
              <div className="kv-req-row">
                <span className="kv-req-tag">请求 A</span>
                <div className="kv-blocks">
                  <span className="kv-blk shared">系统提示词 → P0</span>
                  <span className="kv-blk shared">工具定义 → P1</span>
                  <span className="kv-blk private-a">用户问题 A → P4</span>
                </div>
              </div>
              <div className="kv-req-row">
                <span className="kv-req-tag">请求 B</span>
                <div className="kv-blocks">
                  <span className="kv-blk shared">系统提示词 → P0</span>
                  <span className="kv-blk shared">工具定义 → P1</span>
                  <span className="kv-blk private-b">用户问题 B → P7</span>
                </div>
              </div>
              <p className="eng-pane-note">
                调度器识别相同前缀哈希后直接跳过公共部分重算，并优先接纳未缓存词元更少的请求。
              </p>
            </div>

            <div className="eng-diagram-pane highlight">
              <h3>物理显存块池（HBM / NPU 物理页引用计数）</h3>
              <div className="kv-pool-grid">
                <div className="kv-phys shared">
                  <strong>P0 · 系统前缀</strong>
                  <small>ref = 2 · 零拷贝共享</small>
                </div>
                <div className="kv-phys shared">
                  <strong>P1 · 工具前缀</strong>
                  <small>ref = 2 · 零拷贝共享</small>
                </div>
                <div className="kv-phys active">
                  <strong>P4 · 请求 A 独享</strong>
                  <small>ref = 1 · 增量追加</small>
                </div>
                <div className="kv-phys active">
                  <strong>P7 · 请求 B 独享</strong>
                  <small>ref = 1 · 增量追加</small>
                </div>
              </div>
              <p className="eng-pane-note">
                混合架构（Mamba + Attention）需在提交词元边界同步保存状态检查点，才能安全跨请求恢复。
              </p>
            </div>
          </div>
        )}

        {scenario === "transfer" && (
          <div className="eng-diagram-grid two-col">
            <div className="eng-diagram-pane">
              <h3>Prefill 实例（计算密集 · 并行编码生成 KV）</h3>
              <div className="kv-transfer-flow">
                <div className="kv-node-box">
                  <Cpu size={16} aria-hidden />
                  <div>
                    <strong>按层流水线就绪（Layer-wise Ready）</strong>
                    <small>兼容 GQA 布局时合并相邻块，按完整行注册描述符</small>
                  </div>
                </div>
                <div className="kv-wire-badge">NIXL / Mooncake 零拷贝连续数组提交 →</div>
              </div>
            </div>

            <div className="eng-diagram-pane highlight">
              <h3>Decode 实例（访存密集 · 异构 TP/DCP 条带接收）</h3>
              <div className="kv-transfer-flow">
                <div className="kv-node-box">
                  <Network size={16} aria-hidden />
                  <div>
                    <strong>LCM 最小公倍数分片 / 条带求交映射</strong>
                    <small>两端并行度不同时避免重复写，所有流水段完成后放行解码</small>
                  </div>
                </div>
                <div className="kv-wire-badge subtle">断链检测：排空在途读取后自动重建对端握手</div>
              </div>
            </div>
          </div>
        )}

        {scenario === "offload" && (
          <div className="eng-diagram-grid two-col">
            <div className="eng-diagram-pane">
              <h3>冷启动与写入路径（隐藏主机缓冲开销）</h3>
              <div className="kv-tier-stack">
                <div className="kv-tier">
                  <strong>1. 统一主机映射 + 后台分段锁页</strong>
                  <span>引擎先对外服务，后台线程节流预触页，全就绪后开启卸载</span>
                </div>
                <div className="kv-tier">
                  <strong>2. 融合算子顺带写回（如 MLAPO → CPU 池）</strong>
                  <span>生成注意力 KV 的同时写入主机池，省去独立设备复制内核</span>
                </div>
              </div>
            </div>

            <div className="eng-diagram-pane highlight">
              <h3>容量回收路径（会话演进与分叉感知淘汰）</h3>
              <div className="kv-tier-stack">
                <div className="kv-tier good">
                  <strong>保留：多轮对话公共分叉点 & 高重算成本块</strong>
                  <span>后续分支请求高概率再次命中</span>
                </div>
                <div className="kv-tier evict">
                  <strong>优先淘汰：已被新会话轮次取代的旧快照</strong>
                  <span>请求结束即移入优先回收队列，提升有效命中密度</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="eng-pillars-strip">
        <div className="eng-pillar">
          <Database size={17} aria-hidden />
          <div>
            <strong>容量定界</strong>
            <p>校准预热峰值与物理空闲上界，防止启动期显存溢出与运行期过度保守。</p>
          </div>
        </div>
        <div className="eng-pillar">
          <Layers size={17} aria-hidden />
          <div>
            <strong>状态一致性</strong>
            <p>跨混合模型层、稀疏注意力与多模态编码器维护严格的块边界与生命周期。</p>
          </div>
        </div>
        <div className="eng-pillar">
          <HardDrive size={17} aria-hidden />
          <div>
            <strong>带宽折叠</strong>
            <p>通过低比特缓存（FP8/MXFP4）、整行传输与主机分层卸载突破单卡容量与访存墙。</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SpeculativeVisualGuide() {
  const [mode, setMode] = useState<"verify" | "arch" | "graph">("verify");

  return (
    <section className="eng-guide-shell" aria-labelledby="spec-guide-title">
      <div className="eng-console-card">
        <div className="eng-console-top">
          <div>
            <span className="eng-console-kicker">MECHANISM WALKTHROUGH · 核心机制图解</span>
            <h2 id="spec-guide-title">推测解码怎样在不改变输出分布的前提下压缩单步延迟？</h2>
          </div>
          <div className="eng-scenario-tabs" role="tablist" aria-label="推测解码核心机制切换">
            {(
              [
                ["verify", "01 草稿连猜与单步并行验证"],
                ["arch", "02 多形态草稿架构适配"],
                ["graph", "03 多步整图回放与自适应边界"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={mode === key}
                className={mode === key ? "eng-tab-btn active" : "eng-tab-btn"}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {mode === "verify" && (
          <div className="eng-diagram-grid two-col">
            <div className="eng-diagram-pane">
              <h3>常规自回归 Decode（逐词元串行访存瓶颈）</h3>
              <div className="spec-step-chain">
                <span>读取全量权重 → t₁</span>
                <span>→</span>
                <span>读取全量权重 → t₂</span>
                <span>→</span>
                <span>读取全量权重 → t₃</span>
              </div>
              <p className="eng-pane-note">
                小批量解码受限于权重访存带宽，每生成 1 个词元都需完整遍历一次主模型参数。
              </p>
            </div>

            <div className="eng-diagram-pane highlight">
              <h3>草稿提案 + 目标模型一次前向并行核验</h3>
              <div className="spec-verify-tokens" aria-label="草稿词元验证示意">
                <span className="spec-tok accept">
                  <Check size={13} aria-hidden /> 草稿 t₁ 接受
                </span>
                <span className="spec-tok accept">
                  <Check size={13} aria-hidden /> 草稿 t₂ 接受
                </span>
                <span className="spec-tok reject">
                  <X size={13} aria-hidden /> 草稿 t₃ 拒绝
                </span>
                <span className="spec-tok bonus">
                  <Sparkles size={13} aria-hidden /> 修正 t₃′ 直接产出
                </span>
              </div>
              <p className="eng-pane-note">
                一次主模型前向同时验证整段草稿，保留最长匹配前缀并附赠 1 个修正词元，失配后缀立即回滚。
              </p>
            </div>
          </div>
        )}

        {mode === "arch" && (
          <div className="eng-diagram-grid three-col">
            <div className="eng-diagram-pane">
              <h3>EAGLE-3 / 辅助隐藏态</h3>
              <p className="eng-pane-note">
                直接复用目标模型多层中间隐藏状态并融合前置归一化，减少草稿特征重构与跨层搬运。
              </p>
            </div>
            <div className="eng-diagram-pane">
              <h3>MTP / 共享词表采样</h3>
              <p className="eng-pane-note">
                多词元预测头与目标模型共用词嵌入及 LMHead，通信前补齐 TP 行并在概率采样前精确裁除填充位。
              </p>
            </div>
            <div className="eng-diagram-pane highlight">
              <h3>DFlash / DSpark 窗口草稿</h3>
              <p className="eng-pane-note">
                使用局部滑动窗口与设备侧长度元数据（如 FlashMLA / FIA），避免草稿步回读主机序列长度。
              </p>
            </div>
          </div>
        )}

        {mode === "graph" && (
          <div className="eng-diagram-grid two-col">
            <div className="eng-diagram-pane">
              <h3>消除主机下发空泡（MRV2 / ACLGraph / CUDA Graph）</h3>
              <div className="kv-tier-stack">
                <div className="kv-tier">
                  <strong>多步草稿融合单次启动</strong>
                  <span>预分配固定工作空间，将多层草稿循环与候选打分录为单张执行图一次提交</span>
                </div>
                <div className="kv-tier">
                  <strong>延迟状态写回</strong>
                  <span>已接受词元并入下一轮验证顺带回放，减少单独的检查点同步步</span>
                </div>
              </div>
            </div>

            <div className="eng-diagram-pane highlight">
              <h3>在线服务的收益成立条件</h3>
              <div className="kv-tier-stack">
                <div className="kv-tier good">
                  <strong>收益区：中小并发（如 1–16 请求）且接受率稳定</strong>
                  <span>草稿耗时远小于主模型单步访存，专用融合层显著压缩 TPOT</span>
                </div>
                <div className="kv-tier evict">
                  <strong>回退区：高并发宽批次或草稿/目标精度失配</strong>
                  <span>验证算力饱和时需按批次宽度与均匀度平滑切回常规解码路径</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="eng-pillars-strip">
        <div className="eng-pillar">
          <Zap size={17} aria-hidden />
          <div>
            <strong>压低草稿固定开销</strong>
            <p>融合草稿归一化、马尔可夫采样与多步执行图提交，避免草稿步本身成为主机瓶颈。</p>
          </div>
        </div>
        <div className="eng-pillar">
          <Check size={17} aria-hidden />
          <div>
            <strong>严守数值与接受率对齐</strong>
            <p>统一草稿与目标模型的核块大小、掩码可见范围及 TP 采样布局，防止接受率隐性退化。</p>
          </div>
        </div>
        <div className="eng-pillar">
          <Cpu size={17} aria-hidden />
          <div>
            <strong>动态批次与 P/D 协同</strong>
            <p>支持不规则草稿批处理、P 端仅备草稿上下文 KV，并在宽批次下自动回退常规路径。</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function EngineeringTopicCard({ topic }: { topic: Topic }) {
  return (
    <TopicDirectoryCard
      title={topic.title}
      description={topic.description}
      path={`/topics/${topic.id}`}
      summary={<>{topic.counts.total} 条工程证据 · 截至 <time dateTime={topic.coverage.lastDay}>{topic.coverage.lastDay}</time></>}
      detail={`${Object.keys(topic.labels).length} 个子方向`}
      repositories={topic.counts.byRepository}
      sections={[
        { label: "原理导引" },
        { label: "技术路线", search: "focus=routes" },
        { label: "工程证据", search: "focus=evidence" },
      ]}
    />
  );
}

export default function EngineeringTopicWorkbench({ topic }: { topic: Topic }) {
  const [query, setQuery] = useSearchParams();
  const repo = query.get("repo") ?? "";
  const label = query.get("label") ?? "";
  const stageFilter = query.get("stage") ?? "";
  const searchQuery = query.get("q") ?? "";
  const focus = query.get("focus") ?? "";

  useEffect(() => {
    const target = workbenchSections.find(section => section.id === focus)?.target;
    if (!target) return;
    const frame = requestAnimationFrame(() => revealWorkbenchSection(target));
    return () => cancelAnimationFrame(frame);
  }, [focus]);

  const routes = useMemo<RouteSpec[]>(() => {
    if (topic.id === "kv-cache") return kvCacheRoutes;
    if (topic.id === "speculative-decoding") return speculativeRoutes;
    return Object.entries(topic.labels).map(([id, title]) => ({
      id,
      title,
      problem: topic.description,
      flow: ["问题定位", "工程实现", "边界核验"],
      tradeoff: "具体性能收益与适用范围以对应日报原文及原始 PR 实验条件为准。",
      keywords: [title],
    }));
  }, [topic]);

  const [selectedRouteId, setSelectedRouteId] = useState<string>(routes[0]?.id ?? "");
  const activeRoute = routes.find((r) => r.id === (label || selectedRouteId)) ?? routes[0];

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(query);
    if (value) next.set(key, value);
    else next.delete(key);
    setQuery(next, { replace: true });
  }

  function resetAllFilters() {
    setQuery({}, { replace: true });
  }

  function jumpToRouteEvidence(routeId: string) {
    setSelectedRouteId(routeId);
    const next = new URLSearchParams(query);
    next.set("label", routeId);
    setQuery(next, { replace: true });
    requestAnimationFrame(() => {
      document.getElementById("topic-evidence-workbench")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  const entryStages = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of topic.entries) {
      const st = (entry as Entry & { stage?: string }).stage;
      if (st) counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [topic.entries]);

  const dailySeries = useMemo(() => {
    const byDay = new Map<string, { vllm: number; ascend: number }>();
    for (const entry of topic.entries) {
      const slot = byDay.get(entry.day) ?? { vllm: 0, ascend: 0 };
      if (entry.repository === "vllm-ascend") slot.ascend++;
      else slot.vllm++;
      byDay.set(entry.day, slot);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, counts]) => ({ day, ...counts, total: counts.vllm + counts.ascend }));
  }, [topic.entries]);

  const peakDayTotal = Math.max(1, ...dailySeries.map((d) => d.total));

  const labelCounts = useMemo(() => {
    const map = new Map<string, { total: number; vllm: number; ascend: number }>();
    for (const entry of topic.entries) {
      const curr = map.get(entry.label) ?? { total: 0, vllm: 0, ascend: 0 };
      curr.total++;
      if (entry.repository === "vllm-ascend") curr.ascend++;
      else curr.vllm++;
      map.set(entry.label, curr);
    }
    return map;
  }, [topic.entries]);

  const needle = searchQuery.trim().toLowerCase().replace(/^#\s*/, "");

  const rows = useMemo(() => {
    return topic.entries.filter((entry) => {
      const entryStage = (entry as Entry & { stage?: string }).stage ?? "";
      if (repo && entry.repository !== repo) return false;
      if (label && entry.label !== label) return false;
      if (stageFilter && entryStage !== stageFilter) return false;
      if (needle) {
        const prNum = entry.workId.split("#")[1] ?? "";
        const hay = `${entry.title} ${entry.summary} ${entry.reason} ${prNum} ${entry.day}`.toLowerCase();
        return hay.includes(needle);
      }
      return true;
    });
  }, [label, needle, repo, stageFilter, topic.entries]);

  const hasFilters = Boolean(repo || label || stageFilter || needle);
  const manualCount = topic.entries.filter((e) => e.method === "manual").length;

  return (
    <TopicDetailLayout
      title={topic.title}
      subtitle={topic.description}
      sections={workbenchSections.map(({ id, label, target }) => {
        const next = new URLSearchParams(query);
        next.set("focus", id);
        return {
          label,
          to: { search: next.toString() },
          current: (focus || "guide") === id ? "location" : undefined,
          onClick: focus === id ? event => {
            if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              revealWorkbenchSection(target);
            }
          } : undefined,
        };
      })}
    >
      <p className="topic-meta">
        覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}（{topic.coverage.days} 期）
      </p>

      {/* KPI Summary Strip (keeps exact "专题收录 PR" text for test compatibility) */}
      <dl className="eng-kpi-grid" aria-label="专题收录规模">
        <div className="eng-kpi-card">
          <dt>专题收录 PR</dt>
          <dd>
            <strong>{topic.counts.total}</strong> <small>条</small>
          </dd>
          <span>源自 {topic.coverage.prs} 条全库去重主 PR</span>
        </div>
        {Object.entries(communityNames).map(([id, title]) => (
          <div key={id} className="eng-kpi-card">
            <dt>{title}</dt>
            <dd>
              <strong className={id === "vllm-ascend" ? "tone-ascend" : "tone-vllm"}>
                {topic.counts.byRepository[id] ?? 0}
              </strong>{" "}
              <small>条</small>
            </dd>
            <span>
              占本专题 {(((topic.counts.byRepository[id] ?? 0) / Math.max(1, topic.counts.total)) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
        <div className="eng-kpi-card">
          <dt>子方向与精选</dt>
          <dd>
            <strong>{Object.keys(topic.labels).length}</strong> <small>类路线</small>
          </dd>
          <span>{manualCount > 0 ? `含 ${manualCount} 条人工深度纳入` : "按日报原文规则初筛归档"}</span>
        </div>
      </dl>

      {/* 01 Visual Mechanism Guide */}
      <div id="topic-visual-guide" tabIndex={-1} className="eng-anchor-block">
        {topic.id === "kv-cache" ? (
          <KvCacheVisualGuide />
        ) : topic.id === "speculative-decoding" ? (
          <SpeculativeVisualGuide />
        ) : null}
      </div>

      {/* 02 Interactive Technical Route Map */}
      <section id="topic-route-map" tabIndex={-1} className="acl-survey-map eng-route-section" aria-labelledby="eng-route-heading">
        <div className="eng-section-head">
          <div>
            <h2 id="eng-route-heading">核心技术路线与工程边界</h2>
            <p>点击左侧子方向查看核心矛盾、典型改造链路与适用边界，并可一键筛选下方对应 PR。</p>
          </div>
        </div>

        <div className="acl-survey-map-grid">
          <ul className="acl-survey-route-list">
            {routes.map((route) => {
              const stat = labelCounts.get(route.id) ?? { total: 0, vllm: 0, ascend: 0 };
              const isSelected = activeRoute?.id === route.id;
              return (
                <li key={route.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedRouteId(route.id)}
                  >
                    <div className="eng-route-btn-top">
                      <strong>{route.title}</strong>
                      <em className="eng-route-count">{stat.total} PR</em>
                    </div>
                    <span>
                      vLLM {stat.vllm} · Ascend {stat.ascend}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {activeRoute && (
            <div className="acl-survey-route eng-route-detail">
              <div className="eng-route-detail-head">
                <h4>{activeRoute.title}</h4>
                <div className="eng-keyword-chips">
                  {activeRoute.keywords.map((kw) => (
                    <span key={kw}>{kw}</span>
                  ))}
                </div>
              </div>

              <p className="acl-survey-label">核心工程问题</p>
              <p className="eng-route-copy">{activeRoute.problem}</p>

              <p className="acl-survey-label">典型优化链路</p>
              <ol
                className="acl-survey-flow"
                style={{ "--flow-columns": activeRoute.flow.length } as React.CSSProperties}
              >
                {activeRoute.flow.map((stepText) => (
                  <li key={stepText}>{stepText}</li>
                ))}
              </ol>

              <div className="acl-survey-research">
                <p className="acl-survey-label">适用条件与证据边界</p>
                <p>{activeRoute.tradeoff}</p>
              </div>

              <button
                type="button"
                className="eng-filter-jump-btn"
                onClick={() => jumpToRouteEvidence(activeRoute.id)}
              >
                筛选「{activeRoute.title}」的 {labelCounts.get(activeRoute.id)?.total ?? 0} 条工程 PR{" "}
                <ArrowDown size={14} aria-hidden />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 03 Daily Accumulation & Stage Breakdown */}
      <section id="topic-analytics" tabIndex={-1} className="eng-analytics-grid" aria-label="专题趋势与推理环节分布">
        <div className="eng-chart-card">
          <header>
            <h3>每日收录趋势（按日报日期）</h3>
            <div className="eng-mini-legend">
              <span>
                <i className="dot-vllm" /> vLLM
              </span>
              <span>
                <i className="dot-ascend" /> vLLM Ascend
              </span>
            </div>
          </header>
          <div className="eng-bars-scroll">
            <div className="eng-day-bars">
              {dailySeries.map((d) => (
                <button
                  key={d.day}
                  type="button"
                  className={searchQuery === d.day ? "eng-day-col active" : "eng-day-col"}
                  title={`${d.day}：共 ${d.total} 条（vLLM ${d.vllm}，Ascend ${d.ascend}）`}
                  onClick={() => updateParam("q", searchQuery === d.day ? "" : d.day)}
                >
                  <span className="eng-bar-num">{d.total}</span>
                  <span className="eng-bar-stack" style={{ height: `${Math.max(10, (76 * d.total) / peakDayTotal)}px` }}>
                    {d.ascend > 0 && (
                      <i className="bar-ascend" style={{ flex: d.ascend }} />
                    )}
                    {d.vllm > 0 && (
                      <i className="bar-vllm" style={{ flex: d.vllm }} />
                    )}
                  </span>
                  <time dateTime={d.day}>{d.day.slice(5)}</time>
                </button>
              ))}
            </div>
          </div>
          <small className="eng-chart-hint">点击任意日期柱可筛选当日收录的专题 PR。</small>
        </div>

        <div className="eng-chart-card">
          <header>
            <h3>涉及的推理生命周期环节</h3>
            <span>点击环节可联动筛选</span>
          </header>
          <div className="eng-stage-bars">
            {entryStages.map(([st, cnt]) => {
              const active = stageFilter === st;
              const pct = (100 * cnt) / Math.max(1, topic.counts.total);
              return (
                <button
                  key={st}
                  type="button"
                  aria-pressed={active}
                  className={active ? "eng-stage-row active" : "eng-stage-row"}
                  onClick={() => updateParam("stage", active ? "" : st)}
                >
                  <span className="eng-stage-name">{stageLabels[st] ?? st}</span>
                  <span className="eng-stage-track">
                    <i style={{ width: `${pct}%` }} />
                  </span>
                  <strong>{cnt}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 04 Searchable & Filterable PR Evidence Workbench */}
      <section
        id="topic-evidence-workbench"
        tabIndex={-1}
        className="eng-evidence-section"
        aria-labelledby="eng-evidence-heading"
      >
        <div className="eng-section-head">
          <div>
            <h2 id="eng-evidence-heading">工程 PR 证据库</h2>
            <p className="topic-coverage">
              归档覆盖 {topic.coverage.firstDay} 至 {topic.coverage.lastDay}，共 {topic.coverage.days} 期、
              {topic.coverage.prs} 条去重主 PR。规则匹配为初筛，日期为日报收录日。
            </p>
          </div>
        </div>

        <div className="eng-filter-console">
          <div className="eng-search-row">
            <label className="archive-search-box">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => updateParam("q", event.target.value)}
                placeholder="检索本专题 PR 标题、技术摘要、收录依据或 #编号…"
                aria-label="检索本专题 PR"
                autoComplete="off"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="archive-clear-input"
                  aria-label="清空专题检索"
                  onClick={() => updateParam("q", "")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>

          <div className="topic-filters eng-filter-controls">
            <label>
              社区
              <select value={repo} onChange={(event) => updateParam("repo", event.target.value)}>
                <option value="">全部社区</option>
                {Object.entries(communityNames).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}
                  </option>
                ))}
              </select>
            </label>

            <label>
              子方向
              <select value={label} onChange={(event) => updateParam("label", event.target.value)}>
                <option value="">全部方向</option>
                {Object.entries(topic.labels).map(([id, title]) => (
                  <option key={id} value={id}>
                    {title}（{labelCounts.get(id)?.total ?? 0}）
                  </option>
                ))}
              </select>
            </label>

            {entryStages.length > 0 && (
              <label>
                推理环节
                <select value={stageFilter} onChange={(event) => updateParam("stage", event.target.value)}>
                  <option value="">全部环节</option>
                  {entryStages.map(([st, cnt]) => (
                    <option key={st} value={st}>
                      {stageLabels[st] ?? st}（{cnt}）
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="eng-result-status" role="status">
              <span>
                共 <strong>{rows.length}</strong> 条结果
              </span>
              {hasFilters && (
                <button type="button" className="filter-reset-btn" onClick={resetAllFilters}>
                  <RotateCcw size={13} aria-hidden /> 重置筛选
                </button>
              )}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="archive-empty-box">
            <p>当前筛选下没有收录条目。</p>
            <button type="button" className="docx-secondary" onClick={resetAllFilters}>
              查看本专题全部 {topic.counts.total} 条 PR
            </button>
          </div>
        ) : (
          <ul className="topic-entries eng-entries-grid">
            {rows.map((entry) => {
              const reportQuery = new URLSearchParams({
                version: entry.version,
                section: entry.number,
              });
              const reportLink = {
                pathname: `/reports/${entry.day}`,
                search: reportQuery.toString(),
              };
              const isAscend = entry.repository === "vllm-ascend";
              const prNum = entry.workId.split("#")[1];
              const entryStage = (entry as Entry & { stage?: string }).stage;

              return (
                <li key={entry.workId} className="topic-card">
                  <div className="topic-meta eng-entry-meta">
                    <span className={isAscend ? "eng-repo-pill ascend" : "eng-repo-pill vllm"}>
                      <GitPullRequest size={13} aria-hidden />
                      {communityNames[entry.repository]} #{prNum}
                    </span>
                    <span className="topic-tag">{topic.labels[entry.label] ?? entry.label}</span>
                    {entryStage && stageLabels[entryStage] && (
                      <span className="eng-stage-pill">{stageLabels[entryStage]}</span>
                    )}
                    {entry.method === "manual" && <span className="eng-manual-pill">人工纳入</span>}
                    <time className="eng-entry-date" dateTime={entry.day}>
                      {entry.day}
                    </time>
                  </div>

                  <h3 className="eng-entry-title">
                    <Link to={reportLink}>{entry.title}</Link>
                  </h3>

                  {entry.summary && <p className="eng-entry-summary">{entry.summary}</p>}

                  <p className="topic-reason eng-entry-reason">
                    <span>收录依据：</span>
                    {entry.reason}
                  </p>

                  <div className="topic-links eng-entry-links">
                    <Link className="eng-link-primary" to={reportLink}>
                      查看日报正文
                    </Link>
                    <a href={entry.url} target="_blank" rel="noreferrer">
                      GitHub PR <ArrowUpRight size={14} aria-hidden />
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </TopicDetailLayout>
  );
}

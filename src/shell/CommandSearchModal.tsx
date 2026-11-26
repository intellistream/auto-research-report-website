import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, Compass, GitPullRequest, Layers, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useModSearchIndex } from "../features/group-mods/search";
import { searchMods } from "../features/group-mods/selectors";
import type { FlowIndex } from "../pages/chapter-intros";
import type { TopicIndex } from "../pages/TopicPages";
import { uniquePRs } from "../pages/ReportTrends";
import { useJson, type Catalog } from "../pages/report-preview-data";

const stageCatalog = [
  { key: "startup", label: "模型准备", en: "Startup & Model Loading", desc: "权重加载、量化初始化、图捕获预热" },
  { key: "scheduling", label: "请求调度", en: "Request Scheduling", desc: "连续批处理、队列准入、多模态预算" },
  { key: "prefill", label: "输入处理", en: "Prefill", desc: "并行编码提示词、建立 KV 缓存与首 token" },
  { key: "pd_transfer", label: "P/D 缓存交接", en: "KV Disaggregation", desc: "分离部署下跨节点 KV 缓存推拉传输" },
  { key: "decode", label: "循环生成", en: "Autoregressive Decode", desc: "复用 KV 缓存逐词元生成、融合 MoE/注意力" },
  { key: "speculative", label: "推测解码", en: "Speculative Decoding", desc: "草稿模型采样与目标模型并行验证" },
  { key: "output_return", label: "输出返回", en: "Streaming Output", desc: "增量解码、工具调用解析与流式返回" },
  { key: "resource_reclaim", label: "资源回收与缓存保留", en: "Reclaim & Prefix Reuse", desc: "释放请求占用、保留前缀缓存供后续复用" },
] as const;

const stageLabels: Record<string, string> = Object.fromEntries(stageCatalog.map((s) => [s.key, s.label]));

type SearchCategory = "all" | "pr" | "report" | "topic" | "mod";

type SearchResultItem = {
  id: string;
  kind: "topic" | "stage" | "report" | "pr" | "mod";
  title: string;
  subtitle: string;
  badge?: string;
  badgeTone?: "vllm" | "ascend" | "topic" | "stage" | "report";
  to: string;
};

export default function CommandSearchModal({
  open,
  onClose,
  days,
  catalog,
}: {
  open: boolean;
  onClose: () => void;
  days: string[];
  catalog?: Catalog;
}) {
  const fallbackCatalog = useJson<Catalog>(open && !catalog ? "catalog.json" : undefined);
  const resolvedCatalog = catalog || fallbackCatalog?.data;
  const resolvedDays = days.length ? days : Object.keys(resolvedCatalog?.days || {}).sort().reverse();
  const modIndex = useModSearchIndex(open);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const flowResult = useJson<FlowIndex>(open ? "flow-index.json" : undefined);
  const topicResult = useJson<TopicIndex>(open ? "topics.json" : undefined);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const deduplicatedPRs = useMemo(() => {
    const raw = flowResult?.data?.entries;
    if (!Array.isArray(raw)) return [];
    return uniquePRs(raw);
  }, [flowResult?.data]);

  const results = useMemo<SearchResultItem[]>(() => {
    const needle = query.trim().toLowerCase().replace(/^#\s*/, "");
    const list: SearchResultItem[] = [];

    // 1. Topics & Stages
    if (category === "all" || category === "topic") {
      const topics = topicResult?.data?.topics ?? [
        {
          id: "aclgraph",
          title: "ACL Graph",
          description: "昇腾推理图执行：捕获、回放与动态状态（导引 · 学术综述 · 动态报告）",
        },
        {
          id: "kv-cache",
          title: "KV Cache",
          description: "跟踪推理 KV 缓存的复用、布局、容量管理和跨实例搬运",
        },
        {
          id: "speculative-decoding",
          title: "推测解码",
          description: "跟踪草稿模型、候选词元生成与验证，以及推测解码运行时适配",
        },
      ];
      for (const t of topics) {
        const hay = `${t.title} ${t.description} aclgraph 图执行 综述 专题`.toLowerCase();
        if (!needle || hay.includes(needle)) {
          list.push({
            id: `topic-${t.id}`,
            kind: "topic",
            title: `${t.title} · 技术专题`,
            subtitle: t.description,
            badge: "技术专题",
            badgeTone: "topic",
            to: `/topics/${t.id}`,
          });
          if (t.id === "aclgraph" && (!needle || "综述 论文 paper aclgraph".includes(needle))) {
            list.push({
              id: `topic-${t.id}-paper`,
              kind: "topic",
              title: `${t.title} · 学术综述全文`,
              subtitle: "阅读同行评审级综述稿、路线地图与可编辑源码",
              badge: "综述稿",
              badgeTone: "topic",
              to: `/topics/${t.id}?view=paper`,
            });
          }
        }
      }

      for (const stage of stageCatalog) {
        const hay = `${stage.label} ${stage.en} ${stage.desc} ${stage.key}`.toLowerCase();
        if (!needle || hay.includes(needle)) {
          list.push({
            id: `stage-${stage.key}`,
            kind: "stage",
            title: stage.label,
            subtitle: `${stage.en} · ${stage.desc}`,
            badge: "推理环节",
            badgeTone: "stage",
            to: `/?stage=${stage.key}`,
          });
        }
      }
    }

    if (category === "all" || category === "mod") {
      for (const m of searchMods(modIndex.data?.modSearchIndex || [], query).slice(0, category === "mod" ? 40 : 5)) {
        list.push({id:"mod-"+m.componentId,kind:"mod",title:m.displayName,subtitle:m.problemSummary,badge:m.eligibilityLabel,badgeTone:"topic",to:"/group-mods/"+m.componentId});
      }
    }

    // 2. Daily Reports
    if (category === "all" || category === "report") {
      const matchedDays = resolvedDays.filter((d) => !needle || d.includes(needle) || "日报 研报".includes(needle));
      for (const day of matchedDays.slice(0, category === "report" ? 25 : needle ? 6 : 4)) {
        const rec = resolvedCatalog?.days[day];
        const ver = rec?.versions.find((v) => v.sha256 === rec.current);
        const counts = ver?.counts;
        list.push({
          id: `report-${day}`,
          kind: "report",
          title: `${day} 推理性能日报`,
          subtitle: counts
            ? `vLLM ${counts.upstream} 项 · vLLM Ascend ${counts.ascend} 项${counts.papers ? ` · 论文 ${counts.papers} 篇` : ""}`
            : "阅读当日完整社区工程日报",
          badge: "日报",
          badgeTone: "report",
          to: `/reports/${day}`,
        });
      }
    }

    // 3. Engineering PRs
    if (category === "all" || category === "pr") {
      const matchedPRs = needle
        ? deduplicatedPRs.filter((item) => {
            const prNum = item.workId.split("#").at(-1) ?? "";
            const repoName = item.workId.includes("vllm-ascend") ? "vllm-ascend ascend 昇腾" : "vllm upstream";
            const stageName = stageLabels[item.stage] ?? item.stage;
            return `${item.title} ${prNum} ${item.day} ${repoName} ${stageName} ${item.number}`
              .toLowerCase()
              .includes(needle);
          })
        : deduplicatedPRs.slice(0, 8);

      for (const pr of matchedPRs.slice(0, category === "pr" ? 40 : needle ? 18 : 6)) {
        const isAscend = pr.workId.includes("vllm-ascend");
        const prNum = pr.workId.split("#").at(-1);
        const search = new URLSearchParams({ section: pr.number, version: pr.version });
        list.push({
          id: `pr-${pr.workId}`,
          kind: "pr",
          title: pr.title,
          subtitle: `${pr.day} · ${stageLabels[pr.stage] ?? "待分类"} · 条目 ${pr.number}`,
          badge: `${isAscend ? "Ascend" : "vLLM"} #${prNum}`,
          badgeTone: isAscend ? "ascend" : "vllm",
          to: `/reports/${pr.day}?${search.toString()}`,
        });
      }
    }

    return list;
  }, [resolvedCatalog, category, resolvedDays, deduplicatedPRs, query, topicResult?.data, modIndex.data]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  function selectResult(item: SearchResultItem) {
    onClose();
    navigate(item.to);
  }

  function handleKeyDown(event: ReactKeyboardEvent) {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (activeIndex + 1) % results.length;
      setActiveIndex(next);
      listRef.current?.querySelectorAll<HTMLElement>("[data-result-index]")[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prev = (activeIndex - 1 + results.length) % results.length;
      setActiveIndex(prev);
      listRef.current?.querySelectorAll<HTMLElement>("[data-result-index]")[prev]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[activeIndex];
      if (chosen) selectResult(chosen);
    }
  }

  if (!open) return null;

  return (
    <div className="cmd-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cmd-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="全局快速检索"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="cmd-input-row">
          <Search size={18} className="cmd-search-icon" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 PR、日期、专题、MOD 名称或维护者…"
            aria-label="全局搜索关键词"
            autoComplete="off"
          />
          {query && (
            <button type="button" className="cmd-clear-btn" aria-label="清空输入" onClick={() => setQuery("")}>
              <X size={15} />
            </button>
          )}
          <button type="button" className="cmd-esc-btn" onClick={onClose}>
            ESC
          </button>
        </div>

        <div className="cmd-tabs" role="tablist" aria-label="搜索范围筛选">
          {(
            [
              ["all", "全部"],
              ["pr", `工程 PR (${deduplicatedPRs.length || "…"})`],
              ["report", `日报期次 (${resolvedDays.length})`],
              ["topic", "专题与推理环节"],
              ["mod", "组内 MOD"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={category === key}
              className={category === key ? "cmd-tab active" : "cmd-tab"}
              onClick={() => setCategory(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {category === "mod" && modIndex.error && <p className="cmd-empty" role="alert">{modIndex.error}；其他检索仍可使用。</p>}
        <div className="cmd-results" ref={listRef} role="listbox" aria-label="搜索结果">
          {!flowResult?.data && category === "pr" ? (
            <p className="cmd-empty">正在载入全量 PR 索引…</p>
          ) : results.length === 0 ? (
            <div className="cmd-empty">
              <p>未找到与 “{query}” 匹配的条目</p>
              <small>可尝试搜索 PR 编号（如 66324）、算子名称（如 FlashAttn / MoE / KV）或日期。</small>
            </div>
          ) : (
            results.map((item, idx) => {
              const Icon =
                item.kind === "pr"
                  ? GitPullRequest
                  : item.kind === "report"
                    ? CalendarDays
                    : item.kind === "topic"
                      ? BookOpen
                      : Compass;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIndex}
                  data-result-index={idx}
                  className={idx === activeIndex ? "cmd-item active" : "cmd-item"}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(item)}
                >
                  <span className={`cmd-item-icon cmd-tone-${item.badgeTone ?? "stage"}`}>
                    <Icon size={16} aria-hidden />
                  </span>
                  <span className="cmd-item-body">
                    <span className="cmd-item-top">
                      <strong>{item.title}</strong>
                      {item.badge && (
                        <span className={`cmd-badge cmd-tone-${item.badgeTone ?? "stage"}`}>{item.badge}</span>
                      )}
                    </span>
                    <small>{item.subtitle}</small>
                  </span>
                  <ArrowUpRight size={15} className="cmd-item-arrow" aria-hidden />
                </button>
              );
            })
          )}
        </div>

        <footer className="cmd-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> 选择
          </span>
          <span>
            <kbd>Enter</kbd> 跳转
          </span>
          <span>
            <kbd>Esc</kbd> 关闭
          </span>
          <span className="cmd-footer-brand">
            <Layers size={13} aria-hidden /> SAGE 推理研报索引
          </span>
        </footer>
      </div>
    </div>
  );
}

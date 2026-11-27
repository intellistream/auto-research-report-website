import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import {
  ASCEND_APPLICABILITY_BADGES,
  READ_DEPTH_BADGES,
  VLLM_STATUS_BADGES,
  formatPrStateBadge,
  formatRepositoryLabel,
  getVenueBadge,
  safeAnalysisUrl,
  type AclGraphBadgeSpec,
  type AclGraphModalEntry,
} from "./aclgraph-analysis";
import "./aclgraph-analysis.css";

export type AclGraphModalNavScope = "problem" | "global";
export type AclGraphCardModalProps = {
  entry: AclGraphModalEntry;
  problemCardTotal: number;
  globalCardTotal: number;
  navScope: AclGraphModalNavScope;
  onNavScopeChange: (scope: AclGraphModalNavScope) => void;
  previous?: AclGraphModalEntry;
  next?: AclGraphModalEntry;
  onSelectEntry: (entry: AclGraphModalEntry) => void;
  onClose: () => void;
};

export function resolveModalKeyAction(
  key: string,
  options: { hasPrev: boolean; hasNext: boolean; isEditableTarget?: boolean; hasModifier?: boolean },
): "close" | "prev" | "next" | null {
  if (options.hasModifier || options.isEditableTarget) return null;
  if (key === "Escape") return "close";
  if ((key === "ArrowLeft" || key === "ArrowUp") && options.hasPrev) return "prev";
  if ((key === "ArrowRight" || key === "ArrowDown") && options.hasNext) return "next";
  return null;
}

// reports.py strips punctuation before checking whether the venue badge subsumes this metadata.
export function isAclGraphVenueRedundant(venueOrYear: string, badgeLabel?: string): boolean {
  const normalize = (value: string) => value.replace(/[^\p{L}\p{N}_]/gu, "").toLowerCase();
  const venue = normalize(venueOrYear);
  return Boolean(venue && badgeLabel && normalize(badgeLabel).includes(venue));
}

export function AclGraphBadge({ badge }: { badge: AclGraphBadgeSpec | null }) {
  return badge ? <span className={`acl-badge acl-tone-${badge.tone}`}>{badge.label}</span> : null;
}

function Prose({ text }: { text: string }) {
  return <>{text.split(/\r?\n/).map((line, index) => line.trim() ? <p key={index}>{line}</p> : null)}</>;
}

function FieldGrid({ fields }: { fields: readonly (readonly [string, string])[] }) {
  return <dl className="acl-v2-field-grid">
    {fields.map(([label, value]) => <div key={label}>
      <dt>{label}</dt>
      <dd><Prose text={value} /></dd>
    </div>)}
  </dl>;
}

export default function AclGraphCardModal({
  entry, problemCardTotal, globalCardTotal, navScope, onNavScopeChange,
  previous, next, onSelectEntry, onClose,
}: AclGraphCardModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { card, problem } = entry;
  const problemNumber = String(problem.index).padStart(2, "0");
  const position = navScope === "problem"
    ? `问题 ${problemNumber} · 第 ${entry.problemCardIndex + 1} / ${problemCardTotal} 张`
    : `全专题 · 第 ${entry.globalIndex + 1} / ${globalCardTotal} 张`;
  const venueBadge = card.kind === "paper" ? getVenueBadge(card.venueTier, card.venueName) : null;
  const arxivUrl = card.kind === "paper" && card.arxivId ? safeAnalysisUrl(`https://arxiv.org/abs/${card.arxivId}`) : undefined;
  const sourceUrl = safeAnalysisUrl(card.url) ?? arxivUrl;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    return function restoreFocus() {
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || event.defaultPrevented) return;
      if (event.key === "Tab") {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        )).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[hidden], [inert]'));
        const first = focusable[0];
        const last = focusable.at(-1);
        const focused = document.activeElement;
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (focused === first || focused === dialog || !dialog.contains(focused))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (focused === last || focused === dialog || !dialog.contains(focused))) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const action = resolveModalKeyAction(event.key, {
        hasPrev: Boolean(previous),
        hasNext: Boolean(next),
        isEditableTarget: Boolean(target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')),
        hasModifier: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
      });
      if (!action) return;
      event.preventDefault();
      if (action === "close") onClose();
      else if (action === "prev" && previous) onSelectEntry(previous);
      else if (action === "next" && next) onSelectEntry(next);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previous, next, onClose, onSelectEntry]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [entry.card.id]);

  return <div className="acl-modal-backdrop" onClick={onClose}>
    <div
      className={`acl-card-modal acl-modal-${card.kind}`}
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="acl-card-modal-title"
      tabIndex={-1}
      onClick={event => event.stopPropagation()}
    >
      <header className="acl-modal-header">
        <div className="acl-modal-topbar">
          <span className="acl-modal-breadcrumb">问题 {problemNumber} · {problem.shortTitle}</span>
          <span className="acl-modal-position">{position}</span>
          <button type="button" className="acl-modal-close" aria-label="关闭卡片详情" onClick={onClose}>×</button>
        </div>
        <div className="acl-modal-card-heading">
          {card.kind === "pr" && <a className="acl-modal-repository" href={safeAnalysisUrl(card.url)} target="_blank" rel="noopener noreferrer">
            {formatRepositoryLabel(card.repository)} #{card.number}
          </a>}
          <h2 id="acl-card-modal-title">{card.kind === "paper" ? card.title : card.displayTitle}</h2>
          {card.kind === "pr" && card.title.trim() !== card.displayTitle.trim() && <p className="acl-modal-orig-title" lang="en">{card.title}</p>}
          <div className="acl-modal-metadata">
            {card.kind === "paper" ? <>
              <AclGraphBadge badge={venueBadge} />
              {!isAclGraphVenueRedundant(card.venueOrYear, venueBadge?.label) && <span className="acl-badge acl-tone-gray">{card.venueOrYear}</span>}
              {card.citationCount !== undefined && <span className="acl-badge acl-tone-gray">引用 {card.citationCount}</span>}
              <span className="acl-badge acl-tone-gray">作者 {card.authors.slice(0, 3).join("、")}{card.authors.length > 3 ? " 等" : ""}</span>
              <AclGraphBadge badge={READ_DEPTH_BADGES[card.readDepth]} />
              {arxivUrl && <a className="acl-badge acl-tone-blue" href={arxivUrl} target="_blank" rel="noopener noreferrer">arXiv {card.arxivId}</a>}
            </> : <>
              <AclGraphBadge badge={VLLM_STATUS_BADGES[card.vllmStatus]} />
              <AclGraphBadge badge={ASCEND_APPLICABILITY_BADGES[card.ascendApplicability]} />
              <span className="acl-badge acl-tone-gray">{card.hardwareDependency}</span>
              <AclGraphBadge badge={formatPrStateBadge(card.state, card.mergedAt)} />
            </>}
          </div>
          {sourceUrl && <a className="acl-modal-source-link" href={sourceUrl} target="_blank" rel="noopener noreferrer">
            {card.kind === "paper" ? "查看 arXiv / 论文原文" : "查看 GitHub PR"} <ExternalLink size={14} aria-hidden="true" />
          </a>}
        </div>
      </header>

      <div className="acl-modal-body" ref={bodyRef}>
        {card.kind === "paper" ? <>
          <section className="acl-v2-section" aria-labelledby="acl-v2-problem">
            <h3 id="acl-v2-problem">1. 研究问题</h3>
            <FieldGrid fields={[["场景", card.problem.scenario], ["已有 Gap", card.problem.existingGap], ["影响", card.problem.impact]]} />
          </section>
          <section className="acl-v2-section" aria-labelledby="acl-v2-method">
            <h3 id="acl-v2-method">2. 优化方法</h3>
            <div className="acl-v2-key-idea"><strong>Key Idea</strong><Prose text={card.method.keyIdea} /></div>
            <div className="acl-v2-design-list" aria-label="核心 Design">
              {card.method.designPoints.map((point, index) => <div className="acl-v2-design-item" key={index}>
                <span className="acl-badge acl-tone-indigo">Design {index + 1}</span>
                <h4>【{point.title}】</h4>
                <p className="acl-v2-challenge">解决挑战：{point.challengeAddressed}</p>
                <Prose text={point.mechanism} />
              </div>)}
            </div>
          </section>
          <section className="acl-v2-section" aria-labelledby="acl-v2-effects">
            <h3 id="acl-v2-effects">3. 效果与边界</h3>
            <FieldGrid fields={[
              ["性能结果", card.effectsAndLimits.performanceSummary],
              ["实验条件", card.effectsAndLimits.experimentalConditions],
              ["适用限制", card.effectsAndLimits.limitations],
              ["vLLM / Ascend 适用性", card.effectsAndLimits.engineeringApplicability],
            ]} />
          </section>
        </> : <>
          <section className="acl-v2-section" aria-labelledby="acl-v2-problem">
            <h3 id="acl-v2-problem">1. 研究问题</h3>
            <Prose text={card.problem} />
          </section>
          <section className="acl-v2-section" aria-labelledby="acl-v2-method">
            <h3 id="acl-v2-method">2. 优化方法</h3>
            <Prose text={card.optimization} />
          </section>
          <section className="acl-v2-section" aria-labelledby="acl-v2-effects">
            <h3 id="acl-v2-effects">3. 效果与边界</h3>
            <FieldGrid fields={[
              ["性能与验证结果", card.effectsAndLimits.resultSummary],
              ["实验条件", card.effectsAndLimits.experimentalConditions],
              ["适用限制", card.effectsAndLimits.limitations],
              ["Ascend 适用性依据", card.ascendEvidence],
            ]} />
          </section>
        </>}

        <section className="acl-v2-section" aria-label="证据出处">
          <details className="acl-v2-evidence" open>
            <summary>证据出处（{card.evidenceRefs.length} 条）</summary>
            <ol>
              {card.evidenceRefs.map(ref => {
                const href = safeAnalysisUrl(ref.sourceUrl);
                return <li key={ref.refId}>
                  <div className="acl-evidence-heading">
                    <code>[{ref.refId}]</code><strong>{ref.section}</strong>
                    {href && <a href={href} target="_blank" rel="noopener noreferrer">核查原文 ↗</a>}
                  </div>
                  <blockquote><Prose text={ref.quoteExcerpt} /></blockquote>
                  {ref.metrics.length > 0 && <ul className="acl-evidence-metrics" aria-label="证据指标">
                    {ref.metrics.map((metric, index) => <li key={index}>{metric}</li>)}
                  </ul>}
                </li>;
              })}
            </ol>
          </details>
        </section>
      </div>

      <footer className="acl-modal-footer">
        <button type="button" className="acl-modal-step" disabled={!previous} onClick={() => previous && onSelectEntry(previous)}>
          <ArrowLeft size={16} aria-hidden="true" /> 上一张
        </button>
        <div className="acl-modal-controls">
          <div className="acl-scope-toggle" role="group" aria-label="卡片切换范围">
            <button type="button" aria-pressed={navScope === "problem"} onClick={() => onNavScopeChange("problem")}>本问题内</button>
            <button type="button" aria-pressed={navScope === "global"} onClick={() => onNavScopeChange("global")}>全专题</button>
          </div>
          <span className="acl-modal-readout" aria-live="polite">{position}</span>
          <small className="acl-modal-keyboard-hint">← / → 切换 · Esc 关闭</small>
        </div>
        <button type="button" className="acl-modal-step" disabled={!next} onClick={() => next && onSelectEntry(next)}>
          下一张 <ArrowRight size={16} aria-hidden="true" />
        </button>
      </footer>
    </div>
  </div>;
}

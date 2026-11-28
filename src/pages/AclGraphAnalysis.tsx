import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  ACLGRAPH_PROBLEMS,
  ASCEND_APPLICABILITY_BADGES,
  READ_DEPTH_BADGES,
  VLLM_STATUS_BADGES,
  findAclGraphCardById,
  formatRepositoryLabel,
  getAclGraphAnalysisStats,
  getAdjacentAclGraphCards,
  getVenueBadge,
  type AclGraphCard,
  type AclGraphModalEntry,
  type AclGraphProblem,
} from "./aclgraph-analysis";
import AclGraphCardModal, { AclGraphBadge, isAclGraphVenueRedundant, type AclGraphModalNavScope } from "./AclGraphCardModal";
import "./aclgraph-analysis.css";

export type AclGraphCardFilter = "all" | "paper" | "pr";

export function formatProblemNumber(index: number): string {
  return String(index).padStart(2, "0");
}

function searchText(value: unknown): string {
  if (Array.isArray(value)) return value.map(searchText).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(searchText).join(" ");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function filterAclGraphProblems(problems: readonly AclGraphProblem[], kindFilter: AclGraphCardFilter, keyword: string) {
  const terms = keyword.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return problems.map(problem => {
    const context = [problem.id, problem.slug, problem.title, problem.shortTitle, problem.priorityBadge, ...Object.values(problem.gap)].join(" ");
    const matches = (card: AclGraphCard) => {
      const metadata = card.kind === "pr"
        ? `${formatRepositoryLabel(card.repository)} #${card.number} PR ${card.number} ${VLLM_STATUS_BADGES[card.vllmStatus].label} ${ASCEND_APPLICABILITY_BADGES[card.ascendApplicability].label}`
        : `${getVenueBadge(card.venueTier, card.venueName)?.label ?? ""} ${READ_DEPTH_BADGES[card.readDepth].label}`;
      const haystack = `${context} ${metadata} ${searchText(card)}`.toLowerCase();
      return terms.every(term => haystack.includes(term));
    };
    const papers = kindFilter === "pr" ? [] : problem.papers.filter(matches);
    const prs = kindFilter === "paper" ? [] : problem.prs.filter(matches);
    return { problem, papers, prs, totalVisible: papers.length + prs.length };
  }).filter(row => row.totalVisible > 0 || (kindFilter === "all" && terms.length === 0));
}

function scrollToProblem(problemId: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  document.getElementById(`problem-${problemId}`)?.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    block: "start",
  });
}

function SummaryCard({ card, onOpen }: { card: AclGraphCard; onOpen: () => void }) {
  const venueBadge = card.kind === "paper" ? getVenueBadge(card.venueTier, card.venueName) : null;
  return <button type="button" className={`acl-summary-card acl-summary-${card.kind}`} data-card-id={card.id} onClick={onOpen} aria-haspopup="dialog">
    <span className="acl-summary-meta">
      <span className={`acl-badge acl-tone-${card.kind === "paper" ? "blue" : "teal"}`}>{card.kind === "paper" ? "论文" : "PR"}</span>
      {card.kind === "paper" ? <>
        <AclGraphBadge badge={venueBadge} />
        {!isAclGraphVenueRedundant(card.venueOrYear, venueBadge?.label) && <span className="acl-badge acl-tone-gray">{card.venueOrYear}</span>}
        <AclGraphBadge badge={READ_DEPTH_BADGES[card.readDepth]} />
      </> : <>
        <span className="acl-summary-repository">{formatRepositoryLabel(card.repository)} #{card.number}</span>
        <AclGraphBadge badge={VLLM_STATUS_BADGES[card.vllmStatus]} />
        <AclGraphBadge badge={ASCEND_APPLICABILITY_BADGES[card.ascendApplicability]} />
      </>}
    </span>
    <span className="acl-summary-title">{card.kind === "paper" ? card.title : card.displayTitle}</span>
    {card.kind === "paper" ? <span className="acl-summary-authors">{card.authors.slice(0, 3).join("、")}{card.authors.length > 3 ? " 等" : ""}</span>
      : card.title.trim() !== card.displayTitle.trim() && <span className="acl-summary-orig" lang="en">{card.title}</span>}
    <p className="acl-summary-hook">{card.summaryLine}</p>
    <span className="acl-summary-open"><span>点击打开完整分析</span><ArrowUpRight size={14} aria-hidden="true" /></span>
  </button>;
}

export default function AclGraphAnalysis({
  problems = ACLGRAPH_PROBLEMS,
  heading = "以真实工程与学术痛点为纲，剥离伪 Gap，逐一拆解论文与社区 PR",
  eyebrow = "PROBLEM-DRIVEN RESEARCH GAP ANALYSIS",
  testId = "aclgraph-analysis",
}: { problems?: readonly AclGraphProblem[]; heading?: string; eyebrow?: string; testId?: string }) {
  const [query, setQuery] = useSearchParams();
  const [kindFilter, setKindFilter] = useState<AclGraphCardFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [navScope, setNavScope] = useState<AclGraphModalNavScope>("problem");
  const [activeProblemId, setActiveProblemId] = useState(() => problems.find(problem => problem.id === query.get("problem"))?.id ?? problems[0]?.id);
  const jumpFrame = useRef<number | undefined>(undefined);
  const stats = getAclGraphAnalysisStats(problems);
  const filteredProblems = filterAclGraphProblems(problems, kindFilter, keyword);
  const visibleCards = filteredProblems.reduce((total, row) => total + row.totalVisible, 0);
  const cardParam = query.get("card");
  const activeEntry = cardParam ? findAclGraphCardById(cardParam, problems) : undefined;
  const problemParam = activeEntry?.problem.id ?? query.get("problem");
  const adjacent = activeEntry ? getAdjacentAclGraphCards(activeEntry.card.id, problems) : undefined;
  const previous = navScope === "problem" ? adjacent?.withinProblem.previous : adjacent?.previous;
  const next = navScope === "problem" ? adjacent?.withinProblem.next : adjacent?.next;

  useEffect(() => {
    if (!problemParam || !problems.some(problem => problem.id === problemParam)) return;
    setActiveProblemId(problemParam);
    if (!cardParam) scrollToProblem(problemParam);
  }, [problemParam, cardParam, problems]);

  useEffect(() => () => {
    if (jumpFrame.current !== undefined) window.cancelAnimationFrame(jumpFrame.current);
  }, []);

  function selectEntry(entry: AclGraphModalEntry) {
    const params = new URLSearchParams(query);
    params.set("view", "analysis");
    params.set("problem", entry.problem.id);
    params.set("card", entry.card.id);
    setActiveProblemId(entry.problem.id);
    setQuery(params, { replace: true });
  }

  function openCard(card: AclGraphCard) {
    const entry = findAclGraphCardById(card.id, problems);
    if (entry) selectEntry(entry);
  }

  function closeCard() {
    const params = new URLSearchParams(query);
    params.set("view", "analysis");
    params.delete("card");
    setQuery(params, { replace: true });
  }

  function jumpToProblem(problem: AclGraphProblem) {
    if (!filteredProblems.some(row => row.problem.id === problem.id)) {
      setKindFilter("all");
      setKeyword("");
    }
    setActiveProblemId(problem.id);
    const params = new URLSearchParams(query);
    params.set("view", "analysis");
    params.set("problem", problem.id);
    params.delete("card");
    setQuery(params, { replace: true });
    if (jumpFrame.current !== undefined) window.cancelAnimationFrame(jumpFrame.current);
    jumpFrame.current = window.requestAnimationFrame(() => scrollToProblem(problem.id));
  }

  function resetFilters() {
    setKindFilter("all");
    setKeyword("");
  }

  return <div className="acl-analysis" data-testid={testId}>
    <header className="acl-analysis-overview">
      <p className="acl-analysis-eyebrow">{eyebrow}</p>
      <h2>{heading}</h2>
      <div className="acl-analysis-stats" aria-label="专题剖析统计">
        <span><strong>{stats.problems}</strong> 大核心问题</span>
        <span>{stats.papers === stats.fulltextPapers ? `${stats.fulltextPapers} 篇全文论文` : `${stats.papers} 篇论文（全文 ${stats.fulltextPapers}）`}</span>
        <span>{stats.prs} 条工程 PR <small>Ascend {stats.ascendPrs} · vLLM {stats.upstreamPrs}</small></span>
        <span className="acl-analysis-tip">点击卡片查看完整剖析 <ArrowUpRight size={14} aria-hidden="true" /></span>
      </div>
    </header>

    <nav className="acl-problem-jump" aria-label="核心问题导航">
      {problems.map(problem => <button key={problem.id} type="button" aria-current={activeProblemId === problem.id ? "location" : undefined} onClick={() => jumpToProblem(problem)}>
        <span>{formatProblemNumber(problem.index)}</span>{problem.shortTitle}
      </button>)}
    </nav>

    <div className="acl-filter-bar">
      <div className="acl-filter-types" role="group" aria-label="卡片类型筛选">
        {([
          ["all", `全部 (${stats.totalCards})`],
          ["paper", `仅看论文 (${stats.papers})`],
          ["pr", `仅看 PR (${stats.prs})`],
        ] as const).map(([filter, label]) => <button key={filter} type="button" aria-pressed={kindFilter === filter} onClick={() => setKindFilter(filter)}>{label}</button>)}
      </div>
      <div className="acl-filter-search">
        <Search size={16} aria-hidden="true" />
        <input type="search" aria-label="筛选论文或 PR 卡片" placeholder="搜索问题、论文、PR 编号、方法或关键词…" value={keyword} onChange={event => setKeyword(event.target.value)} />
        {keyword && <button type="button" aria-label="清空卡片搜索" onClick={() => setKeyword("")}><X size={15} aria-hidden="true" /></button>}
      </div>
    </div>

    {problems.length === 0 ? <div className="acl-analysis-empty" role="status">专题剖析内容正在装载中，稍后将展示 6 大核心问题与 48 张精读卡片。</div>
      : visibleCards === 0 ? <div className="acl-analysis-empty" role="status">
        <p>当前筛选条件下没有匹配的论文或 PR 卡片</p>
        <button type="button" onClick={resetFilters}>重置筛选</button>
      </div> : filteredProblems.map(({ problem, papers, prs }) => <section
        key={problem.id}
        id={`problem-${problem.id}`}
        className="acl-problem-section"
        aria-labelledby={`acl-problem-heading-${problem.id}`}
      >
        <header className="acl-problem-header">
          <div className="acl-problem-meta">
            <strong className="acl-problem-number">问题 {formatProblemNumber(problem.index)}</strong>
            <span className="acl-badge acl-tone-orange">{problem.priorityBadge}</span>
            <span className="acl-problem-count">{problem.papers.length} 篇论文 · {problem.prs.length} 条 PR</span>
          </div>
          <h2 id={`acl-problem-heading-${problem.id}`} className="acl-problem-heading">{problem.title}</h2>
        </header>

        <div className="acl-gap-panel">
          <div className="acl-gap-grid">
            <div className="acl-gap-step acl-gap-background">
              <span className="acl-gap-step-tag">01</span><h3>背景（痛点与场景）</h3><p>{problem.gap.background}</p>
            </div>
            <div className="acl-gap-step acl-gap-limits">
              <span className="acl-gap-step-tag">02</span><h3>现有工作局限</h3><p>{problem.gap.existingLimitations}</p>
            </div>
            <div className="acl-gap-step acl-gap-opportunity">
              <span className="acl-gap-step-tag">03</span><h3>研究机会（Research Gap）</h3><p>{problem.gap.researchOpportunity}</p>
            </div>
          </div>
          {problem.gap.keyTakeaway && <div className="acl-gap-takeaway"><strong>关键判断</strong><p>{problem.gap.keyTakeaway}</p></div>}
        </div>

        <div className="acl-cards-block">
          {papers.length > 0 && <div className="acl-card-group">
            <h3 className="acl-card-group-title"><span className="acl-card-group-dot acl-paper-dot" />学术论文精读 · {papers.length} 篇</h3>
            <div className="acl-card-grid">{papers.map(card => <SummaryCard key={card.id} card={card} onOpen={() => openCard(card)} />)}</div>
          </div>}
          {prs.length > 0 && <div className="acl-card-group">
            <h3 className="acl-card-group-title"><span className="acl-card-group-dot acl-pr-dot" />社区工程 PR · {prs.length} 条</h3>
            <div className="acl-card-grid">{prs.map(card => <SummaryCard key={card.id} card={card} onOpen={() => openCard(card)} />)}</div>
          </div>}
        </div>
      </section>)}

    {activeEntry && <AclGraphCardModal
      entry={activeEntry}
      problemCardTotal={activeEntry.problem.papers.length + activeEntry.problem.prs.length}
      globalCardTotal={stats.totalCards}
      navScope={navScope}
      onNavScopeChange={setNavScope}
      previous={previous}
      next={next}
      onSelectEntry={selectEntry}
      onClose={closeCard}
    />}
  </div>;
}

import type { AclGraphProblem } from "./aclgraph-analysis";

/** Synthetic evidence and metrics, used only by tests. */
export function makeAclGraphProblems(): AclGraphProblem[] {
  const titles = ["GraphBreak 与捕获边界", "动态批次与图桶选择", "地址稳定性与张量生命周期", "主机状态同步与图重放", "图内存池与容量管理", "并发调度与执行依赖"];
  const venues = ["ccf_a", "top_venue", "peer_reviewed", "preprint"] as const;
  const statuses = ["merged_core", "open_pr", "rfc_or_draft", "merged_recent", "paper_prototype", "not_verified_in_vllm"] as const;
  const applicability = ["ascend_native", "ascend_pr_available", "portable_framework", "cuda_specific_needs_port", "unverified"] as const;
  return titles.map((title, pi) => ({
    id: `p${pi + 1}`, index: pi + 1, slug: `problem-${pi + 1}`, title,
    shortTitle: title.split("与")[0].trim(), priorityBadge: pi < 3 ? "优先核验" : "研究机会",
    gap: { background: `背景场景 ${pi + 1}：动态请求需要复用已捕获执行图。`,
      existingLimitations: `现有局限 ${pi + 1}：静态实验不能覆盖请求变化。`,
      researchOpportunity: `研究机会 ${pi + 1}：固定版本下比较动态负载。`,
      keyTakeaway: `关键判断 ${pi + 1}：区分局部收益与服务吞吐。` },
    papers: Array.from({ length: 4 }, (_, ci) => {
      const key = `${pi + 1}-${ci + 1}`;
      const arxivId = `2611.${String(pi * 4 + ci + 1).padStart(5, "0")}`;
      return {
        id: `p${pi + 1}-paper-${ci + 1}`, kind: "paper" as const, paperId: `paper:fixture:${key}`, arxivId,
        title: `Graph replay study ${key}`, url: `https://arxiv.org/abs/${arxivId}`,
        authors: ["Alice Researcher", "Bo Engineer", "Chen Analyst", "Dana Reviewer"],
        venueOrYear: `2026 · venue ${ci + 1}`, venueName: ["OSDI", "MLSys", "Systems Journal", ""][ci],
        venueTier: venues[ci], publicationStatus: ci === 3 ? "preprint" as const : "accepted" as const,
        citationCount: pi * 4 + ci, readDepth: "fulltext" as const, summaryLine: `论文摘要 ${key}：分离捕获与重放成本。`,
        problem: { scenario: `论文场景 ${key}：混合长度推理请求。`, existingGap: `论文已有 Gap ${key}：缺少状态变化分析。`, impact: `论文影响 ${key}：可能触发重新捕获。` },
        method: { keyIdea: `完整 Key Idea ${key}：按依赖边界复用图区域。`, designPoints: [
          { title: `区域分解 ${key}`, challengeAddressed: `动态依赖 ${key}`, mechanism: `完整设计机制 ${key}：记录边界状态再选择执行区域。` },
          { title: `状态验证 ${key}`, challengeAddressed: `地址变化 ${key}`, mechanism: `验证缓存张量的地址及有效期 ${key}。` },
        ] },
        effectsAndLimits: { performanceSummary: `测试结果 ${key}：此合成夹具以 10% 为示例。`, experimentalConditions: `论文实验条件 ${key}：固定硬件、提交和请求轨迹。`,
          limitations: `论文适用限制 ${key}：未验证多租户。`, engineeringApplicability: `论文工程适用性 ${key}：Ascend 需要接口语义核验。` },
        evidenceRefs: [{ refId: `paper-evidence-${key}`, section: "§4 Evaluation", quoteExcerpt: `论文原文摘录 ${key}，只应在弹窗显示。`, metrics: ["合成 fixture：10%"], sourceUrl: `https://arxiv.org/html/${arxivId}#S4` }],
      };
    }),
    prs: Array.from({ length: 4 }, (_, ci) => {
      const key = `${pi + 1}-${ci + 1}`, number = 72000 + pi * 4 + ci;
      const repository = ci < 2 ? "vllm-project/vllm-ascend" : "vllm-project/vllm";
      const url = `https://github.com/${repository}/pull/${number}`;
      const state = (["merged", "open", "closed", "merged"] as const)[ci];
      return {
        id: `p${pi + 1}-pr-${ci + 1}`, kind: "pr" as const, prId: `github:${repository}#${number}`, repository, number,
        title: `Reduce graph replay overhead ${key}`, displayTitle: `图重放优化 ${key}`, url, state,
        ...(state === "merged" ? { mergedAt: "2026-11-18T17:30:00Z" } : {}),
        vllmStatus: statuses[(pi + ci) % statuses.length], ascendApplicability: applicability[(pi + ci) % applicability.length],
        ascendEvidence: `Ascend 核验依据 ${key}：需核对设备侧 API 与地址依赖。`, hardwareDependency: ci < 2 ? "Ascend NPU" : "CUDA / 通用框架",
        summaryLine: `PR 摘要 ${key}：复用执行计划，保留状态检查。`, problem: `PR 完整问题 ${key}：主机重复构造执行元数据。`,
        optimization: `PR 完整优化 ${key}：缓存不变元数据，更新动态部分。`,
        effectsAndLimits: { resultSummary: `PR 合成验证结果 ${key}：测试通过，服务收益待测。`, experimentalConditions: `PR 实验条件 ${key}：相同提交与后端。`, limitations: `PR 适用限制 ${key}：未独立复现生产负载。` },
        evidenceRefs: [{ refId: `pr-evidence-${key}`, section: "PR description / tests", quoteExcerpt: `PR 原文摘录 ${key}，只应在弹窗显示。`, metrics: ["合成 fixture：单元测试通过"], sourceUrl: url }],
      };
    }),
  }));
}

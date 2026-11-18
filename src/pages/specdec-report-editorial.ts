/**
 * Academic reading terminology for the SpecDec topic.
 * This is a presentation-only layer: the versioned research report, citations,
 * benchmark provenance, and original archived evidence remain immutable.
 */
export const specDecChapterHeadings: Record<string, { title: string; subsections: string[] }> = {
  "spec-contract": {
    title: "推测执行的正确性：目标分布与合法前缀",
    subsections: [
      "自回归依赖与一次完整的推测轮次",
      "从贪心验证到保持目标分布的概率采样",
      "输出、缓存、递归状态与时序的不变量",
    ],
  },
  "effective-cost": {
    title: "性能判据：单位有效输出的真实成本",
    subsections: [
      "有效提交量与候选位置的存活概率",
      "轮次关键路径与性能盈亏条件",
      "非单调收益：接受率与吞吐的不同变化",
    ],
  },
  "candidate-methods": {
    title: "候选生成：从历史检索到并行块式草稿",
    subsections: [
      "历史检索与独立草稿的质量—成本取舍",
      "利用目标特征构建自回归草稿",
      "多分支候选与树形验证",
      "并行块式草稿的依赖结构与计算代价",
    ],
  },
  "target-verification": {
    title: "目标验证：从固定长度到动态预算",
    subsections: [
      "位置存活概率与固定验证长度的边际成本",
      "自适应验证的概率估计与预算决策",
      "预算选择器与目标模型的实际执行成本",
      "从验证位置选择到合法状态提交",
    ],
  },
  "hybrid-state": {
    title: "混合模型的接受状态与缓存生命周期",
    subsections: [
      "注意力缓存、草稿历史与递归状态的区别",
      "接受状态重构与异步提交",
      "前缀缓存身份、请求恢复与状态有效期",
      "验证决策与运行时状态的共同边界",
    ],
  },
  "serving-runtime": {
    title: "服务运行时：图执行、调度与容量约束",
    subsections: [
      "固定源码的职责划分与兼容边界",
      "草稿、验证与采样的图执行和动态形状",
      "设备元数据与主机—设备异步重叠",
      "缓存、图资源与请求调度的联合预算",
    ],
  },
  "cross-layer-evidence": {
    title: "跨层证据综合：瓶颈迁移与因果边界",
    subsections: [
      "从候选生成到目标验证：串行深度与有效输出成本",
      "从目标验证到接受状态：计算结果与合法提交",
      "从局部执行到在线服务：关键路径与端到端指标",
      "技术演进中的适用条件与未证实结论",
    ],
  },
  "research-outlook": {
    title: "未解问题：研究假设、验证路径与局限",
    subsections: [
      "机制衔接问题与可证伪假设",
      "统一评价方法与局部收益的因果归属",
      "综合回答研究问题与讨论有效性边界",
    ],
  },
};

export const specDecTaxonomyTitles = [
  "候选生成：如何以较低成本形成有效候选",
  "目标验证与接受：如何选择值得计算的位置",
  "接受状态：如何使设备历史对应合法前缀",
  "服务运行时：如何让局部收益传递到在线服务",
] as const;

export const specDecMethodContext = [
  "本文采用问题驱动的持续演进叙述性综述。理论论文用于解释分布保持与算法依赖，官方文档和固定提交源码用于界定实现职责，工程 PR 则用于讨论特定版本与负载下的机制、测量和失败边界。三种证据各有用途，不能相互代替。",
  "证据综合遵循“原有瓶颈—机制变化—新增代价—条件化观察—有效性威胁”的顺序。作者报告的微基准、图任务轨迹及在线吞吐分别说明不同问题；未经配对的软硬件环境、接受轨迹与请求长度不得合并为统一加速结论。",
] as const;

export const specDecTaxonomyContext = [
  "不同推测解码方法的差异首先是条件依赖与成本位置的差异：历史检索和辅助模型改变候选的生成方式，树式或块式草稿改变并行性；固定长度和自适应验证改变实际目标计算量，混合模型又要求将合法输出与内部状态恢复联结起来。各路线并非按发表时间构成单一替代关系。",
  "因此本文按候选生成、目标验证、接受状态和服务运行时四个层次建立分类，并进一步比较每次瓶颈转移后的新增开销。算法层的接受长度、设备层的局部耗时与服务层的有效输出之间，必须由可追踪的关键路径证据建立联系。",
] as const;

export const specDecEvidenceContext = [
  "以下对照是已核查的代表性工程样本，而非按提交时间排列的 PR 动态。每条分别保留改动机制、源码或测试身份、硬件与负载、作者报告的结果、负面观察和本轮核验范围。证据只能用于其实际覆盖的运行条件。",
  "特别需要区分：减少草稿循环或元数据内核耗时，并不保证吞吐改善；接受率、图执行模式或后端同时变化的比较，也不能把全部差值归因于单个优化。未合入的方案只证明其研究意图与已公开的条件化观察，不等同于稳定支持。",
] as const;

export const specDecEvidenceGroups = [
  { title: "候选生成与验证决策", ids: ["E1", "E2", "E3"] },
  { title: "接受状态与缓存身份", ids: ["E5", "E7", "E12"] },
  { title: "图执行、元数据与服务关键路径", ids: ["E8", "E9", "E11", "E17"] },
] as const;

export function displaySpecDecChapterTitle(id: string, fallback: string) {
  return specDecChapterHeadings[id]?.title ?? fallback;
}

export function displaySpecDecSubsectionTitle(id: string, index: number, fallback: string) {
  return specDecChapterHeadings[id]?.subsections[index] ?? fallback;
}

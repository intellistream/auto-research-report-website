// Editorial summary of the checked revision 2 → 3 diff.
export const aclGraphReportUpdate = {
  version: "6dd5554a521e6faeb3477353dd6258a54089733402109dec9c3555eb67ba1d66",
  previousRevision: 2,
  summary: "主判断延续。图执行的收益取决于关键路径上少了哪段开销。本版补齐对照条件，收紧性能结论。",
  evidence: [
    {
      source: "Ascend #21281",
      title: "服务提速仍需重复验证",
      change: "后端实验只有一次顺序配对。计划共享的服务差值区间含零。",
      links: [
        { id: "e2-backend-graphs", label: "后端对照" },
        { id: "e2-plan-sharing", label: "计划共享对照" },
      ],
    },
    {
      source: "Ascend #21259",
      title: "补强局部回放正确性",
      change: "补录作者报告的 112 次动态回放和负对照。当前上游集成与整模型质量仍需配对验证。",
      links: [{ id: "e3-dynamic-replay", label: "动态回放对照" }],
    },
    {
      source: "Ascend #21191",
      title: "搬运减少，首 token 收益待测",
      change: "轨迹中冗余 H2D 任务从 72 降到 0。在线每组只测了 1 个正式请求。",
      links: [{ id: "e1-h2d-removal", label: "任务与在线样本" }],
    },
    {
      source: "Ascend #20279",
      title: "草稿图补齐回退与填充证据",
      change: "源码核实了模式隔离和两卡填充用例。时延表的单位与重复次数仍待确认。",
      links: [{ id: "e5-modes-padded", label: "用例与时延表" }],
    },
  ],
  next: [
    { id: "causal-backend-graph", label: "分别测量图回放、后端和元数据的贡献" },
    { id: "state-ownership", label: "检验换请求和复用槽位时的状态正确性" },
    { id: "capture-budget", label: "在同等资源预算下比较分桶与多流方案" },
  ],
};

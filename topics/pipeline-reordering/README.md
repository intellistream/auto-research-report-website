# 流水线重排专题首版

- 导引：/#/topics/pipeline-reordering
- 剖析：/#/topics/pipeline-reordering?view=analysis
- 数据：src/pages/pipeline-reordering-data.json。
- 本版组织四个问题：主机与设备跨轮衔接、微批计算通信重叠、发射顺序与资源争用、多卡通信与状态一致。
- 四篇论文及六条 PR 从网站 a1073f3aa55736931b7eb13d6a98355119b84673 的 src/pages/aclgraph-data/problems-3-4.json 复制冻结，保留原卡片的性能条件、限制、状态及证据引用；本轮未重新开展论文全文阅读或硬件复现。
- vLLM #64145、#66052 于 2026-11-27 通过 GitHub 连接器核对正文、状态和补丁，均已合入；原始材料快照留在 Windows 对应任务的来源文件目录。
- 四个问题和研究设想为本版选题框架，不构成穷尽文献后的研究缺口结论。问题归纳与原始日报正文分开，不改写或替换日报。
- 时间线只表示两个独立微批、单条计算流和单条通信流的概念模型。相同微批通信依赖自身计算，两次通信不得重叠。争用场景仅以额外计算耗时表达潜在回退，不拟合硬件。
- 后续更新先核对来源与计量条件，再更新冻结 JSON 及其 provenance；不要以 PR 合入推断适用于全部后端。
- 新专题 JSON 已登记至 data/group-research/corpus-sources.json；通用 problem_analysis 适配器保留本专题深链接及 /problems/... 定位，只接纳显式 PR 身份。

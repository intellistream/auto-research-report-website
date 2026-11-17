# Speculative Decoding 技术专题：执行计划（2026-11-17）

> 状态：P0 执行中；P1–P3 尚未实施。此文件为专题研究与交付计划，不代表已完成综述、上线或硬件复现。
>
> 基线：`intellistream/auto-research-report-website` main `9203c13a6342093bc7212295558e6a250dc61fd8`；原始 `topics.json` blob `bfa458918c3539807a33deab9e1736fa24a85829`。审核窗口为 2026-10-22 至 2026-11-11 的 21 份归档，原始 SpecDec 规则候选 105（vLLM 68 / vLLM Ascend 37），归档总体去重主 PR 为 520。
>
> **边界：网站是只读发布仓库**。不把日报网页当成官方技术原文；不在网站内假装执行后端爬取、LLM 研究、NPU 复现；后端生成链路尚需独立确认。禁止修改历史日报及 ACLGraph 已冻结的 PDF/HTML/JSON 和 SHA 记录。

## 0. 研究问题与质量门槛

核心问题：在保持 Target 输出语义的前提下，何时、通过什么机制，使每个最终提交 token 的关键路径成本下降，并能在动态 Serving 负载下成立？

一次推测轮次必须连贯解释：**Draft/Propose → Target Verify → Acceptance/Rejection（含 bonus）→ KV / Recurrent State Commit → 下一轮调度**。

工作准入以**主要工程改动**为准，而非 PR 标题关键词、运行模型或 Benchmark 命令是否含 `MTP`/`DSpark`。至少直接涉及以下一项：

- Draft method、候选采样、候选排列/生成、接受率相关的模型适配；
- 多 token Target Verification、Speculative Sampling、Adaptive Length / Budget；
- 为 SpecDec 显式实现的 Attention/Kernel/Graph/通信/调度接口；
- Accepted Prefix 的 KV / GDN / Mamba / KDA State 正确性、提交、回放、生命周期；
- 对上面路径直接产生影响且提供了可复核的条件或对照。

仅优化通用 MoE、普通单 token Decode、Prefill、KV Pool、元数据、图回放等，即便在带 Draft 的 Serving 配置下验证，也**不自动成为 SpecDec 专题的主要证据**。边界项可保存在排除审计中，转入更贴切的专题，而不是声称该 PR 没有任何性能作用。

证据等级始终分开：`OFFICIAL_DOC/CODE`（当前平台和接口语义）、`ORIGINAL_PR`（实际 diff、审查/合入状态、配对条件）、`PAPER`（作者的方法和实验）、`LOCAL_REPRO`（有固定版本、真实运行记录时才可使用）。`beyondOneToken` 里的 paper/source notes 是导航与反例线索，**不替代原始材料**。不将作者报告速度写成本站独立测得。

## P0 — 归档 PR 清理与人工排除（本分支）

**目标：** 网站公开候选从 105 调整到 81，形成可追溯的排除意见，而不是静默删除历史证据。

1. 原文逐条复核结论冻结为 `speculative-decoding-exclusions-20261117.json`：vLLM 13 条、vLLM-Ascend 11 条，共 24 条；每项含完整 `workId`、原始 PR URL、理由及更合适的归属领域。
2. 只在 `public/word-reports/topics.json` 的 `speculative-decoding.entries` 删除这些候选，不触碰 `aclgraph`、`kv-cache` 的数据，不重排其余 SpecDec 条目。
3. 重算 `counts.total`、`counts.byRepository`、`counts.byLabel`，并记录 `manualExcluded=24`、`manualIncluded=0`。`coverage` 保持来源归档口径（21 天、520 条去重主 PR），不可把 81 错写为归档的总 PR 数。
4. 未排除的 81 条仍是**待综合的规则候选**；不批量改成 `method=manual`，不伪造“人工准入”。
5. 增加自动回归：24 个排除 workId 无重复且不在当前 SpecDec 索引，81 个保留 workId 唯一，统计与 entries 一致，其他两专题的完整索引保持不变（通过本次 Git Diff 复核），以及现有专题资产哈希检查。

**P0 验收：** `105 - 24 = 81`；vLLM `55`、vLLM Ascend `26`；labels `methods=48`、`verification=27`、`runtime=6`。原始日报深链接及历史报告字节不变。检查 `python3 -X utf8 -m unittest discover -s scripts`、`npm test`、`npm run build`；未实际运行的项目标明 `NOT_RUN`，不以静态阅读冒充 CI。

## P1 — 机制导引与社区地图（后续独立变更）

参考 ACLGraph `AclGraphGuide` / `AclGraphTopic` 的可读性与“四分区”，但先抽取通用 Topic Navigation，避免复制 ACLGraph 的硬编码；保留旧 ACLGraph `?view=` 与 `?part=` 路由。

导引用四节叙述：① 从请求到一个 speculative round；② 从 n-gram / EAGLE / MTP 到并行 block drafter（DFlash / DSpark 等）；③ 为什么高接受率仍可能性能不佳（Draft/Verify/State/Graph 与 batch）；④ 社区已解决什么以及剩余研究问题。对每个机制指定可点击的官方实现、原始 PR 和论文；注明适用硬件、主干版本、正确性契约。不要把同名模型或论文机制自动视作 upstream 已集成。

## P2 — 可核验动态研究报告（后续独立变更）

依据 `src/pages/topic-report.ts` 的 `ResearchReport` 契约和 ACLGraph 已发布的版本体系，梳理：

- 方法族：Lookahead / N-gram、EAGLE 系 / MTP、Parallel Draft、Candidate Selector 与 Draft Budget；
- Verify：target 多 token attention、sampling（greedy / probabilistic / rejection）、动态长度 / 负载；
- 执行系统：PP/TP/DP、graph、draft KV、host dispatch、prefill-only worker、spec state lifecycle；
- Hybrid：GDN/Mamba/KDA/MoE 的 accepted-state commit、replay、router/expert 的额外 verify 成本；
- 性能归因：acceptance length vs 每轮 step time vs TPOT/TPS；TTFT、并发、服务型 Goodput、额外显存；严禁跨不同软硬件、模型、基线拼接 speedup。

每条证据至少保留原始 URL、源码或论文版本/日期、模型和设备、工作负载、比较对象、结论及限制。区分 `synthesizedWorkIds` 与待审候选。若只有作者实验，明确 `AUTHOR_REPORTED / NOT_REPRODUCED`；无法确定就写未知，不制造可执行性声明。

冻结 `topic-reports/speculative-decoding/<version>/` 的 MD/HTML/JSON/PDF/manifest，生成与哈希机制先追溯实际后端能力，**不可凭 README 的命令推断 private main 已实现对应构建器**。新版本只新增，不覆盖既有版本或历史链接。

## P3 — 综述稿、四区页面与发布（后续独立变更）

期望入口：`guide`、`paper`、`report`、`evidence`。先确保 P1 的导引和 P2 动态研究报告可用；独立学术稿可后置，**不得展示尚不存在的 PDF/LaTeX 下载**。PR / 日报回溯和原始社区 PR 双向可达，避免“论文故事化”和失去 provenance。保持 ACLGraph 和 KV Cache 页面行为不变。

## PR 策略与工作方式

- 本分支 `feat/specdec-evidence-review-20261117` 仅交 P0：执行计划、24 条排除审计、当前候选索引及自动化检查。目标 `main`，**禁止直接写 main**。
- 先提交计划，再提交证据清理及回归测试；开 **Draft PR** 供核对，非终审、非自动合并。上游未来日报更新时，不能把此前人工排除的 PR 因规则再匹配而悄悄加回。
- P1–P3 分开提交，必须提供 source-to-claim 链接、截图/路由检查与真实运行结果；有重大机制性疑问先在审查记录中标记，不编造结论。

## 完成定义

P0 只宣称“候选清理完成”；**不宣称 SpecDec 综述完成**。整个专题真正完成需满足机制连贯、社区广度和代表性、证据独立可复核、四区可读、资产冻结与回归检查通过。

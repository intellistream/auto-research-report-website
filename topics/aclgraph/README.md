# ACL Graph v5 CSUR 双视角综述导读维护

本目录的 `survey.json` 是页面导读的维护源，导入后成为 `public/word-reports/topics.json` 中 ACL Graph 的 `survey` 字段。它组织核心问题、机制、证据判断、局限、研究反馈和候选问题；完整学术稿与工程报告仍由各自的冻结资产提供。上游研究仓库同名的 `topics/aclgraph/survey.json` 是完整工程研究稿，二者职责不同。

## 数据到页面

```text
日报归档 → 上游分类/研究/冻结导出 → topics.json 的 entries/report/academicPaper
本目录 survey.json → 校验与原子导入 → topics.json 的 survey
                                       ↓
                     综述路线图、动态报告证据判断与候选问题
```

```powershell
python -X utf8 scripts/import-topic-survey.py
python -X utf8 scripts/import-topic-survey.py --check
python -m unittest discover -s scripts -p "test_*.py"
npm run check:topic-survey
npx vitest run src/pages/topic-survey.test.tsx src/pages/academic-paper.test.tsx
npm run build
```

导入会验证报告与论文版本、来源/证据/研究问题/路线引用、真实正文锚点和日期。路线 ID 统一使用小写字母、数字和连字符。错误输入不会替换可用索引。`predev`、`pretest`、`prebuild` 均检查维护源与展示数据一致；CI 的 Python 检查同时验证它们。导入只替换目标专题的 `survey`，保留报告、论文、其他专题和冻结文件。

前端还会校验绑定。缺少导读、版本变化或引用损坏时，从当前报告的 `taxonomy/evidenceDetails/gaps/references` 生成路线与证据入口，不沿用旧判断；未经匹配的论文锚点不提供章节跳转。维护者随后应重新综合新证据、更新导读并导入，而不是只改版本号。上游本地研究流水线也须在同版重建时保留导读，并在报告或论文版本变化时移除旧绑定。

`--check` 对新版本允许一个明确的待复核状态：索引中完全没有 `survey` 字段，且维护源绑定的报告或论文版本确实不同于当前版本。检查仍对维护源原来绑定的冻结资产核验引用和锚点，随后输出 `synthesis pending review; using current report structure`，正常完成构建。相同版本却漏做导入、索引仍带旧版本导读、历史引用损坏均会失败。普通导入命令始终要求匹配当前版本，不能将旧判断直接导入新报告。

## 阅读与证据口径

| 数据 | 页面用途 | 更新依据 |
| --- | --- | --- |
| `thesis` | 冻结论文的章节组织摘要 | 同版论文 |
| `scenarios` | 网页前置负载表：六类变化、24 项相关工作；负载、动态来源、图影响、归纳适配思路与工作对象 | 原论文及冻结稿的引用编号；分组独立于原稿小节标题 |
| `routes`、`subcategories` | 第 4 章四大通用执行图核心机制、10 组 33 项独立文献；判断与局限 | 同版论文第 4.3–4.6 节；工程记录仍绑定原冻结报告 |
| `update` | 学术稿版本摘要与历史工程报告变化 | 摘要对应 v5 CSUR 六章双视角综述；分项仍为报告修订 2 → 3 的实际对照，不等于今日重测 |
| `researchAssessment` | 待验证问题的研究资格、重开条件 | 2026-11-17 共享研究反馈，范围为第二项工作的纯推理论文选题 |
| `pendingQuestions` | 待综合 PR 影响什么问题、缺哪些证据 | `pendingEvidence` 里的实际候选；仅说明核验任务 |

当前静态工程报告仍为冻结修订 3，版本 `6dd5554a521e6faeb3477353dd6258a54089733402109dec9c3555eb67ba1d66`，资料截至 2026-11-14，来源复核/报告修订于 11 月 15 日；既有研究选题反馈为 11 月 17 日。学术稿资料截至 2026-11-24，版本标记为 `v5-csur-20261124`，冻结 SHA-256 为 `62dba962fda5240ee8b37bdac3d8c877245daabcdab03265e7ef7ead46d0fd86`。

v5 遵循 ACM CSUR 多视角系统综述框架，共六章：第 1 章引言，第 2 章软硬件技术基础，第 3 章典型大模型推理场景，第 4 章通用执行图系统架构与核心机制，第 5 章多维实证归因与昇腾 ACLGraph 工程落地，第 6 章五项可检验研究机遇。第 3、4 章构成并列技术视角；全篇收录 74 项文献与规范来源、147 条社区 PR，其中场景 24 项与机制 33 项共 57 项不重复引用。

网页前置负载表于 2026-11-26 按主要变化来源重组。六类可同时出现；`strategy` 是综述归纳的图适配思路，`works[].context` 标明每项工作的实际研究对象。原稿正文、PDF、Word 和机制视角保持冻结版本；行内“参阅原稿”链接提供相关内容入口，不表示正文已经采用新分类。

| 主要变化来源 | 相关原稿锚点 | 相关工作数 |
| --- | --- | --- |
| 请求组成与 KV 状态变化 | `section-3-1` | 6 |
| 阶段与执行规模变化 | `section-3-2` | 5 |
| 控制流与验证结构变化 | `section-3-3` | 5 |
| 注意力掩码与稀疏结构变化 | `section-3-1` | 2 |
| 适配器与专家配置变化 | `section-3-4` | 3 |
| 跨设备依赖与执行组织变化 | `section-3-4` | 3 |

本次归类核验依据：

- [Cortex](https://proceedings.mlsys.org/paper_files/paper/2021/hash/eca986d585a03890a412587a2f5ccb43-Abstract.html) 是递归模型编译，[ACRoBat](https://proceedings.mlsys.org/paper_files/paper/2024/hash/096b1019463f34eb241e87cfce8dfe16-Abstract-Conference.html) 是一般动态控制流自动批处理；两者列作动态模型对照。[CoRa](https://www.pdl.cmu.edu/PDL-FTP/BigLearning/MLSys-2022-the-cora-tensor-compiler.pdf) 处理不规则张量与填充，归执行规模变化。
- [FlexAttention](https://proceedings.mlsys.org/paper_files/paper/2025/file/61a9278dfef5f871b5e472389f8d6fa1-Paper-Conference.pdf) 与 [FlashMask](https://arxiv.org/html/2410.01359v2) 对应注意力访问和稀疏掩码，独立于请求调度。FlexAttention §6.3 也提供图集成证据。
- [PLA-Serve / LAPS](https://proceedings.mlsys.org/paper_files/paper/2026/hash/bbb7506579431a85861a05fff048d3e1-Abstract-Conference.html) 明确对短预填充使用 CUDA Graph 聚类，因此在该行直接署名；不将其归为离线批处理。
- [COMET](https://arxiv.org/html/2502.19811v3) 支撑 MoE 通信计算重叠；Triton-Distributed、FlashOverlap 和 CloudMatrix384 分别作为通信机制或部署架构参照。原表“多模态编码器”缺少对应工作，本次移除此标签。

核验范围为上述原论文摘要及争议处的相关段落，不据此声称每项工作实现了同一套图捕获、重放或地址更新机制。

| 核心机制路由 | 正文锚点 | 细粒度机制分组 | 代表工作数 |
| --- | --- | --- | --- |
| `capture`：图捕获、合法性改造与图粒度控制 | `section-4-3` | 符号形状编译与跨层静态化降阶；捕获合法性改造、分段切分与混合模式 | 7 |
| `replay-state`：动态参数更新、显存与地址稳定性管理 | `section-4-4` | 虚拟内存映射与稳定地址解耦；图外计划缓冲、原地更新与事件张量同步 | 5 |
| `scheduling`：并发执行、多流与设备侧任务调度 | `section-4-5` | 主机侧多流并发图调度与自动优化；设备侧持久化内核与无主机任务图；服务微批流水与大规模分布式重叠 | 12 |
| `lifecycle`：图生命周期管理、缓存与跨进程恢复 | `section-4-6` | 冷启动阶段剖析与快速权重/实例加载；操作系统与运行时 GPU 检查点恢复；执行图离线物化与增量检查点恢复 | 9 |

稿件 PDF 为 59 页，含 5 幅图（硬件执行栈、执行图生命周期、推理场景、图表示模型、系统机制演进）及表 1–7，使用 XeLaTeX 排版。Word 作为同版可编辑资产冻结，不据此声称两种排版页数相同。部署时完整复制 v5 试导入包，保留 `origin/main` 的全部历史论文目录，仅清理已被替代的未发布版本。

代表工作编号直接取自作者稿 `draft/publication-reference-map.json`，并核对同版 `paper.html` 的 `data-source-key` 与 `ref-1` 至 `ref-74`。动态编译系统 Nimble（2021）归属第 4.3 节，GPU 调度系统 Nimble（2020）归属第 4.5 节。前端在组件内校验 `scenarios` 的字段、章节锚点与引用编号；数据缺失或无效时隐藏该视角，机制细分缺失时保留原有示例导读。论文更新不改变工程报告、来源 ID 或研究反馈的历史日期；本次没有新增 NPU 实验。

研究反馈的维护依据是既有 `feedback-pilot/gap-feedback.json`（topicId=aclgraph、reportRevision=3、researchCheckpoint=0030）。此处将其中五个既有问题的决定、理由与重开条件摘要纳入导读，保留原始公开来源链接。四项为证据不足，一项为评测要求，不能当作五个已确认 Research Gap；工程修复和负结果仍有证据价值。冻结稿保留历史表述，页面用单独日期和范围的反馈说明后续判断。

## 持续更新规则

1. 新 PR 先作为候选，关联路线，写清技术问题和待核条件；数量增加本身不改变结论。
2. 新判断保留版本、模型/设备、负载、计数单位、基线、失败与未覆盖范围。后端切换、图开关、计划共享使用各自对照。
3. 研究稿更新后，重新核对导读的判断、局限、候选队列和研究反馈；不得仅替换版本号。
4. GPU 论文作为设计比较。Ascend 能力、服务收益和跨进程恢复须有对应证据。
5. 普通修复足够或未观察到可重复服务影响时，关闭或保留为证据缺口；达到重开条件后再升级研究候选。
6. 论文冻结后同步更新 `paperVersion`、分类标题与每项代表工作的参考文献编号，再运行导入与构建；只改版本号不能保证编号仍指向同一论文。
7. 检查三栏导航、来源跳转、旧深链、完整正文、Word/PDF 下载和窄屏阅读；核对场景与机制两个视角、8 个章节锚点、24 + 33 项不重复引用、10 组机制、5 幅图、表 1–7、公式及 ref-1 至 ref-74。验证新 manifest 及各下载文件的字节数与哈希。

页面入口：`#/topics/aclgraph`；综述 `?view=paper`；动态报告 `?view=report`。旧 `?view=evidence` 仍进入动态报告的 PR 与趋势。

逐节写作先形成对应的证据与论证，再合并完整正文。公开源包包含当前Word、MD、TeX、BibTeX、图片、构建脚本及来源登记；来源登记保存正文引用位置、原始URL、PDF版本和哈希，第三方论文全文不随网站源包公开。

# 社区研报网站

只读展示社区每日研究报告（`auto-research-report` 的产物）。本仓库只包含前端与已发布的数据快照，不包含采集、分析、组稿或模型调用代码。

负责人：曹哲 / @xmdhb。对应 issue #45、#51—#53。当前是只读网站与显式报告导入，不代表三组设计评审、生产接入或发布验收已完成。

## 启动

需要 Node.js 22。本仓库自带合成阅读样例，不需要模型密钥或 Python 环境：

```bash
npm ci
npm run dev
```

访问终端打印的地址（默认 http://127.0.0.1:5173/）。首页仅统计真实报告，因此**全新检出时首页显示“尚未接入真实报告”**；点击“日报档案”可查看完整、待核查及其他状态样例。真实历史材料不随代码提交，导入方法见下文。

`npm test` 验证版本、日期、正文、身份、图覆盖、安全链接、产物哈希和运行身份；`npm run build` 执行 TypeScript 检查及静态构建。静态结果在 `dist/`，用 `npm run preview` 预览，不能双击 `index.html` 代替 HTTP 服务。使用 HashRouter，刷新与深链接无需额外的服务器回退配置。

## 页面

### Word 日报本地预览

需要 Python 3.9+。导入器接受单份 DOCX、包含日报的目录或 ZIP。

```bash
python scripts/import-docx.py "/path/to/daily-reports.zip"
npm ci
npm run dev:docx
```

打开 `http://127.0.0.1:5173/#/` 查看推理流程总览，按来源和日期筛选 PR。选择流程节点后，可在下方按标题或 PR 编号搜索并翻页，点击条目跳到对应日报正文。首页只读取日报目录和独立的 `flow-index.json`，正文按需加载。已有本地数据可重跑导入命令补建索引。「研报阅读」打开最新一期，「日报档案」可切换日期。导入器将网页数据、正文引用的 PNG 和 Word 原件存到仓库旁的 `../work/docx-preview/`。普通开发模式和生产构建仍使用仓库的 `public/`。

文件名须以 `YYYYMMDD.docx` 结尾，并与正文日期一致。解析沿用日报的十一章模板、原有分组、正文段落和链接。同一份文件再次导入会跳过，同日新内容会追加为修订版。无法识别主来源的条目会保留正文和链接，并在导入时标为待核对。

### 已有站点入口

- /#/：优化方向首页；按一级标题显示累计 PR 占比、各方向数量/占比趋势、方向一览及对应真实 PR。审核和运行信息折叠在数据说明中。
- /#/reports：日期档案；保留真实与合成记录，搜索标题/日期/PR，按来源、状态、章节和日期筛选。
- /#/reports/normal：完整合成报告，十一章目录、八位置图、正文、来源入口和同版本下载。
- /#/reports/pending：待核查和临时位置混合样例。
- /#/items/:reportId/:encodedWorkId：对应报告版本内的条目与来源，显示证据及核验信息的缺口。
- /#/runs/:reportId：交付条目和可用程序检查；没有执行的发现/分析不显示为成功。
- /#/reports/empty、not-generated、failed：明确标记为合成的其他状态演示。

## 数据与安全

`public/data/catalog.json` 是站点索引，`public/data/<report-id>/` 是单个报告版本的产物（报告 JSON、Markdown、Word、PNG、运行信息）。索引中的每个产物都带 SHA-256，前端下载前会校验；校验失败拒绝使用该版本。

前端复用 `schemas/DailyReport.schema.json`（上游 `auto-research-report` 中 `examples/daily-report/DailyReport.schema.json` 的副本），额外校验日期、合成标志、章节顺序、唯一身份和编号、正文完整性及图位置覆盖。上游契约变更时需同步此副本。

展示内容通过 React 转义；不启用来源 HTML 或自动加载外部图片。来源链接只允许无凭据的 HTTP(S)，下载只允许交付清单中 `/data/<report>/<file>` 下的文件。

已展示工程条目（含 needs_review）按上游章节填图一次，论文不填图。临时位置沿用 location_basis 并标明仍待分类核验。条目位置、正文交付、人工核查及发布状态分别显示。原始报告文件不被重写。

导出数据不包含模型提示词、完整归档、密钥或原始异常。本仓库是 public 仓库，提交进 `public/data/` 的内容会公开可见。

## 部署

`.github/workflows/pages.yml` 在 `main` 上执行 `npm ci → npm test → npm run build`，并部署到 GitHub Pages；PR 只做检查不部署。

首次部署前需在仓库 Settings → Pages → Source 选择 “GitHub Actions”。项目站点地址为 `https://intellistream.github.io/auto-research-report-website/`，因此构建时把 `VITE_BASE_PATH` 设为 `/<repo>/`；改用自定义域名时改为 `/`。

## 接入真实报告

真实数据由上游仓库的导入脚本产出，需要该仓库的 Python 环境（校验复用 `sage_vllm_daily` 的 DailyReport 模型与组装完整性检查）：

```bash
# 在上游 auto-research-report 仓库根目录
.venv/bin/python scripts/site/import-report.py \
  --report-dir /实际运行目录/daily-report \
  --public-dir ../auto-research-report-website/public/data
```

脚本核对 manifest 中的文件哈希、身份、正文、章节及图号，只写入白名单字段，然后更新索引。提交 `public/data/` 的改动并推送 `main` 即可发布；导入是幂等的，相同版本不重复新增，内容冲突直接失败。

## 统计口径

统计实现位于 `src/statistics.ts` 和 `src/optimization.ts`，页面在 `src/Dashboard.tsx`，SVG 图表在 `src/OptimizationCharts.tsx`。仅读取 synthetic=false 的索引和报告，工程正文条目及待处理 PR 清单均计入，按 work_id（仓库+PR 编号）去重；同一 PR 的多版本只计一次。论文不并入 PR 总量。待核查和分析失败都不排除；未标记待核查不等于审核通过，多版本审核标记冲突单列。

优化方向直接沿用研报第三至第十章的一级标题：服务启动与模型准备、请求接入与调度、Prefill 输入上下文处理、P/D 分离部署的缓存交接、Decode 常规生成、推测解码、输出返回与状态更新、资源回收与缓存保留。前两章概览和位置图不作为方向，论文另列。临时分类仍计入交付章节并标记待核实；没有章节的待处理 PR 计入“待分类”，同一 PR 多版本章节冲突计入“分类不一致”，两者均保留在占比分母中。网页不按标题关键词重新分类。

环图显示当前来源/日期范围内累计 PR 的去重占比。趋势图按每个已交付报告日期内去重，同一 PR 跨日可以分别出现；支持数量和占比切换、图例显隐以及来源和起止日期筛选。点击环图或方向一览可筛选下方 PR 明细，但不改变图表占比分母。只有一个日期时只显示真实数据点；缺少日报的日期不补零，折线断开。真正空报告的数量为零，占比分母为零时显示未知。方向一览仅比较最近两个连续报告日期，占比变化使用百分点。

运行数据不完整时失败数量显示未知，报告加载失败时显示统计不完整，不以示例兜底。首页不加载合成报告，档案及示例详情保留。点击左侧品牌或顶栏“社区研报”均返回首页。

## 已知范围

本版已经实现统计首页、四类阅读/档案页面、下载和显式真实报告导入。没有后端、账号、任务触发、在线编辑或审批。浏览器 UI 检查与上游交接说明见上游仓库的 `docs/website-preview.md`。

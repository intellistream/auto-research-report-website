---
title: "面向大语言模型服务的推测解码综述"
subtitle: "Speculative Decoding for Large Language Model Serving: A Survey"
lang: zh-CN
---

## 摘要 {.unnumbered #abstract-zh}

推测解码以低成本候选换取目标模型并行验证，实际收益取决于一轮能提交多少有效输出、提交后的状态能否继续执行，以及推测新增工作如何影响同批请求。本文综述截至 2026 年 11 月 18 日的代表性研究和版本化实现，分别分析贪心一致、精确采样、合法前缀状态与服务收益的成立条件。通过比较检索与神经草稿、树形与块并行候选、验证预算和混合循环模型的状态恢复，本文说明，接受长度的改善只有在草稿、验证、恢复与调度的边际成本得到控制时才会降低单位输出代价。进一步以固定软件栈及可比评测为例，给出面向模型结构、负载和硬件的条件化研究问题。

**关键词：** 推测解码；大语言模型服务；精确采样；验证预算；前缀状态

## Abstract {.unnumbered #abstract-en}

Speculative decoding uses inexpensive proposals to expose parallel verification in a target language model. Its practical benefit depends on useful output per round, the validity of the state after commitment, and the cost imposed on concurrent requests. This survey reviews representative research and versioned implementations through November 18, 2026. It examines the conditions for greedy equivalence, exact sampling, valid committed-prefix state, and serving gains. By comparing retrieval and neural drafters, tree and block-parallel proposals, verification budgets, and recurrent-state recovery in hybrid models, we explain when longer acceptance translates into lower cost per emitted token. Versioned software case studies and evidence comparisons ground conditional research questions about model structure, workload, and hardware.

**Keywords:** speculative decoding; large language model serving; exact sampling; verification budget; committed-prefix state

# 引言 {#introduction}

自回归推理在位置 $t$ 上必须等待前一输出确定，再从该前缀计算目标模型的条件分布。对于较小的在线批次，每新增一个 token 仍涉及目标权重访问、前缀状态读取和设备提交。推测解码先提供若干潜在后继，再将已知候选在目标模型中并行求值，从而让一轮有机会推进多个 token。Blockwise Parallel Decoding 用贪心前缀匹配刻画了这一机会，经典推测采样则通过拒绝与残差重采样保持目标抽样分布。两条路线共同依赖合法的因果前缀，却分别要求确定性一致与随机分布一致。[@blockwise; @leviathan; @chen]

在在线服务中，验证成本随批组成、上下文、并行布局和目标架构而变。一条候选比普通解码多处理若干位置，有时只增加少量时间，有时引起额外的缓存流量、专家执行与通信。即使一轮产生的 token 已经合法，目标与草稿侧还必须为下一轮构造与已提交前缀相符的状态。已有系统协同综述以草稿来源、候选几何、验证保真度和运行时执行组织工作，并将状态可实现性与端到端收益作为共同约束。Towards Optimal Speculative Decoding 的公开摘要也将草稿效果、验证效率和系统执行联系起来。本文以这些已有综合为起点，将分析落实到一次可观察的提交、该提交对应的状态，以及同一负载下为它支付的关键路径成本。[@codesign; @optimal]

本文给出三项综合。首先，以候选、验证和提交边界建立共同记号，说明随机验证与状态发布须满足哪些独立条件。其次，沿候选依赖、验证预算、状态恢复与执行路径比较代表机制，尤其关注块并行草稿与混合 GDN–MoE 目标的结合。最后，通过同基线证据对照解释离线吞吐、在线延迟和 SLO 指标的适用范围，并提出可用配对实验检验的研究问题。本文属于机制综合，所述性能测量来自相应一手来源。

# 研究范围与文献获取 {#scope}

本文采用问题导向的叙述性技术综述。研究截点为 2026 年 11 月 18 日，来源复核日期为 2026 年 11 月 18 日。以公开的 Decoding Acceleration 索引、11 月检索记录及网站既有专题索引定位候选，再以系统名、DOI、arXiv 编号和组合关键词追查原文，包括 “speculative decoding recurrent state”、“draft verification budget”、“MoE expert bytes” 和 “hardware-aware speculative decoding”。正文纳入直接改变候选、验证、提交状态或服务成本，并具有可定位方法或实现证据的工作。多模态结果用于解释条件信息和节点预算，泛 Agent 应用、非推测优化和缺乏可核查技术材料的候选不进入主论证。定向检索的覆盖范围随问题而定。

理论证明、作者实验、官方文档、固定源码和工程 PR 分别承担不同的论证职责。发表稿与同一成果的预印本按一个研究身份处理，参考条目标识实际使用的版本。对于 *From Draft-Then-Verify to Systems Co-Design*，分类框架、方法剖面和 Co-Design Gates 依据公开 v1 全文，该版本形成 304 项研究的证据集，IEEE 发表摘要对应 312 项。*Towards Optimal Speculative Decoding* 用于公开摘要层的研究定位，正式全文的目录、公式及评测细节未纳入本稿论证。[@codesign; @codesign-ieee; @optimal]

# 正确性、前缀状态与单轮成本 {#framework}

## 一轮执行的观察边界 {#round}

将一轮开始时已对外提交的 token 前缀记为 $h$。草稿提出长度 $D$ 的候选链 $y_{1:D}$，或给出具备父指针的候选树。验证器对链中 $K$ 个候选或树中 $N$ 个候选节点求值。树中同层节点可能是互斥后继，实际输出只能沿一条从已提交前缀开始的合法路径。令 $A$ 表示该轮接受的草稿 token 数，$R$ 表示实际新增并提交的输出 token 数。全数接受时的 bonus token 或首次拒绝后的目标纠正 token 可能使 $R=A+1$。遇到 EOS、长度上限或取消时，按实际提交计数。实现也可能将本轮的最后一个新 token 留到下轮前向作为 anchor；应注明计算行是否含 anchor，避免将验证行数、草稿数和提交数混用。[@leviathan; @chen]

Table: 表 1　单轮与批次的比较记号。时间以墙钟或明示的设备计时口径记录，长度以对应对象计数。

| 记号 | 对象 | 含义 |
|:--|:--|:--|
| $h,c,S_c$ | 提交与物化状态 | 逻辑前缀、已物化边界、该边界的执行状态 |
| $D,K,N$ | 候选与预算 | 草稿链长、验证链长、树验证节点数 |
| $A,R$ | 进度 | 接受的草稿数、实际提交的输出数 |
| $B,L,Q$ | 执行形状 | 活跃解码请求数、上下文长度向量、实际目标查询行数 |
| $T_0,T_{m spec}$ | 关键路径 | 同配置普通解码步与推测轮的时间 |

## 验证规则决定保真度 {#fidelity}

在给定相同 tokenizer、前缀、logits 变换和 tie-breaking 的数学模型下，贪心验证逐位置比较候选与目标 argmax，在第一个不匹配处由目标决定输出，沿因果路径归纳可得贪心一致。有限精度下，宽验证与逐 token 运行可能选择不同 kernel 或归约顺序。若目标的两个最高 logit 接近，微小差异也能改变 argmax。应分别说明数学保证与实测 token 一致率。放宽到 top-$k$ 或以分数阈值直接接受，则改变了承诺，评估应回到任务质量或明确的近似准则。[@blockwise; @chen]

精确的 token-wise 推测采样在每个已经沿草稿到达的位置使用两份条件分布。$p_i(v)$ 是目标实际抽样分布，$q_i(v)$ 是生成当前草稿 token 的真实分布，条件均为该位置的合法前缀，包含各自生效的温度、截断及其他变换。对 $y_isim q_i$，接受概率与首次拒绝的纠正分布分别为
$$
a_i(y_i)=min{1,p_i(y_i)/q_i(y_i)},qquad
r_i(v)=rac{[p_i(v)-q_i(v)]_+}{sum_u[p_i(u)-q_i(u)]_+}.
$$

接受的概率质量为 $min(p_i(v),q_i(v))$，总拒绝质量为 $sum_u[p_i(u)-q_i(u)]_+$，补回后恰得 $p_i(v)$。当分母为零时，该拒绝分支以概率零发生。所有候选被接受后，额外输出从下一位置的目标分布采样。跨位置的保证依赖条件分布与已提交前缀一致，因而同一随机种子下出现不同序列与分布正确性可以同时成立。树、多候选以及 block verification 各需核对自身的选择与纠正规则。[@leviathan; @chen]

预算裁剪也有保真度前提。若在抽得本位置候选前按已知前缀和分数决定是否验证，经典规则可继续使用对应的条件 $q_i$。若选择依赖已经抽出的候选，验证器须匹配被选择对象的条件分布，或采用有独立证明的联合机制。以数学反例说明：令 $p=q$ 为二元均匀分布，只在候选为 1 时用原 $q$ 验证，否则从 $p$ 重新采样。被验证的 1 总被接受，最终输出 1 的概率成为 $3/4$。这里产生偏差的原因是送去验证的候选已经改变分布。贪心前缀裁剪还有自己的一组条件，主要是目标计算的因果不变性、fallback 及状态重建。[@leviathan; @codesign]

## 合法前缀状态与发布 {#state-invariant}

用 $cle |h|$ 表示目标实际物化到的位置，$S_c$ 包括目标侧有效 KV、循环层及卷积状态，以及后续读取所需的索引和长度。对给定目标配置 $	heta$，状态契约要求
$$
S_c simeq F_{	heta}(h_{1:c}),qquad
mathrm{pending}=h_{c+1:|h|}.
$$
$F_{	heta}$ 表示普通解码对该前缀的状态计算，$simeq$ 表示对后续目标计算可观察等价，有限精度时应给出容差或差分指标。物理块地址可以不同，逻辑位置、请求归属、有效范围和读写依赖必须相符。未提交分支可以暂存在设备缓冲中，但后续计算、其他请求及前缀缓存不可把它们当成合法历史。草稿缓存属于另一套状态，以其自身模型和同一合法历史重新裁剪、补齐或重建；它不需要与目标 KV 数值相等。[@codesign]

这一条件把验证与提交分开。验证器决定哪一段可以输出，提交器据此确定物化边界，必要时回收临时 KV、重建循环状态并发布计数。请求退出、槽位复用、异步 D2H 及图重放会引入额外的消费者排序要求。只检查当前轮返回的 token 可能放过被拒后缀残留到下一轮的问题。有限精度与状态污染也应分别定位，前者通常表现为相同逻辑前缀下的小幅计算差异，后者能通过先核对边界、索引和依赖再做差分来识别。[@codesign]

## 从接受长度到单位有效输出时间 {#cost}

对截断前的一条固定长度链，按 $A$ 的尾和恒等式有 $mathbb E[A]=sum_{j=1}^{K}Pr(Age j)$。其中每一项是前 $j$ 个位置共同接受的概率，可以写成沿存活路径的条件概率连乘。常见比例模型以所有位置的条件接受概率相同为近似。请求类型、生成位置和已接受历史改变这些条件时，单个全局接受率无法准确恢复 $mathbb E[A]$。同一平均接受率还可以对应不同的拒绝位置与落到关键路径上的恢复成本。[@leviathan; @chen]

设一次执行依赖图中草稿、验证、选择、状态提交和运行时操作的持续时间分别由对应节点记录。串行时这些时间可以相加。存在并行准备、D2H 重叠或跨请求资源竞争时，用已测相互干扰条件下的关键路径时间 $T_{m spec}$，并把排队与调度间隙按测量范围单列。对串行、可比且可作长期统计的解码轮，单位输出代价及收益为
$$
g_{m spec}=rac{mathbb E[T_{m spec}]}{mathbb E[R]},qquad
g_0=rac{mathbb E[T_0]}{mathbb E[R_0]},qquad
	ext{speedup}=rac{g_0}{g_{m spec}} .
$$
这里用总时间除以总输出的相应估计量。对批次应按所有请求的实际提交量记分子，将共同的墙钟窗口只计一次。在线服务还应分别记录请求排队、首 token、token 间隔、完成分位数及 SLO 下的可持续请求率。离线单轮比值用于解释热路径，不能单独推导带到达过程的服务收益。[@optimal; @codesign]

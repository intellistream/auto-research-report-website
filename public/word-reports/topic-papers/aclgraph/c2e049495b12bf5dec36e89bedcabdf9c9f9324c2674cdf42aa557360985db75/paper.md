---
title: "面向大语言模型推理的ACLGraph图执行技术综述"
subtitle: "ACLGraph Execution for Large Language Model Inference: A Survey"
date: ""
lang: zh-CN
---

## 摘要 {.unnumbered}

大语言模型服务反复执行相似计算，却持续改变请求成员、长度、存储映射和元数据。运行时图执行通过提前准备任务计划减少逐算子提交，其有效性因而取决于静态结构与动态状态之间的契约。本文以ACLGraph为中心，综合截至2026年11月15日的19项研究及相关官方规范和固定实现，区分直接Ascend设计、部署观察、可迁移执行技术和工作负载背景。本文提出图资产六元表示与地址、值、范围、依赖、请求世代五项不变量，按计划生成、提交更新、设备调度与状态恢复比较相关路线，分析CANN、torch_npu及两个服务框架的职责。比较表明，动态性可以通过参数、设备计划、图族和受限条件表示；生成位置、存储位置与消费位置必须分别讨论。分桶、部分捕获与回退又与资源争用、内存寿命和冷启动共同决定生命周期收益。本文据已有方案提出可组合状态契约、含共享成本的资产维护、计划共享、跨图多算子资源约束及静止点资产失效等研究方向，并明确其前提和可证伪方法。

**关键词：** ACLGraph；大语言模型推理；运行时任务图；动态状态；调度；图资产恢复

## Abstract {.unnumbered}

Large language model serving repeatedly executes similar computations while request membership, lengths, storage mappings, and metadata continue to change. Runtime execution graphs reduce repeated preparation and submission, but their reuse depends on contracts connecting stable task structures to dynamic state. Centered on ACLGraph, this survey synthesizes 19 studies available by November 15, 2026, together with official specifications and versioned implementations. We distinguish direct Ascend designs and deployment observations from transferable execution techniques and workload context. A six-component graph-asset model and five invariants organize comparisons of plan generation, submission and updates, device scheduling, and state restoration. The analysis separates where state is generated, stored, and consumed, and relates bucketing, partial capture, fallback, resource interference, and cold start through lifecycle costs. It identifies conditional research questions on composable validity, asset maintenance with shared costs, plan sharing, cross-graph resource and state constraints, and partial asset invalidation at quiescent points without treating existing solutions as absent.

**Keywords:** ACLGraph; LLM inference; runtime task graph; dynamic state; scheduling; graph restoration

# 引言

大语言模型推理把运行时图执行带入一个特殊的系统环境：执行反复发生，请求状态却持续变化。解码阶段每轮产生少量新 token，主机调度、算子准备与设备提交可能进入时延关键路径；连续批处理又允许请求在迭代之间加入和退出，使长度、有效行数与存储映射不断改变。Orca 的迭代级调度、vLLM 的分页存储及 SGLang 的结构化生成分别揭示了成员、寻址和计算粒度的变化，因而“批大小相同”并不足以说明两轮执行具有相同状态。[@yu2022orca; @kwon2023vllm; @zheng2024sglang]

运行时图执行通过提前记录任务及其依赖，减少重复准备和逐任务提交。CUDA 将图定义、实例化与执行分开，CANN 的 ACLGraph 则将捕获的流任务暂存为运行实例，再异步执行该实例。二者都提供计划复用的基础，却具有不同的更新、资源和同步契约。减少提交频率不会自动更新请求状态，也不保证图内任务已经获得最佳资源安排；图执行的作用必须与编译、算子实现及服务调度分别分析。[@nvidia2025cudaguide; @cann900overview; @cann910update]

已有研究分别推进了这一问题的不同部分。Nimble、IOS、AutoGraph 和 Opara 在准备摊销、阶段选择、图重写和提交顺序上优化已有任务；Rammer、Mirage 和 MPK 进一步改变调度粒度或生成跨层程序。FlashInfer 将每轮规划与可捕获执行分开，Medusa 和 Foundry 把图绑定与执行环境作为可恢复资产。它们分别回答计划如何生成、怎样提交、在何处调度以及失效后如何再次可用，不能仅按最大加速比排成一条进步序列。[@kwon2020nimble; @ding2021ios; @zhao2023autograph; @chen2025opara; @ma2020rammer; @wu2025mirage; @cheng2026mpk; @ye2025flashinfer; @zeng2025medusa; @liu2026foundry]

ACLGraph 的公开证据还具有特殊结构。xLLM 技术报告直接讨论 Ascend 上的 Adaptive Graph，并给出图模式开关消融；Ascend 实地研究记录了复杂负载部署中采用或放弃捕获的经历。前者是设计预印本，后者是观察性预印本。与此同时，CANN 规范、torch_npu 和服务框架源码能够解释真实更新协议，但源码中的机制存在不等于跨配置性能成立。综述因此需要把学术设计、规范契约和实现案例连接起来，同时保持证据层次。[@liu2025xllm; @yu2026ascendfield; @torchnpu2026graphs; @vllmascend2026impl; @sglang2026impl]

本文的中心论点是：大模型服务通过分离可复用任务结构与动态请求状态获得图执行效率，而复用能否成立，取决于跨层有效性契约及维护该契约的成本。本文有三项综合贡献。首先，以图资产和变化来源建立统一分析框架，区分编译表示、运行时任务与服务批次，并提出地址、值、范围、依赖和请求世代五项不变量。其次，按计划生成、提交更新、设备调度和状态恢复比较已有路线，将 GPU 可迁移设计映射到 ACLGraph 的直接软件栈证据。最后，将分桶、切图、回退、资源竞争与恢复共同置于生命周期中，导出具有既有解法、适用条件和可证伪假设的研究问题。这些贡献属于文献综合与机制解释，不是新的运行时、形式正确性定理或硬件实验。

第二节交代文献范围和版本处理；第三节建立分析框架；第四节比较编译与调度路线；第五节分析 ACLGraph 软件栈及动态状态位置；第六节讨论图族、资源和恢复的联合权衡；第七节比较实验证据并提出研究方向，最后给出结论。

# 研究范围与文献获取

## 问题导向的检索与纳排

本文资料截止于 2026 年 11 月 15 日。文献获取采用两组互补的定向检索：一组围绕运行时任务图、编译与 GPU 调度，另一组围绕 ACLGraph、NPUGraph、Ascend 推理及产生动态状态约束的 LLM 服务。检索使用论文题名、系统名、DOI 和组合关键词，例如“ACLGraph Ascend inference paper NPUGraph”“FlashInfer dynamic planning CUDA graph”及“Nimble Lightweight and Parallel GPU Task Scheduling”；随后沿会议官网、作者全文、arXiv、厂商归档文档和固定源码提交核实方法与评测；恢复方向在交叉核查中补入 Medusa。该过程不是穷尽数据库的系统检索，不给出虚构的 PRISMA 流程或召回率。

纳入研究需要直接解释图计划、提交、调度、恢复，或明确产生服务图约束，并能取得相关方法和实验原文。官方文档和源码用于核实直接 ACLGraph 契约，PR 仅作局部机制案例。排除仅同名的知识图谱 nPUGraph、光感知 LightLLM 与 Arm Compute Library ACL Graph；没有核实独立系统论文的 ModelTC LightLLM 只作为官方 GPU 实现参与比较。同一研究的预印本、发表稿和附录不重复计数。由此形成 19 项研究：2 项直接相关 Ascend 研究、14 项可迁移执行设计或编译研究、3 项工作负载背景研究；另以规范与实现补充软件栈映射。这里的数量描述本文证据集，不是对整个领域的规模判断。[@lightllm2026code; @liu2025xllm; @yu2026ascendfield]

证据池可分为四层。直接设计证据支持“提出了何种 ACLGraph 相关机制”，直接观察证据支持“特定部署遇到何种现象”；迁移设计支持跨平台机制比较，背景研究解释成员、寻址和程序状态为何变化。CANN 文档可支持接口语义，固定源码可支持责任和排序关系，却都不能独立支持服务收益。因此，后文表格同时保留机制、约束和验证范围，不把代码快照与同行评审论文当作同等强度的性能证据。

## 版本与经验结论的对应

版本身份决定可引用的结论。Opara 采用 2025 年正式卷期元数据，方法阅读来自作者接受稿；其 Rammer− 只是 Wavefront 策略移植。Mirage 采用 OSDI 2025 正式稿，MPK 则采用 2026 年更名后的 v2 预印本。Foundry 采用 2026 年 v1 预印本。Hybrid JIT 的 COMPSAC 2026 发表元数据已核实[@yadav2026hybrid]，但本文的方法与表格解读来自 arXiv v1，未核实发表全文与其一致；因此后文明确限定数字的版本来源。[@chen2025opara; @wu2025mirage; @cheng2026mpk; @liu2026foundry; @yadav2026hybridpreprint]

直接实现按读取时的固定提交解释，不能以可移动的主分支名称代替版本。本文核对的 torch_npu 提交为 2026 年 11 月 14 日快照，vLLM-Ascend 为 11 月 4 日快照，SGLang 为 11 月 15 日快照；后者在 11 月 2 日完成了独立 NPU runner 向通用 runner/backend 的迁移。规范分别标明 CANN 9.0、9.1 或商业 8.5 文档路径，不把其能力与限制拼成一个无版本的“ACLGraph 最新规范”。具体读取范围和文件定位保留在文献登记中。[@torchnpu2026graphs; @vllmascend2026impl; @sglang2026impl; @sglang2026refactor; @cann850updateapi]

# 静态计划与动态状态的统一框架

## 四种对象与不同的复用边界

模型语义图描述张量运算的数学含义；编译中间表示描述这些运算经过分解、融合、布局选择和专化后的程序；运行时任务图描述实际提交的 kernel、拷贝和同步操作；服务批次则是调度器在某一轮选择的请求与 token 集合。前三者是不同抽象层的程序表示，服务批次是执行工作集合，不必人为构造为另一张图。TorchDynamo 产生的 FX 图属于编译捕获接口，CUDA Graph 与 ACLGraph 属于运行时任务提交机制，二者同样使用“捕获”一词并不意味着捕获对象相同。[@ansel2024pytorch2; @nvidia2025cudaguide; @cann900overview]

各层之间也不是固定的一一映射。一个语义算子可能分解为多个 kernel，多个算子可能被融合为一个 kernel，一种服务批次又可能对应多个可用执行计划。Mirage 的 μGraph 将程序表示扩展到 kernel、block 和 thread 层次，MPK 的 tGraph 则把运行时依赖细化到 SM 级任务；它们改变的是表示与执行粒度，不能被等同为更大的 CUDA Graph。服务层的请求成员变化也不必导致拓扑变化：如果算子能读取受约束的长度和索引，工作量可以在固定任务结构内变化。[@wu2025mirage; @cheng2026mpk; @ye2025flashinfer]

图 1 将这些对象与图资产连接起来。它强调两条关系：编译路径决定任务结构和代码，状态路径决定本轮选择、参数与数据。正确复用要求两条路径在消费点相容，不能仅检查编译产物存在，或仅检查服务批量落入某个桶。

![图1　图资产与动态状态的跨层连接。六元资产及五项不变量为本文综合框架；箭头表示职责关系，不代表厂商内部实现。](figures/asset-contract.svg){width=100%}

## 六元图资产与变化分解

本文把可复用执行所依赖的资产抽象为

$$ A=(G,\theta,M,B,C,\Phi). $$

$G$ 为运行时任务拓扑及依赖；$\theta$ 为节点参数模式与绑定，包括标量、指针参数和可更新入口；$M$ 为地址映射、容量、布局及内存寿命；$B$ 为 kernel 二进制和函数入口；$C$ 为设备上下文、通信参与关系及其他执行环境；$\Phi$ 为可复用前提集合。该表示统一描述本文比较问题，不声称六个分量能在任何实际 API 中独立更新。参数可能引用 $M$ 中的地址，代码依赖 $C$，正是这种关联使拓扑相同仍不足以保证可执行。Foundry 对布局和二进制的恢复、TorchDynamo 对专化假设的检查，分别提供了这一综合的不同依据。[@liu2026foundry; @ansel2024pytorch2]

第 $t$ 轮的服务状态记为 $s_t$，包括请求成员、有效 token、长度、索引表、随机数状态和请求所有权。图选择函数将状态映射到候选资产 $A_i$，参数绑定过程再由 $s_t$ 生成该次执行需要的 $\theta_t$ 或设备可读数据。$\Phi_i(s_t,C_t,M_t)$ 表示相关前提是否满足。它可以部分由静态类型或编译 guard 检查，部分由容量和配置准入保证，部分通过事件和资源所有权维护；不是要求每轮完整计算一个巨大的布尔谓词。这个划分允许比较检查发生的位置与成本，而不预设某一种契约语言。

变化可以进一步分解。输入值变化通常只改变缓冲内容；形状变化可能触发参数更新、图族选择或重新编译；控制流变化可能由图外分派、预建条件体或回退处理；任务时长变化即使不改变依赖，也可能影响静态资源分配的质量；进程、二进制或通信环境变化则影响资产能否恢复。请求退出和 slot 复用同时改变成员与所有权，不能简单归入 shape。FlashInfer、CUDA 条件节点、MPK 的混合队列和 Foundry 分别处理其中不同的变化，因而“是否支持动态”应由这些边界组成，而不能用单一布尔值表示。[@ye2025flashinfer; @nvidia2025cudaguide; @cheng2026mpk; @liu2026foundry]

对于某个已选资产，静态性是相对于复用窗口而言的。例如，$G$ 在多轮间不变，设备工作队列内容每轮可变；$M$ 中虚拟地址稳定，映射到的逻辑请求却可以更换；$B$ 在一个部署周期内不变，升级之后则需要重新判断兼容性。这里的“固定地址”首先指被消费者使用的有效地址及其约束，不应混同于物理页永不改变。vLLM 的分页机制已经将逻辑序列与物理存储分离，但其原论文并未自动建立 ACLGraph 的状态协议。[@kwon2023vllm; @liu2026foundry]

## 五项不变量及其组合

地址与寿命不变量要求：消费者使用的指针及其可访问范围，在执行期间引用有效资源；若图绑定了固定存储，则其生命周期必须覆盖相应执行。参数更新或间接寻址可以改变合法地址来源，因此该不变量不是“所有地址绝对不变”。CANN 单流捕获文档规定相关资源须保持至运行实例销毁，CUDA user objects 则提供异步资源引用管理，二者体现了不同接口下的寿命责任。[@cann910single; @nvidia2025cudaguide]

值新鲜性不变量要求：消费者读到的是与本轮状态对应的值，而非捕获期或上一轮的值。同一地址可以存放正确的新长度，也可以残留旧长度，因而指针相等不能推出值正确。CANN 任务更新、torch_npu 更新记录和服务框架参数绑定为部分参数提供了刷新路径；设备缓冲写入则是另一种路径。两者都需要继续核对更新对象与消费者是否匹配，不能用“存在 update 调用”替代这一关系。[@cann910update; @torchnpu2026graphs; @vllmascend2026impl; @sglang2026impl]

范围不变量要求：有效请求数、有效 token 数、累计边界、上下文上界和 padding 语义相容，且不会越过所分配容量。它既约束资源上界，也约束有效前缀与填充尾部的含义。超过某个桶时，应选择能够覆盖输入的更大兼容桶、切换其他执行模式或重新构建；不能把输入交给更小容量图。FlashInfer 的上界布局和 LightLLM 的图准入是已有实例，但上界满足本身仍不能证明填充行不会误更新真实请求状态。[@ye2025flashinfer; @lightllm2026code]

依赖不变量要求：生产者的状态发布先于相应消费者读取，当前读者完成又先于下一次可能冲突的覆盖。事件、流顺序和主机完成等待维护的是不同偏序边。额外全局屏障可能保守地保证正确性，却延长关键路径；没有必要的边则可能造成陈旧读取。CANN 普通事件用于跨流捕获传播，external event 用于图外更新与图内消费者之间的连接，二者不能无差别互换。[@cann910multi; @cann910update]

请求世代不变量进一步要求：缓冲槽位、索引和输出属于当前请求及其有效执行轮次。这里的“世代”是本文对资源所有权更替的分析标签，不假定实现已有显式 generation 字段。请求甲退出后，请求乙可以合法复用同一 slot；地址、容量乃至长度都可能相同，但乙不能继承甲的过期索引和完成状态。vLLM 的块管理解释资源如何复用，SGLang 的 fence 解释相邻执行如何排序；将这些局部条件组合为请求语义仍是上层责任。[@kwon2023vllm; @sglang2026impl]

五项不变量是相互关联的检查维度，而非本文已经证明的充要条件。范围错误可能造成无效地址，错误所有权可能表现为值错误；某些数值差异也可能来自浮点执行顺序，不能一律归因于世代或依赖问题。因此，对应的证据需要区分地址检查、消费时值检查、读写偏序和输出差分。局部断言能够排除某类错误，却不能自然升级为整个服务的正确性证明。

## 三种边界情形

请求退出首先改变有效工作集合。固定容量图可以保留原输入存储，把退出位置变成合法填充；也可以选择另一兼容图。两种方式都需要刷新长度、slot 与索引，而不是只减少主机列表长度。Orca 已解决迭代边界上不必等待整批完成的问题，但其选择性批处理不直接规定捕获图使用的稳定缓冲如何更新。由服务调度进入图执行，必须增加这一状态绑定环节。[@yu2022orca; @ye2025flashinfer]

slot 复用把单轮合法性扩展为跨轮合法性。若甲的消费者仍在读共享元数据，乙提前覆写同一存储，即使每轮最终都能观察到正确值，也不能据此认定无竞争。图2只画出这一冲突别名集合上的写回、发布与消费顺序；独立host缓冲中的CPU规划、双缓冲或不相交设备槽中的生产可以提前进行，待合法时刻再绑定或拷入消费存储。FlashInfer区分pinned host计划缓冲和device workspace，NanoFlow也将下一轮batch formation与当前GPU执行重叠，说明状态生成不必等待所有当前读者。主机可先将replay入队，再完成更新；对应消费者须等待所读状态版本发布，不能仅凭Python行序判断可见性。[@cann910update; @vllmascend2026impl; @sglang2026impl; @ye2025flashinfer; @zhu2025nanoflow]

![图2　同一共享存储上的冲突写回示例。读者完成约束同一别名集合的再覆写，发布连接对应状态版本的消费者；独立缓冲中的规划或生产可提前进行。](figures/state-publication.svg){width=100%}

空 rank 则要求区分“没有本地有效工作”和“无需参与通信”。在需要共同参与的执行路径中，局部 token 数为零不自动授权跳过通信；元数据、填充及 collective 顺序必须与所用算法相容。这是分析性边界情形，不是对所有张量并行 rank 的工作分配描述。MPK 的计算通信任务表示、Foundry 的同结构跨 rank 模板以及 Ascend 元数据生产者案例分别提供相关机制；空工作可以在合法元数据协议内表示，也可能需要另外图族，不能预先断言其必然破坏模板或必然安全。[@cheng2026mpk; @liu2026foundry; @vllmascendpr21259]

## 关键路径与生命周期代价

为避免把已重叠的操作重复计时，设第 $t$ 轮实际执行的准备、更新、拷贝、计算、通信和等待构成依赖图 $D_t$。节点时长 $d_v$ 应在给定资源分配及干扰条件下获得，并把导致等待的资源序列化关系纳入图中。以最长依赖链定义该轮的分析性时长：

$$ L_t=\max_{p\in\mathcal P(D_t)}\sum_{v\in p}d_v. $$

若尚未建模排队或资源干扰，$L_t$ 只能是下界或结构解释，不是预测器。对同一执行，不应再把所有非关键路径节点的时长加回去；更新能否隐藏，取决于它是否推迟消费者以及与其他工作争用资源。

在部署窗口 $\mathcal T$ 内，可以另行统计图构建、编译、更新、恢复和存储占用，并将目标写成条件化的选择问题：

$$ \min_{\pi,\mathcal A}\;\sum_{t\in\mathcal T}w_t L_t(\pi,\mathcal A)
 +\lambda_b K_{\mathrm{build}}+\lambda_r K_{\mathrm{restore}},
 \quad \text{s.t. } H(\mathcal A)\le H_{\max},\;R(\mathcal A)\le R_{\max},\;\Phi_i(s_t)=\mathrm{true}. $$

$\mathcal A$ 是维护的图资产集合，$\pi$ 是选择及更新策略，$w_t$ 是工作负载权重，$K$ 表示窗口内付出的构建或恢复工作，$H$ 是保留内存，$R$ 是实例、事件等资源用量，$\lambda_b,\lambda_r$ 是分析所选权重。该式是本文提出的记账框架，未通过实验拟合；若构建或恢复已经进入 $D_t$ 的前台关键路径，相同时间不能再次计入对应 $K$。它使稳态收益与资产维护成本可分开报告，并允许针对延迟、吞吐或启动期限采用不同目标。IOS 的搜索成本、MPK 的设备调度成本和 Foundry 的恢复成本由此能在共同生命周期中定位，而无需假定它们彼此可直接相加。[@ding2021ios; @cheng2026mpk; @liu2026foundry]


# 执行计划的生成、提交与设备调度

图执行技术的第一个分岔点不在“是否使用图”，而在“谁在什么时刻决定执行什么”。同一段被捕获的算子序列，可以由主机在每次请求前重新规划，可以由主机一次性生成后反复提交，也可以由设备内的常驻调度器在运行中自行分派。三者的优化对象、最优性主张与静态条件各不相同，混为一谈会把“减少主机开销”误读为“消除调度”，把“离线搜索”误读为“运行时自适应”。本节区分计划结构、参数绑定、资源寿命与执行环境，并以第三节的五项不变量检查各种静态承诺。离线优化与运行时适应并不互斥：一套计划可以在部署前构造，再在受约束的状态范围内变化。

## 优化对象的分层：从算子内任务到跨算子阶段

Nimble、IOS 与 Opara 常被并置为“算子并行调度”工作，但它们优化的对象并不相同。Nimble 的出发点是重复执行同一静态网络时把框架准备工作移出热路径：预运行阶段收集 GPU 任务并保留内存，以 CUDA Graph 重放，再在最小等价 DAG 上通过二分图最大匹配配置流 [@kwon2020nimble]。其优化对象是“流与同步的配置”，静态条件是固定输入形状与重放期间有效的预留地址；逻辑并发被显式限定为最大逻辑并发，作者并未主张硬件资源能同时容纳全部并发。IOS 的优化对象则是“阶段划分”：对 DAG 的合法 ending 做动态规划，阶段内选择算子合并或多流并发，并用直接测量的阶段时延与剪枝控制搜索成本 [@ding2021ios]。它的最优性主张限于所定义的阶段空间与可测量、可组合的阶段代价假设，剪枝进一步收缩了该空间；这与 Nimble 的匹配问题属于不同层次的组合优化。Opara 则关注“launch 顺序”：在合法拓扑序之内，用轻量流分配、一次剖析、计算/访存类型交替与小资源需求优先来减少资源碎片与并发干扰，并以 FX、事件和 CUDA Graph 实现 [@chen2025opara]。三者覆盖互补的决策：Nimble 决定哪些任务可以并行、需要多少同步；IOS 决定哪些算子应被合并为一个阶段、哪些应并发；Opara 决定在已给定的并行合法性之内，以何种顺序发射以减少争用。任何“最大加速”的横向排行都会抹掉这一分层——它们回答的是不同问题，其收益也不可相互替代。

这一分层对 ACLGraph 的直接含义是：图捕获确定所选计划的 $G$ 及其在 $M$ 中的绑定和寿命前提，而上述三类工作优化的分别是 $G$ 的边与同步结构、$G$ 的阶段粒度、以及任务提交的顺序。当服务将具体任务序列捕获为 modelRI 时，阶段划分与提交安排通常已成为该计划的结构前提；后续可以修改什么，则取决于任务更新、条件任务及所用算子的接口，不能仅由“已经捕获”推断。这正是后文“动态状态契约”要处理的问题域。

## 搜索与最优性：从代数等价到跨层超优化

Rammer、Mirage 与 MPK 代表另一条路线：不只调度既有算子，而是改变算子边界本身。Rammer 的 rOperator 暴露 rTask，vDevice/vEU 承载编译期 rProgram，Wavefront 策略联合选择 rKernel 与任务映射，CUDA 后端用 persistent thread blocks 实现 [@ma2020rammer]。其原文明确把机制与策略分离：Append/Wait 两个调度接口加剖析器构成机制，Wavefront 只是其中一个策略，作者预期该机制可支持更高级的策略 [@ma2020rammer]。因此 Rammer 的“最优”不是定理，而是特定 wave 启发式在剖析信息下的条件性选择；其静态条件是执行时间相对稳定的图与后端必须实现映射和同步。Opara 中的 Rammer− 仅是 Wavefront 策略的移植，不含完整 rTask/vDevice 系统，不能作为 Rammer 整体能力的证据 [@chen2025opara]。

Mirage 把优化对象推到代数与调度、内核的联合搜索：μGraph 统一 kernel/block/thread 三层，先以抽象表达剪枝、再做等价检查，最后做布局、顺序与内存规划 [@wu2025mirage]。这里必须区分概率等价理论与单次测试实现：原文 §7 说明当前实现只做一次不迭代的随机测试，并计划在流程末端为最佳 μGraph 增加提供理论保证的最终验证步骤 [@wu2025mirage]。理论保证、随机测试配置与浮点误差检查必须分别叙述；当前搜索过滤不能自动继承完整理论误差界。Mirage 也不提供 ACLGraph 运行时或跨进程图恢复，μGraph 不是 CUDA Graph，片段收益不能直接替代完整模型收益。

MPK 与 Rammer 同样细化执行任务，并利用 Mirage 生成任务实现；其关注点进一步扩展到设备内执行模型：SM 级 tGraph 与事件、图规范化/线性化、mega-kernel 内的 worker 与 scheduler、混合 AOT/JIT 队列与分页共享内存 [@cheng2026mpk]。这里的JIT/AOT指任务入队时机，并非为任意新形状即时编译任务图。其原文对二者取舍给出明确机制解释：JIT 适应数据相关的执行时长不均（如 attention），但需 worker→scheduler→worker 两次同步；AOT 预入队只需一次事件同步，但无法吸收不均衡，故按算子是否数据相关分类，并在全局屏障后转回 AOT [@cheng2026mpk]。这实际上是把“静态条件”从整图粒度细化到算子粒度：$G$ 仍是按配置生成的静态 tGraph 族，$\theta$ 中的批大小用于在多个 tGraph 间选择，而算子级的 JIT/AOT 标签是编译期生成的计划属性，复用它们须满足 $\Phi$ 中的配置前提。MPK 的控制实验是离线批量推理（prompt 64、output 1024、最大批量 1–16），虽实现了 continuous batching 机制，但不是在线 SLO 验证；其 GPU SM/warp、TMA 与 NVSHMEM 假设不可直接套在 Ascend 上。截至本次核查，MPK 只按预印本引用，不能据致谢推断正式 venue。

## 静态条件的三种形态：形状、守卫与图族

PyTorch 2 与 AutoGraph 从两个方向处理“静态条件”。PyTorch 2 的 TorchDynamo 以字节码变换、guards 与 graph breaks 获取可编译区域，TorchInductor 做融合与代码生成，符号形状与安全条件下才使用 CUDA Graph [@ansel2024pytorch2]。其静态条件体现为 guards 覆盖编译假设：数据依赖分支可能回到 Python，符号形状支持与 CUDA Graph 可用性分别判定；论文当时会在部分动态形状情形禁用 CUDA Graph，这不等价于之后所有版本的限制。FX 计算图不是设备执行图，其加速比包含融合与代码生成收益，不能归因于图重放。AutoGraph 则面向多流执行器，用流网络分区、DP 加回溯搜索，以总节点代价与关键路径混合排序筛选候选，再在 Nimble 式流配置与 CUDA Graph 上实测反馈 [@zhao2023autograph]。其混合关键路径是候选筛选启发式而非全局最优证明，静态条件是 TASO 提供的等价替换规则与静态 DAG；作者页稿与会议 PDF 存在图表版本差别，本文不转录其逐项数值。

把三者并置可以看出静态条件的三种形态：Nimble/IOS/Opara 把形状与拓扑固定为捕获前提；Rammer/Mirage/MPK 把可分解性与后端映射固定为编译前提；PyTorch 2 以守卫保护程序专化，AutoGraph 则以给定等价规则界定图重写空间。ACLGraph 的服务化问题恰好落在三者交界：它同样利用提前准备的任务计划，但更新语义属于 CANN 自身契约，并需面对每轮变化的批组成、序列长度与 KV 映射。谁来解决这一矛盾，取决于把哪一项不变量交给哪一层。


Table: 表1　计划生成与执行路线的横向比较。最优性和动态边界均相对于各自表示与搜索空间；本表不构成性能排名。

| 路线 | 提前决定的对象 | 运行时仍变化的内容 | 主要成立条件 | 评测解释边界 |
|:--|:--|:--|:--|:--|
| Nimble [@kwon2020nimble] | 流映射、任务轨迹、预留内存 | 输入数据 | 静态网络、固定形状 | V100推理/训练；逻辑并发目标 |
| IOS [@ding2021ios] | 阶段划分、合并或并发 | 固定配置下输入值 | 阶段代价可测量；有限图宽 | 四CNN；批量和设备专化 |
| AutoGraph [@zhao2023autograph] | 等价图替换与并行执行计划 | 固定图的输入值 | 给定规则、候选实测 | 七模型；启发式代价非全局证明 |
| Opara [@chen2025opara] | 流配置、资源感知提交序 | 固定图的输入值 | 剖析及资源类型有效 | 两GPU六模型；Rammer−非完整系统 |
| Rammer [@ma2020rammer] | rKernel选择、rTask/vEU映射 | 计划内数据 | 可分解内核、后端同步 | V100/MI50、初步IPU；覆盖不等同 |
| PyTorch 2 [@ansel2024pytorch2] | guards保护的程序专化 | 受支持符号形状、分支回退 | 编译假设与图安全分别判断 | 多基准；不能把全部收益归图 |
| Mirage [@wu2025mirage] | 多层程序、布局和内存规划 | 专化输入数据 | 有限搜索与算子/验证范围 | 片段与集成；存在退化，基线已开图 |
| MPK [@cheng2026mpk] | tGraph族、任务实现与标签 | 任务就绪、批量选择及路由元数据 | CUDA设备任务和通信原语 | 预印本；离线批量而非在线SLO |

## FlashInfer：连接 LLM 动态性与静态图的桥梁

FlashInfer 是理解这一交界的关键。它把注意力计算拆为plan与run：plan在CPU上按序列长度生成负载均衡CTA队列及部分/最终输出映射，异步拷入device workspace固定偏移；run使用固定grid的persistent kernel，因而可被CUDA Graph捕获。匹配序列长度等计划规格的消费者可跨层共享计划。它还在初始化时为不同平均查询长度和组合格式建立多个wrapper及捕获图，运行时按当前KV配置选择图，再执行每步图外plan与图内run。动态性因此同时由图族选择和固定结构内的计划数据表达，并非只靠固定地址。[@ye2025flashinfer]

必须区分状态生成、保存和消费的位置：FlashInfer的plan在CPU图外执行，计划驻留GPU workspace，run在图内读取；device-resident不等于device-generated。补充材料E还允许用户经plan提供SM数，调度器据此分配tile，形成与NanoFlow式重叠衔接的资源规划入口；这不等于任意运行时都拥有硬件强制隔离。其G.3比较启用与禁用负载均衡调度器，可支持所列负载下调度机制的作用；正文SGLang后端比较则包含更多改变，二者都不能被解释为整个CUDA Graph开关的独立收益。容量上界、捕获参数和grid稳定仍是复用前提，GPU评测也不能替代Ascend测量。[@ye2025flashinfer]


Table: 表2　动态请求的生成、存储与消费位置。生成位置与是否被捕获是独立维度；相同设备驻留状态可由不同位置的生产者形成。

| 机制 | 变化如何表达 | 状态生成者／保存位置 | 消费与复用前提 | 证据类型 |
|:--|:--|:--|:--|:--|
| Orca/vLLM/SGLang原论文 [@yu2022orca; @kwon2023vllm; @zheng2024sglang] | 批成员、块映射、多token工作量 | 服务调度与相应状态结构 | 不直接给ACLGraph协议 | 工作负载背景 |
| FlashInfer [@ye2025flashinfer] | 图族选择、CTA队列和归约映射 | CPU plan图外／固定device workspace | run入图；匹配规格、容量及SM规划预算 | GPU系统与调度消融 |
| CANN任务更新 [@cann910update] | 同构任务组参数 | host更新流／运行实例任务 | 组内数量类型匹配；external event | 版本化规范 |
| xLLM [@liu2025xllm] | 参数化、partial/eager、多图 | 配套算子与固定offset池 | 需算子改造；图模式组合消融 | 直接设计预印本 |
| MPK [@cheng2026mpk] | 图族选择、任务队列、MoE元数据 | 设备内运行时／设备内存 | 预生成tGraph与任务实现 | GPU预印本 |
| Ascend元数据生产者案例 [@vllmascendpr21281; @vllmascendpr21259] | 长度/tiling及SAS/QLI设备任务入图 | 设备计算／持久缓冲；捕获边界变化 | 模型、算子、图模式和共享键限制 | 局部实现证据 |

# ACLGraph 的软件栈与动态状态契约

Ascend 侧的图执行不是单一 API，而是一条从运行时到服务框架的分层契约链。CANN 定义捕获、更新、条件任务与资源寿命的语义；torch_npu 把这些语义封装为 NPUGraph 与自动捕获/更新机制；vLLM-Ascend 与 SGLang 在此之上决定哪些状态在主机更新、哪些驻留设备、哪些由设备内生产者生成。三层的职责边界决定了“动态状态契约”的实际强度，也决定了证据能支持到哪一步。

## CANN 运行时：捕获、更新与条件任务的规范边界

CANN 9.0 的 ACL Graph 概述把图描述为：捕获时流任务暂存于 modelRI 而不立即执行，execute 时重复下发实例 [@cann900overview]。9.1 的单流捕获文档给出若干硬约束：捕获中对stream、event、device及context的执行状态查询或同步无效；GLOBAL 模式限制同步 memcpy；host 异步 copy 需 ACL 页锁内存；资源须存活至 model 销毁 [@cann910single]。跨流捕获要求支流直接或间接汇回主流，汇回后不得再向支流下发游离任务 [@cann910multi]；多流可表达依赖，但不保证实际并发或资源收益。

更新有两条路径。方法一预先以动态任务为界分段捕获，前后任务存入不同model分别执行，动态任务在段间下发；并非每轮都需重捕获，适合大量任务更新但受硬件 model 数量限制；方法二以任务组 handle 标记、在更新流上以 begin/end 配对更新，适合少量单算子任务，且原文明确“更新任务比单独下发任务更耗时”，组内任务数量与类型必须匹配，任务组不支持多线程多流并发更新 [@cann910update]。并发更新场景需用 `ACL_EVENT_EXTERNAL` 事件连接更新流与图内消费者 [@cann910update]。8.5 的 API 页进一步限定更新流不可处于捕获状态，并按产品及 HDK 版本规定适用范围和可更新任务总量限制 [@cann850updateapi]。这些规范共同界定了 $\Phi$ 的运行时下限：更新是显式的、有代价的、受资源与并发约束的，不能默认为廉价。

条件任务是另一条边界。`aclmdlRIAddCondTask` 在 9.1 中标注为试用 API、可能变更、不可用于生产环境，支持表为 A2/A3 推理产品及 950DT，Atlas 200I/500 A2 与 Atlas 推理/训练产品不支持 [@cann910conditional]。因此既不能说“CANN 普遍不支持条件”，也不能说“runner 已实现任意控制流”：底层条件任务入口存在，但其产品范围、试用状态与 runner 路径的采用是两件事，本次核查未在 runner 路径验证其采用、普适性或性能。


条件参数页进一步列出 IF、WHILE 与 SWITCH，以及分支数和 modelRI 数组表示；这证明规范已有受限条件与循环表示，而不是任意 Python 控制流。条件值的寿命同样重要：指定默认赋值标志时，每次执行前重置；不指定时由用户通过设备地址维护条件值。由此，控制选择本身也服从值新鲜性和跨轮依赖，而非加入条件节点后便自动正确。[@audit_cann_cond_params; @audit_cann_cond_create]

## torch_npu：自动捕获与更新记录的封装

torch_npu 的 NPUGraph 把上述语义封装为 Python/C++ 两层。Python 侧 `_GraphDispatchMode` 在捕获时对注册算子记录 dispatch record：取当前流与 ExternalEvent、调用 handler 预处理、解析 schema、以 `graph_task_group_begin/end` 记录任务组 handle、保存弱引用参数 [@torchnpu2026graphs]。更新时 `update_capture_record` 校验输入数量与记录数一致，在 update_stream 上逐条 `graph_task_update_begin`、改写 kwargs、重放算子、`graph_task_update_end` 并记录事件 [@torchnpu2026graphs]。C++ 侧 NPUGraph 的 capture 路由内存池，replay 执行实例并处理 RNG 状态；`raw_npu_graph_exec` 的文档明确直接执行会绕过 replay 的簿记（如 RNG 处理）[@torchnpu2026graphs]。这一层的关键限定是：注册表支持不等于所有算子自动更新；未注册算子走 passthrough，不产生 dispatch record；构建与驱动兼容性未在本次核查验证。

## vLLM-Ascend：descriptor 缓存、provider 协议与更新/重放顺序

vLLM-Ascend 的设计文档把职责分为通用 dispatch 与 Ascend wrapper/backend：descriptor 缓存、backend 参数 hook、ExternalEvent 与回放排序，并说明切图与尺寸覆盖受资源限制 [@vllmascenddesign]。模式指南进一步区分 ACLGraph、Npugraph_ex 与 Xlite 是不同层次/路径，支持组合与默认项按版本变化 [@vllmascendmode]。源码层面，`ACLGraphWrapper` 按 descriptor 缓存图，FULL 常见路径在前序加屏障；不同分支的 update/replay 主机调用顺序可以相反 [@vllmascend2026impl]。`UpdatableGraph` 注册 handle/event/provider，`resolve_tasks` 按 provider 解析当轮参数并断言数量匹配，`update` 在 update_stream 上逐任务 apply，并对 paged attention 复用 workspace 缓存 [@vllmascend2026impl]。这构成一个明确的 provider 协议：图持有更新任务，provider 在每轮提供参数，数量断言是 $\Phi$ 的一部分。该路径说明图所有权、参数绑定与事件发布如何组合，不能据数量断言单独推导参数含义正确。

## SGLang：从独立 runner 到 backend 迁移

SGLang 的 NPU 图支持经历了一个可观察的演进。issue 8030 建立 NPUGraphRunner 路线，并指出 FIA 的 host 参数需每轮 update，这是更新的直接动机 [@sglang8030]。issue 12194 以经验性条目列举地址、更新、事件、内存与资源约束，其中“sum/max 必同步”属过度概括，本文不采用该断言，也不外推其芯片资源数 [@sglang12194]。当前源码快照显示，NPU full graph backend 按 shape 持图，静态 buffer 承载当轮状态；单 worker 异步 update、replay 与 fence 避免跨轮改写：先等前轮 fence，再 submit 更新、提交 replay、等 host update 结束并记录新 fence [@sglang2026impl]。历史 NPUGraphRunner 类保留 host 长度与模型分流逻辑 [@sglang2026impl]。2026-11-02 的提交删除 `npu_graph_runner.py` 等文件并修改 backend 与通用 runner [@sglang2026refactor]。这是 backend 迁移而非去掉能力：删除类名不等于删除 ACLGraph 能力，当前主分支快照也不是已发布版本，且本次未运行分布式测试；CPU 镜像不可用时仍有 D2H 路径。

## 三种动态状态位置的区分

综合上述，动态状态在 ACLGraph 栈中有三个不同位置，混用会导致错误的性能归因。

其一是 host update：状态在主机计算，经更新流写入图内任务参数，由图内消费者通过 ExternalEvent 等待。CANN 方法二、torch_npu 的 dispatch record、vLLM-Ascend 的 provider 协议、SGLang 的 update 路径都属于此类。其代价包括更新和排序，其收益是避免为部分参数变化重新捕获全部计划。

其二是 device 驻留计划：计划数据位于设备固定偏移，由主机生成并拷入。FlashInfer 的 plan/run 划分是直接实例 [@ye2025flashinfer]。xLLM 的 HBM 池也借助固定 offset 和输入输出拷贝稳定地址，但缓冲池协议本身不等于可执行工作队列；两者共享地址稳定原则，处理的数据含义不同 [@liu2025xllm]。

其三是设备内生产者：部分状态由设备任务计算，任务可以在图外逐轮下发，也可以作为普通kernel被捕获或由常驻运行时派发。因此“计算位置”与“是否捕获”是独立维度。MPK将页分配与请求调度置于mega-kernel，设备KV元数据供attention任务读取，其SM/warp和NVSHMEM前提不能直接套用Ascend。Ascend局部案例将部分长度、tiling或SAS/QLI设备生产任务纳入捕获；其中#21259原已使用设备元数据算子，改变的是捕获边界及主机准备路径，并非把全部CPU规划算法迁到设备。它们均受模型、算子、产品与图模式准入限制。[@cheng2026mpk; @vllmascendpr21281; @vllmascendpr21259]

## xLLM：直接研究与观察研究的证据范围

xLLM 是 Ascend 上直接针对 ACLGraph 动态性的系统研究，但须严格限定其证据。其 Adaptive Graph Mode 包含三部分：维度参数化把 batch size、seq len 作为图输入参数；Partial Graph Mode 把动态形状简单的模块（FFN、LayerNorm，仅 num_tokens 维动态）抽为图执行，动态形状复杂的模块（多头注意力，涉及 batch_size、kv_seq_len、q_seq_len）走 eager，并按当前输入形状动态选择；共享 HBM 池以池基址偏移重描述内部张量，启动前拷入输入、执行后拷出输出 [@liu2025xllm]。自定义算子（PageAttention、AllReduce）需改造为接受形状相关参数作为 kernel 实参，避免在捕获期硬编码主机侧计算 [@liu2025xllm]。这明确说明 xLLM 需要算子改造，不等于 CANN 无条件支持任意维度。

其 Table 8 报告 Qwen3-1.7B 吞吐 2385.58→3038.88 tokens/s、Qwen3-4B 1539.93→1671.39，输入输出均为 2048 [@liu2025xllm]。但该表未单列卡数、请求率或重复次数，消融不能拆开各子机制贡献；xLLM 为预印本、非同行评审发表，其描述也未给出 CANN 逐 API 更新协议。因此这些数字只能作为“图模式开关在该配置下的观测”，不能作为各机制归因或跨配置外推的依据。

与之相对，Ascend field study 是观察性研究而非受控实验：16 卡 910、vendor 容器 0.13 系列，文本 W8A8 TP8×DP2 用 full-decode 图，VLM BF16 TP8×PP2 用 eager，二者并非 graph/eager 配对；作者因捕获问题使用 eager 并引用图资源警告 [@yu2026ascendfield]。该研究无图机制受控消融，不能把其他内核故障归因于图，旧容器观察也不代表 2026-11 最新能力。把 xLLM 的直接设计与 field study 的观察并置时，必须区分“系统提出了什么机制”与“现场观察到了什么现象”，xLLM 提供图模式开关的受控消融，但披露范围有限；实地研究提供非配对观察，二者具有不同的因果解释强度。

## 机制演进案例：内存别名、图资源共享与元数据生产者

三个实现案例可说明契约在工程中如何被具体化，此处只取机制，不作测试清单或性能结论。其一，某注意力元数据构建路径把 `query_start_loc_cpu` 复制为新设备张量，而公共元数据已含设备边界；在合并的 MTP draft decode 图中，这一重复 H2D 会被捕获并每轮重放。修复方式是直接复用 `common_attn_metadata.query_start_loc[: num_reqs + 1]`，使 FA3 收到的设备张量别名到 runner 维护的公共缓冲，而非独立副本；共享缓冲行为需跨消费者正确性验证 [@vllmascendpr21191]。这是“内存别名”类机制：同时减少了 $G$ 中的冗余拷贝任务，并将独立副本改为 $M$ 中的共享别名；新的读写寿命责任随之出现。

其二，某 draft 模型仅在 eager 时选择设备长度 CANN FlashAttn，启用 draft ACL 图后回退到 FIA，而 FIA 的元数据构建器把精确设备序列长度物化为 Python 列表并在主机更新注意力任务。改动允许合规配置在 eager 与图模式下都用 FlashAttn，长度准备与 tiling 留在图捕获内，同一注意力组内兼容层通过既有 `get_capture_resource()` 按元数据身份、token 数与注意力几何共享生产者；图所有权提供缓存寿命，回放对持久、经拒绝校正的设备缓冲执行捕获的生产者，无需 FIA 任务更新 [@vllmascendpr21281]。这是“图资源共享”类机制：缓存键包含元数据身份与几何等兼容条件，图所有权限定复用窗口。

其三，某模型的全图解码原已调用SAS/QLI设备元数据算子，但仍逐轮在主机准备executor及CPU标量。改动把这些设备任务纳入FULL图，保留动态设备输入、稳定输出及既有流/事件顺序，只在支持配置安装；draft与eager/piecewise沿用原路径。这减少的是逐轮主机准备和下发，生产计算此前已经在设备上进行。[@vllmascendpr21259] 三个案例分别改变别名关系、共享资源键与生产任务的捕获边界；其地址、值和依赖契约随之改变，不能合并为所有算子均获益的性能结论。


Table: 表3　ACLGraph软件栈的责任与未自动保证的关系。源码快照不同，不代表同一联合运行环境。

| 层次 | 主要责任 | 动态状态入口 | 同步/寿命机制 | 不能自动推出 |
|:--|:--|:--|:--|:--|
| CANN [@cann910single; @cann910multi; @cann910update] | 任务捕获、运行实例与更新 | 任务组、条件值 | 跨流汇合、external event、资源寿命 | LLM slot语义或最优重叠 |
| torch_npu [@torchnpu2026graphs] | Python记录及C++执行环境 | 已注册handler与更新记录 | allocator pool、事件、RNG簿记 | 所有算子都能自动更新 |
| vLLM-Ascend [@vllmascenddesign; @vllmascend2026impl] | mode/descriptor适配、图持有任务 | backend hook与provider | 图所有权、事件及前轮屏障 | 数量断言等于请求语义证明 |
| SGLang [@sglang2026impl; @sglang2026refactor] | 通用runner选图、NPU backend刷新 | 按算子协议的长度和静态buffer | 单worker update、rebind fence | runner迁移等于能力删除 |

## 软件分层与共同责任

表3总结四层之间的职责。CANN提供任务与同步原语，torch_npu记录可更新算子并管理捕获环境，服务层把本轮请求状态绑定到图。vLLM-Ascend的provider登记与SGLang的自动记录、长度字段和fence属于不同的协议组织方式：前者显式关联图与参数提供者，后者在通用runner与NPU backend之间划分设备策略。两者都需要确认值、有效范围、图所有权和跨轮覆盖顺序，接口形式本身不足以判定性能优劣。[@cann910update; @torchnpu2026graphs; @vllmascend2026impl; @sglang2026impl]

源码快照尤其不能代替资源模型。主机提交replay后再update可以与图内事件配合；共享pool也必须服从实际并发的存活区间。是否减少端到端时延，应回到第三节的依赖图及实际资源竞争，而不能由类名、调用行数或一次成功捕获推导。编译侧的Npugraph_ex、运行时ACLGraph和可选XliteGraph在文档中被分别列出，解释其组合时应继续保留层次。[@vllmascend2026impl; @sglang2026impl; @vllmascendmode]


# 图族选择、资源重叠与资产恢复

图族选择在服务层是一个受限的覆盖决策：给定可捕获的静态结构与逐轮执行状态，选择哪些任务进入图、哪些留在图外、哪些以参数更新或切图桥接。它同时分配状态绑定与失效处理的责任：消费时地址须有效，标量与元数据须符合当轮状态，桶（bucket）和填充（padding）须容纳有效范围，依赖须连接真实生产者与消费者，跨轮复用须尊重请求所有权。这些条件是同一契约的不同投影。若未通过更新、换图或回退修复失效，可能出现执行失败、陈旧状态或请求语义错误；是否能及时检测，仍取决于具体机制。

桶化与填充是范围不变量的代价来源。LightLLM按batch取可容纳请求的最近更大或相等桶，并检查最大上下文准入；SGLang NPU后端按算子协议padding和刷新slot。二者的选图发生在服务层，仍需匹配填充语义。FlashInfer也已提供图族选择：不同查询长度与格式配置被捕获成不同图，框架按KV配置分派，图外CPU plan再为本轮生成设备驻留计划。图族和计划并非两条互斥路线：前者改变离散配置，后者在所选图的容量及地址前提内改变工作分配。[@lightllm2026code; @sglang2026impl; @ye2025flashinfer]

部分捕获（partial）与即时执行（eager）的取舍则把范围不变量与依赖不变量绑在一起。xLLM 的 Adaptive Graph 以参数化、partial/eager 选择、多图缓存与固定 offset 内存池组合应对动态形状，但其前提是配套算子改造，且 Table 8 的图模式开关消融覆盖两个模型在固定 2048 输入输出下的整体效果，未单列卡数、请求率或重复次数，因此不能把该差值拆分为各子机制的贡献[@liu2025xllm]。Ascend 现场研究提供了互补的观察：多模态工作负载因捕获期失败而使用 enforce-eager，量化文本工作负载使用 full-decode ACL graph 并收到“捕获过多 batch size 可能导致 OOM 或挂起”的实验阶段警告[@yu2026ascendfield]。这是非配对的部署观察，说明所用版本的覆盖与稳定性影响模式选择；不能将两个负载的差异归因于图，也不能把捕获失败都归为容量越界。

资源重叠问题必须与上述选择共同分析，因为合法并发不保证物理共置或资源收益。NanoFlow以GEMM性能损失作资源占用代理，测量成对干扰并外推三路重叠，以两阶段搜索配置流水与资源，模型或工作量显著变化时重搜。POD-Attention则在融合attention内按SMID和计数器为CTA绑定prefill/decode，既比较50:50与当前批CTA比例分配，也按批组成在运行时自动选择配置：prefill占优用2 CTAs/SM，其余用4，并配合tile、虚拟decode CTA及prefill分裂限制。局部资源自适应已是其解法的一部分。FlashInfer又允许plan接收SM数并据此分配tile。三者分别暴露跨算子干扰搜索、融合kernel内适应和注意力计划资源入口，不能仅用“固定配置对动态选择”重述开放问题；其GPU粒度和比例也不能平移为Cube/Vector实测。[@zhu2025nanoflow; @kamath2025pod; @ye2025flashinfer]

把桶化、填充、partial/eager与资源竞争放在同一框架下，才能说明桶粒度怎样影响维护成本。在每桶独立捕获和保留、内核及共享策略固定时，细桶通常减少填充，却增加捕获、实例和内存维护；这不是无条件单调规律。Hybrid JIT确有新长度触发初始捕获的形状增殖问题，但Foundry将兼容图按拓扑及节点属性分组，模板构造与各参数集准备分离；FlashInfer的workspace上界又取决于请求容量、维度和CTA预算，而非仅由图数决定。因而应分别记录桶数、唯一模板数、参数集数、共享容量和实际重建工作。FlashInfer已经连接图选择、动态计划和资源入口，Foundry改变恢复对象的重建粒度，Hybrid JIT划分静态子图与动态区；它们改变的是不同成本项，不能各压缩成单一稳定对象或据桶数直接推断恢复时间。[@yadav2026hybridpreprint; @liu2026foundry; @ye2025flashinfer]


恢复方向已经有两种需要正面对照的解法。Medusa 在离线阶段记录任务、分配/释放轨迹和参数关系，以分配序列中的间接索引表示指针；在线阶段重放分配轨迹，将新返回的地址写回图节点。为处理同一地址被释放再分配造成的歧义，它把 kernel launch 与分配轨迹共同分析，而不是仅凭指针值匹配。其 kernel 恢复又结合名称查找、模块枚举与触发 kernel；重复层结构使第一层捕获能够触发后续所需模块。因此 Medusa 已恢复参数和 kernel 绑定，不能被描述为只保存拓扑，也不能把其方法整体简化为逐 kernel 手工补丁。[@zeng2025medusa]

Foundry 改变了恢复责任的放置：与其逐项把图中地址改成新地址，它用 VMM 重建图所预期的地址环境，并提取、重载所需二进制。两者都依赖可分析的执行环境，却选择了不同的稳定对象。Medusa 利用离线/在线控制流和分配次序的对应关系；Foundry 主动补记并重放捕获窗口分配，弥补跳过捕获造成的序列差异，同时固定KV容量。Foundry 的同拓扑模板还要求相关节点属性相容，跨rank复用需修补通信状态；PP不能直接套用所有rank共一模板的假设，需要按阶段处理。[@zeng2025medusa; @liu2026foundry]

这种差异使恢复比较回到六元资产：Medusa主要重建 $\theta$ 对 $M$ 与 $B$ 的绑定，Foundry更多重建 $M$、$B$ 和部分 $C$，再重用 $G$ 的模板。它们并不是互斥的逻辑方案，也没有在本文证据中形成同环境的性能对测。Foundry没有纳入Medusa作直接实验基线；Medusa的加载和冷启动实验在A100环境中包含KV初始化与图恢复等工作，并使用温执行环境，不能与Foundry排除权重和环境的初始化比例直接排序。CUDA user objects维护执行中的资源引用寿命，则既不是归档图，也不是恢复整个进程状态。[@zeng2025medusa; @liu2026foundry; @nvidia2025cudaguide]

资产恢复把上述选择的时间维度展开。冷启动包含捕获、编译、权重、环境初始化和首次可用等待；它们可能重叠，需明确测量起止和依赖，不能默认全部串行相加。Foundry 以确定性 VMM 布局、二进制提取重载、同拓扑模板与参数更新，把图拓扑连同地址和 kernel 环境作为可恢复资产；其计时明确假设温进程、预热 compile cache 与本地归档，省略权重加载及环境初始化，因此报告的 95%–99% 初始化缩短不是完整请求冷启动，也不是每 token 加速[@liu2026foundry]。这一限定与 Ascend 现场研究形成有意义的对照：后者报告冷启动耗时数分钟，原因是算子编译与权重量化，属于不同栈、不同测量口径的观察，不能与 Foundry 的秒级数字直接比较[@yu2026ascendfield]。Nimble 的预运行收集与固定内存重放解决同进程重复执行准备，它并未据此解决跨进程资产恢复；其静态网络与固定输入形状前提还限制了可直接容纳的请求变化[@kwon2020nimble]；Opara 以 FX 依赖图、一次剖析与流分配在 PyTorch 公开接口上组合资源感知调度与重放，其 Rammer− 基线只是 Wavefront 策略移植，不是完整 rTask/vDevice 系统，因此不能把 Opara 的相对收益读作对 Rammer 整体的评价[@chen2025opara; @ma2020rammer]。

资源竞争与恢复在此汇合为一个成本核算问题：生命周期成本应按关键路径计，而非把捕获、更新、回放、恢复的耗时盲目相加。一次参数更新的成本取决于它是否阻塞回放、是否与前一世代 fence 串行、是否触发重新捕获；一次桶切换的成本取决于目标桶是否已存在、其地址是否与当前工作区兼容。SGLang 当前 NPU 后端在单 worker 内先等前轮 fence，再提交更新、提交回放、等主机更新结束并记录新 fence，这一顺序说明更新与回放的主机调用次序可以因分支而相反，成本必须按依赖链而非按调用列表计量[@sglang2026impl]。CANN 9.1 的任务更新文档同时给出“切图保留动态任务”与“保持任务组结构并更新参数”两种方法，并明确更新比单独下发任务耗时，因此不能承诺 update 总比 eager 便宜[@cann910update]。更新是否划算取决于更新任务数、准备与传输、可隐藏时间、资源竞争和执行覆盖；仅凭任务数量比仍不足以预测交叉点。

# 实验证据的可比性与研究方向

现有证据的可比性受四类差异制约：版本与发表状态、测量口径、硬件假设、以及基线实现程度。第一类差异在 Hybrid JIT 上最尖锐。其 COMPSAC 2026 的 DOI 与页码 196–204 已核实，但本次实读的是 arXiv v1，未核对发表版的方法与表格是否一致；预印本文字称在全部评估生成长度上取得最低 P99，而其 Table II 显示 300–500 长度上 JIT+CUDA 为 17.31、18.90、20.50、22.09、23.68 ms，对应 TensorRT-LLM 为 16.54、16.53、16.54、16.61、16.65 ms，即长生成段并不占优[@yadav2026hybridpreprint]。这不是否定其短长度区间的收益，而是说明“全范围最低”的表述与自身表格矛盾，综述不能沿用该概括。其表I也存在算术范围问题：用各行基线除以Hybrid时延复算，HuggingFace范围约为1.85–2.90倍、TensorRT-LLM约为1.20–5.05倍，与正文给出的1.02–5.90及1.04–5.42不一致。复算只是文内一致性检查，不能替代重复实验；本文因此采用其机制和受限表格观察，不引用宽泛提升范围。[@yadav2026hybridpreprint]第二类差异在 xLLM：其图模式消融只覆盖两个模型、单一输入输出长度，且未披露卡数、请求率与重复次数，因此支持所报告条件下的图模式整体效果，但不能作为各子机制贡献的分解证据[@liu2025xllm]。第三类差异在 Ascend 现场研究：两个工作负载分别使用 full-decode 图与 enforce-eager，并非图与 eager 的配对对照，其并发甜点与冷启动观察属于部署观察，不能归因为图机制[@yu2026ascendfield]。第四类差异在 Foundry：计时排除权重加载与环境初始化，且假设兼容布局与二进制，其与 CUDA-checkpoint 的比较仅在单卡进行，因为后者不支持通信 kernel 所需的 IPC 内存[@liu2026foundry]。

MPK 的证据需要单独标注。其离线批量推理设置（prompt 64、output 1024、最大批量 1–16）支持 continuous batching 机制，但控制实验不是在线 SLO 验证；其 SM 级 tGraph、设备内 worker/scheduler、NVSHMEM 通信与寄存器按最大需求固定，都是 CUDA 特定假设，不能套用于 Ascend[@cheng2026mpk]。Mirage 的概率等价理论与其单次测试实现之间也存在距离：§7 说明当前为单次测试并计划添加最终保证步骤，因此不能把理论表述读作已执行的完整保证[@wu2025mirage]。这些限定不是要降低各工作的价值，而是要区分“机制已被证明存在”与“机制在目标条件下已被证明有效”。



## 可组合的状态有效性契约

最接近这一问题的工作已经提供了实质机制。TorchDynamo 用 guards 检查程序专化假设，FlashInfer 以 plan/run 和容量上界连接动态计划与固定执行，torch_npu 记录任务更新，两个 Ascend 服务框架再通过 provider、算子协议和 fence 绑定本轮状态。因此研究问题不是再增加一个更新 API，而是局部保证在共享元数据、slot 复用、图/eager 交替和空工作参与通信的条件下如何组合。某个图的参数数量正确，不说明每个参数属于正确请求；某个 buffer 地址正确，也不说明上一轮读者已经完成。[@ansel2024pytorch2; @ye2025flashinfer; @torchnpu2026graphs; @vllmascend2026impl; @sglang2026impl]

可检验的假设是：在算子显式声明输入范围、所有权与发布依赖的前提下，轻量世代标签和消费前检查能够检测仅靠地址及数量断言不能发现的陈旧状态，而无需每轮全设备同步。研究应先限定算子和图覆盖集合，构造请求替换、缩批后扩批和路径交替轨迹，比较现有断言、仅数值差分与契约检查的错误检出范围、误报和关键路径开销。故障注入可以改变更新对象、有效前缀或发布时序，但须保留真实消费者路径。若标签不能区分合法别名与错误继承，或必须依赖全同步才能成立，该假设即不成立。这里的研究贡献是可组合语义与代价，不是多运行若干测试。

还应区分数学等价、浮点可接受性、执行资源有效性和请求语义一致。Mirage 的理论与实现说明了前两者需要不同证据；图恢复后指针可用属于第三者；请求替换后输出归属属于第四者。任何跨层证明都必须给出覆盖的对象与信任边界，不能把有限随机测试或输出 token 一致性扩展为绝对保证。[@wu2025mirage; @liu2026foundry]

## 图族维护与资源调度的联合选择

xLLM 已结合参数化、partial/eager和多图缓存，Hybrid JIT使用按长度缓存与后台捕获，上游vLLM以模式及descriptor分派；FlashInfer进一步连接图族选择、每步CPU计划、固定workspace与SM数规划入口。IOS、Opara和NanoFlow则提供阶段测量、资源顺序和干扰感知优化。因此选图与资源适应本身均非空白。本方向关注资产集合的增删维护：请求分布漂移时，如何在实例/事件、保留内存和启动期限约束下决定构建、保留或恢复哪些资产，并计入模板及工作区共享改变的维护成本。[@liu2025xllm; @yadav2026hybridpreprint; @vllmcudagraphdesign; @ye2025flashinfer; @ding2021ios; @chen2025opara; @zhu2025nanoflow]

一个具体假设是：在这样的约束下，以预期关键路径收益减去维护成本来选择资产的策略，优于只按历史命中率保留图或只按 padding 比例增设桶的策略。其机制依据是，图命中频繁仍可能有高更新成本，罕见图也可能避免无法接受的尾部回退。可采用包含平稳、突变和周期分布的相同请求轨迹，比较固定桶、已有混合模式、带FlashInfer式选图/动态plan及资源入口的组合、命中率淘汰和联合选择；保持内核及总资源预算一致，分别统计执行、构建、回退和恢复的前台暴露时间。若收益只来自多占用内存或更换内核，便不能归于图族策略；若构建成本长期无法摊销，联合策略应退化为更保守的图集合。这使研究能被实际反驳，而不是承诺所有负载均受益。

## 计划生成位置与跨消费者共享

FlashInfer 已证明主机生成的计划可以跨匹配层复用，MPK 已在静态图族中执行设备内任务调度，Ascend 实现案例也已将部分元数据生产者纳入捕获。因而“首次把计划放到设备”或“首次合并逐层规划”都不是恰当的问题。剩余关系在于：逻辑长度相同而 attention 几何、tiling、工作区或更新语义不同时，哪些计划分量能共享，哪些必须由消费者重新解释。图所有权提供缓存寿命，却不能替代共享键的语义完整性。[@ye2025flashinfer; @cheng2026mpk; @vllmascendpr21281; @vllmascendpr21259]

可检验假设为：将消费者不变的长度/分区信息与布局相关计划分离，能在限定算子集合内减少重复生产，并保持与独立规划的输出和依赖一致；但只有当减少的主机准备与传输超过新增设备工作和工作区竞争时，关键路径才会缩短。研究需要在同一后端、同一覆盖图和同一请求轨迹上，分别比较独立 host 更新、共享 host 计划、图内独立生产者与图内共享生产者。记录准备、拷贝、事件等待、设备生产和消费的依赖，而不是只读 API 次数。若不兼容布局迫使大部分计划重建，或设备生产挤占计算资源而延长消费路径，则应识别这一负收益区间。该方法同时解释何时保留 host 更新更合理。

## 跨图与多算子的资源和状态约束

POD已经按当前批组成调整融合attention内的CTA分配策略，并运行时选择2或4 CTAs/SM；FlashInfer已经提供图族分派、动态plan及SM数入口，NanoFlow已经搜索多算子流水与干扰下的资源分配。MPK还显式承担设备调度器的资源成本。因此，按长度或prefill/decode比例选择局部重叠配置不构成这里的新问题；在Ascend复现这一选择只能首先视为迁移验证。[@kamath2025pod; @ye2025flashinfer; @zhu2025nanoflow; @cheng2026mpk]

与上一方向的资产集合增删不同，这里固定已维护的图资产与内核集合，研究多个算子及图之间的组合可行性和切换成本。假设attention、GEMM与通信有可切换但受捕获接口限制的实现，且若干图共享有上限的workspace或状态版本缓冲：局部最快配置可能延长临时结果寿命，与另一图的写入冲突，或因kernel入口、launch属性不兼容而需要换图或合法更新。POD的kernel内自适应不负责决定这些跨资产绑定与存储寿命，单纯独立选图也不会自动给出它们的联合代价。NanoFlow式干扰搜索必须被纳入比较；不能把跨算子优化本身重新命名为空白。所读机制尚未共同给出上述捕获兼容、状态冲突和切换代价的统一处理，以下仅提出这一条件性组合问题。[@kamath2025pod; @ye2025flashinfer; @zhu2025nanoflow]

可检验假设是：在相同候选图资产、kernel实现集合和内存/实例预算下，将状态版本寿命、合法切换及多算子干扰同时纳入可行性与关键路径模型，能相对分阶段组合减少前台等待或反复重绑定。强基线应按算子及可用后端采用POD式局部自适应或FlashInfer式图选择/资源入口，再在相同可执行候选集上加入NanoFlow式资源搜索；这不假定两种attention后端已经合为同一kernel。各策略均可选择相同变体，也都必须做相同别名检查、必要同步与容量限制。比较“先局部优化再修复冲突”和联合选择，在小规模上用穷举可行组合校验搜索差距，并分别消融干扰模型及状态寿命约束。测量跨图等待、重绑定、切换与总关键路径，以未拟合工作量检验泛化。若组合基线已吸收这些条件而同样有效，或收益依赖基线不可用的额外内存、内核或未摊销的重捕获，假设即不成立。研究还须先确认平台暴露的真实控制粒度，不能假定SM数规划入口等价于Ascend资源隔离。

## 恢复兼容性与部分失效处理

Medusa已通过分配索引和kernel定位恢复绑定，Foundry已重建地址、代码及通信环境并复用模板；后者也比较了CUDA-checkpoint与CRIU的整个CUDA context快照路线。这些对象须分开：图资产恢复不自动延续活请求的数据、RNG或输出归属。本方向因此限定在无在途请求且相关设备操作已经完成的服务静止点，考察图资产的部分失效；不提出活请求checkpoint或迁移方案。[@zeng2025medusa; @liu2026foundry]

具体问题是在驱动、硬件和并行布局固定时，单独改变算子二进制或预留容量，哪些模板、参数模式及地址绑定仍可复用。假设为：在所需地址、模块和实例接口可见的范围内，显式记录这些分量的兼容依赖，可在拒绝不合法组合的同时减少相对全重建的工作。对照应包括保守全重捕获、原系统支持的同环境恢复，以及遇到不支持变化即全重建的现有恢复策略；不能强迫原系统执行非法资产来制造优势。逐项改变条件并独立校验判定、初始化后的输出与依赖，记录图构建、加载、参数准备及前台时间，不用这些指标代表活请求恢复。仅拓扑检查可作为错误判定对照，不应让已知不兼容图实际执行。若变化迫使代码、容量和绑定整体失效，部分重建无收益亦是有效结果。ACLGraph是否具备所需可见原语须单独核实；研究贡献应落在兼容判据和失效传播，而不是补齐平台测量。

# 结论

面向 LLM 服务的 ACLGraph 图执行，核心是管理提前固化的任务决策与逐轮变化状态之间的关系。计划生成决定可表达的任务与并发，提交复用降低重复准备，设备内执行细化依赖和资源安排，资产恢复则把复用窗口扩展到进程和部署生命周期。静态拓扑可以承载动态输入，但必须由参数更新、设备计划、图族选择或条件表示明确接住变化；任何一种机制都不能独立免除地址、值、范围、依赖和请求世代责任。

跨工作比较揭示了三组互补关系。编译与调度搜索改善计划质量，重放改善提交路径，两者需要匹配代价模型；host 更新与设备计划改变状态的表达和生产位置，其取舍由关键路径与资源预算决定；Medusa 和 Foundry 分别恢复绑定与重建环境，使持久化从拓扑保存推进为执行上下文管理。直接 Ascend 研究及固定实现表明，这些关系已部分落在参数化、partial、任务更新、图内生产者和共享资源上，而不能简单解释为 CUDA 机制的名称替换。

本文的六元资产与五项不变量将这些设计放在共同坐标中，解释各局部保证的对象及组合前提。已有工作已经连接图选择、动态计划和资源自适应；本文提出的问题进一步限定为状态契约的组合、含共享成本的资产集合维护、跨消费者计划共享、固定资产集内跨图多算子的资源与状态约束，以及静止点上的图资产部分失效。其价值须由明确前提、强组合基线和可证伪对照检验。图执行的长期效率来自可维护的复用边界，而非单纯扩大捕获范围。


# 参考文献 {.unnumbered}

::: {#refs}
:::

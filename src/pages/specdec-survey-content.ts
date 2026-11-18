// Narrative technical survey, maintained independently from the living PR report.
// The chapter IDs are stable anchors for the interactive technical map.
export type SurveySection = {
  title: string;
  paragraphs: string[];
  sourceIds: string[];
  equation?: string;
};
export type SurveyChapter = {
  id: string;
  title: string;
  sections: SurveySection[];
};

export const specDecSurvey = {
  title: "面向大语言模型推理的推测解码技术综述",
  subtitle: "Speculative Decoding for Large Language Model Inference: Algorithms, Verification, and Serving Systems",
  abstract: "大语言模型的逐 token 解码受条件依赖与权重访存约束。推测解码以较低成本产生候选，通过目标模型的并行验证减少串行前向轮次；但候选接受长度、验证工作量和服务吞吐之间并不存在单调关系。本文从目标分布保持出发，将推测执行划分为候选生成、验证预算、接受采样、状态提交和服务调度五个相互制约的环节。首先比较历史查找、辅助模型、EAGLE/MTP、树形提案与块并行 DFlash/DSpark 的依赖结构，再分析动态验证宽度、Attention 与 MoE 计算形状、图回放、KV/递归状态生命周期对端到端性能的影响。特别讨论 GDN-MoE 混合目标中的 Verify 中间态与合法 Accepted State 之间的区别，并以 HybridSpec 和上游工程实现说明性能优化何以受到正确性合同约束。基于这些机制，本文给出以关键路径和有效输出为中心的分析框架，梳理仍需跨模型、设备和动态负载验证的研究问题。",
  keywords: ["Speculative Decoding", "LLM Serving", "Drafting", "Adaptive Verification", "GDN", "MoE", "Runtime"],
  scope: "研究对象为推测解码的算法与 Serving Runtime 协同优化。材料覆盖奠基论文、EAGLE-3、DFlash、DSpark、HybridSpec，以及 vLLM、vLLM-Ascend 和 Speculators 的文档与相关实现。网站社区索引保留 105 条已分类 PR；正文按技术问题引用代表实现，而不以 PR 数量推导性能趋势。",
  chapters: [
    {
      id: "motivation",
      title: "1 引言：从减少 Target 轮次到减少有效输出成本",
      sections: [
        {
          title: "1.1 为什么解码仍存在可利用的并行空间",
          paragraphs: [
            "自回归 Transformer 按 p(xₜ | x₍₍ₜ₎₎) 逐位置生成。当前缀很短、Batch 较小时，单 token Forward 往往需要重新读取相当规模的模型权重，设备计算单元未必被充分利用。随着请求并发增加，矩阵规模、Attention KV 访存和 MoE 激活情况又会变化；因此相同模型在不同负载下的 Decode 瓶颈不固定。",
            "推测解码并不改变目标模型的因果分解。它将未来若干位置的候选先行生成，使 Target 在一次计算中得到多个位置的条件分布，再按验证结果提交合法前缀。该机制把原来多次串行 Target Forward 替换为便宜的 Draft 与较宽的 Target Verify，收益来自成本结构的改变，而不是取消目标概率依赖。",
            "Blockwise Parallel Decoding 与经典 Speculative Sampling 分别奠定了并行提案、前缀确认以及分布保持的基础。今天需要重新分析的，是较宽 Verify 在动态批次、混合模型和复杂 Runtime 下是否仍然划算。"
          ],
          sourceIds: ["P1", "P2", "D1"]
        },
        {
          title: "1.2 研究对象和论证路径",
          paragraphs: [
            "本文按一次轮次的因果路径组织技术：Drafter 生成候选；Target 计算位置条件分布；Verifier 接受合法连续前缀；Sampler 决定拒绝后补样或全接受 Bonus；Runtime 提交 Token、KV 和其他模型状态。多个候选可以在一个 Target Forward 中验证，但已接受 Token 个数仍是随机变量。",
            "比较技术路线时采用三个互相独立的判断维度：正确性合同是否成立，局部计算/访存/调度成本如何变化，以及收益能否传递到固定负载的 TPOT、吞吐与 Goodput。研究重点在这些维度的交叉，而非追逐单项 Acceptance Length 或算子峰值性能。"
          ],
          sourceIds: ["P2", "D1", "D4"]
        }
      ]
    },
    {
      id: "correctness",
      title: "2 正确性模型：Target 分布、合法前缀与状态",
      sections: [
        {
          title: "2.1 概率接受、拒绝补样与 Greedy",
          paragraphs: [
            "设 Drafter 在同一已确认前缀下给出分布 q，Target 给出 p，候选 y ~ q。经典概率推测采样以 min(1,p(y)/q(y)) 的概率接受该位置，拒绝后从正残差分布 (p−q)₊ 的归一化形式重采样。逐位置在正确的条件上下文中应用这一规则，可保持 Target 分布；全部候选接受后的额外 Target Token 也必须按相应分布产生。",
            "Greedy 解码采用确定性的目标 Token 判断，正确性表现为与不启用 SpecDec 的目标模型相同的输出前缀。概率路径的相同分布不意味着在不同随机数消费方式下逐字输出相同。任何提前跳过完整验证的 lossy 方法，都应明示其改变了哪条概率或错误保证。",
            "多分支树提案进一步扩大候选集合，验证需保持祖先路径与位置掩码的一致。树上的一个位置是否可接受，取决于沿该路径所处的条件前缀，而不是把所有候选当作互相独立的可提交输出。"
          ],
          equation: "a(y) = min(1, p(y)/q(y))\nr(x) ∝ max(0, p(x) − q(x))\nE[emitted tokens/round] = 1 + Σᵢ₌₁ᴷ Pr(first i proposals all accepted)",
          sourceIds: ["P1", "P2", "P3", "P4"]
        },
        {
          title: "2.2 语义正确之外，还存在内部状态正确",
          paragraphs: [
            "对于普通 Attention，KV Cache 与 Block Table 指向已确认 Token 的历史。当 Verify 算过被拒绝的候选后，必须保证后续请求只能看见合法前缀对应的 KV 与位置。若额外 Drafter KV 在某一块末位依赖后一 Token，缓存身份本身就包含了 lookahead 条件；仅凭传统 Token Block Hash 复用可能不充分。",
            "对 GDN、Mamba 或 KDA 等 Recurrent 层，隐藏状态 Sₜ 是前缀的一种有损摘要。Verify 可能一次推进若干候选位置并得到多个临时状态；采样拒绝后的实际前缀只允许提交相应位置的状态。下一轮如果读入了被拒绝路径的中间态，即使本轮 Token 完全正确，也会在之后发生状态偏差。",
            "因此一个系统级正确性合同应同时覆盖 Token、Attention KV、Recurrent Checkpoint、请求槽位与异步读写顺序。Prefix Cache、Preemption、P/D 迁移和 Graph Replay 不是附属的可用性问题，而是状态合法性的延伸。"
          ],
          sourceIds: ["E5", "E7", "E11", "P9"]
        }
      ]
    },
    {
      id: "drafting",
      title: "3 候选生成：顺序深度、模型容量与前缀存活",
      sections: [
        {
          title: "3.1 从无模型提案到辅助模型",
          paragraphs: [
            "Prompt Lookup、N-gram 与 Suffix 检索复用已有文本的重复结构，不要求额外推理模型，也不需要为新 Drafter 分配权重。但候选有效性取决于重复上下文的覆盖，代码、模板化输出与长篇散文可能表现不同。廉价的提案并不必然具有高通过率，因此应将命中率与每轮提交数量分别测量。",
            "独立小模型可在不同 Token 分布上生成更条件化的候选，代价是额外模型权重、Draft KV 与多个串行 Forward。辅助模型越强，候选可能越好，但 T_draft 也会增长。真正的选择标准是额外提案成本是否足以被减少的 Target 调用抵消，而不是 Drafter 的 Perplexity 排名。",
            "Medusa 以多解码头提高候选集合生成的并行度，SpecInfer 则把候选组织为树并交给 Target 同时验证。它们展示了另一个重要变量：候选搜索空间不止是单链长度 K，树的分支与路径概率也决定验证 Mask、计算规模和有效结果。"
          ],
          sourceIds: ["D1", "P3", "P4"]
        },
        {
          title: "3.2 EAGLE/MTP：Target 特征引导的自回归草稿",
          paragraphs: [
            "EAGLE 利用 Target 的 Feature 构造对下一位置更有信息量的 Drafter，减少完全独立训练小模型的难度。EAGLE-3 将早期特征预测改为直接 Token Prediction，并用多个层级的 Target Feature 融合以及 Training-Time Test 训练机制改善草稿质量。这是提案端的技术演进，不能简化为单纯加大 Speculative Tokens。",
            "原生 MTP 通常从模型训练时附加的多 Token Prediction 结构提供候选；其 Forward 次数、Feature 接口、KV 保留方式以及 Target 兼容性需要按具体模型实现解释。EAGLE-3 与 MTP 同样可能产生逐步 Draft 序列，但不能假设两者共享训练目标、缓存生命周期或 Backend 支持。",
            "AR Drafter 的主要瓶颈是候选生成仍依赖串行步骤。vLLM #63096 的多步 Draft Graph 优化针对 Host 端反复构建 Metadata 的开销；局部 Draft 循环缩短并未在原作者的所有 Serving 条件下产生可辨的端到端提升。这说明 Drafter 循环只是完整轮次的一段。"
          ],
          sourceIds: ["P5", "P6", "E1", "D3"]
        },
        {
          title: "3.3 DFlash/DSpark：块并行预测与受控依赖",
          paragraphs: [
            "DFlash 使用轻量 Diffusion Drafter，在 Target Hidden States 条件下并行预测一个 Token Block，目标是用较少草稿轮次产生多位置候选。其代价转移为更宽的单次计算，以及块内后段候选与真实前缀之间较弱的依赖。长块不必然带来更长的合法前缀，这也是验证预算需要重新考虑的原因。",
            "DSpark 在块并行 Backbone 上加入低秩 Markov Head，让后续候选受到前一个已采样候选的影响，同时通过 Confidence Head 预测各位置的接受倾向。其位置置信度可供后续预算使用，但 Markov Sampling、Confidence Head 与 KV Cache 都是有成本的组件。",
            "这一谱系不是 EAGLE 被 DFlash 取代的线性胜负史。它们分别探索候选质量、计算深度和条件依赖的不同折中，并依赖不同训练资产、Target Feature 约定与 Runtime。DFLare 扩大了 Diffusion Drafter 获取 Target 层信息的方式，也要求重新核算模型开销。"
          ],
          sourceIds: ["P7", "P8", "P10", "D3"]
        }
      ]
    },
    {
      id: "verification",
      title: "4 Target 验证：动态预算与长度相关成本",
      sections: [
        {
          title: "4.1 每轮输出数量不是唯一目标",
          paragraphs: [
            "设一轮生成 K 个候选，Target Verify 通常需要评估最多 K+1 个条件位置；在 B 个请求组成的动态批次中，进入 Target 的 Query Rows 可能接近 B×(K+1)，也可能因 Early Trimming、Ragged Query、Padding 与 Graph Bucket 而显著不同。只有被验证并合法提交的前缀产生有效输出，其余 Verify 工作可能被浪费。",
            "一个简化的顺序轮次成本为 T_round = T_draft + T_target-verify + T_sampling + T_state + T_host。在存在 Graph Replay、流水重叠和多请求动态组批时，各项不一定能独立求和；严格性能判断应以实际 Critical Path 和单位时间完成的有效输出衡量。Acceptance Length 只是收益链的分母之一。",
            "增加 K 可能提高平均每轮有效 Token，也可能把 Target 从访存占优推向计算、Attention KV 读写或 Expert 执行占优；同一方法在低并发有利、高并发退化，并不构成矛盾。"
          ],
          equation: "T_effective ≈ critical_path_time_per_round / E[emitted tokens per round]\nVerify rows ≈ Σᵣ (kᵣ + 1)  (before padding; per-request kᵣ may differ)",
          sourceIds: ["D1", "D4", "P8"]
        },
        {
          title: "4.2 Adaptive Verification：把候选位置变成有成本的预算项",
          paragraphs: [
            "固定 K 把所有请求视为相同。Adaptive Verification 利用每个候选位置的接受概率估计，计算某个后缀位置存活到 Target 的概率，再结合已测量的设备形状成本，在全局 Verify Budget 内为各请求分配不同长度。高置信请求的靠后位置可能比低置信请求的靠前位置更值得计算。",
            "估计器与预算选择器本身不能免费。vLLM #65175 记录了 XPress 未向 Acceptance Estimator 提供信息时错误裁剪的后果；#63421 将预算选择由动态编译转为专门的 Triton Kernel，表明 Host 编译和 Launch 可直接出现在 SpecDec 关键路径。预算策略与实现执行成本需要同时进入评估。",
            "DSpark 的 Confidence Head 为块内位置提供预测，而传统在线估计器也可以从历史验证结果更新。它们的信号来源、置信度校准、请求生命周期和跨工作负载迁移能力不同。只有在 Target 与 Drafter 固定、预算成本测量独立、真实输出分布不被改变时，策略比较才可解释。"
          ],
          sourceIds: ["D4", "P8", "E2", "E3"]
        },
        {
          title: "4.3 MoE Router 使 Verification Cost 更依赖实际 Token",
          paragraphs: [
            "对于稀疏 MoE，验证宽度改变的不只是输入矩阵行数，还包括 Token 分配到各 Expert 的负载分布。固定长度成本表可能难以描述不同路由分布下的专家激活、通信与同步开销。对 GDN-MoE Hybrid，额外 Recurrent State 计算进一步改变多 Token Verify 的相对成本。",
            "HybridSpec 论文把 Budget 选择引入 Router 边界：先用较小验证范围运行到可观测 Router 的阶段，再利用已知路由信息决定后续 Token 的验证深度，同时重建合法 Accepted State。这里真正的研究对象是验证决策的位置和可利用信息，而不是普遍增大 Draft Depth。",
            "两阶段 Verify 的代价在于额外决策、可能分段的图执行及状态重构。它适用于哪些模型层布局、Graph 能力与设备后端，需要与固定 K 和普通 Adaptive Verification 作条件相同的比较。"
          ],
          sourceIds: ["P9", "D4", "E7"]
        }
      ]
    },
    {
      id: "state",
      title: "5 Hybrid Model 的合法状态：GDN、KV 与恢复",
      sections: [
        {
          title: "5.1 Attention KV 与 Recurrent State 的结构差异",
          paragraphs: [
            "Attention KV 通常按 Token Position 保存，验证后的被拒绝部分可以通过 Page/Block 生命周期隔离或释放。GDN、Mamba 和 KDA 层的状态却沿序列递归演进，Sₜ 表示先前全部合法 Token 对未来计算的摘要。若一次 Verify 计算了 Sₜ₊ₖ 而只接受前 a 个 Token，下一轮应从 Sₜ₊ₐ 继续，而不是读取 Sₜ₊ₖ。",
            "这使 Hybrid SpecDec 同时涉及三个历史：Target KV、Drafter KV 与 Recurrent Checkpoint。三者的有效位置和存储布局不一定相同；某些 Drafter KV 会读取 Target Hidden State 的投影，因此无需像普通 Target Sliding Window 那样为全部 Prefill 历史分配页。",
            "Lookahead Block Hash 与 Draft Tail KV 等工程路径说明了缓存身份和存活范围的细节。若 Prefix Cache 复用跨越 Drafter 状态边界，需要证明缓存 Key 与后续 Token 依赖一致。"
          ],
          sourceIds: ["P9", "E5", "E14"]
        },
        {
          title: "5.2 Accepted-State Reconstruction 与提交协议",
          paragraphs: [
            "一种策略是保留合法 Checkpoint，再在采样确定接受位置后重建目标 State；另一种策略是利用验证过程产生的中间表示，在合法前缀处提取或回放所需状态。正确性取决于所有 Recurrent 层是否消费了与最终提交序列完全一致的位置，尤其要审查被拒绝的第一个 Token 和 Bonus Token。",
            "RecoverSSM 类实现将后处理的提交与下一次 Verify 的回放拆开，使部分工作可以延迟或重叠。但 Pending Count、Checkpoint 所在 Block、请求退出和 Preemption 都成为协议组成部分。vLLM #66595 与 Ascend #21430 分别探索延迟回放与 Host D2H Snapshot 提前的不同问题，不能视为同一个实现。",
            "Graph Capture/Replay 还要求相同 Request Slot 的物理缓冲在执行前更新为正确世代；混合 GDN 的共享元数据需区分 Batch 公共字段和 Cache Group 私有状态。任何优化引入的共享视图、异步拷贝和回退路径都必须维持相同的提交顺序。"
          ],
          sourceIds: ["E7", "E11", "E12", "E18"]
        }
      ]
    },
    {
      id: "runtime",
      title: "6 Serving Runtime：Graph、采样与资源共存",
      sections: [
        {
          title: "6.1 多步 Draft Graph 与动态 Verify Shape",
          paragraphs: [
            "SpecDec 试图减少 Target Forward 次数，却往往引入更多小型 Draft/Selection/Sampling Kernel。对设备而言，Host Dispatch、Kernel Launch、图捕获、Shape Specialization 和 Context KV 都是实际成本。即使 Drafter 计算很少，多个 Host Round-trip 也可能主导轮次。",
            "vLLM 的多步 Draft Graph 优化减少 Draft Metadata 重建；Ascend 的 DFlash2 ACL Graph 则把 Backbone、候选选择和 Proposal Cache 更新纳入设备图回放。二者的关键条件不同：能否固定可复用缓冲地址、能否以图内动态值覆盖每轮候选，以及设备 Attention Backend 是否支持相应的捕获与回退。",
            "Target Verify 的长度可能因接受率估计、请求加入退出或预填充而变化，因此普通 Decode 图与变长 Verify 图并非可互换。变长图的收益还要计入 Padding、图族常驻显存和切换成本；尚未合入的 PR 不能当作已经可部署的功能。"
          ],
          sourceIds: ["E1", "E8", "E13", "E17"]
        },
        {
          title: "6.2 Sampling Kernel、内存峰值与动态批次",
          paragraphs: [
            "Target 计算出多个位置的 Logits 后，Rejection Sampling 仍需概率比较、重采样和输出位置整理。多个细粒度设备算子串行调用可能在 Host 端累计明显成本；Ascend #20254 将相关 Kernel 纳入 ACL Graph 的尝试，目标正是避免逐 Kernel Host Dispatch。",
            "高并发与较大 K 也会扩大 Target Logits 和 Top-k/Top-p 的中间张量。Ascend #20006 研究将行级排序分块以控制峰值内存，该路径强调正确性与可继续服务，并非自动获得更高 TPS。采样实现必须在精度、RNG 与相同条件概率下保持定义的一致。",
            "当 Batch 中既有 Spec Request 也有普通 Decode、Prefill 或正在结束的 Request，Scheduler 需要明确哪些草稿不会被消费。跳过无用 Draft 的收益不是多一种算法，而是把候选有效性纳入执行条件。"
          ],
          sourceIds: ["E9", "E10", "E6"]
        },
        {
          title: "6.3 KV Residency、Prefix Cache 与 P/D",
          paragraphs: [
            "Drafter 与 Target 争用同一设备容量。提高 K 可能增加 Draft KV、Graph Workspace 和 Verify Temporary，同时提高 Preemption 概率。真正的缓存优化应分别计算 Target KV、Drafter KV、Recurrent State 及图工作空间，不能只通过 Token Capacity 对比判断。",
            "Prefill/Decode 分离使这种状态所有权进一步跨实例。目标 Prefix KV 命中、EAGLE/MTP Lookahead 身份和 Hybrid SSM Checkpoint 均可能影响恢复语义。跨 TP 的 State Restore 对 TTFT 有意义，却不能被直接列入单轮 Verify 的加速倍数。",
            "面向生产系统，合理的 SpecDec 策略最终是运行时决策：何时开启提案、使用多大预算、采取哪个图路径、如何维护状态以及何时回退 AR。实现层的可观察性必须与算法层模型联合设计。"
          ],
          sourceIds: ["E5", "E6", "E14", "E15", "D2"]
        }
      ]
    },
    {
      id: "synthesis",
      title: "7 综合比较：用因果关键路径评价优化",
      sections: [
        {
          title: "7.1 不能把接受率、微基准与服务性能混为一谈",
          paragraphs: [
            "现有工程材料呈现出有价值的对照。vLLM #63096 的 Draft Graph 改善了局部草稿循环，整体 Serving TPS 变化却接近报告中的运行波动；#63421 既减少预算选择 Kernel 的 Host 开销，也报告特定 H200/DSpark 配置下的服务收益。二者说明真正需要解释的是局部收益如何传递到完整轮次。",
            "部分优化解决容量错误、兼容性或状态合法性，而非直接降低单次推理时延。例如 Sampling OOM 与 Prefix Cache Hash 错误首先是服务正确性或资源可用性问题。以这些改动数量统计'加速'会混淆不同类型的工程贡献。",
            "基础设施实验应同时记录 AR Baseline、固定 K、Adaptive Verification、同等配置新方法的 Target/Drafter 状态和实际输出。并发、输入输出长度、KV 类型、Graph Mode、Quantization 与后端变化须独立控制。"
          ],
          sourceIds: ["E1", "E2", "E5", "E10", "D4"]
        },
        {
          title: "7.2 从模型算法进步转向系统成本联合建模",
          paragraphs: [
            "从历史匹配到 EAGLE-3、DFlash、DSpark 的演进提高了候选质量或并行程度，Adaptive Verification 与 HybridSpec 则尝试减少 Target 对低价值候选的计算。仅凭更优的候选质量还无法保证吞吐；模型执行形状、Device/Host 分工、混合状态和 Runtime 容量必须进入同一优化目标。",
            "这里形成一个可检验的分析框架：先确认输出分布和 Accepted State 合法，再测量 Draft Cost 与 Target Verify Cost 对 K、Batch 和上下文长度的函数，最后将 Sampling、Graph 和调度空泡计入真实 Critical Path。某个方法是否有效，应由这个框架对未参与校准的负载作出预测，并接受失败案例。"
          ],
          sourceIds: ["P6", "P7", "P8", "P9", "D1"]
        }
      ]
    },
    {
      id: "open-problems",
      title: "8 研究问题：从单一方法改进走向可验证的协同优化",
      sections: [
        {
          title: "8.1 验证长度与设备成本联合自适应",
          paragraphs: [
            "现有动态预算已经利用候选存活概率和设备 Profile；仍值得研究的是这些估计在请求变动、混合模型和多卡通信中的适用范围。当 Target 的 Router/Expert 工作量与请求内容相关时，是否存在不引入额外同步的分阶段决策方式？比较对象应包括当前强基线，而非只和固定 K 竞争。",
            "一个可证伪的方案是冻结相同 Target、Drafter 与工作量，独立记录各候选位置的存活概率、Verify Rows、Router/Expert 使用和端到端 Goodput；检查额外预测与决策开销是否吞掉收益。"
          ],
          sourceIds: ["D4", "P9", "E2", "E3"]
        },
        {
          title: "8.2 Recurrent State 的通用提交边界",
          paragraphs: [
            "Hybrid SpecDec 要在 Sampling 已知之后维持 State 合法性，却希望把状态准备和提交从 Host 关键路径移走。一个有价值的统一问题是：Checkpoint、Accepted Prefix、Pending Replay 和缓存世代能否用显式可验证的接口表达，并同时支持 Preemption、Prefix Hit、P/D 和图回放？",
            "验证应覆盖零接受、部分接受、全接受和 Bonus；针对每个 Recurrent 层逐步对照未推测执行的状态，并让请求退出、重入与跨实例恢复在同一测试矩阵中发生。性能实验应以正确性覆盖达到门槛为前置条件。"
          ],
          sourceIds: ["E5", "E7", "E12", "E15", "E18"]
        },
        {
          title: "8.3 图与内存预算如何约束候选策略",
          paragraphs: [
            "动态 K、不同 Draft 结构与批次成员的变化共同决定 Graph Bucket 数量、Padding、临时 Logits、Draft KV 和 Recurrent State 占用。优化验证长度不能忽视捕获和常驻资源。一个跨层预算问题是是否能同时决策提案长度、图路径与缓存预留。",
            "实验应在等内存预算下回放固定的动态请求轨迹，记录图命中/回退比例、峰值 HBM、Preemption、关键路径和输出 Quality，判断新的联合策略相较现有 Scheduler 是否真正改进。"
          ],
          sourceIds: ["E8", "E10", "E14", "E17"]
        }
      ]
    },
    {
      id: "conclusion",
      title: "9 结语",
      sections: [
        {
          title: "机制闭环比单一速度指标更重要",
          paragraphs: [
            "推测解码的关键贡献，是允许廉价提案与昂贵目标模型在正确概率合同下分工，从而利用原本被串行解码限制的并行能力。过去的研究逐渐把问题从'如何产生更多候选'推进到'如何在有限设备预算下选择值得验证的候选'。",
            "随着混合 Attention/GDN、稀疏 MoE 与动态图服务成为重要目标，正确状态提交、形状选择、图与缓存的资源耦合成为新的性能边界。一个有说服力的系统结论不仅要说明每轮少了多少 Target 调用，还必须说明每轮增加了哪些工作、哪些状态仍然合法，以及这种交换在真实请求负载下是否划算。"
          ],
          sourceIds: ["P2", "P8", "P9", "D4"]
        }
      ]
    }
  ] satisfies SurveyChapter[],
} as const;

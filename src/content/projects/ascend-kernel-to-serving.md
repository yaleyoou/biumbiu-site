---
title: "从算子到 Serving：昇腾推理评测链路实践"
cardTitle: "Ascend Kernel-to-Serving Pipeline"
description: "从 MatMul、Online Softmax、Paged Attention 和 Quest Sparse Attention，一直到 vLLM-Ascend 集成与端到端评测。"
date: 2026-04-30
period: "2026.01 - 04"
role: "Competition TA"
status: "Completed"
stack: "Ascend / Triton / vLLM"
image: "/images/vllm-ascend-logo-dark.webp"
imageAlt: "vLLM 与 Ascend 联合标识"
tags: ["Triton-Ascend", "Ascend NPU", "vLLM-Ascend", "Sparse Attention"]
featured: true
order: 3
containImage: true
darkImage: true
---

从 1 月到 4 月，我作为助教参与了中国科学技术大学首届算子开发创新大赛的技术支持、赛题设计和评测体系建设。项目以 Ascend 910B3 为硬件平台，以 Triton-Ascend 为主要开发工具，目标不是完成几个孤立的算子，而是走通一条从基础计算到大模型推理集成的完整链路：

> MatMul / Online Softmax → Paged Attention / Quest Sparse Attention → vLLM-Ascend → Correctness / Throughput / Serving

我完整实现了各阶段的 baseline，并把 Paged Attention 与 Quest Sparse Attention 接入 vLLM-Ascend。主要职责集中在集成阶段的题目设计、代码框架和测试脚本建设，同时也参与了前面各阶段的测评、复查和服务器环境支持。

![首届算子开发创新大赛项目海报](/images/ustc-kernel-competition-poster-1200.webp)

## 为什么要从算子一直做到推理系统

大模型最终需要落到硬件上执行，而算子正是模型与芯片之间的执行单元。项目采用逐级递进的设计：

1. 环境与基础知识培训；
2. Softmax、MatMul 基础算子开发；
3. Paged Attention、带 Quest 的 Sparse Attention 综合算子开发；
4. 将算子接入 vLLM-Ascend，进行端到端正确性与性能评测。

前两个阶段主要验证选手能否正确使用 Triton-Ascend，并理解并行划分、访存和数值稳定性。综合算子阶段进一步引入分页 KV Cache、GQA、Online Softmax 和动态稀疏选择。

到了集成阶段，问题发生了变化：算子在独立测试中输出正确，并不意味着它能直接进入大模型推理系统。真实框架会带来变长序列、分页映射、动态 batch、模型配置、KV Cache 生命周期、图模式、服务并发和显存预分配等约束。集成阶段的核心，就是补齐从“功能正确”到“可用于真实推理”的最后一段距离。

## 我的工作范围

### 全流程 baseline 实现

我完整实现了从 MatMul、Online Softmax，到 Paged Attention、Quest Sparse Attention，再到 vLLM-Ascend 集成的 baseline。

baseline 不只是给出一份答案，它至少承担四项职责：

- 验证题目接口和输入约束确实可实现；
- 为正确性测试提供可信参照；
- 帮助定位问题来自 kernel、封装层还是框架集成；
- 为性能测试建立可复现的起点。

尤其在 Paged Attention 和 Sparse Attention 阶段，很多错误不会直接崩溃，而会隐藏在最后一个不完整 block、GQA 头映射、逻辑块到物理块的转换、无效 token mask 或 Softmax 累加顺序中。只有先把全流程跑通，才能设计出真正能区分实现质量的测试。

### 各阶段测评与题目复查

在基础算子阶段，我负责 Softmax 的测评，并参与部分 MatMul 测评。除了结果是否正确，还需要处理不同 shape、非对齐维度、数据类型与性能波动等问题。

在综合算子阶段，我复查了 Paged Attention 和 Quest Sparse Attention 的题面，并亲自试做题目。亲自走过数据布局、边界条件和运行脚本后，才能判断题面是否给出足够信息，测试是否覆盖关键路径，以及性能目标是否合理。

### 独立评测服务器与运行环境

我协助准备了独立机房中用于测评的服务器和运行环境。评测环境需要固定软件版本、共享文件布局和运行入口，使不同提交能够在尽量一致的条件下执行。

高性能算子的结果很容易受到后台负载、首次编译、缓存状态、模型初始化和测试顺序影响。只有把环境、脚本和基线固定下来，最终结果才具有可比性。

### 集成阶段题目、框架与评测体系

集成阶段是我投入最多的部分，工作包括：

- 集成阶段总题面的设计与编写；
- Paged Attention、ReshapeAndCache、Sparse Attention 的算子接入框架；
- vLLM-Ascend 评测框架；
- 正确性、离线吞吐与 Serving Benchmark 脚本；
- 测评数据集与两种运行入口；
- NPU Graph 入图兼容脚本；
- 答辩重新提交阶段的新增长度数据集、极限长度和兼容性复测；
- 对选手提交进行超长序列手动测试。

## 三个算子，一条推理链路

| 阶段 | 核心问题 | 系统约束 |
| --- | --- | --- |
| ReshapeAndCache | 正确写入分页 KV Cache | slot mapping、跳过无效 token |
| GQA Paged Attention | 在非连续缓存上稳定计算 | GQA、block table、变长序列、Online Softmax |
| Quest Sparse Attention | 先选块，再做精确注意力 | Top-K、分页映射、动态上下文与额外调度开销 |

### ReshapeAndCache：正确写入分页 KV Cache

在解码过程中，新 token 产生的 Key 和 Value 最初是连续排列的，而 Paged Attention 使用按物理块组织的 KV Cache。ReshapeAndCache 需要根据 `slot_mapping`，将每个 token 的 Key/Value 写入正确的物理块和块内偏移：

```text
block_idx    = slot_idx // block_size
block_offset = slot_idx % block_size
```

若 `slot_mapping[i] < 0`，则应跳过对应 token。这个算子的计算并不复杂，但它处于 KV Cache 写入路径上，一旦地址映射错误，后续 Attention 读取到的就是错误上下文。测试因此不能只看算子是否执行成功，而必须分别比对 Key Cache 和 Value Cache 的写入结果。

### GQA Paged Attention：非连续缓存上的稳定计算

集成版 Paged Attention 需要支持 GQA。Query 头数可以是 KV 头数的整数倍，多个 Query Head 共享同一组 KV Head。算子还需要读取 `block_tables` 完成逻辑块到物理块的映射，使用 `context_lens` 处理不同序列的实际长度，并对最后一个 block 中的无效 token 做 mask。

在数值计算上，我们引入 Online Softmax，避免显式保存完整 attention score。在线更新需要维护当前最大值、归一化系数和累积输出；当新的分块改变最大值时，旧的累积结果必须按新尺度重标定。

### Quest Sparse Attention：先选块，再做精确注意力

Quest Sparse Attention 面向长上下文。标准注意力需要让 Query 与全部历史 Key 交互，计算和访存成本随上下文增长。Quest 的思路是先以较低成本为逻辑块打分，选择最相关的 Top-K 块，再只对这些块执行精确注意力。

集成版本需要同时满足：

- 支持 GQA；
- 支持 batch 内不同的 `context_lens`；
- 通过 `block_table` 访问分页 KV Cache；
- 跳过超出实际上下文的逻辑块与 token；
- 只对 `topk_blocks` 个候选块执行完整注意力；
- 保持对外接口稳定，使内部可以继续做融合和访存优化。

它不再是一个孤立的 Sparse kernel，而是生产推理路径中的 Sparse Paged Attention。评分、Top-K、物理块读取和精确注意力之间任何一处不一致，都会在最终模型输出或吞吐表现上放大。

## 分层评测体系

集成阶段采用“单算子正确性 → 组合正确性 → 离线吞吐 → 在线服务”的结构。

### 单算子正确性

三个算子分别构建独立测试：比较 Key/Value 写入后的缓存、Paged Attention 输出，以及以 PyTorch 版 Quest 流程为参考的 Sparse Attention 输出。

测试输出最大误差，并给出明确状态。评测不能只检查进程退出码，因为“程序没有崩溃”与“数值正确”是两件不同的事。

### 可切换的端到端验证

框架通过环境变量切换实现：

| 配置 | 作用 |
| --- | --- |
| `VLLM_KVCACHE_MODE=npu` | 使用官方 ReshapeAndCache |
| `VLLM_KVCACHE_MODE=triton` | 使用 Triton ReshapeAndCache |
| `PAGED_ATTN_MODE=npu` | 使用官方 NPU Paged Attention |
| `PAGED_ATTN_MODE=triton` | 使用 Triton Paged Attention |
| `PAGED_ATTN_MODE=sparse` | 使用 Quest Sparse Attention |

这种设计可以只替换一个环节，也可以同时启用多个 Triton 算子进行组合测试。相比一次性替换整条路径，它大幅降低了定位错误的成本。

### Offline Throughput

离线吞吐测试使用 vLLM CLI 直接运行数据集，关注总 token 吞吐、输出 token 吞吐和请求处理速度。它适合稳定比较 kernel 集成前后的总体计算效率，也便于固定 prompt 数、输入输出长度和执行参数。

### Serving Benchmark

真实服务还会受到调度、并发和请求到达方式影响。因此我同时实现了 server + client 的 Serving Benchmark，记录 request throughput、token throughput、TTFT、TPOT、ITL、成功与失败请求数以及峰值并发。

Offline 与 Serving 是两个不同口径。前者更接近受控条件下的吞吐能力，后者反映在线调度与并发服务能力，二者不能混成一个排名指标。

## 长序列 Sparse 测试

为了让 Sparse Attention 与 Paged Attention 在更有代表性的长上下文上比较，我新增了一组 workload 对齐的长序列测试。

数据来自 LongBench 的三个子集：

| 子集 | 样本数 | 特点 |
| --- | ---: | --- |
| Qasper | 20 | 长文档问答 |
| NarrativeQA | 50 | 叙事文本理解 |
| GovReport | 30 | 长篇政府报告 |

共 100 条 prompt，平均长度约 8K tokens。数据被重新整理为评测脚本可消费的格式，并尽量让 Sparse 与 Paged Attention 使用一致的请求集合和生成参数。只有 workload 一致，性能对比才有意义。

### 测试结果与解释

在这组约 8K 平均输入长度的数据上，Quest Sparse Attention 的端到端性能约为 Triton Paged Attention 的 2 倍。与此同时，它仍未追平基于 Ascend C 的官方实现，实测大致达到后者的 70%；Triton Paged Attention 则约为官方实现的 30%。

这些比例是端到端测试中的近似值，不同批次、请求调度和统计口径会带来波动。更重要的结论是：

1. 长序列上，动态稀疏开始体现减少 KV 读取和注意力计算的收益；
2. 稀疏算法收益足以显著超过当前 Triton 稠密实现；
3. 官方底层 kernel 的优化仍然很强，减少计算量不等于自动获得最高端到端性能；
4. Sparse 路径仍有评分、Top-K、索引和多 kernel 调度开销。

## 极限长度、精度与显存

### 极限序列长度

我增加了 Sparse Attention 极限序列长度测试，并在当前模型与环境配置下验证到 `40960` tokens，也就是该模型配置支持的最长上下文。

一次 40960 tokens 测试成功，只能说明当前整条推理链路到达模型上限；要继续寻找 kernel 的理论或实现上限，还需要更长上下文模型、足够的 KV Cache，以及对 block table、grid 数量和索引类型的单独压力测试。

### Sparse 精度

Sparse Attention 的正确性不能直接和完整稠密注意力逐元素相等，因为它只计算选出的 Top-K 块。参考语义是“同样的 Quest 评分 + 同样的 Top-K 选择 + 对选中 token 做精确注意力”。

算法近似误差和 kernel 实现误差是两类问题。评测 kernel 正确性时，必须先固定稀疏选择结果，否则无法判断差异来自近似策略还是算子本身。

### 显存优化

vLLM 启动时会先进行 profiling run。它根据显存利用率配置，在扣除模型权重、框架开销和临时显存后，将剩余显存尽可能预分配给 KV Cache。因此，在同一配置下运行不同长度的数据集，最终看到的 KV Cache 显存占用通常都差不多。

这不代表 Sparse Attention 没有减少计算或访存，也不能直接证明它节省了 KV Cache 容量。Quest 仍需保留完整 KV Cache，只是在每一步只读取和计算其中一部分。

更合理的显存评测应区分：

- 模型权重与框架常驻显存；
- 预分配的 KV Cache 容量或 GPU block 数；
- kernel 执行期间的临时峰值显存；
- 固定显存预算下可支持的最大并发和上下文长度；
- 稀疏评分与 Top-K 带来的额外工作区。

## NPU Graph 与两种运行入口

常规 eager 模式通过，并不意味着算子可以进入图模式。图捕获会对动态 shape、Python 侧控制流、张量生命周期和编译时行为提出额外要求。为此，我补充了算子入图兼容脚本，并把它纳入答辩重新提交阶段的检查。

同时，我分别实现 CLI 与 server 两种测评入口：CLI 用于受控的离线吞吐测试，server + client 用于服务化并发测试。两条路径覆盖了算子在 vLLM-Ascend 中最常见的使用方式，也让我们能够判断性能变化来自 kernel 本身，还是来自 scheduler、请求组织和服务配置。

## 项目结果

从项目最终统计看，环境配置阶段有 46 人参与，基础算子阶段各有约 40 人，综合算子阶段累计收到 65 人次提交，最终有 15 人完成集成测试。

最终汇总中，Paged Attention 与 Sparse Attention 都出现了相对初始 baseline 的显著加速，集成阶段也产出了 Serving 与 Offline Sparse 两类端到端结果。这些数字是参赛选手和整个项目团队的共同成果，并非我的个人性能成绩；我的工作重点是让这些实现能够在统一环境、统一数据和统一口径下被正确比较。

对评测工作来说，最终能得到一个排名并不是全部。更重要的是，这套流程能够回答：

- 算子在独立输入上是否正确？
- 接入真实 KV Cache 后是否仍然正确？
- 稠密和稀疏路径是否使用同一 workload？
- 性能提升来自 kernel，还是来自测试数据差异？
- 长序列、变长 batch 和模型上限附近是否稳定？
- eager 模式和图模式是否都能运行？
- 离线吞吐提升能否延续到在线 Serving？

## 这段经历带给我的认识

### 出题本身也是系统设计

一份好的算子题面必须同时定义接口、数据布局、参考语义、容差、边界条件和性能口径。任何部分含糊，都会在提交阶段变成重复沟通，甚至造成不公平比较。亲自实现 baseline 和试做题目，是降低这种风险最有效的方式。

### 正确性测试要能定位

单个总误差只能告诉我们“错了”，分层切换官方实现与 Triton 实现，才能判断错误发生在 KV Cache 写入、分页读取、稀疏选择还是框架调用。可诊断性应当从一开始就写进测试架构。

### 性能测试首先要统一语义

比较两个实现之前，必须确认输入集合、prompt 长度、生成长度、并发、预热、缓存状态和统计指标一致。特别是 Sparse 与 Dense 的比较，如果 workload 不一致，结果再漂亮也没有解释力。

### 框架行为会改变指标含义

vLLM 的 KV Cache 预分配就是一个例子。只看监控工具中的“显存占用”很容易得到错误结论。理解框架何时分配内存、怎样调度请求、哪些阶段进入图捕获，与理解 kernel 本身同样重要。

### 从 kernel 到 serving，中间没有自动成立

一个 kernel 的 microbenchmark 很快，并不保证端到端吞吐一定提高。数据准备、索引、Top-K、kernel launch、图模式兼容和 scheduler 都可能抵消局部收益。也正因如此，最终阶段放在 vLLM-Ascend，而不是停留在单算子计时。

这四个月的工作横跨算子实现、题目设计、测试框架、服务器环境、数据集和端到端推理。我做的不只是几道算子题，而是为一条从算子到大模型服务的完整链路建立了可实现、可测试、可比较的工程基线。

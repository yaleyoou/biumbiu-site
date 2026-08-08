---
title: "一次完整部署大模型：在 4 张 A100 上用 SGLang 运行 DeepSeek-V4-Flash-0731"
cardTitle: "在 4 张 A100 上部署 DeepSeek-V4-Flash-0731"
description: "记录从官方 checkpoint 出发，在 4 张 A100 上完成 DeepSeek-V4-Flash-0731 的模型转换、A100 适配、TP=4 部署、DSpark 加速与端到端验证的完整过程。"
date: 2026-08-02
image: "/images/deepseekv4flash0731.webp"
imageAlt: "4 张 A100 上 SGLang 服务与模型架构示意图"
tags: ["DeepSeek", "SGLang", "A100", "LLM 部署", "大模型推理"]
featured: true
order: 100
draft: false
category: "Field note"
---


> - 时间：2026 年 8 月
> - 模型：DeepSeek-V4-Flash-0731
> - 推理框架：SGLang v0.5.16
> - 硬件：4 x NVIDIA A100-SXM4-80GB
> - 目标：从官方 checkpoint 出发，完成模型转换、A100 适配、TP=4 部署、API
>   鉴权、DSpark 加速和端到端验证

这是一个从头走完一个大模型的完整部署流程。

这里的“完整”不只是把服务进程启动起来，而是包含下载和校验官方模型、理解权重
格式、做离线转换、补齐 A100 不支持的计算路径、接入 SGLang、启动多卡推理、验证
API 协议、测试长上下文和并发，并确认 speculative decoding 真的产生了加速。

最终，我在 4 张 A100-SXM4-80GB 上成功运行了 DeepSeek-V4-Flash-0731，服务由
SGLang v0.5.16 提供 OpenAI Chat Completions、Responses 和 Anthropic Messages
兼容接口。基础生成、流式输出、多轮对话、函数工具调用、8K/32K 上下文以及并发
1/4/8 均完成验证，另外用官方 ShareGPT 数据做了两轮在线 request-rate sweep。

这篇笔记记录完整过程，也记录为了让 DeepSeek V4 在 A100 SM80 上运行，我所采用
和适配的运行时改动。

本文对应的完整代码已经整理到
[yaleyoou/deepseek-v4-a100-sglang-v0516](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516)。
其中 A100 kernel 和早期 patch 设计参考了
[Qeeweew/deepseek-v4-a100-sglang](https://github.com/Qeeweew/deepseek-v4-a100-sglang)，
我在此基础上完成了 DeepSeek-V4-Flash-0731、SGLang v0.5.16、Responses API 和
DSpark 部署链路的迁移与回归。

## 一、最终结果

最终验证环境如下：

| 项目 | 配置 |
| --- | --- |
| GPU | 4 x NVIDIA A100-SXM4-80GB，SM80 |
| CUDA runtime | 12.9 |
| PyTorch | 2.11.0+cu129 |
| SGLang | 0.5.16 |
| SGLang commit | `fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1` |
| Triton | 3.6.0 |
| sglang-kernel | 0.4.5+cu129 |
| flashinfer-python | 0.6.14 |
| nvidia-cutlass-dsl | 4.6.0 |
| Tensor Parallel | TP=4 |
| 主权重 dtype | BF16 |
| Routed experts | packed MXFP4，运行时转为 MXFP4/INT8 路径 |
| KV cache | BF16 |
| Indexer cache | INT8 |
| Speculative decoding | DSpark |

真实部署结果：

| 验证项目 | 结果 |
| --- | --- |
| Patch、kernel、validator tests | 68 passed |
| SGLang API/protocol unit tests | 88 passed |
| 原始 checkpoint 校验 | PASS |
| 转换后 checkpoint 校验 | PASS |
| 基础模式 API 回归 | 12/12 passed |
| DSpark API 回归 | 12/12 passed |
| 外部 HTTPS 代理 | 12/12 passed |
| 长上下文 Chat API | 8,214 和 32,790 prompt tokens passed |
| 官方 server benchmark | 8K/32K 精确输入，50/50 请求成功 |
| ShareGPT 在线 benchmark | 0.5/1/2/3 req/s，两轮 800/800 请求成功 |
| 并发性能 | concurrency 1/4/8，五轮固定长度测试完成 |

DSpark 模式启动后，每张卡约剩余 27.43GB，SGLang 计算出的
`max_total_num_tokens=412416`，最大运行请求数为 48。

使用 SGLang 官方 serving benchmark，固定每个请求输入 1,024 tokens、生成 128
tokens，预热并清空 Radix Cache 后做五轮测试，聚合输出吞吐的中位数为：

| 并发 | 五轮中位输出吞吐 | 五轮范围 |
| ---: | ---: | ---: |
| 1 | 107.01 tok/s | 106.98-115.17 tok/s |
| 4 | 237.01 tok/s | 208.11-245.05 tok/s |
| 8 | 314.54 tok/s | 306.01-328.41 tok/s |

这些是固定合成输入下的模型服务核心性能，不包含 Chat 模板和客户端 tokenization，
也不等同于真实业务流量。详细口径和每轮数据见第十三节。

## 二、这次部署真正困难在哪里

DeepSeek-V4-Flash-0731 的官方 checkpoint 不是简单的 BF16 模型，而是混合格式：

- 普通矩阵主要使用 block FP8。
- Routed expert 权重使用 packed MXFP4 E2M1。
- MXFP4 每个 block 还带 UE8M0 scale。
- 模型包含 DeepSeek V4 特有的稀疏注意力、compressor 和 indexer。
- 0731 checkpoint 还包含 MTP/DSpark 所需权重。

A100 是 SM80。它有很强的 BF16 和 INT8 Tensor Core，但没有 Hopper/Blackwell
上的原生 FP8/FP4 Tensor Core 路径。SGLang 原始 MXFP4 Marlin 实现也会明确拒绝
SM80，只允许 SM90 或 SM120。

所以问题不是“给启动命令加一个 A100 参数”，而是需要重新规划数据路径：

```text
官方 checkpoint
        |
        | 离线转换
        v
普通 FP8 权重 -> BF16
Routed experts -> 保留 packed MXFP4 + UE8M0 scale
        |
        | SGLang 加载时注入 A100 patch
        v
普通线性层 -> BF16
MoE experts -> MXFP4 重排 + INT8 Tensor Core
KV cache -> BF16
Indexer cache -> INT8
Sparse attention -> SM80 Triton kernel
        |
        v
TP=4 SGLang API 服务
```

## 三、目录与存储规划

为了让命令可以在其他机器复用，我先把工作盘和模型盘抽象成环境变量：

```bash
export WORKSPACE=/path/to/workspace
export MODEL_ROOT=/path/to/persistent/models

export SGLANG_ROOT="${WORKSPACE}/sglang"
export PATCH_ROOT="${WORKSPACE}/deepseek-v4-a100-sglang-v0516"
export ORIGINAL_MODEL="${MODEL_ROOT}/original/DeepSeek-V4-Flash-0731"
export MODEL_PATH="${MODEL_ROOT}/converted/DeepSeek-V4-Flash-0731-MoE-MXFP4-BF16"

mkdir -p "$WORKSPACE" "$MODEL_ROOT/original" "$MODEL_ROOT/converted"
```

我实际部署时把源码、编译缓存和日志放在普通工作盘，只把大模型放在持久化盘。
读者只需要修改上面两个根目录，后续命令不依赖我的机器路径。

原模型需要读取约 167GB，转换结果约 173GB。为了同时保留原始模型和转换结果，
模型盘最好至少准备 400GB 可用空间，还要为临时文件留出余量。

转换器逐分片处理，不会把整个模型同时装入 CPU 内存。这个设计对大模型转换非常
重要：磁盘空间和顺序读写速度往往比 CPU 算力更容易成为瓶颈。

## 四、固定 SGLang 版本

这个项目不是 SGLang fork，而是外部 monkeypatch。它会替换 SGLang 的模型、KV
pool、indexer、attention backend 和 JIT 等内部接口，因此必须固定到经过验证的
commit，而不能只写一个宽松的版本范围。

先获取本文对应的 patch 仓库和 SGLang：

```bash
git clone https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516.git "$PATCH_ROOT"
git clone https://github.com/sgl-project/sglang.git "$SGLANG_ROOT"
git -C "$SGLANG_ROOT" checkout fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1
```

目标版本是：

```text
SGLang version: 0.5.16
SGLang commit:  fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1
```

安装 patch package：

```bash
cd "$PATCH_ROOT"
python -m pip install -e . --no-deps
```

这里使用 editable install，启动脚本还会显式把项目根目录和
`${SGLANG_ROOT}/python` 放到 `PYTHONPATH`。这样可以保证 Python 启动时找到本项目
的 `sitecustomize.py`，同时使用指定 checkout 中的 SGLang，而不是环境里另一个
碰巧同名的安装包。

## 五、下载并校验官方模型

我固定了 Hugging Face revision，避免部署过程中上游模型内容变化：

```bash
export HF_HOME="${PATCH_ROOT}/cache/huggingface"
export HF_XET_CACHE=$HF_HOME/xet
export HF_XET_HIGH_PERFORMANCE=1
export HF_XET_NUM_CONCURRENT_RANGE_GETS=32
export HF_HUB_DOWNLOAD_TIMEOUT=1800

hf download deepseek-ai/DeepSeek-V4-Flash-0731 \
  --revision 7872f01b1d1fe23eabc4c98b48bffcef5a386062 \
  --local-dir "$ORIGINAL_MODEL" \
  --max-workers 8
```

下载完成后，我没有立刻开始转换，而是先严格校验原始 checkpoint：

```bash
cd "$PATCH_ROOT"
python scripts/validate_dsv4_checkpoint.py original \
  "$ORIGINAL_MODEL"
```

校验器检查的内容包括：

- 48 个 safetensors 分片及其规范命名。
- index 中的 tensor 到 shard 映射。
- safetensors header、重复 tensor 和缺失 tensor。
- MXFP4 expert weight 与 scale 是否成对出现。
- tokenizer、config、MTP 和 DSpark 权重。
- 0731 的四个 DSpark 字段。

```text
dspark_block_size       = 5
dspark_noise_token_id   = 128799
dspark_target_layer_ids = [40, 41, 42]
dspark_markov_rank      = 256
```

这一步让我认识到，模型文件“已经下载完”不等于 checkpoint 完整。对于几十个分片
的大模型，少一个 shard 或 index 写错一项，都可能等到加载数分钟后才暴露。

## 六、离线转换模型

正式转换命令如下：

```bash
python scripts/convert_deepseek_v4_flash_moe_mxfp4_bf16.py \
  --input "$ORIGINAL_MODEL" \
  --output "$MODEL_PATH"
```

转换器对每个 tensor 做分类处理。

### 普通 FP8 权重

对于带 block scale 的普通 FP8 weight，转换器执行：

```text
BF16 weight = BF16(FP8 code) * BF16(block scale)
```

然后将结果写成 BF16。这个过程是解量化，不会恢复官方 checkpoint 量化前已经
损失的精度，但不会再增加一次新的低比特重量化。

### Routed experts

对于形如以下路径的 expert 权重：

```text
layers.<layer>.ffn.experts.<expert>.w1.weight
layers.<layer>.ffn.experts.<expert>.w2.weight
layers.<layer>.ffn.experts.<expert>.w3.weight
mtp.<layer>.ffn.experts.<expert>.*
```

转换器保留 packed MXFP4 weight 以及对应 `.scale`。它们会在 SGLang 加载权重时
被重新编码成 A100 kernel 使用的紧凑格式。

### 为什么配置仍然写 fp8

转换后的 `config.json` 仍保留：

```json
{
  "quantization_config": {
    "quant_method": "fp8",
    "activation_scheme": "dynamic",
    "fmt": "e4m3",
    "scale_fmt": "ue8m0"
  },
  "torch_dtype": "bfloat16"
}
```

这看起来有些反直觉，但这里的 `fp8` 主要承担 loader 路由作用。SGLang 通过 FP8
quantization config 识别 DeepSeek V4 的 MXFP4 experts；普通模块则加入
`ignored_layers`，按转换后的 BF16 tensor 加载。

正式转换完成后，我再次对照原模型做严格校验：

```bash
python scripts/validate_dsv4_checkpoint.py converted \
  "$MODEL_PATH" \
  --reference "$ORIGINAL_MODEL"
```

最终输出是 48 个 shards、71,927 个 tensors、173,182,190,584 data bytes；35,328
个 expert tensors 和 4,680 个 MTP tensors 都被完整映射。

## 七、A100 支持改动

运行时适配采用 `sitecustomize.py` monkeypatch，而不是直接修改 SGLang 源码。

启动脚本设置：

```bash
export PYTHONPATH="${PROJECT_ROOT}:${SGLANG_ROOT}/python:${PYTHONPATH}"
export ENABLE_SGLANG_DSV4_A100_PATCH=1
```

Python 启动时自动导入 `sitecustomize.py`，然后执行：

```python
from dsv4_a100_patch import apply_patch

apply_patch()
```

这样做有两个好处：补丁和 SGLang 源码边界清晰；去掉环境变量或 `PYTHONPATH`
就能快速回到原生 SGLang，便于做对照和定位问题。

### 7.1 DeepSeek V4 默认参数

补丁强制使用 DeepSeek V4 attention backend、page size 256 和 BF16 KV cache。
基础模式最大 running requests 默认为 256；DSpark 模式让 SGLang speculative hook
选择更小的 48，避免启动时捕获大量无用 verify CUDA Graph。

### 7.2 MXFP4 expert 的 A100 计算路径

A100 没有原生 FP4 MMA，所以我采用的计算路径是：

```text
INT8 activation x decoded INT8 weight
    -> INT32 accumulate
    -> activation scale * channel scale
    -> BF16 output
```

加载时，原始 MXFP4 E2M1 code 和 UE8M0 block scale 被重排为：

```text
remapped packed MXFP4 code
+ packed 2-bit shift
+ FP32 per-channel scale
```

运行时整数解码近似为：

```text
weight_i8 = e2m1_lut_x2[fp4_code] << shift2
```

最大的值是 `12 << 3 = 96`，能够放入有符号 INT8。activation 则按 token 动态
量化：

```text
scale = max(abs(row)) / 127
q_i8 = round(row / scale), clamp to [-127, 127]
```

MoE 前向流程为：

```text
hidden states
  -> per-token INT8 quantization
  -> 按 expert 对 routed token 对齐
  -> W13 grouped GEMM
  -> SwiGLU
  -> 再次 per-route INT8 quantization
  -> W2 grouped GEMM
  -> 按 top-6 router weight 归并
  -> BF16 hidden states
```

MXFP4 重排不是数学上的无损变换。一些原 block scale 无法被 2-bit shift 精确表达，
因此预处理会选择最接近的 E2M1 code。这是为了在 A100 上保留低显存权重表示并使用
INT8 Tensor Core 所做的明确精度折中。

CUTLASS kernel 通过 SGLang JIT/TVM FFI 编译。第一次启动会为不同 `block_m`、
`block_n`、W13/W2 组合生成 SM80 模块，并在 CUDA Graph capture 前初始化动态共享
内存属性。

### 7.3 BF16 KV cache

原始 DeepSeek V4 路径包含 A100 不适合直接使用的 packed FP8 cache。补丁替换了
SWA、C4 和 C128 KV pool，使 attention cache 按 BF16 存储。

同时修复了一个 v0.5.16 迁移细节：SGLang `_make_kv_pool` 通过默认参数捕获原来的
FP8 pool class，仅替换模块变量并不会影响已经捕获的默认值。因此补丁必须显式
覆盖 factory，确保所有 pool 都使用 BF16 layout。

内存 configurator 也同步改写，否则 SGLang 会按错误的 cache 字节数估算
`max_total_num_tokens`，轻则浪费显存，重则启动后 OOM。

### 7.4 INT8 indexer

DeepSeek V4 的 C4 indexer 为 query 选择稀疏 attention page。补丁使用 INT8
indexer cache，每行额外保存 FP32 scale，并用 Triton kernel 完成 query 投影、
RoPE、Hadamard、量化和 paged MQA logits。

长 prefill 时，每个 TP rank 不再重复处理全部 query token，而是按 token 维度分块：

```text
T = total query tokens
W = attention TP size
chunk = ceil(T / W)

rank r 处理 [r * chunk, (r + 1) * chunk)
```

每个 rank 仍读取完整历史 KV，因此本地 top-k 是针对完整上下文计算的。完成后使用
attention TP group all-gather，恢复全局 token 顺序。

### 7.5 A100 稀疏注意力

补丁实现了 SM80 Triton direct sparse attention，将以下操作融合到同一个 kernel：

```text
sparse page gather
-> QK
-> online softmax
-> PV
```

单 source 处理 SWA；双 source 将 SWA 与 C4/C128 作为同一个逻辑 sparse set，在
统一 softmax 分母中归一化。

Prefill 和 decode 可以共用 kernel，因为 causal 约束已经由 metadata 展开成每个
query row 的 `page_indices` 和 `lengths`。kernel 只访问：

```text
indices[token, :lengths[token]]
```

### 7.6 TP=4 的 Q-head padding 修复

迁移到 SGLang v0.5.16 时遇到一个非常危险的问题：服务能够启动，也能返回 HTTP
200，但生成内容错误。

原因是 TP=4 下的 Q tensor 布局是“有效 local heads 位于零前缀，后面是 padding”，
而不是每个 TP rank 从全局 head tensor 中取自己的连续 rank 分片。旧逻辑在 rank
1 到 rank 3 上选择到了 padding。

正确逻辑是所有 rank 都取前 `local_heads`，并把输出写回同样的零前缀位置。这个
问题让我意识到，服务 ready 和 HTTP 200 都不能证明模型部署正确，必须加入确定性
短生成和内容断言。

### 7.7 DSpark 和 MTP

0731 checkpoint 自带 `mtp.*` 和 DSpark 权重，不需要第二个 draft model 目录。

补丁分别处理 `DeepseekV4ForCausalLMNextN` 和
`DeepseekV4ForCausalLMDSpark`，让 draft model 的 routed experts 继续进入 A100
MXFP4/INT8 路径。

DSpark 还有一个关键点：转换后的 `mtp.0.main_proj` 必须保持 BF16。如果它被 FP8
loader 再量化成 Marlin FP8，target 最终输出可能仍然正确，但 draft acceptance
会接近 0，表面上“服务正常”，实际上 speculative decoding 完全没有加速。

修复前观察值约为：

```text
accept len ~= 1
accept rate ~= 0
```

修复后观察值：

```text
单请求：accept len=4.38, accept rate=0.68
并发 8：accept len=2.71, accept rate=0.34
```

这也是为什么部署 speculative decoding 时不能只检查输出正确性，还必须检查
accept length、accept rate 和实际吞吐。

### 7.8 SGLang v0.5.16 API 漂移适配

从旧 patch 迁移到 v0.5.16 时，还适配了以下内部接口变化：

- JIT compile context 和 dependency registry 的模块位置变化。
- `_compute_kv_to_cache` 新增 `attn_backend` 参数。
- SWA cache location 改为通过 backend 获取。
- fused norm/rope 和 compressor rope 模块位置变化。
- Attention TP all-gather helper 改名。
- Indexer prepare 函数的参数、返回值和 metadata 生命周期变化。
- 已删除的 unified-attention fallback 不再保留，A100 路径要求 direct attention。
- DSpark 直接使用 `DSPARK` algorithm，不再依赖旧环境变量。

这种 monkeypatch 会直接触碰内部 API，因此每次升级 SGLang 都必须重新做完整回归，
不能假设小版本升级天然兼容。

## 八、安全准备

服务监听 `0.0.0.0`，因此必须开启 API key。我没有把 key 写进启动命令，而是保存
在权限为 `0600` 的文件中：

```bash
cd "$PATCH_ROOT"
mkdir -p secrets
umask 077
openssl rand -hex 32 > secrets/sglang_api_key
chmod 600 secrets/sglang_api_key
```

启动 wrapper 在 Python 进程内部读取 key，再构造 SGLang `ServerArgs`。补丁还会
对 `ServerArgs.__repr__` 和 `/server_info` 返回值中的 `api_key`、
`admin_api_key` 做脱敏。

`secrets/`、`logs/`、`cache/` 和 `test-results/` 都加入 `.gitignore`。博客、issue、
截图和 shell history 中不应出现真实 key 或内部代理地址。

## 九、启动前 fail-fast 检查

正式启动脚本会先运行：

```bash
python scripts/check_compatibility.py \
  --sglang-root "$SGLANG_ROOT" \
  --model-path "$MODEL_PATH"
```

它会拒绝以下情况：

- SGLang commit 或版本不匹配。
- 可见 GPU 不是正好四张。
- 任意 GPU 不是 compute capability 8.0。
- 模型 architecture 不是 `DeepseekV4ForCausalLM`。
- DSpark 配置字段不匹配 0731。
- `sitecustomize` patch 没有生效。

这个检查放在模型加载之前，可以避免等权重加载和 JIT 数分钟之后才发现环境根本
不受支持。

## 十、启动基础模式

基础模式禁用 speculative decoding，便于先确认 target model 本身正确：

```bash
cd "$PATCH_ROOT"

CUDA_VISIBLE_DEVICES=0,1,2,3 \
SGLANG_ROOT="$SGLANG_ROOT" \
MODEL_PATH="$MODEL_PATH" \
API_KEY_FILE=$PWD/secrets/sglang_api_key \
bash scripts/launch_dsv4_flash_0731_tp4.sh
```

关键 SGLang 参数是：

```text
--dtype bfloat16
--quantization fp8
--moe-runner-backend marlin
--tp-size 4
--mem-fraction-static 0.70
--reasoning-parser deepseek-v4
--tool-call-parser deepseekv4
```

再强调一次：`--quantization fp8` 是进入 DeepSeek V4/MXFP4 loader 的入口，不代表
普通矩阵最终仍使用 FP8。`Mxfp4MarlinMoEMethod` 也已经被 patch 替换，真正运行
的是 A100 MXFP4/INT8 backend。

基础模式加入 `--skip-server-warmup`。日志默认写入：

```text
logs/server-tp4-<UTC timestamp>.log
```

## 十一、启动 DSpark 模式

确认基础模式正确后，再启动 DSpark：

```bash
cd "$PATCH_ROOT"
API_KEY_FILE=$PWD/secrets/sglang_api_key \
bash scripts/launch_dsv4_flash_0731_tp4_dspark.sh
```

DSpark wrapper 设置 `ENABLE_DSPARK=1`，主脚本最终增加：

```text
--speculative-algorithm DSPARK
```

DSpark 模式不能添加 `--skip-server-warmup`。第一次启动需要编译
gptq-marlin/TVM FFI 模块、预热 target/draft verify CUDA Graph。必须等日志出现：

```text
The server is fired up and ready to roll!
```

再接入外部流量。

我使用 tmux 管理服务：

```bash
tmux new -s dsv4
cd "$PATCH_ROOT"
bash scripts/launch_dsv4_flash_0731_tp4_dspark.sh
```

按 `Ctrl-b d` 离开，通过 `tmux attach -t dsv4` 返回。启动脚本已经使用 `tee`
记录完整日志，不需要再叠加 `nohup`。

## 十二、API 验证

先测试模型列表和鉴权。以下 key 只是占位符：

```bash
export BASE_URL=http://127.0.0.1:30000/v1
export SGLANG_API_KEY='<从安全配置读取>'

curl -sS "$BASE_URL/models" \
  -H "Authorization: Bearer $SGLANG_API_KEY"
```

Chat Completions：

```bash
curl -sS "$BASE_URL/chat/completions" \
  -H "Authorization: Bearer $SGLANG_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"deepseek-v4-flash-0731",
    "messages":[{"role":"user","content":"Reply with exactly: CHAT_OK"}],
    "temperature":0,
    "max_tokens":32
  }'
```

Responses API：

```bash
curl -sS "$BASE_URL/responses" \
  -H "Authorization: Bearer $SGLANG_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "model":"deepseek-v4-flash-0731",
    "input":"Reply with exactly: RESPONSES_OK",
    "max_output_tokens":32,
    "store":false
  }'
```

自动回归：

```bash
python scripts/smoke_test_api.py \
  --base-url http://127.0.0.1:30000 \
  --api-key-file secrets/sglang_api_key \
  --suite full
```

DSpark 模式使用：

```bash
python scripts/smoke_test_api.py \
  --base-url http://127.0.0.1:30000 \
  --api-key-file secrets/sglang_api_key \
  --suite full \
  --tool-choice-mode auto
```

SGLang v0.5.16 的 DFlash validator 不允许 speculative decoding 与 grammar
constraint 同时使用。因此 DSpark 支持普通文本、stream、多轮和
`tool_choice=auto`，不支持强制 JSON grammar 或 `tool_choice=required/any`。
需要强制工具调用时，应停止 DSpark 并使用基础模式。

另外，当前 Responses request schema 的 `tool_choice` 仅接受字符串
`auto/required/none`，不接受指定函数的对象。需要 named function choice 时，可以
改用 Chat Completions。

## 十三、长上下文和并发性能实测

### 13.1 先区分功能验证和性能压测

仓库中的 `long_context_api.py` 走带鉴权的 OpenAI Chat Completions，用来确认长
上下文请求能完成、usage 计数正确且模型返回指定文本：

```bash
python scripts/long_context_api.py \
  --base-url http://127.0.0.1:30000 \
  --api-key-file secrets/sglang_api_key \
  --target-prompt-tokens 8192,32768 \
  --max-tokens 32 \
  --output test-results/long-context-chat-api.json
```

本次重新实测结果如下：

| 目标 prompt tokens | Chat 实际 tokens | completion tokens | 单次耗时 | 结果 |
| ---: | ---: | ---: | ---: | --- |
| 8,192 | 8,214 | 6 | 1.533s | PASS |
| 32,768 | 32,790 | 6 | 2.994s | PASS |

这里多出的 22 tokens 来自 system/user 消息包装。这个脚本使用重复文本构造输入，
两个请求顺序执行，第二个请求还可能命中第一个请求留下的公共前缀；同时模型只生成
6 tokens 就遇到 EOS。因此这张表只说明 Chat API 功能通过，单次耗时不能作为长
上下文性能结论。

### 13.2 使用 SGLang 官方 serving benchmark

性能测试改用 SGLang v0.5.16 自带的
[`sglang.benchmark.serving`](https://github.com/sgl-project/sglang/blob/fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1/python/sglang/benchmark/serving.py)。
它直接请求 SGLang native `/generate` 接口，并同时给出输出吞吐、E2E latency、TTFT、
TPOT 和 speculative accept length。旧入口 `python -m sglang.bench_serving` 在这个
版本中已经提示 deprecated。

正式测量前我做了以下控制：

- 使用 `scripts/launch_dsv4_flash_0731_tp4_dspark.sh` 启动，确认日志出现
  `Initialized DSpark draft runner`，并等待 target/draft CUDA Graph 和服务内建
  warmup 全部完成。
- 预热完成后确认四张 A100 利用率回到 0%，温度约 30-37 摄氏度，再开始记录。
- 本次调度容器有 cpuset 限制，启动时额外设置了 `SGLANG_SET_CPU_AFFINITY=0`；
  它只关闭 SGLang 自动 CPU 绑核，不改变模型、GPU 或 DSpark 参数。没有此限制的
  完整主机可以保留启动脚本默认值。
- 使用 `random-ids`、`--tokenize-prompt` 和 `--random-range-ratio 1.0` 精确控制
  输入/输出长度；工具默认发送 `ignore_eos=true`，保证每个请求生成满 128 tokens。
- 每轮先按目标并发预热，再用 `--flush-cache` 清空 Radix Cache；固定 seed，并交错
  concurrency 1/4/8 的测试顺序，减少缓存、温升和先后顺序偏差。
- concurrency 1 使用 16 请求/轮，concurrency 4 和 8 分别使用 32 和 64 请求/轮，
  保证每个档位都有多个满批次；每个档位正式测五轮。

单个并发档位的复现命令如下，修改 `CONCURRENCY` 和 `NUM_PROMPTS` 后重复五轮：

```bash
export OPENAI_API_KEY="$(< secrets/sglang_api_key)"
MODEL_PATH=/path/to/DeepSeek-V4-Flash-0731-MoE-MXFP4-BF16
CONCURRENCY=8
NUM_PROMPTS=64

PYTHONPATH=/path/to/sglang/python \
python -m sglang.benchmark.serving \
  --backend sglang \
  --base-url http://127.0.0.1:30000 \
  --model "$MODEL_PATH" \
  --served-model-name deepseek-v4-flash-0731 \
  --tokenizer "$MODEL_PATH" \
  --dataset-name random-ids \
  --num-prompts "$NUM_PROMPTS" \
  --random-input-len 1024 \
  --random-output-len 128 \
  --random-range-ratio 1.0 \
  --tokenize-prompt \
  --request-rate inf \
  --max-concurrency "$CONCURRENCY" \
  --temperature 0 \
  --warmup-requests "$CONCURRENCY" \
  --flush-cache \
  --disable-tqdm \
  --seed 20260803 \
  --output-file test-results/bench-serving-dspark.jsonl
```

固定 1,024 input tokens + 128 output tokens 的五轮结果为：

| 并发 | 请求/轮 | 五轮输出吞吐（tok/s） | 中位数 | 范围 | CV（变异系数） |
| ---: | ---: | --- | ---: | ---: | ---: |
| 1 | 16 | 106.99 / 106.98 / 107.01 / 115.17 / 112.90 | 107.01 | 106.98-115.17 | 3.59% |
| 4 | 32 | 208.11 / 237.01 / 245.05 / 221.40 / 242.39 | 237.01 | 208.11-245.05 | 6.78% |
| 8 | 64 | 319.90 / 308.06 / 328.41 / 306.01 / 314.54 | 314.54 | 306.01-328.41 | 2.89% |

辅助指标同样取五轮中位数：

| 并发 | median TTFT | median TPOT | DSpark average accept length |
| ---: | ---: | ---: | ---: |
| 1 | 239.16ms | 7.48ms | 2.52 |
| 4 | 252.61ms | 14.19ms | 2.51 |
| 8 | 267.08ms | 23.40ms | 2.52 |

15 个正式轮次共完成 560 个请求、573,440 input tokens 和 71,680 output tokens；
全部请求成功，并且每个请求都准确生成 128 tokens。

这是一组固定 shape、无限到达率下的合成饱和吞吐测试，回答的是“把请求持续灌满
时能处理多少 token”。它不能单独回答真实流量下的用户延迟，因此还需要下面的
ShareGPT open-loop 测试。

### 13.3 ShareGPT 在线 open-loop benchmark

在线延迟测试继续使用同一个 SGLang 官方工具，数据改为其默认的
[ShareGPT_V3_unfiltered_cleaned_split.json](https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered)。
本文锁定的 v0.5.16 实现会保留每条样本最前面的 user/assistant 两个 turn，将 user
内容作为 prompt，并以 assistant 内容的 token 数作为目标输出长度。有限
`--request-rate` 使用指数分布生成请求
间隔，即 Poisson 到达，而不是“上一批完成后再补请求”的固定并发闭环。

SGLang v0.5.16 自己的
[`test_online_latency_default`](https://github.com/sgl-project/sglang/blob/fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1/test/registered/perf/test_bench_serving_1gpu_part1.py#L124-L144)
也是 100 个请求、`request_rate=1`。本文保留这个官方在线延迟点，再向两侧扩展为
0.5/1/2/3 req/s 的 rate sweep，以观察吞吐和排队延迟的拐点。

本次从数据集中固定抽取 seed=42 的 100 条请求，限制 prompt + output 不超过 32K，
不覆盖 ShareGPT 原生输出长度。每个 QPS 档位预热 8 条请求、清空 Radix Cache 后
正式跑 100 条，完整 sweep 重复两轮。未设置 `--max-concurrency`，避免客户端限流
掩盖服务过载；流式输出和默认 `ignore_eos=true` 保持开启，使每条请求生成到数据集
给定长度。

这 100 条请求的 token 分布为：

| 长度 | mean | P50 | P95 | max |
| --- | ---: | ---: | ---: | ---: |
| prompt tokens | 350.84 | 158 | 1,329.10 | 3,588 |
| output tokens | 236.76 | 173 | 688.70 | 821 |
| prompt + output | 587.60 | 415.50 | 1,855.95 | 3,681 |

官方脚本可以自动下载数据集，因此复现时不需要把本机 Hugging Face cache 路径写进
命令。单轮 sweep 如下；再执行一遍即可得到本文的两轮结果：

```bash
export OPENAI_API_KEY="$(< secrets/sglang_api_key)"
export HF_HOME=/path/to/huggingface-cache
export PYTHONPATH=/path/to/sglang/python
MODEL_PATH=/path/to/DeepSeek-V4-Flash-0731-MoE-MXFP4-BF16

for RATE in 0.5 1 2 3; do
  python -m sglang.benchmark.serving \
    --backend sglang \
    --base-url http://127.0.0.1:30000 \
    --model "$MODEL_PATH" \
    --served-model-name deepseek-v4-flash-0731 \
    --tokenizer "$MODEL_PATH" \
    --dataset-name sharegpt \
    --sharegpt-context-len 32768 \
    --num-prompts 100 \
    --request-rate "$RATE" \
    --temperature 0 \
    --warmup-requests 8 \
    --flush-cache \
    --disable-tqdm \
    --seed 42 \
    --output-details \
    --output-file test-results/bench-serving-sharegpt-online-dspark.jsonl
done
```

两轮在每个档位共完成 200 条请求。吞吐按两轮总 token / 总测试时间聚合，平均并发
也按测试时间加权；两轮输出吞吐范围单独列出，以免隐藏运行波动：

| 到达率 | 完成速率 | 输出吞吐 | 两轮输出吞吐范围 | 平均并发 |
| ---: | ---: | ---: | ---: | ---: |
| 0.5 req/s | 0.538 req/s | 127.46 tok/s | 127.45-127.47 tok/s | 1.62 |
| 1 req/s | 1.040 req/s | 246.17 tok/s | 246.00-246.35 tok/s | 3.45 |
| 2 req/s | 1.948 req/s | 461.12 tok/s | 458.09-464.20 tok/s | 12.59 |
| 3 req/s | 2.438 req/s | 577.14 tok/s | 556.34-599.55 tok/s | 27.28 |

这里的到达率是 Poisson 分布参数，完成速率是有限样本下的完成请求数 / 整段测试
时间；两者不会严格相等。尤其 3 req/s 档还包含最后一批积压请求的排空时间。

下面的百分位不是“两个 P95/P99 再平均”，而是从 `--output-details` 保存的逐请求
TTFT 和逐 token ITL 重建 E2E/TPOT，并合并两轮样本后重新计算。重建值与脚本的
单轮 E2E 百分位差异小于 0.1ms。每个档位包含 200 个请求和 47,352 个输出 tokens：

| 到达率 | P50 E2E | P50 TTFT | P50 TPOT | P50 ITL |
| ---: | ---: | ---: | ---: | ---: |
| 0.5 req/s | 2,671.32ms | 437.60ms | 8.87ms | 4.67ms |
| 1 req/s | 2,626.32ms | 300.93ms | 11.78ms | 5.64ms |
| 2 req/s | 5,160.67ms | 425.06ms | 24.59ms | 8.95ms |
| 3 req/s | 9,407.33ms | 1,329.49ms | 43.75ms | 13.28ms |

| 到达率 | P95 / P99 E2E | P95 / P99 TTFT | P95 / P99 TPOT | P95 / P99 ITL |
| ---: | ---: | ---: | ---: | ---: |
| 0.5 req/s | 6,999.13 / 10,491.64ms | 2,191.47 / 3,124.93ms | 31.92 / 131.09ms | 22.51 / 51.28ms |
| 1 req/s | 8,451.42 / 12,659.81ms | 2,241.13 / 3,049.49ms | 30.27 / 114.16ms | 30.33 / 73.47ms |
| 2 req/s | 16,636.36 / 23,882.79ms | 2,684.88 / 2,920.10ms | 112.51 / 233.09ms | 54.59 / 236.72ms |
| 3 req/s | 28,479.37 / 34,387.38ms | 3,207.61 / 3,462.48ms | 216.19 / 387.90ms | 130.52 / 559.35ms |

指标口径如下：

- TTFT 是从客户端发出请求到收到第一个非空流式 token 的时间，包含排队和
  prefill。如果把首个有效流式数据包称为 TTFP，那么它在这里对应同一个观测点；
  SGLang 官方输出的指标名仍是 TTFT。
- TPOT 是单个请求扣除首 token 后，每个输出 token 的平均耗时。
- ITL 是相邻输出 token 的流式到达间隔。DSpark 一次 stream chunk 可能接受多个
  token，SGLang 官方 native benchmark 会用该 chunk 的时间间隔除以新增 token 数，
  再展开成逐 token ITL。

结果显示，增加请求率会提高连续批处理利用率，所以输出吞吐从 127.46 tok/s 提升到
577.14 tok/s；但这不代表单个用户更快。到达率从 1 增加到 2 req/s 后，P50 TPOT
从 11.78ms 增至 24.59ms，P95 E2E 从 8.45s 增至 16.64s。3 req/s 时到达率已经
高于服务对这组 ShareGPT 长度分布的持续完成能力，完成速率只有 2.438 req/s，平均
并发升到 27.28，P95 E2E 达 28.48s。若以延迟而不是峰值吞吐为目标，这套硬件和
模型配置更适合把持续流量控制在 1 req/s 左右，并结合业务 SLO 再做更细的 1-2
req/s 区间扫描。

两轮间也存在明显波动。例如 0.5 req/s 的单轮 median TTFT 分别为 1,041.09ms 和
238.54ms，3 req/s 的单轮输出吞吐分别为 556.34 和 599.55 tok/s。因此本文保留
轮间范围并使用 pooled 百分位，不把某一轮最好成绩当作稳定性能。以上在线指标针对
SGLang native `/generate`；Chat/Responses 的协议功能由前面的 API 回归覆盖，若要
评估生产网关，还应在真实 HTTPS 路径上重复相同 workload。

### 13.4 8K/32K 长上下文 benchmark

长上下文继续使用相同官方工具，固定 concurrency 1、每轮 5 个请求、每个请求输出
128 tokens，各做五轮。以 32K 为例：

```bash
export OPENAI_API_KEY="$(< secrets/sglang_api_key)"
MODEL_PATH=/path/to/DeepSeek-V4-Flash-0731-MoE-MXFP4-BF16
INPUT_LEN=32768

PYTHONPATH=/path/to/sglang/python \
python -m sglang.benchmark.serving \
  --backend sglang \
  --base-url http://127.0.0.1:30000 \
  --model "$MODEL_PATH" \
  --served-model-name deepseek-v4-flash-0731 \
  --tokenizer "$MODEL_PATH" \
  --dataset-name random-ids \
  --num-prompts 5 \
  --random-input-len "$INPUT_LEN" \
  --random-output-len 128 \
  --random-range-ratio 1.0 \
  --tokenize-prompt \
  --request-rate inf \
  --max-concurrency 1 \
  --temperature 0 \
  --warmup-requests 1 \
  --flush-cache \
  --disable-tqdm \
  --seed 20260803 \
  --output-file test-results/bench-serving-long-context-dspark.jsonl
```

| 目标 input tokens | 实际 input tokens | 正式请求 | 五轮 median E2E | 五轮范围 | median TTFT | 结果 |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 8,192 | 8,192 | 25 | 1.727s | 1.220-1.965s | 744.20ms | PASS |
| 32,768 | 32,768 | 25 | 3.606s | 3.490-4.047s | 2,978.69ms | PASS |

每轮的请求中位 E2E 分别为：

- 8K：1.879 / 1.965 / 1.220 / 1.727 / 1.549 秒。
- 32K：4.047 / 3.731 / 3.606 / 3.490 / 3.502 秒。

10 个正式轮次共处理 1,024,000 input tokens 和 6,400 output tokens，50 个请求的
输入长度和输出长度全部与设定一致。8K 结果的轮间波动较明显，因此这里报告中位数
和范围，而不是挑最好的一轮；32K 的 median E2E 轮间 CV 为 6.24%。

### 13.5 如何看待旧数据

旧并发脚本使用很短的 Chat prompt，默认每个并发档位只发送一批请求，整个测试只做
一次公共 warmup，也没有每轮清缓存。因此原来的 119.99 / 152.73 / 358.89 tok/s
可以视为当时那一次请求的观测值，但不足以作为稳定 benchmark；尤其 concurrency 4
明显低于新测试的五轮范围。新旧测试的 input 长度也不同，不能直接计算性能涨跌。

同理，旧长上下文表中的 4.734s / 7.285s 不是“错误结果”，而是 Chat API、重复
前缀、可提前 EOS 和单次计时共同得到的结果。本次同一功能脚本重跑为 1.533s /
2.994s，进一步说明这种单次耗时不适合作为性能数字。博客中的正式性能结论以固定
token shape、预热、清缓存和五轮中位数为准。

性能之外，我也没有只检查请求是否返回 200，而是同时检查：

- 输出 token 数是否达到预期。
- 返回文本是否符合确定性断言。
- streaming 是否完整结束。
- 多轮消息是否保持上下文。
- function tool loop 是否真的返回 tool call 并继续生成。
- 未带 key 的请求是否返回 401。
- 日志是否出现 CUDA、NCCL、missing weight 或 unexpected weight 错误。

## 十四、我遇到和重点防范的问题

| 现象 | 根因或处理方式 |
| --- | --- |
| SGLang commit mismatch | Patch 依赖内部 API，切回固定 commit，不跳过正式检查 |
| 模型缺 shard 或权重 | 先运行 original/converted 严格 validator |
| 原生 MXFP4 报 SM90/SM120 | A100 patch 未加载，检查 `PYTHONPATH` 和环境变量 |
| 服务 ready 但输出错误 | 检查 TP=4 Q-head padding/local-head 选择逻辑 |
| DSpark accept rate 接近 0 | 确认 `mtp.0.main_proj` 保持 BF16，没有进入 FP8 Marlin |
| 首个请求像卡死 | DSpark 必须执行内建 warmup，并等待 JIT/CUDA Graph 完成 |
| OOM | 确认无残留进程，从 `mem-fraction-static=0.70` 开始向下调 |
| NCCL/Bus error | 检查四卡可见性和 `/dev/shm`，必要时提高到 64GB |
| Responses 返回 400 | 检查路径 `/v1/responses` 和当前 `tool_choice` schema |
| DSpark 强制工具调用报 400 | Grammar constraint 与 speculative decoding 不兼容，切基础模式 |
| Anthropic system 报 400 | `system` 应放请求顶层，不能放进 messages 数组 |

当前环境 `/dev/shm=10GB` 已通过 TP=4 实测，但换到其他容器或调度系统后，如果
出现 NCCL shared-memory 错误，仍建议将共享内存提高到至少 64GB。

## 十五、参考项目、迁移动机与工作边界

### 15.1 我从哪里开始

这次工作不是从零发明 A100 kernel。最初让我能够系统理解这条路线的项目是
[Qeeweew/deepseek-v4-a100-sglang](https://github.com/Qeeweew/deepseek-v4-a100-sglang)。
它已经完成了几项最困难的基础工作：MXFP4 routed expert 重排、A100 INT8 Tensor
Core MoE、BF16 KV cache、indexer/attention fallback，以及通过 `sitecustomize.py`
向 SGLang 注入运行时补丁的整体设计。

参考项目锁定的 SGLang commit 是
[`1c0019da7579db73223195f25b0eed3882dff24e`](https://github.com/sgl-project/sglang/commit/1c0019da7579db73223195f25b0eed3882dff24e)。
我以该项目的 `d3987e718f0f` 为迁移基线，保留其 Apache-2.0 许可证和原作者信息。

### 15.2 为什么要迁移到新的 SGLang

严格来说，参考项目锁定的旧 SGLang 已经有一个早期 `/v1/responses` 路由，但
[当时的 ResponseTool schema](https://github.com/sgl-project/sglang/blob/1c0019da7579db73223195f25b0eed3882dff24e/python/sglang/srt/entrypoints/openai/protocol.py#L1276-L1322)
只接受 `web_search_preview` 和 `code_interpreter`，不能接收
`{"type":"function", ...}` 自定义函数工具。因此它无法支撑 0731 正式版所需的
真实 function tool loop。迁移目标不是简单增加一个同名路由，而是补齐协议、模型
parser、工具调用和多轮回放的完整兼容链路。

与此同时，我部署的
[DeepSeek-V4-Flash-0731](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)
是取代 preview 的正式版本。官方模型卡明确说明它显著增强了 agentic capabilities，
并且 checkpoint 自带 DSpark speculative decoding 模块。

我的目标因此不再只是“让模型在 A100 上生成文本”，而是让它能够作为 Agent 模型
接入上层应用：

- 使用 `/v1/chat/completions` 兼容传统 OpenAI 客户端。
- 使用 `/v1/responses` 承载 reasoning、tool call、tool output 和多轮 Agent loop。
- 使用 `/v1/messages` 兼容 Anthropic Messages 客户端。
- 使用 0731 自带的 DSpark 权重降低 decode 成本。

这里要区分两个层次：DeepSeek-V4-Flash-0731 提供推理、工具调用和 Agent 能力；
SGLang 则负责把这些能力解析并暴露成 Chat、Responses 或 Anthropic HTTP 协议。
只有模型和服务框架两边都支持，Agent 链路才真正完整。

因此我将目标 SGLang 升级并固定到 v0.5.16 commit
[`fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1`](https://github.com/sgl-project/sglang/commit/fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1)。
升级不是简单地替换版本号，因为 monkeypatch 依赖的都是 SGLang 内部接口。

### 15.3 这次迁移具体做了什么

在参考项目的 A100 计算基础上，这次迁移和补充的主要工作包括：

- 适配 SGLang v0.5.16 的 JIT、KV pool factory、attention backend 和 indexer API。
- 修复 TP=4 下 Q tensor 零前缀有效 head 布局，否则 rank 1 到 rank 3 会读取 padding。
- 为 DeepSeek-V4-Flash-0731 增加严格 checkpoint validator 和转换后索引校验。
- 保留 0731 的 MTP/DSpark 字段与权重，并让 draft experts 进入 A100 MXFP4/INT8 路径。
- 保持 DSpark `main_proj` 为 BF16，避免输出正确但 acceptance 接近零的性能失效。
- 验证 Chat Completions、Responses、Anthropic、stream、多轮和真实 tool loop。
- 增加 API key 文件加载、日志脱敏、长上下文、并发和外部代理回归。

迁移后的完整实现发布在
[yaleyoou/deepseek-v4-a100-sglang-v0516](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516)。
这个仓库是本文所有转换脚本、A100 patch、启动脚本、测试和实现文档的公开来源。

### 15.4 我如何描述这项工作的边界

更准确地说，这次工作的价值不是“从零写出了 DeepSeek V4 A100 kernel”，而是学习
并复用了已有 A100 方案，再把它迁移到 DeepSeek-V4-Flash-0731 和 SGLang v0.5.16，
补齐 Responses/Anthropic/DSpark/安全启动和端到端验证，使它成为一条可以复现、
可以维护、也能够接入 Agent 应用的完整部署链路。

## 十六、这次部署让我学到什么

### 1. Server ready 不等于模型正确

多卡 head 布局错误时，服务可以正常启动并返回 HTTP 200，但内容是错的。部署验收
必须包含确定性 prompt、内容断言和多种 batch/context shape。

### 2. 量化配置也是 loader 协议

`--quantization fp8` 不一定意味着最终所有算子都执行 FP8。它还决定 SGLang 如何
创建层、如何注册参数、如何选择 MoE method。理解 loader 路由比只看命令行名称
更重要。

### 3. 性能错误可能不会影响正确性

DSpark `main_proj` 被错误量化时，target 输出仍然正确，但 acceptance 接近 0。
性能功能必须用自己的指标验证，不能用“输出没错”代替。

### 4. 大模型部署是完整系统工程

真正的部署范围包括 checkpoint、存储、loader、kernel、cache layout、分布式通信、
CUDA Graph、HTTP 协议、鉴权、日志、代理和回归测试。任何一层都可能让最终服务
失败或悄悄退化。

### 5. 对内部 API 的 patch 必须严格锁版本

Monkeypatch 的优点是改动边界清晰，不污染 SGLang 源码；代价是内部接口一旦变化
就必须重新迁移。版本锁定和 fail-fast 是这种方案的一部分，不是额外负担。

## 十七、最终启动清单

以后重新部署时，我会按下面的顺序检查：

- [ ] GPU 是 4 x A100 SM80，`CUDA_VISIBLE_DEVICES=0,1,2,3`。
- [ ] SGLang commit 和 version 精确匹配。
- [ ] 原始 checkpoint validator 通过。
- [ ] 转换后 checkpoint validator 通过。
- [ ] API key 文件权限为 `0600`。
- [ ] `ENABLE_SGLANG_DSV4_A100_PATCH=1`。
- [ ] Compatibility check 返回 PASS。
- [ ] 四个 TP rank 都加载了 `mxfp4_int8` experts。
- [ ] 日志显示 BF16 attention cache + INT8 indexer cache。
- [ ] DSpark 模式完成 JIT 和 CUDA Graph warmup。
- [ ] 确定性短生成内容正确。
- [ ] Chat、Responses、Anthropic、stream 和 tool loop 通过。
- [ ] 未鉴权请求返回 401。
- [ ] 8K/32K context 和并发 1/4/8 通过。
- [ ] ShareGPT open-loop rate sweep 的成功率和 TTFT/TPOT/ITL 符合目标 SLO。
- [ ] DSpark accept rate 明显大于 0。
- [ ] 日志没有明文 key、missing weight、CUDA 或 NCCL traceback。

## 结语

这次部署最有价值的地方，不是最终看到端口监听成功，而是第一次完整理解了一个
模型如何从磁盘上的低精度 checkpoint，经过 loader、运行时权重重排、分布式调度、
GPU kernel、KV cache 和 API 层，最后变成一个可以稳定调用的服务。

DeepSeek-V4-Flash-0731 并不是天然适配 A100。最终能够运行，是因为把不适合 SM80
的 FP8/FP4 路径拆开处理：普通权重落到 BF16，routed experts 映射到 INT8 Tensor
Core，KV/indexer 和稀疏注意力分别使用 A100 兼容实现，再通过严格版本约束和完整
回归把它们重新组合到 SGLang 服务链路中。

对我来说，这才算第一次真正“完整部署了一个模型”。

## 参考资料与项目链接

### 本文实现

- [完整代码仓库：yaleyoou/deepseek-v4-a100-sglang-v0516](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516)
- [项目 README 与快速开始](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/README.md)
- [完整中文部署手册](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/deployment_zh.md)
- [SGLang v0.5.16 迁移实现说明](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/implementation_v0516.md)
- [模型转换说明](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/model_conversion.md)
- [MXFP4/INT8 MoE 设计](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/mxfp4_int8_moe.md)
- [A100 稀疏注意力设计](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/deepseek_v4_sparse_attention.md)
- [Indexer query-token CP 设计](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/docs/indexer_query_cp.md)
- [运行时 monkeypatch 主入口](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/dsv4_a100_patch/patch.py)
- [TP=4 基础启动脚本](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/scripts/launch_dsv4_flash_0731_tp4.sh)
- [TP=4 DSpark 启动脚本](https://github.com/yaleyoou/deepseek-v4-a100-sglang-v0516/blob/main/scripts/launch_dsv4_flash_0731_tp4_dspark.sh)

### 参考项目与上游资料

- [A100 patch 参考项目：Qeeweew/deepseek-v4-a100-sglang](https://github.com/Qeeweew/deepseek-v4-a100-sglang)
- [DeepSeek-V4-Flash-0731 官方模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash-0731)
- [SGLang 官方仓库](https://github.com/sgl-project/sglang)
- [SGLang 官方 ShareGPT benchmark 数据](https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered)
- [本文锁定的 SGLang v0.5.16 commit](https://github.com/sgl-project/sglang/commit/fdebc938f7f4d16fe6b9f55dcd9a767cf0899ea1)
- [参考项目锁定的旧 SGLang commit](https://github.com/sgl-project/sglang/commit/1c0019da7579db73223195f25b0eed3882dff24e)

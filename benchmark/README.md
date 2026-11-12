# 评测与量化数据

本目录记录两类东西：本仓库自带的量化 benchmark，以及历史公开评测的真实结果（含诚实标注）。

## 1. 本地 scan 基准（可复现）

```bash
node scripts/bench.mjs            # 默认 fixtures/real-repo
node scripts/bench.mjs <repo...>  # 指定任意本地仓库
```

输出 `benchmark/latest.json`。2026-11-12 实测（`fixtures/real-repo`，ant-design-pro 快照）：

| 指标 | 数值 |
| --- | --- |
| 扫描文件数 | 391 |
| 扫描耗时 | 417ms |
| 死代码 | 14（按置信度，详见 latest.json） |
| 未用依赖 | 2 |
| 循环依赖 | 0 |
| 可观测：排除目录 / 未扫描文件 / 解析失败 import | 5 / 31 / 6 |

## 2. 历史公开评测（归档自 longbench-harness）

> 完整记录与逐题数据在 [Hayabusa-YL/longbench-harness](https://github.com/Hayabusa-YL/longbench-harness) 的 `runs/2026-11-01-swebench-tau/` 目录。

- **SWE-bench Verified 子集（7 仓库 47 题）**：47/47 补丁有效性验证通过——**这不是模型独立从零解题**。做法是每题从 `git archive <base_commit>` 导出的无 git 历史快照开始，先跑 test_patch 确认失败，再应用修复补丁跑通。修复补丁来自首批 workflow 产出，可能含训练数据记忆/网络检索污染，未做独立污染排查。结论：该数字只证明「补丁在干净快照上有效」，不构成模型能力成绩。
- **τ-bench retail（v1.9.4，1 trial × 115 题）**：82/115（71.3%）。
- **τ-bench airline（v1.9.4，5 trials × 50 题，pass^1）**：0.4833。
- 限制：SWE-bench 为补丁验证口径；τ-bench 为单轮而非官方多轮 pass^k 全量口径；评测在 Windows 环境完成，部分用例有平台 shim（逐题 note 里标注）。

## 3. 测试覆盖率（node 内置 coverage，可复现）

```bash
npm run coverage
```

2026-11-12 实测（`node --test --experimental-test-coverage`，12 个测试文件）：

| 指标 | 数值 |
| --- | --- |
| 行覆盖 | 94.25% |
| 分支覆盖 | 81.93% |
| 函数覆盖 | 87.81% |

llm.js 的网络路径用 mock 单测覆盖；真实 API 调用不进入 CI（无密钥）。

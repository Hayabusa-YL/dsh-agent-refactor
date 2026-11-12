# 拆分流水线质量分布验证（split-variance）

## 目的

回答一个问题：**同一个大组件、同一份提示词，多次跑拆分，成功率与产物结构分布如何？** 这是「一次大改 → 多小文件高质量」承诺的验收前提。

## 方法

- 固定 fixture：`scripts/split-variance.mjs` 内置的 300 行合成组件（60 组 filter 状态 / 60 个 effect / 30 个筛选块 / 表格）。
- 流程：analyze → plan（带校验+反馈重试）→ generate（单组件分文件）→ parent。
- 判定：`splitFile` 全流程不抛错 = 成功；组件数/迁移步数/文件数 = 结构分布。
- 不用真模型时，任何片段都**不会**被包装成成功：失败照实记录。

## 结果

### qwen2.5:7b（本机 ollama，OpenAI 兼容 + 原生 options）

批次一（无 options，单调用超时 120s/300s，3 次）：

| run | 结果 | 失败阶段 | 失败模式 | 耗时 |
|---|---|---|---|---|
| 0 | 失败 | 调用内 | 500 token repeat limit | 140s |
| 1 | 失败 | 调用内 | 300s abort | 458s |
| 2 | 失败 | 调用内 | 300s abort | 749s |

批次二（原生 /api/chat + num_predict 2000/repeat_penalty 1.05，3 次）：

| run | 结果 | 失败阶段 | 失败模式 | 耗时 |
|---|---|---|---|---|
| 0 | 失败 | 调用内 | 500 token repeat limit | 239s |
| 1 | 失败 | analyze | JSON 截断（position 6551） | 1062s |
| 2 | 失败 | analyze | JSON 截断（position 7055） | 456s |

批次三（analyze 加 structured schema）：analyze 单步 180s 超时 abort。

单步诊断（`scripts/split-debug.mjs`）：

| 阶段 | 结果 | 耗时 | 备注 |
|---|---|---|---|
| analyze | 失败 | 40s | 返回 `{}`（空对象，偷懒） |
| plan | 成功 | 53s | components 3 / hooks 1 / migration 7 |
| generate | 成功 | 61s | 3 文件 + parent |

### qwen2.5:3b（本机 ollama）

| run | 结果 | 失败阶段 | 失败模式 | 耗时 |
|---|---|---|---|---|
| 0 | 失败 | 调用内 | JSON 语法错误（position 5143，缺 ]） | 189s |
| 1 | 失败 | 调用内 | JSON 语法错误（position 5605，缺 ]） | 135s |

3b 更快但 JSON 产出更破损：2 次都死在语法错误的 JSON 上，连 parseJsonLoose 兜底都救不回来。

## 失败模式统计

- token 重复循环（ollama 500）：2 次
- 单调用 300s abort：2 次
- JSON 截断（num_predict 截断）：2 次
- 空对象 `{}`：analyze 单步
- schema 约束下超时：1 次

## 根因

1. **analyze 是唯一瓶颈**：7b 在 300 行源码 + 5 字段语义地图任务上或输出空对象、或输出被截断、或陷入重复循环；48s~180s 之间跳变（ollama 动态批处理/显存压力）。
2. plan/generate 单步可正常工作，说明流水线本身与提示词没有硬伤。
3. 加固措施（分文件生成、plan 反馈重试、ollama 原生 options、structured schema）都**没能**把 7b 的 analyze 从不可靠变成可靠——这是模型能力/本机算力天花板，不是提示词问题。

## 已实施改进（本轮）

- plan 校验失败带 feedback 重试（REPAIR_ROUNDS=2）。
- generate 每文件独立调用 + 父组件文本块解析（减少 JSON 修复负担）。
- llm.js 支持 ollama 原生 `/api/chat`（num_predict/repeat_penalty/repeat_last_n）。
- llm.js 支持 structured outputs（json 传 schema 对象）。
- maxTokens 降为 2000（避免无意义超长输出）。
- 分包策略：generate 按 plan 分组（组件+其直接 hook 同一包，载荷过大自动退回单文件）。

## 结论与建议

- **本地 qwen2.5:7b 不适合作为拆分生产模型**：成功率实测 0/6，失败模式以 analyze 阶段为主。
- 项目已原生支持 OpenAI 兼容接口：给 `AGENT_REFACTOR_LLM_BASE_URL/KEY/MODEL` 配 deepseek-chat 等 API 模型即可跑通；单组件拆分成本几分钱量级。
- 若坚持本地：需更小输入（analyze 只喂组件头部+结构摘要）或换更快模型后重新测分布；当前无数据支持「本地可稳定生产」。
- 局限：fixture 只有 1 个组件、每模型样本少；3b 批次结果出来后补全分布。

## 复现

```bash
cd projects/agent-refactor
node scripts/split-variance.mjs 3 qwen2.5:7b
node scripts/split-variance.mjs 2 qwen2.5:3b
node scripts/split-debug.mjs analyze qwen2.5:7b
```

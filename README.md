# agent-refactor

> 以「代码体检」为入口的 AI 工程师工具包：扫出死代码、未用依赖、循环依赖，安全地修掉它，再把 800 行巨型组件拆成可维护的结构——**每一步都有证据链、测试门禁和自动回滚**。

不是"告诉你哪里臭"，而是"告诉你这行代码为什么没人用、这块 UI 为什么拆不动，然后安全地清掉或拆开它"。

## 演示（15 秒）

![scan 扫出问题、fix 安全修复的终端演示](docs/case-study/demo/demo.gif)

## 它做什么

四条命令，覆盖"体检 → 修复 → 重构"完整链路：

| 命令 | 作用 | 输出 |
| --- | --- | --- |
| `scan` | 扫描死代码 / 未用依赖 / 循环依赖 | 终端报告 + HTML，每条结论带证据链（扫描文件数、引用链、可达性） |
| `fix` | 安全清理：备份 → 删除/清理 → 跑测试 → 通过保留 | 失败自动回滚，零残留 |
| `split` | 把巨型组件拆成子组件 + hooks：分析 → 规划 → 生成 → 门禁 → 落地 | 拆分后的文件树 + 门禁日志 |
| `analyze` | 对任意组件只出拆分计划，不落地 | 语义地图 + 拆分计划 |

## 实测数据（真实，可复核）

**巨型组件拆分**（fixtures/giant-app，550 行 Dashboard）：

- 550 行单文件 → 119 行容器 + 6 个子组件 + 3 个 hooks + 共享类型
- 门禁：vite 构建通过（1648ms 首次 / 479ms 缓存）、SSR 冒烟通过（HTML 1346 字符）、单元测试 14 个全绿
- jsdom 交互冒烟：初始渲染、筛选面板展开、新增弹窗开关 4 步通过
- 失败案例：第一次生成编译失败，门禁拦截、自动回滚、零残留（见 [案例](docs/case-study/README.md)）

**真实开源仓库端到端**（ant-design-pro v6.0.3，真实生产级 umi 项目，页面组件 advanced-form 554 行）：

- 第一次尝试：生成代码把 JSX 写进 `.ts` hook 文件，构建失败 → 门禁拦截、自动回滚、零残留（已修复空目录残留）
- 修复引擎后重跑：554 行 → 58 行容器 + 4 组件 + 1 hook，`npm run build` 通过（17 秒）、`tsc --noEmit` 通过
- 这不是自建 fixture，是真实开源仓库的完整构建验证

**真实开源组件**（ant-design/ant-design `components/table/InternalTable.tsx`，822 行）：

- 分析出 47 个状态、20 个 UI 区块、12 个副作用、3 处强耦合（changeEventInfo 共享对象、transformColumns 链、mergedData 依赖链）
- 规划 3 组件 + 5 hooks + 7 步迁移，结构校验通过
- 局限：该文件依赖 30+ 内部模块，只能验证规划质量，未能构建验证（见边界）

**成本**：单组件完整拆分（分析 + 规划 + 生成，共 3 次 LLM 调用）约 2–3 万 token，按 DeepSeek 价格约 **3–5 分钱**；失败回喂修复每轮再加约 3 千 token。样本与记录见 `memory/audit/split-engine-2026-11-15.md`。

## 诚实边界（先看这里）

1. **行为等价性机器证明不到 100%。** 门禁能证明"能编译、结构等价、现有测试通过"，但异步、动画、副作用类组件的真实行为必须人工回归——这是物理上限，不是没做。
2. **真实仓库构建验证已做一次**（ant-design-pro advanced-form 页面，构建+类型检查通过）；antd 的 822 行 InternalTable 只验证了规划质量，因为依赖 30+ 内部模块无法独立构建。
3. **LLM 生成是非确定性的。** 同一组件两次拆分结果可能不同；工具记录每次的模型版本与成本，便于审计。
4. **验证等级标注**：每条结论都会标注「编译级 / 结构级 / 行为级」，行为级不承诺，只标注。

## 安全保证

- **fix / split 永远先备份**：被改文件先复制到 `.agent-refactor/backup/`。
- **门禁自动判定**：fix 跑 `testCommand`，split 跑 `buildCommand` + 可选 `verifyCommand`（如 SSR 冒烟）。
- **失败自动回滚**：门禁不过，恢复全部文件，报告原始错误。
- **默认 dry-run**：`--yes` 显式同意才落地；没测试命令默认拒绝修复。

## 快速开始

```bash
npm install
node bin/cli.js scan fixtures/demo-project
node bin/cli.js fix fixtures/demo-project --dry-run
node bin/cli.js analyze fixtures/real-components/antd-InternalTable.tsx   # 需配 LLM
node bin/cli.js split fixtures/giant-app/src/App.tsx --yes               # 需配 LLM
```

LLM 配置（环境变量）：

```bash
export AGENT_REFACTOR_LLM_BASE_URL=https://api.deepseek.com/v1
export AGENT_REFACTOR_LLM_KEY=sk-***
export AGENT_REFACTOR_LLM_MODEL=deepseek-chat
```

## 作者与来历

这整个项目——代码、测试、审计记录、失败复盘——由 AI agent 在一位人类的指令下完成。人负责下指令和决策，AI 负责全部实现与验证。这本身就是作品的一部分：一个能独立交付、知道何时停手、诚实标注上限的 AI 工程师。

## 路线图

- [x] scan：死代码 / 未用依赖 / 循环依赖 + 证据链
- [x] fix：备份 + 测试门禁 + 自动回滚
- [x] split：LLM 分析 → 规划 → 生成 → 门禁（构建 / 快照 / 测试）→ 回归
- [x] analyze：任意组件出拆分计划
- [x] 真实组件对照（antd InternalTable 规划验证）
- [ ] 生成代码静态安全审查（eval/外网请求拦截）
- [ ] 批量拆分：扫全项目巨组件，逐个拆
- [ ] 真实仓库端到端构建验证
- [ ] GitHub Action：PR 自动体检评论

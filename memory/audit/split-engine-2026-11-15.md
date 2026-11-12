# 巨组件智能拆分引擎 · 首轮实测

- 日期：2026-11-15
- 目标组件：`fixtures/giant-app/src/Dashboard.jsx`（550 行用户管理页，17 个 state、8 个 UI 区块、3 个副作用、多区块共享 selectedIds/filtered 强耦合）
- 模型：DeepSeek `deepseek-chat`（OpenAI 兼容接口，环境变量配置）

## 链路验证（分析 → 规划 → 校验 → 生成 → 构建 → 回滚）

| 环节 | 结果 |
|------|------|
| 分析 | 17 状态 / 8 UI 区块 / 3 副作用，识别出 keyword、selectedIds、filtered 三处跨区块强耦合 |
| 规划 | 6 组件 + 3 hooks，计划通过 `validatePlan` 规则校验 |
| 生成 | 11 个文件（6 组件 + 3 hooks + types.ts + 改薄父组件） |
| 构建门禁 | `vite build` 通过，1648ms |
| SSR 冒烟 | `renderToString(<App/>)` 通过，输出含"用户管理"，1346 字符 |
| 第一次尝试 | 生成代码构建失败 → 自动回滚，0 残留文件（门禁生效） |

## 拆分结果

| 文件 | 行数 |
|------|------|
| src/Dashboard.jsx（父容器） | 110 |
| src/hooks/useUserDashboard.ts | 220 |
| src/hooks/useUserFilters.ts | 46 |
| src/hooks/useToast.ts | 16 |
| src/components/UserTable.tsx | 107 |
| src/components/UserFormModal.tsx | 79 |
| src/components/DashboardToolbar.tsx | 46 |
| src/components/FilterPanel.tsx | 32 |
| src/components/Pagination.tsx | 28 |
| src/components/ConfirmDialog.tsx | 31 |
| src/types.ts | 25 |

## 测试

- 单元测试 14 个全过：validatePlan（名称/数量/必填校验）、validateGenerated（文件覆盖/空内容）、split-flow（dry-run / 应用成功 / 构建失败回滚 / 小组件拦截）。

## 结论与遗留

1. 端到端可用：真实 LLM 拆分 550 行组件，构建 + SSR 双验证通过，失败自动回滚。
2. 生成质量有波动：第一次生成构建失败（LLM 输出不稳定的编译错误），第二次通过——门禁是唯一可信的防线，不能省。
3. 遗留（P1）：拆分后交互回归（点击筛选/分页/弹窗）尚未自动化测；真实开源组件对照实验未做。

## 成本

- 3 次 LLM 调用（2 次 dry-run/失败尝试 + 1 次成功），deepseek-chat 合计约 2 万 token，约 0.02 元。

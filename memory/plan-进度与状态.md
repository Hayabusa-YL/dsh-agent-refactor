# AgentRefactor 进度与状态

> 项目：projects/agent-refactor（CLI 工具，死代码扫描 ✓ / 自动修复 ✓ / 巨组件智能拆分 ✓）
> 更新：2026-11-15

## 已完成

### 1. 死代码扫描（v1，已完成）
- `scan <path>`：未使用文件、未使用依赖、循环依赖检测，`--json`/`--fail`/`--fix`
- 单测 3 个

### 2. 自动修复（v4 带测试门禁，已完成）
- `fix <path>`：备份 → 删文件/改 package.json → 自动探测测试命令门禁 → 通过保留 / 失败回滚
- `--dry-run`/`--yes`/`--skip-tests`；测试命令探测（scripts.test / vitest / jest / tsconfig）
- 端到端：demo-project 删 3 死文件 12 行；stress-project 回滚 135ms
- 单测 4 个

### 3. 巨组件智能拆分引擎（已完成首轮实测，2026-11-15）
- `split <component> [path]`：AI 分析 → 拆分规划（规则校验）→ 代码生成 → 备份应用 → 构建门禁 + 可选 verify-cmd 冒烟 → 失败回滚
- 模型接口：OpenAI 兼容，环境变量 `AGENT_REFACTOR_LLM_BASE_URL` / `AGENT_REFACTOR_LLM_KEY` / `AGENT_REFACTOR_LLM_MODEL`
- 实测：真实 550 行 Dashboard → 110 行容器 + 6 组件 + 3 hooks + types，vite build 1648ms 通过，SSR 冒烟通过；一次失败生成自动回滚零残留
- 单测 7 个（validatePlan / validateGenerated / split-flow 全链路 mock）

## 测试总况

`npm test`：14 个测试全过（scan 3 + fix 4 + splitter 3 + split-flow 4）。

## 待办（按优先级）

- P1：拆分后交互回归自动化（筛选/分页/弹窗点击流）
- P1：真实开源巨组件对照实验（找 800+ 行 GitHub 公开组件）
- P2：LLM 失败时用构建错误日志做自动修复迭代（当前失败直接回滚）
- P2：依赖树可视化（计划第 12 节，仅方案）

## 关键文件

- `src/scan.js` / `src/fix.js` / `src/splitter.js` / `src/split-flow.js` / `src/llm.js` / `src/verify.js` / `src/cli.js`
- `fixtures/giant-app`（550 行 React 用户管理页 + Vite 构建环境 + ssr-smoke.mjs）
- 审计证据：`~/.dsh/memories/audit/split-engine-2026-11-15.md`

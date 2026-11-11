# 变更日志

## [0.1.0] - 2026-11-11

### 新增

- `scan`：入口可达性扫描死代码；import/require 命中检测未使用依赖；Tarjan SCC 循环依赖检测
- `fix`：备份到临时目录，删除死文件 + 清理未使用依赖，跑测试门禁（自动探测 npm test 或 .agentrefactorrc），失败自动回滚；无测试命令默认拒绝修复
- `report`：暗色终端风 HTML 报告，死代码 / 未使用依赖 / 循环依赖分区块
- 证据链 v1：每条结论附带扫描文件数、引用数、入口可达性、引用来源

### 修复（2026-11-11）

- **置信度分级**：每条死代码标注 high / medium / low；`fix` 只删 high，其余单列需人工确认
- **入口收窄**：只认 package.json 字段、根/一级 index/main/app 等入口、配置文件、测试文件；深层 index 不再自动当入口
- **模块解析补齐**：项目内绝对路径、tsconfig paths 别名、`.d.ts`、`/index.*` 补全
- **配置字符串进图**：vite/webpack/next/umi/tsconfig 的 exclude/coverage/ignore 不当使用证据，include 的 .d.ts 只作类型根
- **框架约定**：Umi global/loading/mock、路由 component、小程序 app.json pages 单独处理；生成目录整体可达
- **真实数据**：real-repo 死代码 108 → 14，high 误报 0/28；mini-leads 4 条误报全部降级；giant-app 0 high

### 质量

- 单元测试 22 个全绿（scan 8 + fix 5 + splitter 3 + split-flow 4 + 入口收窄/别名回归 2）
- 扫描核心不引入外部 AST 解析器（自研轻量 import/export 解析）；CLI 交互层依赖 chalk/commander/ora
- MIT License

# 变更日志

## [未发布]

### 新增

- `fix` 静态安全门：项目没有可探测的测试命令时不再直接拒绝——应用前检查 package.json 入口字段（main/module/browser/types/bin/exports 等）是否指向将被删除的文件、git 工作区是否干净，全绿才动手；有测试命令的项目仍走测试门禁，结果标注「未跑测试」
- 拆分回归验证：`split` 在构建门禁之后新增回归门——项目有 vitest/jest + @testing-library/react + jsdom 时，拆分前采集原组件渲染快照，拆分后自动生成对比测试并执行；环境不支持时生成 node:test 静态结构回归（父组件引用全部子组件、子组件有导出），失败同样自动回滚

## [0.3.0] - 2026-11-12

### 修复

- **六仓库真实语料回归**（ofetch / create-vue / unplugin-auto-import / hono / pinia / express）：补上 `.mts/.cts` 全量扫描、VitePress `.vitepress` 入口、Nuxt 模块 `runtime/` 约定、`*.test-d.ts` 类型测试入口、config 模板字符串路径按通配展开、CI workflow 点名的依赖算用到、`.d.ts` 声明文件不判 high、`simple-git-hooks` 入口、benchmarks/docs 包不做依赖检查
- 置信度兜底：`.d.ts` 声明与模板/resources 目录统一降级，fix 只删 high
- 语料修复后：6 仓库 high 归零，剩余 medium/low 逐条人工核对为约定或遗留，不误删

## [0.2.0] - 2026-11-12

### 修复

- 未使用依赖误报清理：templates/examples 包跳过、脚本 bin 别名映射（nr / run-p / tsgo / nuxt-module-build）、`--coverage` 与 provider 推断 coverage 包、automd 文档标记不算未用
- 新增真实仓库回归语料（`npm run corpus`）

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

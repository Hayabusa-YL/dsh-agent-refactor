# 代码健康档案（Health Profile）

agent-refactor 的 scan 输出可以直接当「代码健康档案」存档，用来追踪项目随时间的健康变化。

## 档案内容

每次扫描分六块，每块都带证据链：

1. **死代码**（deadFiles）— 0 引用的源文件。证据标注它为什么判死：仅被测试引用、动态引用不明显、从未被引用。
2. **未使用依赖**（unusedDeps）— package.json 里未被任何源文件 import 的依赖。
3. **循环依赖**（cycles）— import 环，附完整环路径。
4. **置信度**（confidence）— 每个结论标 direct / indirect / unsure：
   - `direct`：AST 里一次都没引用（可直接删）
   - `indirect`：仅动态引用可能命中（chunk 字符串、require(CONST)、URL 拼接）
   - `unsure`：无法判定（Vite glob、webpack require.context 等）
5. **健康评分**（health）— 综合死代码/未用依赖/循环数给出的分与评级。
6. **修复计划**（fix）— 可自动执行的删除清单，一键 fixapply。

## 用法

```bash
# 扫描并生成 HTML 档案
npx agent-refactor scan . --html agent-refactor-report.html

# 转 PDF（需本机 Edge/Chrome；脚本会自动找）
node scripts/report-pdf.mjs agent-refactor-report.html

# 机器可读档案（JSON）
npx agent-refactor scan . --json > health.json
```

## 档案快照

自扫本仓库的命令与结果：

```bash
node bin/cli.js scan . --json
```

（快照数字见 memory/audit 的验收记录，随版本更新。）

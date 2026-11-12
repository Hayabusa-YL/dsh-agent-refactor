import { readFileSync, writeFileSync } from 'node:fs'

function patch(file, pairs) {
  let c = readFileSync(file, 'utf8')
  for (const [from, to] of pairs) {
    if (!c.includes(from)) {
      console.error('MISS: ' + file + ' :: ' + from.slice(0, 60))
      process.exit(1)
    }
    c = c.replace(from, to)
  }
  writeFileSync(file, c, 'utf8')
  console.log('patched: ' + file)
}

patch('README.md', [
  [
    '| `scan` | 扫描死代码 / 未用依赖 / 循环依赖 | 终端报告 + HTML，每条结论带证据链（扫描文件数、引用链、可达性） |',
    '| `scan` | 扫描死代码 / 未用依赖 / 循环依赖 | 终端报告 + HTML，每条结论带证据链（扫描文件数、引用链、可达性）与置信度（high / medium / low） |',
  ],
  [
    '**成本**：单组件完整拆分',
    `**扫描精度**（2026-11 修复）：入口可达性 + 置信度分级后，real-repo 死代码 108 → 14，旧报告 100 条误报抽检 0 条仍是 high；mini-leads 旧报告 4 条误报全部降级；giant-app 0 条 high。fix 只删 high 置信死文件。

**成本**：单组件完整拆分`,
  ],
  [
    '- [ ] 真实仓库端到端构建验证',
    '- [x] 真实仓库端到端构建验证（ant-design-pro advanced-form，构建 + 类型检查通过）',
  ],
  [
    '- [ ] GitHub Action：PR 自动体检评论',
    '- [x] GitHub Action：PR / push 自动体检评论（.github/workflows/self-scan.yml）',
  ],
])

patch('CHANGELOG.md', [
  [
    '- 单元测试 14 个全绿（scan 3 + fix 4 + splitter 3 + split-flow 4）',
    '- 单元测试 22 个全绿（scan 8 + fix 5 + splitter 3 + split-flow 4 + 入口收窄/别名回归 2）',
  ],
  [
    '### 质量',
    `### 修复（2026-11-11）

- **置信度分级**：每条死代码标注 high / medium / low；\`fix\` 只删 high，其余单列需人工确认
- **入口收窄**：只认 package.json 字段、根/一级 index/main/app 等入口、配置文件、测试文件；深层 index 不再自动当入口
- **模块解析补齐**：项目内绝对路径、tsconfig paths 别名、\`.d.ts\`、\`/index.*\` 补全
- **配置字符串进图**：vite/webpack/next/umi/tsconfig 的 exclude/coverage/ignore 不当使用证据，include 的 .d.ts 只作类型根
- **框架约定**：Umi global/loading/mock、路由 component、小程序 app.json pages 单独处理；生成目录整体可达
- **真实数据**：real-repo 死代码 108 → 14，high 误报 0/28；mini-leads 4 条误报全部降级；giant-app 0 high

### 质量`,
  ],
])

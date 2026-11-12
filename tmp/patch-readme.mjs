import { readFileSync, writeFileSync } from 'node:fs'

const p = 'README.md'
let c = readFileSync(p, 'utf8')
const pairs = [
  // 1. slogan
  [
    '> 以「代码体检」为入口的 AI 工程师工具包：扫出死代码、未用依赖、循环依赖，安全地修掉它，再把 800 行巨型组件拆成可维护的结构——**每一步都有证据链、测试门禁和自动回滚**。\n\n不是"告诉你哪里臭"，而是"告诉你这行代码为什么没人用、这块 UI 为什么拆不动，然后安全地清掉或拆开它"。',
    '> **别再手动排雷了。** 一键给代码库做微创手术：自动清掉没人用的死代码和依赖，删之前先备份、删完自动跑测试，崩了自动还原——每一步都有证据链，不让你背锅。\n\n不是"告诉你哪里臭"，而是"告诉你这行代码为什么没人用、这块 UI 为什么拆不动，然后安全地清掉或拆开它"。',
  ],
  // 2. demo section + report screenshot
  [
    '## 演示（15 秒）\n\n![scan 扫出问题、fix 安全修复的终端演示](docs/case-study/demo/demo.gif)',
    '## 演示\n\n![scan 扫出问题、fix 安全修复的终端演示](docs/demo/demo.gif)\n\n终端里扫完，浏览器里直接生成 HTML 体检报告——每条死代码都带引用链和置信度，截图如下（[下载 mp4](docs/demo/demo.mp4)）：\n\n![HTML 体检报告截图](docs/demo/report/report-shot.png)',
  ],
  // 3. trouble-solving section before 实测数据
  [
    '## 实测数据（真实，可复核）',
    '## 这个工具能帮你解决什么麻烦？\n\n**接手了别人的代码，不敢删任何文件？** 最怕一删就崩、锅是自己的。`scan` 跑一遍，列出没人引用的死代码和没用的依赖，每条结论带证据链（扫了多少文件、谁引用它、从入口能不能走到）；拿不准先 `--dry-run` 看计划，确认了再修——`fix` 会先备份、删完跑测试，测试挂了自动还原，不让你背锅。\n\n**重构完一地鸡毛，遗留一堆垃圾？** 接进 GitHub Action，每次推 PR 自动扫一遍，把这次新冒出来的死代码直接评论在 PR 里，合并前自己看清。\n\n**技术主管没空逐个审查？** 定期跑一次，看哪些模块已经变成"无人问津的孤岛"——没人引用、没人 import、只在 git 历史里活着。\n\n## 实测数据（真实，可复核）',
  ],
  // 4. quick start
  [
    '## 快速开始\n\n```bash\nnpm install\nnode bin/cli.js scan fixtures/demo-project',
    '## 快速开始\n\n最快的方式是直接跑自带的演示项目，十秒看到结果：\n\n```bash\n# 一次性准备\ngit clone https://github.com/Hayabusa-YL/dsh-agent-refactor.git\ncd dsh-agent-refactor && npm install\n\n# 对着演示项目跑一遍（扫描 5 个文件，附死代码 / 未用依赖 / 循环依赖）\nnode bin/cli.js scan fixtures/demo-project\n```\n\n正式使用（在你要体检的项目里）：\n\n```bash\nnode bin/cli.js scan .\nnode bin/cli.js fix . --dry-run   # 先看计划，确认后再加 --yes\nnode bin/cli.js analyze fixtures/real-components/antd-InternalTable.tsx   # 需配 LLM\nnode bin/cli.js split fixtures/giant-app/src/App.tsx --yes               # 需配 LLM\n```\n\n> npm 包正在准备发布；发布后 `npx agent-refactor scan ./你的项目` 一行搞定。在那之前用上面的 git clone 方式，功能完全一样。',
  ],
]

for (const [from, to] of pairs) {
  if (!c.includes(from)) {
    console.error('MISS: ' + from.slice(0, 50))
    process.exit(1)
  }
  c = c.replace(from, to)
}
writeFileSync(p, c, 'utf8')
console.log('README patched, ' + c.split('\n').length + ' lines')

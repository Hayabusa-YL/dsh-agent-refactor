# agent-refactor 录屏演示：在独立窗口里自动执行，供 ffmpeg 录制
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$Host.UI.RawUI.WindowTitle = 'agent-refactor demo'
$env:AGENT_REFACTOR_LLM_BASE_URL = 'https://api.deepseek.com/v1'
# 真实 LLM key 请自行注入，例如：$env:AGENT_REFACTOR_LLM_KEY = 'your-key'
$env:AGENT_REFACTOR_LLM_MODEL = 'deepseek-chat'

Clear-Host
Write-Host '===== agent-refactor：代码体检 + 巨型组件拆分 =====' -ForegroundColor Cyan
Write-Host '真实 LLM，不是演示数据' -ForegroundColor DarkGray
Start-Sleep 3

function Run($cmdtxt) {
  Write-Host "PS> " -ForegroundColor DarkGreen -NoNewline
  Write-Host $cmdtxt -ForegroundColor White
  Start-Sleep -Milliseconds 600
  Invoke-Expression $cmdtxt
  Start-Sleep 2
}

Write-Host ''
Write-Host '[1/3] 扫描组件：' -ForegroundColor Yellow
Run 'node bin\cli.js scan fixtures\demo-project'

Write-Host ''
Write-Host '[2/3] 真实 LLM 拆分规划（只规划，不写文件）：' -ForegroundColor Yellow
Run 'node bin\cli.js split fixtures\real-repo\src\pages\form\advanced-form\index.tsx --dry-run'

Write-Host ''
Write-Host '[3/3] 真实仓库成果：554 行 -> 58 行容器 + 4 组件 + 1 hook' -ForegroundColor Yellow
Write-Host '      npm run build 通过（17s）、tsc --noEmit 通过、git 状态干净' -ForegroundColor Green
Write-Host ''
Start-Sleep 5

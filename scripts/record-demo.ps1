# 录制 agent-refactor 演示并转 GIF（v2：录满自然结束，文件完整）
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'docs\case-study\demo'
New-Item -ItemType Directory -Force $out | Out-Null
$mkv = Join-Path $out 'demo.mkv'
$gif = Join-Path $out 'demo.gif'

# 1. 恢复 real-repo 原版（演示对象是 554 行原始组件）
Set-Location (Join-Path $root 'fixtures\real-repo')
git checkout -- src/pages/form/advanced-form/index.tsx 2>$null
git clean -fdq src/pages/form/advanced-form 2>$null
Set-Location $root
$lines = (Get-Content 'fixtures\real-repo\src\pages\form\advanced-form\index.tsx').Count
Write-Output "real-repo 恢复为 $lines 行原版"

# 2. 起演示窗口并置前
$demo = Join-Path $root 'scripts\demo-run.ps1'
$demoProc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$demo -WindowStyle Maximized -PassThru
Start-Sleep -Seconds 2
$ws = New-Object -ComObject WScript.Shell
$null = $ws.AppActivate('agent-refactor demo')
Start-Sleep -Seconds 1
# 演示窗口置顶，录制期间不会被 QQ/其他窗口盖住
try {
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class DemoTopWin {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
}
"@
} catch { }
$hwnd = (Get-Process -Id $demoProc.Id -ErrorAction SilentlyContinue).MainWindowHandle
if ($hwnd -ne [IntPtr]::Zero) {
  [DemoTopWin]::SetWindowPos($hwnd, [IntPtr]::new(-1), 0, 0, 0, 0, 0x0003) | Out-Null
}

# 3. 只录演示窗口本身（title 抓窗口，不录桌面/任务栏/其他界面），窗口关闭自动结束
& ffmpeg -y -f gdigrab -draw_mouse 0 -framerate 15 -i "title=agent-refactor demo" -c:v libx264 -preset ultrafast -t 70 $mkv 2>&1 | Select-Object -Last 2

# 4. 关演示窗口
Stop-Process -Id $demoProc.Id -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# 5. 转 GIF（≤58 秒免加速）
$dur = [double](ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 $mkv)
Write-Output "raw=$dur s"
$factor = [math]::Ceiling($dur / 58)
if ($factor -lt 1) { $factor = 1 }
$vf = 'fps=8,scale=1280:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer'
if ($factor -gt 1) { $vf = "setpts=PTS/$factor,$vf" }
ffmpeg -y -i $mkv -vf $vf -loop 0 $gif 2>&1 | Select-Object -Last 2

Get-Item $mkv, $gif | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}

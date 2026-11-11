#!/usr/bin/env node
// agent-refactor：把 HTML 报告转成 PDF（依赖本机 Edge/Chrome 的 headless 打印）
// 用法：node scripts/report-pdf.mjs <report.html> [out.pdf]
// 例：node bin/cli.js scan . --html agent-refactor-report.html && node scripts/report-pdf.mjs agent-refactor-report.html
//
// 注意：部分 Windows 沙箱/受限环境里，node 直接 spawn 浏览器进程会静默不产出文件；
// 这里先写一个临时 .bat，再交给 cmd 执行，可绕开该限制（纯 Windows 回退路径）。
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import os from 'node:os'

const [, , htmlPath, pdfPath] = process.argv
if (!htmlPath || !existsSync(htmlPath)) {
  console.error('用法: node scripts/report-pdf.mjs <report.html> [out.pdf]')
  process.exit(1)
}

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]
const browser = candidates.find((p) => existsSync(p))
if (!browser) {
  console.error('未找到 Edge/Chrome，无法打印 PDF')
  process.exit(1)
}

const out = resolve(pdfPath || htmlPath.replace(/\.html?$/i, '.pdf'))
const url = pathToFileURL(resolve(htmlPath)).href
const profileDir = resolve(os.tmpdir(), 'agent-refactor-pdf-' + Date.now())
const batPath = resolve(os.tmpdir(), 'agent-refactor-pdf-' + Date.now() + '.bat')

const bat = [
  '@echo off',
  `"${browser}" --headless=new --disable-gpu --no-sandbox "--user-data-dir=${profileDir}" --no-pdf-header-footer --virtual-time-budget=10000 "--print-to-pdf=${out}" "${url}"`,
  '',
].join('\r\n')
writeFileSync(batPath, bat, 'utf8')

let r
try {
  r = spawnSync('cmd', ['/c', batPath], { encoding: 'utf8', timeout: 90000 })
} finally {
  rmSync(batPath, { force: true })
}
if (r.error) {
  console.error('Edge 启动失败：' + r.error.message)
  process.exit(1)
}
if (r.status !== 0) {
  console.error('Edge 退出码 ' + r.status + '：' + String(r.stderr || '').slice(0, 300))
  process.exit(1)
}
if (!existsSync(out)) {
  console.error('PDF 生成失败：' + out)
  process.exit(1)
}
console.log('PDF: ' + out)

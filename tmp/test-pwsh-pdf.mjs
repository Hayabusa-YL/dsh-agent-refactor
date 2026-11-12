import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import os from 'node:os'

const browser = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const out = resolve('tmp/action-test.pdf')
const url = pathToFileURL(resolve('tmp/action-test.html')).href
const prof = resolve(os.tmpdir(), 'arpw2-' + Date.now())
rmSync(out, { force: true })
const cmd = `& "${browser}" --headless=new --disable-gpu --no-sandbox "--user-data-dir=${prof}" --no-pdf-header-footer --virtual-time-budget=10000 "--print-to-pdf=${out}" "${url}"`
const r = spawnSync('pwsh', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 90000 })
console.log('status:', r.status, 'stderr:', JSON.stringify((r.stderr || '').slice(0, 300)))
console.log('exists:', existsSync(out))

#!/usr/bin/env node
/**
 * 至臻门禁：报「完成/至臻」前先跑这一条，全项 PASS 才允许汇报。
 * 用法：npm run gate
 * 退出码：0 = 全部 PASS；1 = 有 FAIL。
 */
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scanProject } from '../src/scan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];

async function check(name, fn) {
  const started = Date.now();
  try {
    const r = await fn();
    results.push({ name, ok: r.ok, detail: r.detail, ms: Date.now() - started });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message, ms: Date.now() - started });
  }
}

await check('全量测试（npm test）', () => {
  const r = spawnSync('npm', ['test'], { cwd: root, shell: true, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const pass = /# pass (\d+)/.exec(out)?.[1];
  const fail = /# fail (\d+)/.exec(out)?.[1];
  return { ok: r.status === 0 && fail === '0', detail: `pass=${pass ?? '?'} fail=${fail ?? '?'}` };
});

await check('jest 行为快照真环境（离线自动 skip）', () => {
  const r = spawnSync('node', ['--test', 'test/split-behavior-jest.test.js'], { cwd: root, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const fail = /# fail (\d+)/.exec(out)?.[1] ?? '?';
  const skip = /# skip (\d+)/.exec(out)?.[1] ?? '0';
  return { ok: r.status === 0 && fail === '0', detail: `fail=${fail} skip=${skip}` };
});

await check('语料基线（real-repo 未用依赖/死代码不倒退）', async () => {
  const res = await scanProject(join(root, 'fixtures/real-repo'));
  const names = res.unusedDeps.map((d) => d.name);
  const knownFalsePositives = ['react-dom', '@biomejs/biome', '@commitlint/cli', '@cloudflare/workers-types'];
  const hit = knownFalsePositives.filter((n) => names.includes(n));
  const high = res.deadFiles.filter((d) => d.confidence === 'high').length;
  const problems = [];
  if (hit.length) problems.push(`误报回归：${hit.join(', ')}`);
  if (names.length > 2) problems.push(`未用依赖 ${names.length} 个（基线 ≤2）`);
  if (high > 6) problems.push(`high 死代码 ${high}（基线 ≤6）`);
  return { ok: problems.length === 0, detail: problems.length ? problems.join('；') : `未用=${names.length} high=${high}` };
});

await check('CLI 冒烟（scan --json 可解析）', () => {
  const r = spawnSync('node', ['bin/cli.js', 'scan', 'fixtures/real-repo', '--json'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return { ok: false, detail: `exit=${r.status} ${(r.stderr || '').slice(0, 120)}` };
  try {
    const j = JSON.parse(r.stdout);
    const ok = j && (Array.isArray(j.deadFiles) || Array.isArray(j.unusedDeps));
    return { ok, detail: ok ? 'json 可解析' : '缺少 deadFiles/unusedDeps 字段' };
  } catch {
    return { ok: false, detail: 'stdout 不是合法 JSON' };
  }
});

await check('文档与版本同步', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const problems = [];
  if (!changelog.includes(`[${pkg.version}]`)) problems.push(`CHANGELOG 缺 [${pkg.version}] 条目`);
  if (!readme.includes('npm run gate')) problems.push('README 未提 npm run gate');
  const testScript = pkg.scripts?.test || '';
  if (!testScript.includes('split-behavior.test.js')) problems.push('test 脚本未挂 split-behavior');
  return { ok: problems.length === 0, detail: problems.length ? problems.join('；') : `v${pkg.version}` };
});

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.name} — ${r.detail}（${r.ms}ms）`);
}
console.log(`\n至臻门禁：${results.length - failed.length}/${results.length} PASS${failed.length ? '，未过不许报完成' : '，全部通过'}`);
process.exit(failed.length ? 1 : 0);

#!/usr/bin/env node
/**
 * 公开量化基准：对本地语料仓库跑 scan，输出指标 JSON（benchmark/latest.json）。
 * 用法：node scripts/bench.mjs [repo...]  默认 fixtures/real-repo。
 * 指标：扫描耗时、扫描文件数、死代码（按置信度）、未用依赖、循环依赖。
 */
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = process.argv.slice(2);
const repos = targets.length ? targets : [join(ROOT, 'fixtures', 'real-repo')];

function runScan(repo) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    execFile(
      process.execPath,
      [join(ROOT, 'bin', 'cli.js'), 'scan', repo, '--json'],
      { cwd: ROOT, maxBuffer: 20 * 1024 * 1024, timeout: 300000 },
      (err, stdout) => {
        const ms = Math.round(performance.now() - t0);
        if (err && !stdout) return resolve({ repo, ok: false, ms, error: String(err) });
        try {
          const result = JSON.parse(stdout);
          resolve({
            repo,
            ok: true,
            ms,
            filesScanned: result.meta?.scannedFiles ?? null,
            deadFiles: result.deadFiles?.length ?? null,
            deadByConfidence: result.meta?.deadByConfidence ?? null,
            unusedDeps: result.unusedDeps?.length ?? null,
            cycles: result.cycles?.length ?? null,
            version: result.meta?.version ?? null,
          });
        } catch (e) {
          resolve({ repo, ok: false, ms, error: 'JSON parse failed: ' + e.message });
        }
      },
    );
  });
}

const results = [];
for (const repo of repos) {
  const r = await runScan(repo);
  results.push(r);
  const status = r.ok
    ? `${r.ms}ms  files=${r.filesScanned}  dead=${r.deadFiles}  unused=${r.unusedDeps}  cycles=${r.cycles}`
    : `FAIL  ${r.error}`;
  console.log(`${r.repo}  ${status}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  toolVersion: results.find((r) => r.ok)?.version ?? null,
  repos: results,
};
await mkdir(join(ROOT, 'benchmark'), { recursive: true });
await writeFile(join(ROOT, 'benchmark', 'latest.json'), JSON.stringify(report, null, 2), 'utf8');
console.log('benchmark/latest.json written');

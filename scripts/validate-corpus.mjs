#!/usr/bin/env node
/**
 * 真实仓库回归语料：对 tmp/corpus 下的真实开源仓库跑 scan，产出可对比的指标。
 *
 * 用法：node scripts/validate-corpus.mjs [corpusDir] [outFile]
 * - corpusDir 默认 tmp/corpus（先 git clone --depth 1 到里面）
 * - 结果 JSON 含每仓库摘要 + 完整扫描结果，方便和下次跑的结果 diff
 */
import { scanProject } from '../src/scan.js';
import { readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpusDir = process.argv[2] || join(__dirname, '../tmp/corpus');
const outFile = process.argv[3] || join(corpusDir, 'results.json');

const repos = (await readdir(corpusDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  .map((e) => e.name)
  .sort();

if (!repos.length) {
  console.error('no repos in', corpusDir);
  process.exit(1);
}

const results = [];
for (const name of repos) {
  const dir = join(corpusDir, name);
  const res = await scanProject(dir);
  const summary = {
    repo: name,
    scannedFiles: res.meta.scannedFiles,
    frameworks: res.meta.frameworks,
    entries: res.meta.entryFiles.length,
    dead: res.deadFiles.length,
    deadByConfidence: res.meta.deadByConfidence,
    unusedDeps: res.unusedDeps.length,
    cycles: res.cycles.length,
    topDead: res.deadFiles.slice(0, 8).map((d) => `${d.confidence}:${d.file}`),
  };
  results.push({ summary, full: res });
  console.log(JSON.stringify(summary));
}

await writeFile(outFile, JSON.stringify(results, null, 2));
console.log(`\nwritten: ${outFile}`);

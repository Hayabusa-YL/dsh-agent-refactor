/**
 * 批量拆分：扫描项目里所有大组件，逐个走拆分流水线，单个失败不阻断后续。
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { splitComponent } from './split-flow.js';

const COMPONENT_EXT = /\.(jsx|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next', '.nuxt', '.output']);

/** 找出项目里所有达到行数阈值且有默认导出（或大写导出）的组件文件。 */
export async function findLargeComponents(root, { minLines = 300, maxFiles = 20, dir = '.' } = {}) {
  const results = [];
  const walk = async (dirAbs) => {
    let entries;
    try {
      entries = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dirAbs, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(abs);
        continue;
      }
      if (!COMPONENT_EXT.test(e.name)) continue;
      try {
        const src = await readFile(abs, 'utf8');
        const lines = src.split('\n').length;
        if (lines < minLines) continue;
        if (!/export\s+default|export\s+(?:const|function)\s+[A-Z]/.test(src)) continue;
        results.push({ path: relative(root, abs).replace(/\\/g, '/'), lines, bytes: Buffer.byteLength(src) });
      } catch {
        // 读不了的文件直接跳过
      }
    }
  };
  await walk(resolve(root, dir));
  results.sort((a, b) => b.lines - a.lines);
  return results.slice(0, maxFiles);
}

/** 逐个拆分。onProgress(entry, index, total) 可选。 */
export async function batchSplit({ root, llm, minLines = 300, maxFiles = 20, dryRun = false, yes = false, onProgress } = {}) {
  const targets = await findLargeComponents(root, { minLines, maxFiles });
  const results = [];
  for (const t of targets) {
    let res;
    try {
      res = await splitComponent({ root, componentRel: t.path, llm, dryRun, yes });
    } catch (e) {
      res = { ok: false, message: e.message };
    }
    const entry = {
      file: t.path,
      lines: t.lines,
      ok: !!res.ok,
      stage: res.stage,
      message: res.message,
      regression: res.regression ? res.regression.mode : res.dryRun ? 'dry-run' : undefined,
    };
    results.push(entry);
    onProgress?.(entry, results.length, targets.length);
  }
  const applied = results.filter((r) => r.ok).length;
  return { targets, results, total: targets.length, applied, failed: results.length - applied };
}

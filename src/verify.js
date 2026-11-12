/**
 * 构建门禁：探测项目构建命令并执行。拆分后用它在沙盒里验证编译。
 * 项目没有构建命令时退回语法检查兜底（node --check），不直接拒绝。
 */
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { runCommand } from './fix.js';

export async function detectBuild(root) {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    if (pkg.scripts?.build) return { command: 'npm run build', source: 'package.json scripts.build' };
  } catch {
    /* ignore */
  }
  try {
    await readFile(join(root, 'tsconfig.json'), 'utf8');
    return { command: 'npx tsc --noEmit', source: 'tsconfig.json' };
  } catch {
    /* ignore */
  }
  try {
    await readFile(join(root, 'vite.config.js'), 'utf8');
    return { command: 'npx vite build', source: 'vite.config.js' };
  } catch {
    /* ignore */
  }
  return { command: null };
}

export async function verifyBuild(root) {
  const detected = await detectBuild(root);
  if (!detected.command) {
    return { ok: true, skipped: true, command: null, message: '未找到构建命令，退回生成文件语法检查兜底' };
  }
  const result = await runCommand(detected.command, root);
  return { ...result, command: detected.command, source: detected.source };
}

/** 对已落盘的 .js/.mjs/.cjs 文件跑 node --check（JSX/TS/Vue 文件跳过，由静态/构建门禁覆盖）。 */
export async function checkSyntax(root, relPaths) {
  const failures = [];
  for (const rel of relPaths || []) {
    if (!/\.(js|mjs|cjs)$/.test(rel)) continue;
    const result = await new Promise((resolve) => {
      execFile(process.execPath, ['--check', join(root, rel)], { cwd: root, timeout: 30000 }, (err, _stdout, stderr) => {
        resolve({ ok: !err, tail: (stderr || '').trim().split('\n').slice(-5) });
      });
    });
    if (!result.ok) failures.push({ file: rel, tail: result.tail });
  }
  return { ok: failures.length === 0, failures };
}

/**
 * 构建门禁：探测项目构建命令并执行。拆分后用它在沙盒里验证编译。
 */
import { readFile } from 'node:fs/promises';
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
    return { ok: false, command: null, message: '未找到构建命令（package.json scripts.build / tsconfig / vite.config）' };
  }
  const result = await runCommand(detected.command, root);
  return { ...result, command: detected.command, source: detected.source };
}

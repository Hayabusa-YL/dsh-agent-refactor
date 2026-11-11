/**
 * 拆分全流程编排：筛选 → 分析 → 规划 → 校验 → 生成 → 校验 → 备份应用 → 构建门禁 → 回滚。
 */
import { readFile, writeFile, mkdir, cp, rm, rmdir, mkdtemp } from 'node:fs/promises';
import { join, dirname, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { analyzeComponent, planSplit, validatePlan, generateComponents, validateGenerated } from './splitter.js';
import { verifyBuild } from './verify.js';
import { runCommand } from './fix.js';

const MIN_LINES = 300;

function safeJoin(root, rel) {
  const abs = resolve(root, rel);
  const relPath = relative(root, abs);
  if (relPath.startsWith('..') || resolve(root, relPath) !== abs) return null;
  return abs;
}

export async function splitComponent({ root, componentRel, llm, dryRun = false, yes = false, verifyCmd = null }) {
  const componentPath = resolve(root, componentRel);
  const code = await readFile(componentPath, 'utf8');
  const lines = code.split('\n').length;

  if (lines < MIN_LINES) {
    return { ok: false, stage: 'screening', message: `组件只有 ${lines} 行，未达巨组件标准（建议 ${MIN_LINES}+ 行）` };
  }

  const analysis = await analyzeComponent(llm, code, { path: componentRel });
  const plan = await planSplit(llm, code, analysis, { path: componentRel });
  const planErrors = validatePlan(plan);
  if (planErrors.length) return { ok: false, stage: 'plan', plan, analysis, errors: planErrors };

  if (dryRun) return { ok: true, dryRun: true, plan, analysis, lines };

  if (!yes) return { ok: false, stage: 'confirm', plan, analysis, lines, message: '计划已生成，加 --yes 确认生成代码' };

  const generated = await generateComponents(llm, code, plan, { path: componentRel });
  const genErrors = validateGenerated(generated, plan);
  if (genErrors.length) return { ok: false, stage: 'generate', plan, errors: genErrors };

  const backupDir = await mkdtemp(join(tmpdir(), 'ar-split-'));
  const backupPath = join(backupDir, 'original.txt');
  await cp(componentPath, backupPath);

  const written = [];
  try {
    for (const f of generated.files) {
      const abs = safeJoin(root, f.path);
      if (!abs) {
        await rollback(written, componentRel, root, componentPath, backupPath);
        return { ok: false, stage: 'generate', rolledBack: true, errors: [`非法路径：${f.path}`] };
      }
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, f.content, 'utf8');
      written.push(f.path);
    }
    await writeFile(componentPath, generated.parent.content, 'utf8');
    written.push(componentRel);

    const failVerify = async (stage, extra) => {
      const debugDir = await mkdtemp(join(tmpdir(), 'ar-split-fail-'));
      for (const f of generated.files) {
        await writeFile(join(debugDir, f.path.replace(/[\\/]/g, '_')), f.content, 'utf8').catch(() => {});
      }
      await writeFile(join(debugDir, 'PARENT.txt'), generated.parent.content, 'utf8').catch(() => {});
      await rollback(written, componentRel, root, componentPath, backupPath);
      return { ok: false, stage, rolledBack: true, ...extra, debugDir };
    };

    const build = await verifyBuild(root);
    if (!build.ok) return failVerify('verify', { build, plan, written });

    let smoke = null;
    if (verifyCmd) {
      smoke = await runCommand(verifyCmd, root);
      if (!smoke.ok) return failVerify('verify-runtime', { build, smoke, plan, written });
    }
    return {
      ok: true,
      stage: 'done',
      plan,
      written,
      build: { command: build.command, ms: build.ms },
      smoke: smoke ? { command: smoke.command, ms: smoke.ms } : null,
    };
  } catch (e) {
    await rollback(written, componentRel, root, componentPath, backupPath);
    return { ok: false, stage: 'apply', rolledBack: true, message: e.message };
  }
}

async function rollback(written, componentRel, root, componentPath, backupPath) {
  for (const w of written) {
    if (w === componentRel) continue;
    const abs = safeJoin(root, w);
    if (abs) await rm(abs, { force: true });
  }
  await cp(backupPath, componentPath);
  // 清理本次写入产生的空目录（只删空目录，非空目录 rmdir 失败时忽略）
  const dirs = [...new Set(written.filter((w) => w !== componentRel).map((w) => dirname(w)))].sort((a, b) => b.length - a.length);
  for (const d of dirs) {
    const abs = safeJoin(root, d);
    if (abs) await rmdir(abs).catch(() => {});
  }
}

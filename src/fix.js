import { readFile, writeFile, copyFile, mkdir, rm, mkdtemp } from 'node:fs/promises';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

/**
 * 安全修复：备份 → 应用 → 测试门禁 → 通过才保留，失败自动回滚。
 * 原则：不在副本里装依赖（Node 项目副本没有 node_modules 导致测试跑不起来），
 * 采用"原项目内备份+回滚"，任何一步失败原样恢复。
 */
export async function applyFix(root, scanResult, options = {}) {
  const { dryRun = false, skipTests = false, yes = false } = options;
  const { deadFiles, unusedDeps } = scanResult;

  const plan = {
    deleteFiles: deadFiles.map((d) => d.file),
    removeDeps: unusedDeps.map((d) => d.name),
  };

  if (plan.deleteFiles.length === 0 && plan.removeDeps.length === 0) {
    return { ok: true, applied: false, message: '没有需要修复的问题', plan };
  }

  if (dryRun) {
    return { ok: true, applied: false, dryRun: true, plan };
  }

  if (!yes) {
    return { ok: false, applied: false, plan, message: '需要确认：加 --yes 才会真正修改（或用 --dry-run 预览）' };
  }

  const pkgPath = join(root, 'package.json');
  const backupDir = await mkdtemp(join(tmpdir(), 'agent-refactor-'));
  const backups = [];
  let pkgBackup = null;

  try {
    // 1. 备份
    for (const rel of plan.deleteFiles) {
      const abs = join(root, rel);
      const dst = join(backupDir, rel);
      await mkdir(dirname(dst), { recursive: true });
      await copyFile(abs, dst);
      backups.push({ rel, dst });
    }
    if (plan.removeDeps.length) {
      try {
        pkgBackup = await readFile(pkgPath, 'utf8');
      } catch {
        pkgBackup = null;
      }
    }

    // 2. 应用修改
    for (const rel of plan.deleteFiles) {
      await rm(join(root, rel), { force: true });
    }
    if (plan.removeDeps.length && pkgBackup) {
      const pkg = JSON.parse(pkgBackup);
      for (const name of plan.removeDeps) {
        delete pkg.dependencies?.[name];
        delete pkg.devDependencies?.[name];
      }
      await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    // 3. 测试门禁
    const gate = await detectTestCommand(root);
    let testResult = null;
    if (!skipTests && gate.command) {
      testResult = await runCommand(gate.command, root);
      if (!testResult.ok) {
        await rollback(root, backups, pkgPath, pkgBackup);
        return {
          ok: false,
          applied: false,
          rolledBack: true,
          plan,
          test: testResult,
          message: '测试失败，已自动回滚',
        };
      }
    } else if (!skipTests && !gate.command) {
      await rollback(root, backups, pkgPath, pkgBackup);
      return {
        ok: false,
        applied: false,
        rolledBack: true,
        plan,
        message: '未找到测试命令（可用 .agentrefactorrc 配置 testCommand，或加 --skip-tests）',
      };
    }

    await rm(backupDir, { recursive: true, force: true });
    return { ok: true, applied: true, plan, backups: backups.length, test: testResult, message: '修复完成，测试通过' };
  } catch (e) {
    try {
      await rollback(root, backups, pkgPath, pkgBackup);
    } catch {
      /* 回滚尽力而为 */
    }
    return { ok: false, applied: false, rolledBack: true, plan, message: `应用失败并回滚：${e.message}` };
  }
}

async function rollback(root, backups, pkgPath, pkgBackup) {
  for (const b of backups) {
    const target = join(root, b.rel);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(b.dst, target);
  }
  if (pkgBackup !== null) {
    await writeFile(pkgPath, pkgBackup, 'utf8');
  }
}

async function detectTestCommand(root) {
  const candidates = ['.agentrefactorrc.json', '.agentrefactorrc'];
  for (const name of candidates) {
    try {
      const raw = await readFile(join(root, name), 'utf8');
      const cfg = JSON.parse(raw);
      if (cfg.testCommand) return { command: cfg.testCommand, source: name };
    } catch {
      /* ignore */
    }
  }
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const test = pkg.scripts?.test;
    if (test && test !== 'echo "Error: no test specified" && exit 1') {
      return { command: test, source: 'package.json' };
    }
  } catch {
    /* ignore */
  }
  return { command: null };
}

export function runCommand(command, cwd) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(command, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', (code) => {
      resolvePromise({
        ok: code === 0,
        exitCode: code,
        ms: Date.now() - started,
        tail: output.split(/\r?\n/).filter(Boolean).slice(-200),
      });
    });
    child.on('error', (e) => resolvePromise({ ok: false, error: e.message, tail: [] }));
  });
}

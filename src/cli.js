import { Command } from 'commander';
import chalk from 'chalk';
import { resolve, relative } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
import { readFile } from 'node:fs/promises';
import { scanProject } from './scan.js';
import { applyFix } from './fix.js';
import { splitComponent } from './split-flow.js';
import { createLLM } from './llm.js';
import { analyzeComponent, planSplit, validatePlan } from './splitter.js';
import { renderTerminal, writeHtmlReport } from './report.js';

export function run(argv) {
  const program = new Command();
  program
    .name('agent-refactor')
    .version(pkg.version)
    .description('代码体检：死代码、未用依赖、循环依赖，每一条都附证据链');

  program
    .command('scan [path]')
    .description('扫描项目健康度')
    .option('--json', '输出机器可读 JSON')
    .option('--html <file>', 'HTML 报告输出路径', 'agent-refactor-report.html')
    .action(async (target, opts) => {
      const root = target ? resolve(target) : process.cwd();
      try {
        const result = await scanProject(root);
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          renderTerminal(result, chalk);
        }
        const htmlPath = await writeHtmlReport(result, resolve(process.cwd(), opts.html));
        const displayPath = relative(process.cwd(), htmlPath) || htmlPath;
        if (opts.json) {
          console.error(chalk.dim(`  HTML 报告：${displayPath}`));
        } else {
          console.log(chalk.dim(`  HTML 报告：${displayPath}`));
        }
      } catch (e) {
        console.error(chalk.red(`  扫描失败：${e.message}`));
        process.exitCode = 1;
      }
    });

  program
    .command('init')
    .description('生成 .agentrefactorrc 配置文件')
    .action(async () => {
      const fs = await import('node:fs/promises');
      const { join } = await import('node:path');
      const path = join(process.cwd(), '.agentrefactorrc.json');
      try {
        await fs.writeFile(path, JSON.stringify({
          entry: [],
          ignore: ['*.test.*', '*.spec.*', 'scripts/'],
          testCommand: 'npm test',
          skipTests: false,
        }, null, 2), 'utf8');
        console.log(chalk.green(`  配置已生成：${path}`));
      } catch (e) {
        console.error(chalk.red(`  生成失败：${e.message}`));
      }
    });

  program
    .command('fix [path]')
    .description('扫描并应用安全修复（备份+测试门禁，失败自动回滚）')
    .option('--dry-run', '只预览计划，不改动')
    .option('--yes', '确认应用修改')
    .option('--skip-tests', '跳过测试门禁（不推荐）')
    .action(async (target, opts) => {
      const root = target ? resolve(target) : process.cwd();
      try {
        const result = await scanProject(root);
        const safeDead = result.deadFiles.filter((d) => d.confidence === 'high');
        const planLine = `删除 ${safeDead.length} 个高置信死文件，移除 ${result.unusedDeps.length} 个未用依赖`;
        console.log(chalk.bold(`  修复计划：${planLine}`));
        for (const d of safeDead) console.log(chalk.yellow(`    - ${d.file}`));
        const unsure = result.deadFiles.length - safeDead.length;
        if (unsure) console.log(chalk.dim(`    （另有 ${unsure} 条仅有字符串/约定证据，需人工确认，未列入删除计划）`));
        for (const d of result.unusedDeps) console.log(chalk.yellow(`    - ${d.name}（package.json）`));

        const fixResult = await applyFix(root, result, {
          dryRun: opts.dryRun,
          yes: opts.yes,
          skipTests: opts.skipTests,
        });

        if (fixResult.dryRun) {
          console.log(chalk.dim('  预览模式：未做任何改动'));
          return;
        }
        if (!fixResult.ok) {
          console.log(chalk.red(`  ${fixResult.message}`));
          if (fixResult.test?.tail?.length) {
            console.log(chalk.dim('  测试输出（尾部）：'));
            fixResult.test.tail.slice(-8).forEach((l) => console.log(chalk.dim(`    ${l}`)));
          }
          process.exitCode = 1;
          return;
        }
        if (fixResult.plan) {
          for (const f of fixResult.plan.deleteFiles || []) console.log(chalk.red(`    - 删除 ${f}`));
          for (const d of fixResult.plan.removeDeps || []) console.log(chalk.red(`    - 移除依赖 ${d}（package.json）`));
        }
        console.log(chalk.green(`  ✓ ${fixResult.message}`));
        if (fixResult.test?.tail?.length) {
          for (const l of fixResult.test.tail) {
            console.log(l.includes('PASSED') ? chalk.green(`    ✓ ${l}`) : chalk.dim(`    ${l}`));
          }
        }
        if (fixResult.test) console.log(chalk.dim(`  测试门禁通过（${fixResult.test.ms}ms）`));
      } catch (e) {
        console.error(chalk.red(`  修复失败：${e.message}`));
        process.exitCode = 1;
      }
    });

  program
    .command('split <component> [path]')
    .description('AI 拆分巨型 React 组件（分析→规划→校验→生成→沙盒构建门禁→失败回滚）')
    .option('--dry-run', '只输出拆分计划')
    .option('--yes', '确认生成并应用')
    .option('--verify-cmd <cmd>', '构建通过后额外执行的项目验证命令（如 SSR 冒烟）')
    .action(async (component, target, opts) => {
      const root = target ? resolve(target) : process.cwd();
      const llm = createLLM();
      if (!llm) {
        console.log(chalk.red('  未配置模型接口：设置 AGENT_REFACTOR_LLM_BASE_URL / AGENT_REFACTOR_LLM_KEY / AGENT_REFACTOR_LLM_MODEL'));
        process.exitCode = 1;
        return;
      }
      try {
        const res = await splitComponent({ root, componentRel: component, llm, dryRun: opts.dryRun, yes: opts.yes, verifyCmd: opts.verifyCmd });
        printSplitResult(res, chalk);
        if (!res.ok) process.exitCode = 1;
      } catch (e) {
        console.error(chalk.red(`  拆分失败：${e.message}`));
        process.exitCode = 1;
      }
    });

  program
    .command('batch [path]')
    .description('批量拆分：扫描项目里所有大组件，逐个走拆分流水线（单个失败不阻断后续）')
    .option('--min-lines <n>', '大组件最小行数', '300')
    .option('--max-files <n>', '最多处理多少个', '20')
    .option('--dry-run', '只输出拆分计划')
    .option('--yes', '确认生成并应用')
    .action(async (target, opts) => {
      const root = target ? resolve(target) : process.cwd();
      const llm = createLLM();
      if (!llm) {
        console.log(chalk.red('  未配置模型接口：设置 AGENT_REFACTOR_LLM_BASE_URL / AGENT_REFACTOR_LLM_KEY / AGENT_REFACTOR_LLM_MODEL'));
        process.exitCode = 1;
        return;
      }
      try {
        const { batchSplit } = await import('./batch.js');
        const res = await batchSplit({
          root,
          llm,
          minLines: Number(opts.minLines) || 300,
          maxFiles: Number(opts.maxFiles) || 20,
          dryRun: !!opts.dryRun,
          yes: !!opts.yes,
          onProgress: (entry, i, total) => {
            const mark = entry.ok ? chalk.green('✔') : chalk.red('✘');
            console.log(`${mark} [${i}/${total}] ${entry.file}${entry.message ? chalk.dim(` — ${entry.message}`) : ''}`);
          },
        });
        console.log(chalk.bold(`\n  批量结果：${res.applied}/${res.total} 成功${res.failed ? `，${res.failed} 失败` : ''}`));
        if (res.failed) process.exitCode = 1;
      } catch (e) {
        console.error(chalk.red(`  批量拆分失败：${e.message}`));
        process.exitCode = 1;
      }
    });

  program
    .command('analyze <file>')
    .description('分析任意巨型组件，输出 AI 拆分计划（不落地，无需项目构建）')
    .action(async (file) => {
      const llm = createLLM();
      if (!llm) {
        console.log(chalk.red('  未配置模型接口（AGENT_REFACTOR_LLM_BASE_URL/KEY/MODEL）'));
        process.exitCode = 1;
        return;
      }
      const abs = resolve(file);
      const code = await readFile(abs, 'utf8');
      const lines = code.split('\n').length;
      try {
        const analysis = await analyzeComponent(llm, code, { path: file });
        const plan = await planSplit(llm, code, analysis, { path: file });
        const errors = validatePlan(plan);
        printSplitResult({ ok: errors.length === 0, analysis, plan, lines, errors }, chalk);
      } catch (e) {
        console.error(chalk.red(`  分析失败：${e.message}`));
        process.exitCode = 1;
      }
    });

  program.parse(argv);
}

function printSplitResult(res, chalk) {
  if (res.totalLines || res.lines) console.log(chalk.dim(`  源组件 ${res.lines || ''} 行`));
  if (res.analysis) {
    const a = res.analysis;
    console.log(chalk.bold('  语义地图：'));
    if (a.states?.length) console.log(chalk.dim(`    状态 ${a.states.length} 个 · UI 区块 ${a.uiBlocks?.length || 0} 个 · 副作用 ${a.effects?.length || 0} 个`));
    if (a.crossCoupling?.length) console.log(chalk.dim(`    强耦合点：${a.crossCoupling.slice(0, 3).join('；')}`));
  }
  if (res.plan) {
    const p = res.plan;
    console.log(chalk.bold('  拆分计划：'));
    for (const c of p.components || []) {
      console.log(chalk.green(`    ├─ <${c.name}> `) + chalk.dim(`— ${c.responsibility || ''}`));
    }
    for (const h of p.hooks || []) {
      console.log(chalk.cyan(`    └─ ${h.name}() `) + chalk.dim(`— ${h.responsibility || ''}`));
    }
    if (p.migration?.length) {
      console.log(chalk.bold('  迁移步骤：'));
      p.migration.forEach((m, i) => console.log(chalk.dim(`    ${i + 1}. ${m}`)));
    }
  }
  if (res.errors?.length) {
    console.log(chalk.red('  校验失败：'));
    for (const e of res.errors) console.log(chalk.red(`    ✗ ${e}`));
    return;
  }
  if (res.dryRun) {
    console.log(chalk.dim('  预览模式：未生成代码。确认后加 --yes'));
    return;
  }
  if (res.stage === 'confirm') {
    console.log(chalk.dim(`  ${res.message}`));
    return;
  }
  if (res.rolledBack) {
    const reason = res.stage === 'verify' ? '构建失败' : res.stage === 'verify-regression' ? '回归验证失败' : res.stage === 'verify-runtime' ? '运行冒烟失败' : res.message || '应用失败';
    console.log(chalk.red(`  已自动回滚：${reason}`));
    if (res.regression?.tail?.length) {
      res.regression.tail.slice(-8).forEach((l) => console.log(chalk.dim(`    ${l}`)));
    }
    if (res.smoke?.tail?.length) {
      res.smoke.tail.slice(-8).forEach((l) => console.log(chalk.dim(`    ${l}`)));
    }
    if (res.build?.tail?.length) {
      res.build.tail.slice(-8).forEach((l) => console.log(chalk.dim(`    ${l}`)));
    }
    return;
  }
  if (res.ok) {
    if (res.stage === 'done' || res.written) {
      console.log(chalk.green(`  ✓ 拆分完成：写入 ${res.written?.length || 0} 个文件，构建通过（${res.build?.ms || 0}ms）`));
      if (res.regression) {
        const mode = res.regression.mode === 'behavior' ? '行为快照' : '静态结构';
        console.log(chalk.dim(`    回归验证：${mode}（${res.regression.ms || 0}ms）`));
      }
      for (const w of res.written || []) console.log(chalk.dim(`    + ${w}`));
    } else {
      console.log(chalk.green('  ✓ 分析完成：拆分计划已通过校验（未落地代码）'));
    }
  }
}

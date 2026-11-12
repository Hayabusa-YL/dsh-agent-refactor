/**
 * 拆分回归验证：
 * 1) 行为模式（项目有 vitest/jest + @testing-library/react + jsdom）：拆分前采集原组件渲染快照，拆分后对比
 * 2) 静态模式（默认兜底）：生成 node:test 结构回归测试，验证子组件引用与导出契约
 * 任何环境探测失败都退回静态模式，不阻塞拆分。
 */
import { readFile, writeFile, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './fix.js';

/** 剥掉 NODE_TEST_CONTEXT：本工具自身可能跑在 node --test 里，子进程继承它会让 node --test 递归跳过。 */
function cleanEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

export async function detectRegressionEnv(root) {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const framework = deps.vitest ? 'vitest' : deps.jest ? 'jest' : null;
    return {
      framework,
      hasReact: !!deps.react,
      hasTestingLibrary: !!(deps['@testing-library/react']),
      hasJsdom: !!(deps.jsdom || deps['jest-environment-jsdom']),
    };
  } catch {
    return null;
  }
}

async function hasBin(root, name) {
  const bin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  return access(bin).then(() => true).catch(() => false);
}

/** 跨平台跑测试框架入口：Windows 下 `node_modules/.bin/vitest` 这种正斜杠路径 cmd 解析不了，直接走 node 入口。 */
function frameworkCommand(framework) {
  return framework === 'jest' ? 'node node_modules/jest/bin/jest.js' : 'node node_modules/vitest/vitest.mjs';
}

function runnerArgs(framework, testFile) {
  return framework === 'jest' ? `${testFile} --env=jsdom` : `run ${testFile} --reporter=dot`;
}

/**
 * 拆分前采集行为基线（原组件渲染出的 HTML）。环境不全时返回 null，后续走静态模式。
 */
export async function captureBehaviorBaseline(root, componentRel) {
  const env = await detectRegressionEnv(root);
  if (!env || !env.framework || !env.hasTestingLibrary || !env.hasJsdom) return null;
  if (!(await hasBin(root, env.framework))) return null;

  const baselinePath = join(root, '__ar_baseline.json');
  const testFile = '__ar_capture_baseline.test.tsx';
  const importPath = './' + componentRel.replace(/\\/g, '/');
  const isJest = env.framework === 'jest';
  const header = isJest
    ? ['/** @jest-environment jsdom */']
    : ['// @vitest-environment jsdom', "import { test } from 'vitest';"];
  const content = [
    ...header,
    "import React from 'react';",
    "import { render } from '@testing-library/react';",
    `import * as Mod from '${importPath}';`,
    "import { writeFileSync } from 'node:fs';",
    "test('capture baseline', () => {",
    "  const C = Mod.default ?? Object.values(Mod).find((v) => typeof v === 'function');",
    "  if (!C) throw new Error('no component export');",
    '  const { container } = render(<C />);',
    `  writeFileSync('${baselinePath.replace(/\\/g, '/')}', JSON.stringify({ html: container.innerHTML }), 'utf8');`,
    '});',
  ].join('\n');
  await writeFile(join(root, testFile), content, 'utf8');
  try {
    const run = await runCommand(`${frameworkCommand(env.framework)} ${runnerArgs(env.framework, testFile)}`, root, cleanEnv());
    if (!run.ok) return null;
    const parsed = JSON.parse(await readFile(baselinePath, 'utf8'));
    return { html: parsed.html, path: baselinePath };
  } catch {
    return null;
  } finally {
    await rm(join(root, testFile), { force: true });
  }
}

/**
 * 拆分后回归验证：行为模式优先，失败自动退回静态结构模式。
 * 返回 { ok, mode: 'behavior'|'static', command, ms, tail }。
 */
export async function verifySplitRegression(root, { componentRel, generated, baseline }) {
  const children = (generated.files || []).filter((f) => f.path !== componentRel);
  const env = await detectRegressionEnv(root);
  const cleanupBaseline = async () => {
    if (baseline?.path) await rm(baseline.path, { force: true });
  };
  if (baseline?.html && env?.framework && env.hasTestingLibrary && env.hasJsdom && (await hasBin(root, env.framework))) {
    const res = await runBehaviorRegression(root, componentRel, baseline, env.framework);
    await cleanupBaseline();
    if (res) return res;
  }
  const res = await runStaticRegression(root, componentRel, children);
  await cleanupBaseline();
  return res;
}

async function runStaticRegression(root, componentRel, children) {
  const testFile = '__ar_regression.test.mjs';
  const childJson = JSON.stringify(children.map((c) => c.path));
  const content = [
    "import { test } from 'node:test';",
    "import assert from 'node:assert';",
    "import { readFile } from 'node:fs/promises';",
    `const parent = '${componentRel.replace(/\\/g, '/')}';`,
    `const children = ${childJson};`,
    "test('split regression: parent imports all generated children', async () => {",
    "  const code = await readFile(parent, 'utf8');",
    '  for (const child of children) {',
    "    const base = child.split('/').pop().replace(/\\.(jsx?|tsx?)$/, '');",
    '    assert.ok(code.includes(base), `parent must reference ${child}`);',
    '  }',
    '});',
    "test('split regression: children files exist and export', async () => {",
    '  for (const child of children) {',
    "    const code = await readFile(child, 'utf8');",
    '    assert.ok(/export\\s/.test(code), `${child} must export something`);',
    '  }',
    '});',
  ].join('\n');
  await writeFile(join(root, testFile), content, 'utf8');
  try {
    const run = await runCommand(`node --test ${testFile}`, root, cleanEnv());
    return { ok: run.ok, mode: 'static', command: `node --test ${testFile}`, ms: run.ms, tail: run.tail };
  } finally {
    await rm(join(root, testFile), { force: true });
  }
}

async function runBehaviorRegression(root, componentRel, baseline, framework) {
  const testFile = '__ar_regression.test.tsx';
  const importPath = './' + componentRel.replace(/\\/g, '/');
  const isJest = framework === 'jest';
  const header = isJest
    ? ['/** @jest-environment jsdom */']
    : ['// @vitest-environment jsdom', "import { test, expect } from 'vitest';"];
  const content = [
    ...header,
    "import React from 'react';",
    "import { render } from '@testing-library/react';",
    `import * as Mod from '${importPath}';`,
    "import { readFileSync } from 'node:fs';",
    "test('split regression: renders same html as before split', () => {",
    "  const C = Mod.default ?? Object.values(Mod).find((v) => typeof v === 'function');",
    "  if (!C) throw new Error('no component export');",
    `  const expected = JSON.parse(readFileSync('${baseline.path.replace(/\\/g, '/')}', 'utf8')).html;`,
    '  const { container } = render(<C />);',
    '  expect(container.innerHTML).toBe(expected);',
    '});',
  ].join('\n');
  await writeFile(join(root, testFile), content, 'utf8');
  try {
    const run = await runCommand(`${frameworkCommand(framework)} ${runnerArgs(framework, testFile)}`, root, cleanEnv());
    return { ok: run.ok, mode: 'behavior', command: `${framework} ${runnerArgs(framework, testFile)}`, ms: run.ms, tail: run.tail };
  } finally {
    await rm(join(root, testFile), { force: true });
  }
}

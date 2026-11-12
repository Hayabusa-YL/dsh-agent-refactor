import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectRegressionEnv, captureBehaviorBaseline, verifySplitRegression } from '../src/regression.js';

async function makeRegProject({ parentImportsChild = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-reg-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'reg', version: '1.0.0' }), 'utf8');
  await mkdir(join(dir, 'src'), { recursive: true });
  const parent = parentImportsChild
    ? "import Child from './Child.js';\nexport default function Parent() { return Child; }\n"
    : 'export default function Parent() { return null; }\n';
  await writeFile(join(dir, 'src', 'Parent.js'), parent, 'utf8');
  await writeFile(join(dir, 'src', 'Child.js'), 'export default function Child() { return null; }\n', 'utf8');
  return dir;
}

test('static regression passes when parent imports all children', async () => {
  const dir = await makeRegProject();
  try {
    const generated = { files: [{ path: 'src/Parent.js' }, { path: 'src/Child.js' }] };
    const res = await verifySplitRegression(dir, { componentRel: 'src/Parent.js', generated, baseline: null });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.mode, 'static');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('static regression fails when parent misses a child', async () => {
  const dir = await makeRegProject({ parentImportsChild: false });
  try {
    const generated = { files: [{ path: 'src/Parent.js' }, { path: 'src/Child.js' }] };
    const res = await verifySplitRegression(dir, { componentRel: 'src/Parent.js', generated, baseline: null });
    assert.equal(res.ok, false);
    assert.equal(res.mode, 'static');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectRegressionEnv reads package.json dependencies', async () => {
  const dir = await makeRegProject();
  try {
    const env = await detectRegressionEnv(dir);
    assert.equal(env.framework, null);
    assert.equal(env.hasReact, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('captureBehaviorBaseline returns null without testing environment', async () => {
  const dir = await makeRegProject();
  try {
    const baseline = await captureBehaviorBaseline(dir, 'src/Parent.js');
    assert.equal(baseline, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

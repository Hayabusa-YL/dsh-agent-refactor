import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanProject } from '../src/scan.js';
import { applyFix } from '../src/fix.js';

async function makeProject({ failTest = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-fix-'));
  const pkg = {
    name: 'fixture-fix',
    version: '1.0.0',
    main: 'src/index.js',
    scripts: { test: failTest ? 'node -e "process.exit(1)"' : 'node smoke.js' },
    dependencies: { lodash: '^4.17.0', 'unused-pkg': '^1.0.0' },
  };
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'index.js'), 'import "./a.js";\nimport "lodash";\n', 'utf8');
  await writeFile(join(dir, 'src', 'a.js'), 'export const a = 1;\n', 'utf8');
  await writeFile(join(dir, 'src', 'orphan.js'), 'export const orphan = 2;\n', 'utf8');
  await writeFile(join(dir, 'smoke.js'), "console.log('ok');\n", 'utf8');
  return dir;
}

test('fix applies: deletes dead file, removes unused dep, keeps files', async () => {
  const dir = await makeProject();
  try {
    const scan = await scanProject(dir);
    const res = await applyFix(dir, scan, { yes: true });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.applied, true);
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(orphanExists, false, 'orphan.js should be deleted');
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies['unused-pkg'], undefined, 'unused-pkg removed');
    assert.equal(pkg.dependencies.lodash, '^4.17.0', 'lodash kept');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fix rolls back when tests fail', async () => {
  const dir = await makeProject({ failTest: true });
  try {
    const scan = await scanProject(dir);
    const res = await applyFix(dir, scan, { yes: true });
    assert.equal(res.ok, false);
    assert.equal(res.rolledBack, true);
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(orphanExists, true, 'orphan.js restored by rollback');
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies['unused-pkg'], '^1.0.0', 'unused-pkg restored');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fix dry-run changes nothing', async () => {
  const dir = await makeProject();
  try {
    const scan = await scanProject(dir);
    const res = await applyFix(dir, scan, { dryRun: true });
    assert.equal(res.ok, true);
    assert.equal(res.applied, false);
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(orphanExists, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fix only deletes high-confidence dead files', async () => {
  const dir = await makeProject();
  try {
    await mkdir(join(dir, 'tools'), { recursive: true });
    await writeFile(join(dir, 'tools', 'helper.js'), 'export const helper = 1;\n', 'utf8');
    await writeFile(join(dir, 'README.md'), 'Run `node tools/helper.js` to regenerate.\n', 'utf8');
    const scan = await scanProject(dir);
    const helper = scan.deadFiles.find((d) => d.file.replace(/\\/g, '/') === 'tools/helper.js');
    assert.equal(helper?.confidence, 'medium', 'README reference downgrades to medium');
    const res = await applyFix(dir, scan, { yes: true });
    assert.equal(res.ok, true, JSON.stringify(res));
    const helperExists = await readFile(join(dir, 'tools', 'helper.js')).then(() => true).catch(() => false);
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(helperExists, true, 'medium-confidence file must not be deleted');
    assert.equal(orphanExists, false, 'high-confidence orphan is deleted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeNoTestProject({ mainToOrphan = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-fix-notest-'));
  const pkg = {
    name: 'fixture-fix-notest',
    version: '1.0.0',
    main: mainToOrphan ? 'src/orphan.js' : 'src/index.js',
    dependencies: { 'unused-pkg': '^1.0.0' },
  };
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'index.js'), 'export const ok = 1;\n', 'utf8');
  await writeFile(join(dir, 'src', 'orphan.js'), 'export const orphan = 2;\n', 'utf8');
  return dir;
}

test('fix without test command passes static safety gate', async () => {
  const dir = await makeNoTestProject();
  try {
    const scan = await scanProject(dir);
    const res = await applyFix(dir, scan, { yes: true });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.applied, true);
    assert.ok(res.staticGate?.ok, 'static gate should pass');
    assert.match(res.message, /静态安全门通过/);
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(orphanExists, false, 'orphan deleted via static gate');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fix without test command refuses when package.json main points at deleted file', async () => {
  const dir = await makeNoTestProject({ mainToOrphan: true });
  try {
    // 直接构造扫描结果：真实 scan 会把 main 指向的文件当入口，这里单测静态门本身
    const scan = { deadFiles: [{ file: 'src/orphan.js', confidence: 'high' }], unusedDeps: [] };
    const res = await applyFix(dir, scan, { yes: true });
    assert.equal(res.ok, false);
    assert.equal(res.applied, false);
    assert.ok(res.staticGate?.problems.some((p) => p.includes('入口')), JSON.stringify(res.staticGate));
    const orphanExists = await readFile(join(dir, 'src', 'orphan.js')).then(() => true).catch(() => false);
    assert.equal(orphanExists, true, 'file untouched when static gate fails');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


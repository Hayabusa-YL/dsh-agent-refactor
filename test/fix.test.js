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

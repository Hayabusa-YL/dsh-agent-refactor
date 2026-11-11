import { test } from 'node:test';
import assert from 'node:assert';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/scan.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

test('detects dead files, unused deps and cycles', async () => {
  const result = await scanProject(resolve(__dirname, '../fixtures/demo-project'));
  const dead = result.deadFiles.map((d) => d.file.replace(/\\/g, '/'));
  assert.ok(dead.includes('src/orphan.js'), 'orphan.js should be dead');
  assert.ok(dead.includes('src/utils.js'), 'utils.js should be dead');
  assert.ok(result.unusedDeps.some((d) => d.name === 'unused-pkg'), 'unused-pkg should be flagged');
  assert.ok(!result.unusedDeps.some((d) => d.name === 'lodash'), 'lodash is used');
  assert.equal(result.cycles.length, 1, 'a<->b cycle detected');
  assert.equal(result.cycles[0].length, 2);
});

test('healthy project has zero issues', async () => {
  const result = await scanProject(resolve(__dirname, '../fixtures/demo-project'));
  assert.equal(result.meta.scannedFiles, 5);
});

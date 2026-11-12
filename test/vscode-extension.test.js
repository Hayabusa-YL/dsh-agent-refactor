import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const EXT = join(ROOT, 'vscode-extension');

test('VSCode 插件：extension.js 语法合法', async () => {
  await new Promise((resolve, reject) => {
    execFile(process.execPath, ['--check', join(EXT, 'extension.js')], (err) => (err ? reject(err) : resolve()));
  });
});

test('VSCode 插件：package.json 声明命令与入口', async () => {
  const pkg = JSON.parse(await readFile(join(EXT, 'package.json'), 'utf8'));
  assert.equal(pkg.main, './extension.js');
  assert.ok(pkg.contributes.commands.some((c) => c.command === 'agentRefactor.scan'));
  assert.ok(pkg.activationEvents.includes('onCommand:agentRefactor.scan'));
});

test('VSCode 插件：CLI 入口存在', async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
  const cli = pkg.bin['agent-refactor'];
  assert.ok(cli);
  const content = await readFile(join(ROOT, cli), 'utf8');
  assert.match(content, /run\(process\.argv\)/);
});

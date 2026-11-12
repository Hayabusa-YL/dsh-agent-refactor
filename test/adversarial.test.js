import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanProject } from '../src/scan.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const FIX = join(ROOT, 'fixtures/adversarial');

test('对抗性语料：动态模板 import 不静默判死，真死文件仍 high', async () => {
  const result = await scanProject(FIX);
  const dead = new Map(result.deadFiles.map((d) => [d.file, d]));

  assert.ok(result.meta.entryFiles.includes('src/main.ts'));

  // 真死文件：没有任何引用，仍判 high
  const orphan = dead.get('src/orphan.ts');
  assert.ok(orphan);
  assert.equal(orphan.confidence, 'high');

  // 动态模板 import 命中的文件：降为 low，并给出模板证据
  for (const rel of ['src/pages/home.ts', 'src/chunk-x.ts']) {
    const d = dead.get(rel);
    assert.ok(d, `${rel} 应出现在死代码列表`);
    assert.equal(d.confidence, 'low');
    assert.ok(d.evidence.some((e) => /动态 import 模板/.test(e)));
    assert.ok(d.chain.some((c) => /动态 import 模板/.test(c)));
  }

  // tsconfig paths 别名解析成功：@/components/beta 不是死代码
  assert.ok(!dead.has('src/components/beta.ts'));

  // 非字面量 import 逐条可追溯
  assert.ok(result.meta.dynamicImports.total >= 2);
  assert.ok(result.meta.dynamicImports.items.some((i) => i.expr.includes('${name}')));
  assert.ok(result.meta.dynamicImports.items.some((i) => i.expr.includes('chunk-')));

  // 未用依赖只报真没用的那个
  const unused = result.unusedDeps.map((d) => d.name);
  assert.deepEqual(unused, ['unused-dep']);
});

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifySplitRegression } from '../src/regression.js';

const dir = await mkdtemp(join(tmpdir(), 'ar-dbg-'));
await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
await mkdir(join(dir, 'src'));
await writeFile(join(dir, 'src/Parent.js'), 'export default function Parent() { return null; }\n');
await writeFile(join(dir, 'src/Child.js'), 'export default function Child() { return null; }\n');
const res = await verifySplitRegression(dir, {
  componentRel: 'src/Parent.js',
  generated: { files: [{ path: 'src/Parent.js' }, { path: 'src/Child.js' }] },
  baseline: null,
});
console.log(JSON.stringify(res, null, 1));

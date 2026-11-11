import { test } from 'node:test';
import assert from 'node:assert';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { scanProject } from '../src/scan.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function makeProject(files, pkg = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-scan-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
  return dir;
}

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

test('resolves tsconfig paths aliases', async () => {
  const dir = await makeProject(
    {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
      'src/index.js': "import { x } from '@/utils/x';\n",
      'src/utils/x.js': 'export const x = 1;\n',
      'src/dead.js': 'export const dead = 1;\n',
    },
    { main: 'src/index.js' },
  );
  try {
    const result = await scanProject(dir);
    const dead = result.deadFiles.map((d) => d.file.replace(/\\/g, '/'));
    assert.ok(!dead.includes('src/utils/x.js'), 'alias target must be reachable');
    assert.ok(dead.includes('src/dead.js'), 'unreferenced file stays dead');
    assert.ok(result.deadFiles.every((d) => ['high', 'medium', 'low'].includes(d.confidence)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('completes .d.ts extensions and type roots', async () => {
  const dir = await makeProject(
    {
      'tsconfig.json': JSON.stringify({ include: ['./**/*.d.ts'] }),
      'src/index.js': "import data from './data';\nconsole.log(data);\n",
      'src/data.d.ts': 'declare const data: { ok: boolean };\nexport default data;\n',
      'src/globals.d.ts': 'declare const __GLOBAL__: string;\n',
    },
    { main: 'src/index.js' },
  );
  try {
    const result = await scanProject(dir);
    const dead = result.deadFiles.map((d) => d.file.replace(/\\/g, '/'));
    assert.ok(!dead.includes('src/data.d.ts'), '.d.ts import target must resolve');
    assert.ok(!dead.includes('src/globals.d.ts'), 'tsconfig include .d.ts is a type root');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scans generated dot dirs and follows their imports', async () => {
  const dir = await makeProject(
    {
      'src/index.js': "import './.umi/runtime.js';\n",
      'src/.umi/runtime.js': "import '../locales/zh.js';\n",
      'src/locales/zh.js': 'export default {};\n',
    },
    { main: 'src/index.js' },
  );
  try {
    const result = await scanProject(dir);
    const dead = result.deadFiles.map((d) => d.file.replace(/\\/g, '/'));
    assert.equal(result.meta.scannedFiles, 3, '.umi files are scanned');
    assert.ok(!dead.includes('src/.umi/runtime.js'));
    assert.ok(!dead.includes('src/locales/zh.js'), 'imports from .umi keep targets reachable');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('narrows entries to root/src index, not deep index files', async () => {
  const dir = await makeProject(
    {
      'src/index.js': "import './app.js';\n",
      'src/app.js': 'export const app = 1;\n',
      'src/pages/foo/index.js': 'export const foo = 1;\n',
    },
    { main: 'src/index.js' },
  );
  try {
    const result = await scanProject(dir);
    const dead = result.deadFiles.map((d) => d.file.replace(/\\/g, '/'));
    assert.ok(!dead.includes('src/app.js'), 'src first-level app.* is an entry');
    assert.ok(dead.includes('src/pages/foo/index.js'), 'deep index.* is no longer an entry');
    const orphan = result.deadFiles.find((d) => d.file.replace(/\\/g, '/') === 'src/pages/foo/index.js');
    assert.equal(orphan.confidence, 'high');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('marks route strings and framework conventions as medium confidence', async () => {
  const dir = await makeProject(
    {
      'config/config.ts': "import routes from './routes';\nexport default { mock: { include: ['src/pages/**/_mock.ts'] }, routes };\n",
      'config/routes.ts': "export default [{ path: '/', component: './Home' }];\n",
      'src/pages/Home.tsx': 'export default () => null;\n',
      'src/pages/foo/_mock.ts': 'export default {};\n',
      'src/global.tsx': 'export const g = 1;\n',
      'mock/user.ts': 'export default {};\n',
    },
    { dependencies: { '@umijs/max': '^4.0.0' }, main: 'src/index.js' },
  );
  try {
    const result = await scanProject(dir);
    const byFile = new Map(result.deadFiles.map((d) => [d.file.replace(/\\/g, '/'), d.confidence]));
    assert.equal(byFile.get('src/pages/Home.tsx'), 'medium', 'route component string is medium');
    assert.equal(byFile.get('src/global.tsx'), 'medium', 'Umi convention file is medium');
    assert.equal(byFile.get('mock/user.ts'), 'medium', 'mock dir is medium');
    assert.equal(byFile.get('src/pages/foo/_mock.ts'), undefined, 'config glob include is strong');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

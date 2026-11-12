import { test } from 'node:test';
import assert from 'node:assert';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { scanProject } from '../src/scan.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function makeProject(files, pkg = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-fw-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, 'utf8');
  }
  return dir;
}

const norm = (f) => f.replace(/\\/g, '/');
const deadSet = (result) => new Set(result.deadFiles.map((d) => norm(d.file)));
const entrySet = (result) => new Set(result.meta.entryFiles);

test('next: pages routes, app special files and middleware are entries', async () => {
  const dir = await makeProject(
    {
      'pages/index.tsx': "import Button from '../components/Button';\nexport default () => Button;\n",
      'pages/about.tsx': 'export default () => null;\n',
      'components/Button.tsx': 'export default function Button() { return null; }\n',
      'app/page.tsx': 'export default () => null;\n',
      'app/layout.tsx': 'export default function Layout() { return null; }\n',
      'middleware.ts': 'export const config = { matcher: [] };\n',
    },
    { dependencies: { next: '^14.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    assert.deepEqual(result.meta.frameworks, ['next']);
    const entries = entrySet(result);
    for (const f of ['pages/index.tsx', 'pages/about.tsx', 'app/page.tsx', 'app/layout.tsx', 'middleware.ts']) {
      assert.ok(entries.has(f), `${f} should be an entry`);
    }
    assert.equal(deadSet(result).size, 0, 'no false positives in a Next project');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('nuxt: route dirs are entries and auto-import dirs are not dead', async () => {
  const dir = await makeProject(
    {
      'app.vue': '<template><NuxtPage /></template>\n',
      'pages/index.vue': '<template><div /></template>\n',
      'layouts/default.vue': '<template><slot /></template>\n',
      'components/Foo.vue': '<template><div /></template>\n',
      'composables/useFoo.ts': 'export const useFoo = () => 1;\n',
      'server/api/hello.ts': 'export default () => ({});\n',
    },
    { dependencies: { nuxt: '^3.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    const entries = entrySet(result);
    for (const f of ['pages/index.vue', 'layouts/default.vue', 'app.vue', 'server/api/hello.ts']) {
      assert.ok(entries.has(f), `${f} should be an entry`);
    }
    const byFile = new Map(result.deadFiles.map((d) => [norm(d.file), d.confidence]));
    assert.equal(byFile.get('components/Foo.vue'), 'medium', 'Nuxt auto-import component is medium, not high');
    assert.equal(byFile.get('composables/useFoo.ts'), 'medium', 'Nuxt auto-import composable is medium');
    assert.ok(!byFile.has('pages/index.vue'), 'route pages are entries, never listed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('remix and sveltekit route conventions', async () => {
  const remix = await makeProject(
    {
      'app/root.tsx': 'export default () => null;\n',
      'app/routes/_index.tsx': 'export default () => null;\n',
      'app/routes/about.tsx': 'export default () => null;\n',
    },
    { dependencies: { '@remix-run/react': '^2.0.0' } },
  );
  const kit = await makeProject(
    {
      'src/routes/+page.ts': 'export const load = () => ({});\n',
      'src/hooks.server.ts': 'export const handle = async () => {};\n',
    },
    { devDependencies: { '@sveltejs/kit': '^2.0.0' } },
  );
  try {
    const r1 = await scanProject(remix);
    assert.ok(entrySet(r1).has('app/routes/_index.tsx'));
    assert.equal(deadSet(r1).size, 0);
    const r2 = await scanProject(kit);
    assert.ok(entrySet(r2).has('src/routes/+page.ts'));
    assert.ok(entrySet(r2).has('src/hooks.server.ts'));
  } finally {
    await rm(remix, { recursive: true, force: true });
    await rm(kit, { recursive: true, force: true });
  }
});

test('vite: index.html module script is the entry', async () => {
  const dir = await makeProject(
    {
      'index.html': '<script type="module" src="/src/main.ts"></script>\n',
      'src/main.ts': "import { app } from './app';\nconsole.log(app);\n",
      'src/app.ts': 'export const app = 1;\n',
      'src/unused.ts': 'export const unused = 1;\n',
    },
    { devDependencies: { vite: '^5.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    assert.ok(entrySet(result).has('src/main.ts'), 'html script src becomes entry');
    assert.ok(!deadSet(result).has('src/app.ts'));
    assert.ok(deadSet(result).has('src/unused.ts'), 'unreferenced file stays dead');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('storybook: stories are entries and components reachable', async () => {
  const dir = await makeProject(
    {
      'src/Button.stories.tsx': "import Button from './Button';\nexport default { component: Button };\n",
      'src/Button.tsx': 'export default function Button() { return null; }\n',
    },
    { devDependencies: { '@storybook/react': '^8.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    assert.ok(entrySet(result).has('src/Button.stories.tsx'));
    assert.ok(!deadSet(result).has('src/Button.tsx'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('monorepo: unused deps are attributed and hoisted usage is not flagged', async () => {
  const dir = await makeProject(
    {
      'packages/a/package.json': JSON.stringify({ name: 'a', dependencies: { 'a-only': '1.0.0' } }),
      'packages/a/src/index.ts': "import { u } from 'hoisted-util';\nimport { x } from './x';\nexport const y = u + x;\n",
      'packages/a/src/x.ts': 'export const x = 1;\n',
      'packages/b/package.json': JSON.stringify({ name: 'b', dependencies: { 'b-dep': '1.0.0' } }),
      'packages/b/src/entry.ts': "import b from 'b-dep';\nexport default b;\n",
    },
    { private: true, workspaces: ['packages/*'], dependencies: { 'hoisted-util': '1.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    const names = result.unusedDeps.map((d) => d.name);
    assert.ok(names.includes('a-only'), 'a-only unused');
    assert.equal(result.unusedDeps.find((d) => d.name === 'a-only').workspace, 'packages/a');
    assert.ok(!names.includes('hoisted-util'), 'used by workspace file, not flagged');
    assert.ok(!names.includes('b-dep'), 'used in its own package, not flagged');
    const dead = deadSet(result);
    assert.ok(!dead.has('packages/a/src/x.ts'), 'workspace imports resolve');
    assert.ok(!dead.has('packages/b/src/entry.ts'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('template/examples packages are not checked for unused deps', async () => {
  const dir = await makeProject(
    {
      'template/vitest/package.json': JSON.stringify({ name: 't', devDependencies: { jsdom: '1.0.0' } }),
      'template/vitest/vitest.config.js.ejs': "export default { test: { environment: 'jsdom' } };\n",
      'examples/demo/package.json': JSON.stringify({ name: 'e', dependencies: { 'demo-dep': '1.0.0' } }),
      'examples/demo/vite.config.ts': "import { defineConfig } from 'vite';\nexport default defineConfig({});\n",
      'src/main.ts': 'export const main = 1;\n',
    },
    { private: true, workspaces: ['template/*', 'examples/*'], dependencies: { 'root-unused': '1.0.0' } },
  );
  try {
    const result = await scanProject(dir);
    const names = result.unusedDeps.map((d) => d.name);
    assert.ok(names.includes('root-unused'), 'root package still reports');
    assert.ok(!names.includes('jsdom'), 'template package deps are delivered resources, not flagged');
    assert.ok(!names.includes('demo-dep'), 'example package deps are not flagged');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('script bin aliases count as toolchain usage', async () => {
  const dir = await makeProject(
    {
      'src/main.ts': 'export const main = 1;\n',
    },
    {
      devDependencies: {
        '@antfu/ni': '1.0.0',
        'npm-run-all2': '1.0.0',
        '@typescript/native-preview': '1.0.0',
      },
      scripts: {
        lint: 'nr lint',
        build: 'run-p typecheck build-only',
        typecheck: 'tsgo',
      },
    },
  );
  try {
    const result = await scanProject(dir);
    const names = result.unusedDeps.map((d) => d.name);
    assert.ok(!names.includes('@antfu/ni'), 'nr alias resolves to @antfu/ni');
    assert.ok(!names.includes('npm-run-all2'), 'run-p alias resolves to npm-run-all2');
    assert.ok(!names.includes('@typescript/native-preview'), 'tsgo alias resolves to native-preview');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('vitest coverage provider implies the coverage package', async () => {
  const byFlag = await makeProject(
    { 'src/main.ts': 'export const main = 1;\n' },
    { devDependencies: { '@vitest/coverage-v8': '1.0.0' }, scripts: { test: 'vitest run --coverage' } },
  );
  const byProvider = await makeProject(
    {
      'src/main.ts': 'export const main = 1;\n',
      'vitest.config.ts': "import { defineConfig } from 'vitest/config';\nexport default defineConfig({ test: { coverage: { provider: 'istanbul' } } });\n",
    },
    { devDependencies: { '@vitest/coverage-istanbul': '1.0.0' } },
  );
  try {
    const r1 = await scanProject(byFlag);
    assert.ok(!r1.unusedDeps.map((d) => d.name).includes('@vitest/coverage-v8'), '--coverage implies v8 provider');
    const r2 = await scanProject(byProvider);
    assert.ok(!r2.unusedDeps.map((d) => d.name).includes('@vitest/coverage-istanbul'), 'explicit provider implied');
  } finally {
    await rm(byFlag, { recursive: true, force: true });
    await rm(byProvider, { recursive: true, force: true });
  }
});

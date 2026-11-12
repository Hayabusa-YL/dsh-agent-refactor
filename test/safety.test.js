import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanGeneratedSafety } from '../src/safety.js';
import { splitComponent } from '../src/split-flow.js';

const clean = {
  files: [{ path: 'a.jsx', content: "import React from 'react';\nexport function A() { return <div />; }\n" }],
  parent: { path: 'p.jsx', content: 'import React from "react";\nexport default function P() { return null; }\n' },
};

test('clean generated code passes safety scan', () => {
  const r = scanGeneratedSafety(clean);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, []);
});

test('eval / new Function / child_process / document.write are red lines', () => {
  const cases = [
    "const x = eval('1+1');",
    "const f = new Function('return 1');",
    "const cp = require('child_process');",
    "import cp from 'node:child_process';",
    "document.write('<b>x</b>');",
  ];
  for (const c of cases) {
    const g = { files: [{ path: 'bad.jsx', content: c }], parent: { path: 'p.jsx', content: '' } };
    const r = scanGeneratedSafety(g);
    assert.equal(r.ok, false, c);
    assert.ok(r.blockers.length >= 1, c);
  }
});

test('parent component is scanned too', () => {
  const g = { files: [], parent: { path: 'p.jsx', content: "eval('x');" } };
  const r = scanGeneratedSafety(g);
  assert.equal(r.ok, false);
});

test('warnings recorded but not blocking', () => {
  const g = { files: [{ path: 'a.jsx', content: 'const html = <span dangerouslySetInnerHTML={{ __html: x }} />;' }], parent: { path: 'p.jsx', content: '' } };
  const r = scanGeneratedSafety(g);
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.rule === 'inline-html'));
  assert.ok(r.warnings.some((w) => w.rule === 'hardcoded-secret') === false);
});

test('split retries generation exactly once when a red line is produced', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ar-safety-'));
  try {
    await mkdir(join(dir, 'src'), { recursive: true });
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'safety-fixture', private: true, scripts: { build: 'node -e "process.exit(0)"' } }), 'utf8');
    const body = Array.from({ length: 350 }, (_, i) => `const v${i} = ${i};`).join('\n');
    await writeFile(join(dir, 'src', 'Big.jsx'), `import React from 'react';\n\n${body}\n\nexport default function Big() { return <div>{v1}</div>; }\n`, 'utf8');

    const analysis = { states: [], effects: [], uiBlocks: [], events: [], crossCoupling: [] };
    const plan = {
      components: [
        { name: 'A', file: 'src/A.jsx', responsibility: 'x', props: [] },
        { name: 'B', file: 'src/B.jsx', responsibility: 'y', props: [] },
      ],
      hooks: [{ name: 'useX', file: 'src/hooks.js', responsibility: 's', state: [] }],
      migration: ['1', '2', '3', '4'],
      risks: [],
    };
    const dirty = {
      files: [
        { path: 'src/A.jsx', content: "const evil = eval('1');\n" },
        { path: 'src/B.jsx', content: 'export function B() { return null; }\n' },
        { path: 'src/hooks.js', content: 'export function useX() { return 1; }\n' },
      ],
      parent: { path: 'src/Big.jsx', content: 'import React from "react";\nexport default function Big() { return <A />; }\n' },
    };
    const retry = {
      files: [
        { path: 'src/A.jsx', content: "import React from 'react';\nexport function A() { return <i>1</i>; }\n" },
        { path: 'src/B.jsx', content: "import React from 'react';\nexport function B() { return <i>2</i>; }\n" },
        { path: 'src/hooks.js', content: 'export function useX() { return 1; }\n' },
      ],
      parent: { path: 'src/Big.jsx', content: 'import React from "react";\nimport { A } from "./A.jsx";\nimport { useX } from "./hooks.js";\nexport default function Big() { useX(); return <A />; }\n' },
    };
    let generateCalls = 0;
    const llm = {
      async chat(messages) {
        const sys = messages[0].content;
        if (sys.includes('输出语义地图')) return JSON.stringify(analysis);
        if (sys.includes('拆成 3-5')) return JSON.stringify(plan);
        generateCalls++;
        const unitCount = plan.components.length + plan.hooks.length + 1;
        const source = generateCalls > unitCount ? retry : dirty;
        if (sys.includes('改造成父组件')) return JSON.stringify(source.parent);
        const user = messages[1]?.content || '';
        const matched = user.match(/"file": "([^"]+)"/);
        const path = matched ? matched[1] : '';
        const hit = source.files.find((f) => f.path === path);
        return JSON.stringify({ path, content: hit ? hit.content : '' });
      },
    };
    const res = await splitComponent({ root: dir, componentRel: 'src/Big.jsx', llm, yes: true });
    assert.equal(generateCalls, 2 * (plan.components.length + plan.hooks.length + 1), 'first full pass + exactly one safety retry pass');
    assert.equal(res.ok, true, JSON.stringify(res.errors || res));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

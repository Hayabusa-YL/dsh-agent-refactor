import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { batchSplit, findLargeComponents } from '../src/batch.js';

function compSource(name, lines = 350) {
  const body = Array.from({ length: lines }, (_, i) => `const v${i} = ${i};`).join('\n');
  return `import React from 'react';\n\n${body}\n\nexport default function ${name}() { return <div><span>{v1}</span></div>; }\n`;
}

async function makeProject() {
  const dir = await mkdtemp(join(tmpdir(), 'ar-batch-'));
  await mkdir(join(dir, 'src', 'components'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'batch-fixture', private: true, scripts: { build: 'node -e "process.exit(0)"' } }), 'utf8');
  await writeFile(join(dir, 'src', 'components', 'BigOne.jsx'), compSource('BigOne'), 'utf8');
  await writeFile(join(dir, 'src', 'components', 'BigTwo.jsx'), compSource('BigTwo'), 'utf8');
  await writeFile(join(dir, 'src', 'components', 'Small.jsx'), 'import React from "react";\nexport default function Small() { return null; }\n', 'utf8');
  return dir;
}

function makeLlm() {
  return {
    async chat(messages) {
      const sys = messages[0].content;
      if (sys.includes('输出语义地图')) return JSON.stringify({ states: [], effects: [], uiBlocks: [], events: [], crossCoupling: [] });
      if (sys.includes('拆成 3-5')) {
        return JSON.stringify({
          components: [
            { name: 'Part', file: 'src/components/Part.jsx', responsibility: 'x', props: [] },
            { name: 'Part2', file: 'src/components/Part2.jsx', responsibility: 'y', props: [] },
          ],
          hooks: [{ name: 'useX', file: 'src/hooks/useX.js', responsibility: 's', state: [] }],
          migration: ['a', 'b', 'c', 'd'],
          risks: [],
        });
      }
      return JSON.stringify({
        files: [
          { path: 'src/components/Part.jsx', content: "import React from 'react';\nexport function Part() { return <i>1</i>; }\n" },
          { path: 'src/components/Part2.jsx', content: "import React from 'react';\nexport function Part2() { return <i>2</i>; }\n" },
          { path: 'src/hooks/useX.js', content: 'export function useX() { return 1; }\n' },
        ],
        parent: { path: 'src/components/BigOne.jsx', content: "import React from 'react';\nimport { Part } from './Part.jsx';\nimport { Part2 } from './Part2.jsx';\nimport { useX } from '../hooks/useX.js';\nexport default function BigOne() { useX(); return <><Part /><Part2 /></>; }\n" },
      });
    },
  };
}

test('findLargeComponents selects only big default-export components', async () => {
  const dir = await makeProject();
  try {
    const found = await findLargeComponents(dir, { minLines: 300 });
    assert.deepEqual(found.map((f) => f.path).sort(), ['src/components/BigOne.jsx', 'src/components/BigTwo.jsx']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('batchSplit applies every split and skips small files', async () => {
  const dir = await makeProject();
  try {
    const res = await batchSplit({ root: dir, llm: makeLlm(), minLines: 300, yes: true });
    assert.equal(res.total, 2);
    assert.equal(res.applied, 2);
    assert.equal(res.failed, 0);
    assert.deepEqual(res.results.map((r) => r.file).sort(), ['src/components/BigOne.jsx', 'src/components/BigTwo.jsx']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('batchSplit keeps going when one component fails', async () => {
  const dir = await makeProject();
  try {
    let calls = 0;
    const flakyLlm = {
      async chat(messages) {
        const sys = messages[0].content;
        calls++;
        if (sys.includes('输出语义地图')) {
          if (calls >= 1) return JSON.stringify({ states: [], effects: [], uiBlocks: [], events: [], crossCoupling: [] });
          throw new Error('llm down');
        }
        if (sys.includes('拆成 3-5')) {
          return JSON.stringify({ components: [], hooks: [], migration: [], risks: [] });
        }
        return JSON.stringify({ files: [], parent: { path: 'x.jsx', content: '' } });
      },
    };
    const res = await batchSplit({ root: dir, llm: flakyLlm, minLines: 300, yes: true });
    assert.equal(res.total, 2);
    assert.equal(res.applied, 0);
    assert.equal(res.failed, 2);
    assert.ok(res.results.every((r) => !r.ok));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

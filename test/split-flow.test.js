import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitComponent } from '../src/split-flow.js';

function bigComponentSource(lines = 350) {
  const decls = Array.from({ length: lines }, (_, i) => `const item${i} = ${i};`).join('\n');
  return `import React from 'react';\n\n${decls}\n\nexport default function BigComponent() {\n  return <div>{item1}</div>;\n}\n`;
}

async function makeProject({ buildOk = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ar-split-test-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'split-fixture',
      private: true,
      type: 'module',
      scripts: { build: buildOk ? 'node -e "process.exit(0)"' : 'node -e "process.exit(1)"' },
    }, null, 2),
    'utf8',
  );
  await writeFile(join(dir, 'src', 'BigComponent.jsx'), bigComponentSource(), 'utf8');
  return dir;
}

const analysis = {
  states: [{ name: 'count', type: 'number', usedIn: 'counter block' }],
  effects: [],
  uiBlocks: [{ name: 'counter', lineRange: '1-350', purpose: '展示计数' }],
  events: [{ name: 'onClick', source: 'button' }],
  crossCoupling: [],
};

const plan = {
  components: [
    { name: 'CounterPanel', file: 'src/components/CounterPanel.jsx', responsibility: '计数器面板', props: [{ name: 'count', type: 'number', source: 'useCounter' }] },
    { name: 'ResetButton', file: 'src/components/ResetButton.jsx', responsibility: '重置按钮', props: [{ name: 'onReset', type: 'function', source: 'useCounter' }] },
  ],
  hooks: [{ name: 'useCounter', file: 'src/hooks/useCounter.js', responsibility: '计数状态', state: ['count'] }],
  migration: ['新建 useCounter', '新建 CounterPanel', '新建 ResetButton', '改造父组件'],
  risks: [],
};

const generated = {
  files: [
    { path: 'src/hooks/useCounter.js', content: 'export function useCounter() { return { count: 0 }; }\n' },
    { path: 'src/components/CounterPanel.jsx', content: 'export function CounterPanel({ count }) { return <div>{count}</div>; }\n' },
    { path: 'src/components/ResetButton.jsx', content: 'export function ResetButton({ onReset }) { return <button onClick={onReset}>reset</button>; }\n' },
  ],
  parent: { path: 'src/BigComponent.jsx', content: 'import { useCounter } from "./hooks/useCounter.js";\nimport { CounterPanel } from "./components/CounterPanel.jsx";\nimport { ResetButton } from "./components/ResetButton.jsx";\nexport default function BigComponent() { const c = useCounter(); return <div><CounterPanel count={c.count} /><ResetButton onReset={() => {}} /></div>; }\n' },
};

function fakeLLM() {
  return {
    async chat(messages) {
      const sys = messages[0].content;
      if (sys.includes('输出语义地图')) return JSON.stringify(analysis);
      if (sys.includes('拆成 3-5 个子组件')) return JSON.stringify(plan);
      if (sys.includes('生成其中一个文件')) {
        const user = messages[1]?.content || '';
        const matched = user.match(/"file": "([^"]+)"/);
        const path = matched ? matched[1] : '';
        const hit = generated.files.find((f) => f.path === path);
        return JSON.stringify({ path, content: hit ? hit.content : 'export function X() { return null; }\n' });
      }
      if (sys.includes('改造成父组件')) return JSON.stringify(generated.parent);
      throw new Error('unexpected prompt: ' + sys.slice(0, 40));
    },
  };
}

test('split dry-run returns plan without writing', async () => {
  const dir = await makeProject();
  try {
    const res = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm: fakeLLM(), dryRun: true });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.equal(res.dryRun, true);
    assert.equal(res.plan.components.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('split applies generated files when build passes', async () => {
  const dir = await makeProject({ buildOk: true });
  try {
    const res = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm: fakeLLM(), yes: true });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.ok(res.written.includes('src/components/CounterPanel.jsx'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('split rolls back when build fails', async () => {
  const dir = await makeProject({ buildOk: false });
  try {
    const res = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm: fakeLLM(), yes: true });
    assert.equal(res.ok, false);
    assert.equal(res.stage, 'verify');
    assert.equal(res.rolledBack, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('split rejects small components', async () => {
  const dir = await makeProject();
  try {
    await writeFile(join(dir, 'src', 'BigComponent.jsx'), 'export default function X() { return null; }\n', 'utf8');
    const res = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm: fakeLLM(), yes: true });
    assert.equal(res.ok, false);
    assert.equal(res.stage, 'screening');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

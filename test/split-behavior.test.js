/**
 * 行为快照回归的真实环境验证（至臻项）：
 * 在临时 React 项目里装 react/react-dom + vitest + @testing-library/react + jsdom，
 * 1) 等价拆分 → 行为门禁通过（applied，mode=behavior）
 * 2) 渲染不等价的拆分 → 行为门禁拦下并回滚
 * 环境装不上（离线）时跳过，不阻塞套件。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitComponent } from '../src/split-flow.js';
import { runCommand } from '../src/fix.js';

function bigComponentSource(lines = 350) {
  const decls = Array.from({ length: lines }, (_, i) => `const item${i} = ${i};`).join('\n');
  return `import React from 'react';\n\n${decls}\n\nexport default function BigComponent() {\n  return <div><span>{item1}</span><button onClick={() => {}}>reset</button></div>;\n}\n`;
}

async function makeReactProject() {
  const dir = await mkdtemp(join(tmpdir(), 'ar-split-behavior-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'split-behavior-fixture',
      private: true,
      type: 'module',
      scripts: { build: 'node -e "process.exit(0)"' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
      devDependencies: {
        vitest: '^2.1.0',
        jsdom: '^26.0.0',
        '@testing-library/react': '^16.0.0',
        '@testing-library/dom': '^10.0.0',
      },
    }, null, 2),
    'utf8',
  );
  await writeFile(join(dir, 'vitest.config.js'), "export default { test: { environment: 'jsdom' } };\n", 'utf8');
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
    { name: 'CounterPanel', file: 'src/components/CounterPanel.jsx', responsibility: '计数器面板', props: [{ name: 'count', type: 'number', source: 'props' }] },
    { name: 'ResetButton', file: 'src/components/ResetButton.jsx', responsibility: '重置按钮', props: [{ name: 'onReset', type: 'function', source: 'props' }] },
  ],
  hooks: [{ name: 'useCounter', file: 'src/hooks/useCounter.js', responsibility: '计数状态', state: ['count'] }],
  migration: ['新建 useCounter', '新建 CounterPanel', '新建 ResetButton', '改造父组件'],
  risks: [],
};

const equivGenerated = {
  files: [
    { path: 'src/hooks/useCounter.js', content: 'export function useCounter() { return { count: 99 }; }\n' },
    { path: 'src/components/CounterPanel.jsx', content: "import React from 'react';\nexport function CounterPanel({ count }) { return <span>{count}</span>; }\n" },
    { path: 'src/components/ResetButton.jsx', content: "import React from 'react';\nexport function ResetButton({ onReset }) { return <button onClick={onReset}>reset</button>; }\n" },
  ],
  parent: { path: 'src/BigComponent.jsx', content: "import React from 'react';\nimport { useCounter } from './hooks/useCounter.js';\nimport { CounterPanel } from './components/CounterPanel.jsx';\nimport { ResetButton } from './components/ResetButton.jsx';\nexport default function BigComponent() { useCounter(); return <div><CounterPanel count={1} /><ResetButton onReset={() => {}} /></div>; }\n" },
};

const brokenGenerated = {
  files: [
    { path: 'src/hooks/useCounter.js', content: 'export function useCounter() { return { count: 99 }; }\n' },
    { path: 'src/components/CounterPanel.jsx', content: "import React from 'react';\nexport function CounterPanel({ count }) { return <span>{count}</span>; }\n" },
    { path: 'src/components/ResetButton.jsx', content: "import React from 'react';\nexport function ResetButton({ onReset }) { return <button onClick={onReset}>reset</button>; }\n" },
  ],
  parent: { path: 'src/BadComponent.jsx', content: "import React from 'react';\nimport { useCounter } from './hooks/useCounter.js';\nimport { CounterPanel } from './components/CounterPanel.jsx';\nexport default function BadComponent() { useCounter(); return <div><CounterPanel count={1} /></div>; }\n" },
};

function llmFor(generated) {
  return {
    async chat(messages) {
      const sys = messages[0].content;
      if (sys.includes('输出语义地图')) return JSON.stringify(analysis);
      if (sys.includes('拆成 3-5 个子组件')) return JSON.stringify(plan);
      if (sys.includes('按拆分计划生成完整代码')) return JSON.stringify(generated);
      throw new Error('unexpected prompt: ' + sys.slice(0, 40));
    },
  };
}

test('split behavior regression compares rendered html (applies equivalent, rolls back on mismatch)', async (t) => {
  const dir = await makeReactProject();
  try {
    const install = await runCommand('npm install --no-audit --no-fund --loglevel=error', dir);
    if (!install.ok) {
      t.skip('npm install 不可用（离线环境），跳过行为模式真实环境验证');
      return;
    }
    const good = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm: llmFor(equivGenerated), yes: true });
    assert.equal(good.ok, true, `等价拆分应通过：${JSON.stringify(good.regression || good.errors || good)}`);
    assert.equal(good.regression.mode, 'behavior', '环境齐全时应走行为快照模式');
    // 坏拆分：渲染结果少一个按钮 → 行为门禁拦下并回滚
    await writeFile(join(dir, 'src', 'BadComponent.jsx'), bigComponentSource(), 'utf8');
    const bad = await splitComponent({ root: dir, componentRel: 'src/BadComponent.jsx', llm: llmFor(brokenGenerated), yes: true });
    assert.equal(bad.ok, false);
    assert.equal(bad.stage, 'verify-regression');
    assert.equal(bad.regression.mode, 'behavior');
    const restored = await readFile(join(dir, 'src', 'BadComponent.jsx'), 'utf8');
    assert.match(restored, /<button onClick=\{\(\) => \{\}\}>reset<\/button>/);
    await assert.rejects(readFile(join(dir, 'src', 'hooks', 'useCounter.js'), 'utf8'), '坏拆分的生成文件应被回滚删除');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

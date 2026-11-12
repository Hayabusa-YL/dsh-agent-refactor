/**
 * jest 行为快照回归的真实环境验证：
 * 临时 React 项目（jest + babel preset-env/react/typescript + jest-environment-jsdom + @testing-library/react），
 * 验证拆分走行为快照模式并通过。环境装不上（离线）时跳过。
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitComponent } from '../src/split-flow.js';
import { captureBehaviorBaseline } from '../src/regression.js';
import { runCommand } from '../src/fix.js';

function bigComponentSource(lines = 350) {
  const decls = Array.from({ length: lines }, (_, i) => `const item${i} = ${i};`).join('\n');
  return `import React from 'react';\n\n${decls}\n\nexport default function BigComponent() {\n  return <div><span>{item1}</span><button onClick={() => {}}>reset</button></div>;\n}\n`;
}

async function makeJestProject() {
  const dir = await mkdtemp(join(tmpdir(), 'ar-split-jest-'));
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(
    join(dir, 'package.json'),
    JSON.stringify({
      name: 'split-jest-fixture',
      private: true,
      scripts: { build: 'node -e "process.exit(0)"' },
      dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
      devDependencies: {
        jest: '^29.7.0',
        'jest-environment-jsdom': '^29.7.0',
        '@testing-library/react': '^14.3.0',
        '@testing-library/dom': '^9.3.4',
        '@babel/core': '^7.24.0',
        '@babel/preset-env': '^7.24.0',
        '@babel/preset-react': '^7.24.0',
        '@babel/preset-typescript': '^7.24.0',
      },
    }, null, 2),
    'utf8',
  );
  await writeFile(
    join(dir, 'babel.config.json'),
    JSON.stringify({ presets: ['@babel/preset-env', ['@babel/preset-react', { runtime: 'classic' }], '@babel/preset-typescript'] }),
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
    { name: 'CounterPanel', file: 'src/components/CounterPanel.jsx', responsibility: '计数器面板', props: [{ name: 'count', type: 'number', source: 'props' }] },
    { name: 'ResetButton', file: 'src/components/ResetButton.jsx', responsibility: '重置按钮', props: [{ name: 'onReset', type: 'function', source: 'props' }] },
  ],
  hooks: [{ name: 'useCounter', file: 'src/hooks/useCounter.js', responsibility: '计数状态', state: ['count'] }],
  migration: ['新建 useCounter', '新建 CounterPanel', '新建 ResetButton', '改造父组件'],
  risks: [],
};

const generated = {
  files: [
    { path: 'src/hooks/useCounter.js', content: 'export function useCounter() { return { count: 99 }; }\n' },
    { path: 'src/components/CounterPanel.jsx', content: "import React from 'react';\nexport function CounterPanel({ count }) { return <span>{count}</span>; }\n" },
    { path: 'src/components/ResetButton.jsx', content: "import React from 'react';\nexport function ResetButton({ onReset }) { return <button onClick={onReset}>reset</button>; }\n" },
  ],
  parent: { path: 'src/BigComponent.jsx', content: "import React from 'react';\nimport { useCounter } from './hooks/useCounter.js';\nimport { CounterPanel } from './components/CounterPanel.jsx';\nimport { ResetButton } from './components/ResetButton.jsx';\nexport default function BigComponent() { useCounter(); return <div><CounterPanel count={1} /><ResetButton onReset={() => {}} /></div>; }\n" },
};

const llm = {
  async chat(messages) {
    const sys = messages[0].content;
    if (sys.includes('输出语义地图')) return JSON.stringify(analysis);
    if (sys.includes('拆成 3-5 个子组件')) return JSON.stringify(plan);
    if (sys.includes('按拆分计划生成完整代码')) return JSON.stringify(generated);
    throw new Error('unexpected prompt: ' + sys.slice(0, 40));
  },
};

test('jest project: behavior regression captures baseline and applies equivalent split', async (t) => {
  const dir = await makeJestProject();
  try {
    const install = await runCommand('npm install --no-audit --no-fund --loglevel=error', dir);
    if (!install.ok) {
      t.skip('npm install 不可用（离线环境），跳过 jest 行为模式验证');
      return;
    }
    const baseline = await captureBehaviorBaseline(dir, 'src/BigComponent.jsx');
    assert.ok(baseline?.html, 'jest 项目应能采集行为基线');
    const res = await splitComponent({ root: dir, componentRel: 'src/BigComponent.jsx', llm, yes: true });
    assert.equal(res.ok, true, JSON.stringify(res.regression?.tail || res.errors || res));
    assert.equal(res.regression.mode, 'behavior', 'jest 环境应走行为快照模式');
    const html = (await readFile(join(dir, 'src', 'BigComponent.jsx'), 'utf8'));
    assert.match(html, /CounterPanel/, '拆分后的父组件应引用子组件');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

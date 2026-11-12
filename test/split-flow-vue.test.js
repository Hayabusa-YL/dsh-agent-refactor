import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { splitComponent } from '../src/split-flow.js';

function vueSource() {
  const lines = [
    '<script setup>',
    "import { ref, computed } from 'vue';",
    'const count = ref(0);',
    "const label = computed(() => 'count: ' + count.value);",
    'function inc() { count.value++; }',
  ];
  for (let i = 0; i < 340; i++) lines.push(`const v${i} = ${i};`);
  lines.push('</script>', '', '<template>', '  <div>', '    <span>{{ label }}</span>', '    <button class="reset" @click="inc">reset</button>', '  </div>', '</template>', '');
  return lines.join('\n');
}

const ANALYSIS = {
  states: [{ name: 'count', type: 'number', usedIn: 'label 与按钮' }],
  effects: [],
  uiBlocks: [{ name: '展示区', lineRange: '1-10', purpose: '显示计数' }],
  events: [{ name: 'inc', source: 'reset 按钮' }],
  crossCoupling: [],
};

const PLAN = {
  parent: 'App.vue',
  components: [
    { name: 'CounterPanel', file: 'components/CounterPanel.vue', responsibility: '展示计数', props: [{ name: 'count', type: 'number', source: 'count' }], events: [] },
    { name: 'CounterStats', file: 'components/CounterStats.vue', responsibility: '统计展示', props: [{ name: 'label', type: 'string', source: 'label' }], events: [] },
    { name: 'CounterActions', file: 'components/CounterActions.vue', responsibility: '操作按钮', props: [{ name: 'disabled', type: 'boolean', source: 'false' }], events: [{ name: 'update:count', from: 'reset 按钮' }] },
  ],
  hooks: [{ name: 'useCounter', file: 'composables/useCounter.js', responsibility: '计数状态', state: ['count'] }],
  migration: ['抽取 useCounter', '抽取子组件', '父组件组合'],
  risks: ['样式作用域需检查'],
};

const GENERATED = {
  files: [
    {
      path: 'components/CounterPanel.vue',
      content:
        '<script setup>\nimport { computed } from "vue";\ndefineProps({ count: { type: Number, required: true } });\nconst label = computed(() => "count: " + count.value);\n</script>\n<template><span>{{ label }}</span></template>\n',
    },
    {
      path: 'components/CounterStats.vue',
      content:
        '<script setup>\nimport { computed } from "vue";\ndefineProps({ label: { type: String, required: true } });\n</script>\n<template><span>{{ label }}</span></template>\n',
    },
    {
      path: 'components/CounterActions.vue',
      content:
        '<script setup>\nconst emit = defineEmits(["update:count"]);\n</script>\n<template><button class="reset" @click="emit(\'update:count\')">reset</button></template>\n',
    },
    {
      path: 'composables/useCounter.js',
      content: 'import { ref } from "vue";\nexport function useCounter() {\n  const count = ref(0);\n  const inc = () => count.value++;\n  return { count, inc };\n}\n',
    },
  ],
  parent: {
    path: 'src/App.vue',
    content:
      '<script setup>\nimport { useCounter } from "./composables/useCounter.js";\nimport CounterPanel from "./components/CounterPanel.vue";\nimport CounterStats from "./components/CounterStats.vue";\nimport CounterActions from "./components/CounterActions.vue";\nconst { count, inc } = useCounter();\n</script>\n<template><div><CounterStats :label="\'count: \' + count" /><CounterPanel :count="count" /><CounterActions @update:count="inc" /></div></template>\n',
  },
};

function mockLlm() {
  const calls = [];
  return {
    calls,
    async chat(messages) {
      calls.push(messages);
      const system = messages[0].content;
      if (system.includes('语义地图')) return JSON.stringify(ANALYSIS);
      if (system.includes('拆成 3-5 个子组件')) return JSON.stringify(PLAN);
      if (system.includes('生成其中一个文件')) {
        const user = messages[1]?.content || '';
        const matched = user.match(/"file": "([^"]+)"/);
        const path = matched ? matched[1] : '';
        const hit = GENERATED.files.find((f) => f.path === path);
        return JSON.stringify({ path, content: hit ? hit.content : 'export function X() { return null; }\n' });
      }
      if (system.includes('改造成父组件')) return JSON.stringify(GENERATED.parent);
      throw new Error('unexpected system prompt');
    },
  };
}

test('splitComponent supports Vue SFC components without a build script', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-refactor-vue-'));
  try {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'App.vue'), vueSource(), 'utf8');
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'vue-demo', version: '0.0.0' }), 'utf8');

    const llm = mockLlm();
    const result = await splitComponent({ root, componentRel: 'src/App.vue', llm, yes: true });

    assert.equal(result.ok, true, result.reason || 'split failed');
    assert.equal(result.plan.components.length, 3);
    assert.equal(result.written.length, 5);
    assert.equal(result.build.skipped, true);

    const parent = await readFile(join(root, 'src', 'App.vue'), 'utf8');
    assert.match(parent, /CounterPanel/);
    assert.match(parent, /useCounter/);

    const child = await readFile(join(root, 'components', 'CounterPanel.vue'), 'utf8');
    assert.match(child, /defineProps/);

    const hook = await readFile(join(root, 'composables', 'useCounter.js'), 'utf8');
    assert.match(hook, /export function useCounter/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

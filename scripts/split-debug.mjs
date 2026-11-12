/**
 * 拆分流水线单步诊断：分别跑 analyze / plan / generate，找出瓶颈阶段。
 * 用法：node scripts/split-debug.mjs [analyze|plan|generate] [model]
 */
import { analyzeComponent, planSplit, generateComponents } from '../src/splitter.js';
import { createLLM } from '../src/llm.js';

process.env.AGENT_REFACTOR_LLM_BASE_URL ||= 'http://127.0.0.1:11434/v1';
process.env.AGENT_REFACTOR_LLM_MODEL = process.argv[3] || 'qwen2.5:7b';
process.env.AGENT_REFACTOR_LLM_TIMEOUT_MS ||= '180000';

function buildGiant() {
  const L = [];
  L.push("import React, { useState, useEffect, useMemo, useCallback } from 'react';");
  L.push('');
  L.push("const STATUS = ['active', 'pending', 'disabled'];");
  L.push('');
  L.push('export default function GiantDashboard() {');
  for (let i = 1; i <= 60; i++) {
    L.push(`  const [filter${i}, setFilter${i}] = useState('');`);
    L.push(`  const [page${i}, setPage${i}] = useState(1);`);
  }
  for (let i = 1; i <= 60; i++) L.push(`  useEffect(() => { setPage${i}(1); }, [filter${i}]);`);
  L.push('  const [rows, setRows] = useState([]);');
  L.push("  useEffect(() => { fetch('/api/users').then((r) => r.json()).then(setRows); }, []);");
  for (let i = 1; i <= 10; i++) L.push(`  const handler${i} = useCallback((e) => { setFilter${i}(e.target.value); }, []);`);
  L.push('  const filtered = useMemo(() => rows.filter((r) => STATUS.includes(r.status)), [rows]);');
  L.push('  return (');
  L.push("    <div className='giant-dashboard'>");
  for (let i = 1; i <= 30; i++) {
    L.push(`      <section className='filter-${i}'>`);
    L.push(`        <input value={filter${i}} onChange={(e) => setFilter${i}(e.target.value)} placeholder='filter ${i}' />`);
    L.push(`        <span>page {page${i}}</span>`);
    L.push('      </section>');
  }
  L.push('      <table>');
  L.push('        <tbody>');
  L.push('          {filtered.map((r) => <tr key={r.id}><td>{r.id}</td></tr>)}');
  L.push('        </tbody>');
  L.push('      </table>');
  L.push('    </div>');
  L.push('  );');
  L.push('}');
  return L.join('\n');
}

const GIANT = buildGiant();
const ANALYSIS = {
  states: [{ name: 'rows', type: 'array', usedIn: '表格区' }],
  effects: [{ name: 'fetch users', deps: [] }],
  uiBlocks: [{ name: 'filters', lineRange: '1-500', purpose: '筛选' }, { name: 'table', lineRange: '1-500', purpose: '表格' }],
  events: [{ name: 'onChange', source: 'input' }],
  crossCoupling: ['大量 filter state'],
};
const PLAN = {
  components: [
    { name: 'FilterPanel', file: 'src/components/FilterPanel.jsx', responsibility: '筛选', props: [{ name: 'filters', type: 'array', source: 'useFilters' }], events: [] },
    { name: 'DataTable', file: 'src/components/DataTable.jsx', responsibility: '表格', props: [{ name: 'rows', type: 'array', source: 'useRows' }], events: [] },
  ],
  hooks: [{ name: 'useFilters', file: 'src/hooks/useFilters.js', responsibility: '筛选状态', state: ['filters'] }],
  migration: ['建 useFilters', '建 FilterPanel', '建 DataTable', '改父组件'],
  risks: [],
};

const stage = process.argv[2] || 'analyze';
const llm = createLLM();
const t0 = Date.now();
try {
  if (stage === 'analyze') {
    const a = await analyzeComponent(llm, GIANT, { path: 'src/Dashboard.jsx' });
    console.log('analyze ok', Date.now() - t0, 'keys:', Object.keys(a).join(','), 'len:', JSON.stringify(a).length);
  } else if (stage === 'plan') {
    const p = await planSplit(llm, GIANT, ANALYSIS, { path: 'src/Dashboard.jsx' });
    console.log('plan ok', Date.now() - t0, 'components:', p.components?.length, 'hooks:', p.hooks?.length, 'migration:', p.migration?.length);
  } else {
    const g = await generateComponents(llm, GIANT, PLAN, { path: 'src/Dashboard.jsx' });
    console.log('generate ok', Date.now() - t0, 'files:', g.files?.length, 'paths:', g.files?.map((f) => f.path).join(','), 'parent:', g.parent?.path);
  }
} catch (e) {
  console.log('FAIL', stage, Date.now() - t0, e.message);
}

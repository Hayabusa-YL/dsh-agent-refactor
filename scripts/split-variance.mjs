/**
 * split 质量分布测量：同一个巨型 fixture 跑 N 次，记录成功率、失败阶段、结构差异、耗时。
 * 默认用本机 ollama（127.0.0.1:11434, qwen2.5:7b），不花钱。
 * 做法：复制 giant-app 环境，把 Dashboard.jsx 替换成脚本生成的 300+ 行巨型组件，
 * 每次跑完整 split 流水线，记录结果。
 * 用法：node scripts/split-variance.mjs [runs=3]
 * 环境变量可覆盖：AGENT_REFACTOR_LLM_BASE_URL / AGENT_REFACTOR_LLM_KEY / AGENT_REFACTOR_LLM_MODEL
 */
import { cp, mkdir, symlink, rm, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { splitComponent } from '../src/split-flow.js';
import { createLLM } from '../src/llm.js';

const RUNS = Number(process.argv[2] || 3);
const FIX = resolve('fixtures/giant-app');
const OUT = resolve('tmp/split-variance', String(process.argv[3] || 'qwen2.5_7b').replace(/[^a-zA-Z0-9._-]/g, '_'));

process.env.AGENT_REFACTOR_LLM_BASE_URL ||= 'http://127.0.0.1:11434/v1';
process.env.AGENT_REFACTOR_LLM_KEY ||= 'ollama';
process.env.AGENT_REFACTOR_LLM_MODEL = process.argv[3] || 'qwen2.5:7b';
process.env.AGENT_REFACTOR_LLM_TIMEOUT_MS ||= '300000';

/** 生成 300+ 行巨型组件，结构真实（state/effect/表格/分页），供 split 分析→拆分。 */
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
  L.push('      <header><h1>Giant Dashboard</h1></header>');
  for (let i = 1; i <= 30; i++) {
    L.push(`      <section className='filter-${i}'>`);
    L.push(`        <input value={filter${i}} onChange={(e) => setFilter${i}(e.target.value)} placeholder='filter ${i}' />`);
    L.push(`        <span>page {page${i}}</span>`);
    L.push('      </section>');
  }
  L.push('      <table>');
  L.push('        <thead><tr><th>id</th><th>name</th><th>status</th></tr></thead>');
  L.push('        <tbody>');
  L.push('          {filtered.map((r) => (');
  L.push('            <tr key={r.id}><td>{r.id}</td><td>{r.name}</td><td>{r.status}</td></tr>');
  L.push('          ))}');
  L.push('        </tbody>');
  L.push('      </table>');
  L.push('    </div>');
  L.push('  );');
  L.push('}');
  return L.join('\n');
}

const GIANT = buildGiant();

await rm(OUT, { recursive: true, force: true });
const results = [];

for (let i = 0; i < RUNS; i++) {
  const dir = resolve(OUT, `run-${i}`);
  await mkdir(dir, { recursive: true });
  await cp(FIX, dir, {
    recursive: true,
    force: true,
    filter: (src) => !src.includes('node_modules') && !src.includes('dist'),
  });
  await symlink(resolve(FIX, 'node_modules'), resolve(dir, 'node_modules'), 'junction');
  await writeFile(join(dir, 'src/Dashboard.jsx'), GIANT, 'utf8');

  const t0 = Date.now();
  let res;
  try {
    const baseLLM = createLLM();
    const llm = {
      ...baseLLM,
      async chat(messages, opts = {}) {
        const out = await baseLLM.chat(messages, opts);
        if ((opts.maxTokens || 0) >= 8000) {
          await writeFile(resolve(OUT, `raw-generate-${i}.json`), out, 'utf8').catch(() => {});
        }
        return out;
      },
    };
    res = await splitComponent({ root: dir, componentRel: 'src/Dashboard.jsx', llm, yes: true });
  } catch (e) {
    res = { ok: false, stage: 'throw', message: e.message };
  }
  const entry = {
    run: i,
    ok: Boolean(res.ok),
    stage: res.stage || (res.ok ? 'done' : 'unknown'),
    ms: Date.now() - t0,
    components: res.plan?.components?.length ?? null,
    hooks: res.plan?.hooks?.length ?? null,
    plannedComponents: res.plan?.components?.map?.((c) => c.name || c.file) ?? null,
    errors: (res.errors || []).slice(0, 3),
    rolledBack: Boolean(res.rolledBack),
    message: res.message || '',
  };
  results.push(entry);
  console.log(JSON.stringify(entry));
}

const okCount = results.filter((r) => r.ok).length;
const summary = {
  runs: RUNS,
  succeeded: okCount,
  failed: RUNS - okCount,
  failureRate: Number(((RUNS - okCount) / RUNS).toFixed(3)),
  stages: [...new Set(results.map((r) => r.stage))],
  avgMs: Math.round(results.reduce((s, r) => s + r.ms, 0) / RUNS),
  results,
};
console.log('SUMMARY ' + JSON.stringify(summary));

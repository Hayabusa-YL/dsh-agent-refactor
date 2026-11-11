/**
 * 组件拆分引擎：分析 → 规划 → 校验。
 * 每个阶段产出结构化 JSON，规划必须过 validatePlan 规则校验才允许生成。
 */
import { parseJsonLoose } from './llm.js';

const PLAN_SYSTEM = `你是一个资深 React 架构师。任务：把一个巨型 React 单文件组件拆成 3-5 个子组件 + custom hooks。
只输出 JSON，不要解释。JSON 结构：
{
  "components": [
    { "name": "PascalCase 组件名", "file": "相对路径.tsx", "responsibility": "一句话职责",
      "props": [{ "name": "camelCase", "type": "string", "source": "父组件哪个 state/hook 提供" }],
      "events": [{ "name": "onXxx", "from": "子组件触发的事件来源" }] }
  ],
  "hooks": [
    { "name": "useXxx", "file": "相对路径.ts", "responsibility": "一句话", "state": ["state 名"] }
  ],
  "migration": ["按顺序的迁移步骤，每步说清改哪个文件"],
  "risks": ["拆分风险提示"]
}
规则：子组件必须自包含（props 齐全、不依赖父组件局部变量）；hook 名以 use 开头；迁移步骤 3-8 条；hook 文件（.ts）只放状态/副作用/计算逻辑，禁止返回或包含任何 JSX——需要渲染的逻辑必须做成组件（.tsx）。`;

const ANALYZE_SYSTEM = `你是一个资深 React 架构师。阅读一个巨型组件的完整源码，输出语义地图 JSON：
{
  "states": [{ "name": "state 名", "type": "类型", "usedIn": "被哪些 UI 区块使用" }],
  "effects": [{ "name": "副作用描述", "deps": ["依赖"] }],
  "uiBlocks": [{ "name": "UI 区块名", "lineRange": "大致行范围", "purpose": "负责什么" }],
  "events": [{ "name": "事件 handler", "source": "触发来源" }],
  "crossCoupling": ["组件内部耦合最严重的点"]
}
只输出 JSON，不要解释。`;

export async function analyzeComponent(llm, code, meta = {}) {
  const content = await llm.chat(
    [
      { role: 'system', content: ANALYZE_SYSTEM },
      { role: 'user', content: `组件路径：${meta.path || 'unknown'}\n\n完整源码：\n${code}` },
    ],
    { json: true, maxTokens: 3000 },
  );
  return parseJsonLoose(content);
}

export async function planSplit(llm, code, analysis, meta = {}) {
  const content = await llm.chat(
    [
      { role: 'system', content: PLAN_SYSTEM },
      {
        role: 'user',
        content: `组件路径：${meta.path || 'unknown'}\n\n语义地图：\n${JSON.stringify(analysis, null, 2)}\n\n完整源码：\n${code}`,
      },
    ],
    { json: true, maxTokens: 4000 },
  );
  return parseJsonLoose(content);
}

/** 规则校验：规划不合格就拒绝生成，不让 AI 的胡话进代码 */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object') return ['计划不是对象'];
  const comps = Array.isArray(plan.components) ? plan.components : [];
  const hooks = Array.isArray(plan.hooks) ? plan.hooks : [];

  if (comps.length < 2 || comps.length > 8) errors.push(`子组件数量应为 2-8，实际 ${comps.length}`);
  if (hooks.length < 1 || hooks.length > 8) errors.push(`custom hooks 数量应为 1-8，实际 ${hooks.length}`);

  const names = new Set();
  for (const c of comps) {
    if (!c.name || !/^[A-Z][A-Za-z0-9]*$/.test(c.name)) errors.push(`组件名不合法：${c.name}`);
    if (names.has(c.name)) errors.push(`组件名重复：${c.name}`);
    names.add(c.name);
    if (!c.file) errors.push(`${c.name} 缺少 file`);
    if (!Array.isArray(c.props)) errors.push(`${c.name} 缺少 props 数组`);
    else if (!c.props.every((p) => p.name && p.type && p.source)) errors.push(`${c.name} 的 props 必须都有 name/type/source`);
  }
  for (const h of hooks) {
    if (!h.name || !/^use[A-Z][A-Za-z0-9]*$/.test(h.name)) errors.push(`hook 名不合法：${h.name}`);
    if (!h.file) errors.push(`${h.name} 缺少 file`);
  }
  if (!Array.isArray(plan.migration) || plan.migration.length < 3 || plan.migration.length > comps.length + hooks.length + 3) {
    errors.push(`migration 步数应在 3-${comps.length + hooks.length + 3}（与拆出单元数匹配）`);
  }
  return errors;
}

const GENERATE_SYSTEM = `你是资深 React 工程师。按拆分计划生成完整代码。只输出 JSON：
{
  "files": [{ "path": "components/RelativePath.tsx", "content": "完整文件内容" }],
  "parent": { "path": "原组件相对路径", "content": "改造后的父组件完整内容" }
}
规则：
- files 必须覆盖计划里所有 components 和 hooks 的 file 字段；
- 每个文件内容完整可编译（含 import/export 与类型）；
- 原项目是 TypeScript 就用 TS 类型，不引入新依赖；
- hooks 的 .ts 文件禁止包含 JSX（<大写组件>），需要 JSX 的逻辑请放进 .tsx 组件文件；
- 父组件改为组合这些子组件和 hooks，保持原 UI 结构与交互行为不变；
- 如果原型是 .jsx 就用 JSX，不要强行加类型。`;

export async function generateComponents(llm, code, plan, meta = {}) {
  const content = await llm.chat(
    [
      { role: 'system', content: GENERATE_SYSTEM },
      {
        role: 'user',
        content: `原组件路径：${meta.path || 'unknown'}\n\n拆分计划：\n${JSON.stringify(plan, null, 2)}\n\n完整源码：\n${code}`,
      },
    ],
    { json: true, maxTokens: 8000 },
  );
  return parseJsonLoose(content);
}

/** 生成结果校验：计划里的每个文件都要被生成，且内容非空 */
export function validateGenerated(generated, plan) {
  const errors = [];
  if (!generated || !Array.isArray(generated.files)) return ['生成结果缺少 files 数组'];
  if (!generated.parent || !generated.parent.content) errors.push('缺少改造后的父组件内容');
  const expected = [...(plan.components || []), ...(plan.hooks || [])].map((x) => x.file).filter(Boolean);
  const produced = generated.files.map((f) => String(f.path || '').replace(/\\/g, '/'));
  for (const e of expected) {
    const want = String(e).replace(/\\/g, '/');
    if (!produced.some((p) => p.endsWith(want) || want.endsWith(p))) {
      errors.push(`计划要求的文件未生成：${e}`);
    }
  }
  if (!generated.files.every((f) => f.path && typeof f.content === 'string' && f.content.trim())) {
    errors.push('存在空文件内容');
  }
  for (const f of generated.files) {
    const filePath = String(f.path || '');
    if (/\.ts$/.test(filePath) && /(<\/[A-Z][A-Za-z0-9]*>|<[A-Z][A-Za-z0-9]*\s[^>]*>)/.test(String(f.content || ''))) {
      errors.push(`${filePath} 是 .ts 文件但包含 JSX，请改为 .tsx 组件或移除 JSX`);
    }
  }
  return errors;
}

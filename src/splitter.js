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

const VUE_ANALYZE_SYSTEM = `你是一个资深 Vue 3 架构师。阅读一个巨型单文件组件（.vue）的完整源码，输出语义地图 JSON：
{
  "states": [{ "name": "state 名", "type": "类型", "usedIn": "被哪些 UI 区块使用" }],
  "effects": [{ "name": "副作用描述", "deps": ["依赖"] }],
  "uiBlocks": [{ "name": "UI 区块名", "lineRange": "大致行范围", "purpose": "负责什么" }],
  "events": [{ "name": "事件 handler", "source": "触发来源" }],
  "crossCoupling": ["组件内部耦合最严重的点"]
}
只输出 JSON，不要解释。`;

const VUE_PLAN_SYSTEM = `你是一个资深 Vue 3 架构师。任务：把一个巨型 .vue 单文件组件拆成 3-5 个子组件 + custom composables。
只输出 JSON，不要解释。JSON 结构：
{
  "components": [
    { "name": "PascalCase 组件名", "file": "相对路径.vue", "responsibility": "一句话职责",
      "props": [{ "name": "camelCase", "type": "string", "source": "父组件哪个 ref/reactive/computed 提供" }],
      "events": [{ "name": "emit 名如 update:count", "from": "子组件触发的事件来源" }] }
  ],
  "hooks": [
    { "name": "useXxx", "file": "相对路径.js 或 .ts", "responsibility": "一句话", "state": ["state 名"] }
  ],
  "migration": ["按顺序的迁移步骤，每步说清改哪个文件"],
  "risks": ["拆分风险提示"]
}
规则：子组件必须自包含（props/emits 齐全、不依赖父组件局部变量）；composable 名以 use 开头、禁止包含模板或 JSX；所有组件文件一律 .vue；迁移步骤 3-8 条。`;

const VUE_GENERATE_SYSTEM = `你是资深 Vue 3 工程师。按拆分计划生成完整代码。只输出 JSON：
{
  "files": [{ "path": "components/RelativePath.vue", "content": "完整文件内容（含 <script setup> 与 <template>，必要时 <style>）" }],
  "parent": { "path": "原组件相对路径.vue", "content": "改造后的父组件完整内容" }
}
规则：
- files 必须覆盖计划里所有 components 和 hooks 的 file 字段；
- 每个 .vue 文件内容完整可编译；composable 用 .js/.ts，禁止包含模板或 JSX；
- 使用 <script setup> + defineProps/defineEmits 传递 props 与事件；
- 不引入新依赖；
- 父组件改为组合子组件和 composables，保持原 UI 与交互行为不变；
- 如果原型是 .vue 且不需要强类型，composable 用 .js。`;

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
      { role: 'system', content: meta.kind === 'vue' ? VUE_ANALYZE_SYSTEM : ANALYZE_SYSTEM },
      { role: 'user', content: `组件路径：${meta.path || 'unknown'}\n\n完整源码：\n${code}` },
    ],
    { json: true, maxTokens: 3000 },
  );
  return parseJsonLoose(content);
}

export async function planSplit(llm, code, analysis, meta = {}) {
  const content = await llm.chat(
    [
      { role: 'system', content: meta.kind === 'vue' ? VUE_PLAN_SYSTEM : PLAN_SYSTEM },
      {
        role: 'user',
        content: `组件路径：${meta.path || 'unknown'}\n\n语义地图：\n${JSON.stringify(analysis, null, 2)}${meta.planErrors?.length ? `\n\n上一次计划未通过校验：\n${meta.planErrors.map((e) => `- ${e}`).join('\n')}\n请修正这些问题后重新输出完整计划 JSON。` : ''}`,
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

const GENERATE_FILE_SYSTEM = `你是资深 React 工程师。按拆分计划生成其中一个文件。只输出 JSON：
{ "path": "该文件的相对路径", "content": "完整文件内容" }
规则：
- 内容完整可编译（含 import/export 与类型），不引入新依赖；
- hooks 的 .ts 文件禁止包含 JSX（<大写组件>），需要 JSX 的逻辑请放进 .tsx 组件文件；
- 如果原型是 .jsx 就用 JSX，不要强行加类型。
只输出 JSON，不要解释。`;

const VUE_GENERATE_FILE_SYSTEM = `你是资深 Vue 3 工程师。按拆分计划生成其中一个文件。只输出 JSON：
{ "path": "该文件的相对路径", "content": "完整文件内容" }
规则：
- 组件文件用 <script setup> + defineProps/defineEmits，内容完整可编译；
- composable 用 .js/.ts，禁止包含模板或 JSX；
- 不引入新依赖。
只输出 JSON，不要解释。`;

const GENERATE_PARENT_SYSTEM = `你是资深 React 工程师。按拆分计划把原组件改造成父组件，组合子组件与 hooks。只输出 JSON：
{ "path": "原组件相对路径", "content": "改造后的父组件完整内容" }
规则：
- 保持原 UI 结构与交互行为不变，不引入新依赖；
- 如果原型是 .jsx 就用 JSX；只输出 JSON，不要解释。`;

const VUE_GENERATE_PARENT_SYSTEM = `你是资深 Vue 3 工程师。按拆分计划把原组件改造成父组件，组合子组件与 composables。只输出 JSON：
{ "path": "原组件相对路径.vue", "content": "改造后的父组件完整内容" }
规则：
- 保持原模板与行为不变，所有组件文件一律 .vue，不引入新依赖；
- 只输出 JSON，不要解释。`;

export async function generateComponents(llm, code, plan, meta = {}) {
  const problems = [
    ...(Array.isArray(meta.safetyIssues) && meta.safetyIssues.length
      ? ['上一次生成的代码被静态安全审查拦截，必须避免以下问题后重新生成全部文件：', ...meta.safetyIssues.map((b) => `- ${b.file}: ${b.message}`)]
      : []),
    ...(Array.isArray(meta.generateErrors) && meta.generateErrors.length
      ? ['上一次生成结果未通过校验，必须修正以下问题后重新生成全部文件：', ...meta.generateErrors.map((e) => `- ${e}`)]
      : []),
  ];
  const feedback = problems.length ? `\n\n${problems.join('\n')}` : '';
  const units = [...(plan.components || []), ...(plan.hooks || [])];
  const files = [];
  for (const unit of units) {
    const content = await llm.chat(
      [
        { role: 'system', content: meta.kind === 'vue' ? VUE_GENERATE_FILE_SYSTEM : GENERATE_FILE_SYSTEM },
        {
          role: 'user',
          content: `原组件路径：${meta.path || 'unknown'}\n\n本次要生成的文件（拆分计划条目）：\n${JSON.stringify(unit, null, 2)}\n\n完整源码：\n${code}${feedback}`,
        },
      ],
      { json: true, maxTokens: 3000 },
    );
    const parsed = parseJsonLoose(content);
    files.push({ path: parsed.path || unit.file, content: parsed.content });
  }
  const parentContent = await llm.chat(
    [
      { role: 'system', content: meta.kind === 'vue' ? VUE_GENERATE_PARENT_SYSTEM : GENERATE_PARENT_SYSTEM },
      {
        role: 'user',
        content: `原组件路径：${meta.path || 'unknown'}\n\n拆分计划：\n${JSON.stringify(plan, null, 2)}\n\n完整源码：\n${code}${feedback}`,
      },
    ],
    { json: true, maxTokens: 3000 },
  );
  const parent = parseJsonLoose(parentContent);
  return { files, parent: { path: parent.path || meta.path, content: parent.content } };
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

/**
 * 生成代码静态安全审查：LLM 产出的新代码在落盘前过一遍红线。
 * 只查本次生成的新文件与改造后的父组件，不查原仓库。
 */

const RED_LINE_RULES = [
  { name: 'eval', re: /\beval\s*\(/, message: '禁止使用 eval' },
  { name: 'new-function', re: /new\s+Function\s*\(/, message: '禁止使用 new Function 动态执行' },
  { name: 'child-process', re: /require\(\s*['"]child_process['"]\s*\)|from\s+['"]child_process['"]|from\s+['"]node:child_process['"]/, message: '禁止引用 child_process' },
  { name: 'document-write', re: /\bdocument\s*\.\s*write\s*\(/, message: '禁止使用 document.write' },
];

const WARN_RULES = [
  { name: 'inline-html', re: /dangerouslySetInnerHTML/, message: '使用了 dangerouslySetInnerHTML，注意 XSS' },
  { name: 'innerHTML', re: /\.innerHTML\s*=/, message: '直接赋值 innerHTML，注意 XSS' },
  { name: 'hardcoded-secret', re: /(?:sk-|ghp_|AKIA)[A-Za-z0-9_]{10,}/, message: '疑似硬编码密钥' },
];

/** 审查生成结果。红线命中即失败（会回喂重生成一次），警告只记录。 */
export function scanGeneratedSafety(generated) {
  const blockers = [];
  const warnings = [];
  if (!generated || typeof generated !== 'object') {
    return { ok: false, blockers: [{ file: '(unknown)', rule: 'invalid', message: '生成结果不是对象' }], warnings };
  }
  const files = [
    ...(Array.isArray(generated.files) ? generated.files : []),
    generated.parent || null,
  ];
  const seen = new Set();
  for (const f of files) {
    if (!f || typeof f.content !== 'string') continue;
    if (f.path && seen.has(f.path)) continue;
    if (f.path) seen.add(f.path);
    const path = f.path || '(unknown)';
    for (const rule of RED_LINE_RULES) {
      if (rule.re.test(f.content)) blockers.push({ file: path, rule: rule.name, message: rule.message });
    }
    for (const rule of WARN_RULES) {
      if (rule.re.test(f.content)) warnings.push({ file: path, rule: rule.name, message: rule.message });
    }
  }
  return { ok: blockers.length === 0, blockers, warnings };
}

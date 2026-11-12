import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'tests', 'vendor', 'public',
]);

// 框架生成的目录：内容由框架按约定加载，不能当成死代码来源
const GENERATED_DIR_RE = /(^|[\\/])\.(umi|umi-production|umi-test|next|nuxt|svelte-kit|output)([\\/]|$)/i;

const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.mts', '.cts', '.jsx', '.ts', '.tsx', '.vue', '.astro', '.svelte']);

// 模块解析候选：TS 先于 JS，最后补 .d.ts（`import type ... from '../data'`）
const RESOLVE_EXTS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.vue', '.astro', '.svelte',
  '.d.ts', '.d.mts', '.d.cts',
];
const INDEX_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.astro', '.svelte', '.d.ts'];

const CONFIG_FILE_RE = /(^|[\\/])((vite|webpack|next|umi|rollup|rspack|vue|svelte|astro|nuxt|vitest|jest|playwright|babel|tailwind|postcss|commitlint|biome|eslint|storybook|tsdown|tsup|unbuild|rslib|unocss)\.config\.[cm]?[jt]s|\.umirc\.[cm]?[jt]s|config[\\/]config\.[cm]?[jt]s)$/i;
const RC_CONFIG_RE = /(^|[\\/])\.[\w-]+rc\.[cm]?[jt]s$/i;

const ENTRY_NAMES = ['index', 'main', 'app', 'App', 'server', 'entry'];

// 框架单体入口文件（非 .config 命名）：Gatsby 的 gatsby-config 等
const CONFIG_FILE_EXTRA_RE = /(^|[\\/])(gatsby-(config|node|browser|ssr)\.[cm]?[jt]s|\.storybook[\\/][^\\/]+\.(?:[cm]?[jt]s))$/i;

const TOOLCHAIN = new Set([
  'eslint', 'prettier', 'typescript', 'vite', 'vitest', 'jest', 'webpack', 'rollup',
  'esbuild', 'postcss', 'autoprefixer', 'tailwindcss', 'sass', 'less',
  'ts-node', 'lint-staged', 'husky', 'nodemon', 'cross-env', 'concurrently',
  'webpack-cli', 'rollup-plugin', '@vue/compiler-sfc', 'vue-tsc',
  'rimraf', 'patch-package', 'publint', 'automd',
  '@typescript/native-preview', 'bun-types', 'conventional-changelog-angular',
]);

// 脚本里常见的 CLI 别名 → 真正提供它的包（脚本里叫 nr，包叫 @antfu/ni）
const SCRIPT_BIN_PKGS = {
  nr: '@antfu/ni',
  ni: '@antfu/ni',
  nlx: '@antfu/ni',
  nun: '@antfu/ni',
  'run-p': 'npm-run-all2',
  'run-s': 'npm-run-all2',
  'npm-run-all': 'npm-run-all2',
  tsgo: '@typescript/native-preview',
  'nuxt-module-build': '@nuxt/module-builder',
};

const BUILTINS = new Set([
  'fs', 'path', 'url', 'util', 'events', 'stream', 'http', 'https', 'os', 'crypto',
  'child_process', 'buffer', 'process', 'node:fs', 'node:path', 'node:url',
  'node:util', 'node:events', 'node:stream', 'node:http', 'node:https', 'node:os',
  'node:crypto', 'node:child_process', 'node:buffer', 'node:process', 'assert',
  'zlib', 'net', 'dns', 'readline', 'worker_threads', 'perf_hooks', 'vm', 'timers',
]);

function extractScripts(code, file) {
  let src = code;
  if (file.endsWith('.vue')) {
    const m = code.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    src = m ? m[1] : '';
  } else if (file.endsWith('.svelte')) {
    src = [...code.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  } else if (file.endsWith('.astro')) {
    // Astro 的 import 全在文件头部的 `---` frontmatter 里
    const m = code.match(/^---\s*([\s\S]*?)\s*---/);
    src = m ? m[1] : '';
  }
  return src;
}

function extractSpecifiers(code, file) {
  const src = extractScripts(code, file);
  const specs = new Set();
  const patterns = [
    /(?:import|export)\s+(?:[^;'"]*?from\s+)?['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@import\s+['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      if (m[1]) specs.add(m[1]);
    }
  }
  return [...specs];
}

function stripQuery(spec) {
  return spec.split('?')[0].split('#')[0];
}

function toPackageName(spec) {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    return parts.length >= 2 ? parts[0] + '/' + parts[1] : spec;
  }
  return spec.split('/')[0];
}

function looksLikePath(token) {
  const t = token.trim();
  if (!t || t.length > 300) return false;
  if (/[\s`$]/.test(t)) return false;
  if (/^(https?|data|node|npm|pnpm|yarn|git):/i.test(t)) return false;
  if (/^[a-z]+:\/\//i.test(t)) return false;
  if (t.startsWith('#')) return false;
  return t.startsWith('.') || t.startsWith('/') || t.includes('/') || /\.(?:[cm]?[jt]sx?|vue|json)$/i.test(t);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(pattern) {
  let out = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i += 2;
        if (pattern[i] === '/') i += 1;
        out += '(?:.*/)?';
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (c === '{') {
      const end = pattern.indexOf('}', i);
      if (end === -1) {
        out += '\\{';
        i += 1;
      } else {
        const alts = pattern.slice(i + 1, end).split(',').map(escapeRe).join('|');
        out += `(?:${alts})`;
        i = end + 1;
      }
    } else {
      out += escapeRe(c);
      i += 1;
    }
  }
  return new RegExp(out + '$');
}

function stripJsonComments(raw) {
  let out = '';
  let inStr = false;
  let quote = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const n = raw[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i += 1;
      } else if (c === quote) {
        inStr = false;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
      out += c;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
      i += 1;
      out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

function parseJsonLoose(raw) {
  const s = stripJsonComments(String(raw).replace(/^\uFEFF/, ''))
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

async function existsFile(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function walk(dir, state) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      await walk(p, state);
      continue;
    }
    const ext = extname(e.name).toLowerCase();
    if (CODE_EXTS.has(ext)) state.files.push(p);
    else if (e.name === 'package.json') state.packages.push(p);
    else if (/\.(md|txt|json|toml|ya?ml)$/i.test(e.name)) state.textFiles.push(p);
  }
}

async function loadJson(p) {
  try {
    const raw = await readFile(p, 'utf8');
    return parseJsonLoose(raw);
  } catch {
    return null;
  }
}

function collectExportStrings(value, out) {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectExportStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectExportStrings(v, out);
  }
}

function isConfigFile(file, root) {
  const rel = relative(root, file).replace(/\\/g, '/');
  return CONFIG_FILE_RE.test(file) || CONFIG_FILE_EXTRA_RE.test(file) || RC_CONFIG_RE.test(file) || rel === 'config/config.ts' || rel === 'config/config.js';
}

function isTestFile(file, root) {
  const rel = relative(root, file).replace(/\\/g, '/');
  return /\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/.test(rel)
    || /\.(test|spec)-d\.[cm]?ts$/.test(rel)
    || /(^|\/)(test|tests|__tests__|e2e|test-dts|type-tests|tests-dts)\//.test(rel);
}

function candidatePaths(base) {
  const out = [base];
  for (const ext of RESOLVE_EXTS) out.push(base + ext);
  for (const ext of INDEX_EXTS) out.push(join(base, 'index' + ext));
  return out;
}

export async function scanProject(rootDir) {
  const root = resolve(rootDir);
  const state = { files: [], packages: [join(root, 'package.json')], textFiles: [] };
  await walk(root, state);
  state.files.sort();
  const files = state.files;
  const fileSet = new Set(files);
  const rootPkg = await loadJson(join(root, 'package.json'));

  // ---------- 配置：tsconfig paths / include，package.json 都属于配置层 ----------
  const tsconfigs = [];
  const textFiles = state.textFiles.slice();
  for (const p of textFiles) {
    const base = p.split(/[\\/]/).pop().toLowerCase();
    if (base === 'tsconfig.json' || base === 'jsconfig.json') tsconfigs.push(p);
  }
  const aliases = [];
  const configReferenced = new Set(); // 配置/脚本/tsconfig extends 里点名用到的包（非 import）
  const typeRoots = new Set();
  for (const tsPath of tsconfigs) {
    const rel = relative(root, tsPath).replace(/\\/g, '/');
    if (GENERATED_DIR_RE.test(rel) || rel.startsWith('node_modules/')) continue;
    const json = await loadJson(tsPath);
    if (!json) continue;
    const baseDir = dirname(tsPath);
    for (const e of [].concat(json.extends || [])) {
      if (typeof e === 'string' && !e.startsWith('.')) configReferenced.add(toPackageName(e));
    }
    // tsconfig types 数组点名的类型包（@cloudflare/workers-types 等）
    for (const t of [].concat(json.compilerOptions?.types || [])) {
      if (typeof t === 'string' && t) configReferenced.add(toPackageName(t));
    }
    const paths = json.compilerOptions?.paths;
    if (paths && typeof paths === 'object') {
      for (const [pattern, targets] of Object.entries(paths)) {
        const list = (Array.isArray(targets) ? targets : [targets]).filter((t) => typeof t === 'string');
        if (list.length) aliases.push({ pattern, targets: list, baseDir });
      }
    }
    const includes = []
      .concat(json.include || [])
      .concat(json.files || []);
    for (const inc of includes) {
      if (typeof inc !== 'string' || !/[*?{[]/.test(inc)) continue;
      // include 只把 .d.ts 当类型根；普通 .ts 只是编译范围，不能证明被使用
      const matches = expandGlob(inc, [baseDir], fileSet);
      for (const m of matches) {
        if (/\.d\.[cm]?ts$/i.test(m)) typeRoots.add(m);
      }
    }
  }
  aliases.sort((a, b) => staticPrefixLength(b.pattern) - staticPrefixLength(a.pattern));

  function staticPrefixLength(pattern) {
    const i = pattern.indexOf('*');
    return i === -1 ? pattern.length : i;
  }

  function withinRoot(p) {
    const rel = relative(root, p);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  }

  function firstExisting(bases) {
    for (const base of bases) {
      for (const cand of candidatePaths(base)) {
        if (fileSet.has(cand)) return cand;
      }
    }
    return null;
  }

  function resolveAliasBases(spec) {
    const out = [];
    for (const a of aliases) {
      const star = a.pattern.indexOf('*');
      if (star === -1) continue;
      const prefix = a.pattern.slice(0, star);
      const suffix = a.pattern.slice(star + 1);
      if (!spec.startsWith(prefix)) continue;
      if (suffix && !spec.endsWith(suffix)) continue;
      if (spec.length < prefix.length + suffix.length) continue;
      const wildcard = spec.slice(prefix.length, spec.length - suffix.length);
      for (const t of a.targets) {
        out.push(resolve(a.baseDir, t.replace('*', wildcard)));
      }
    }
    return out;
  }

  function resolveSpec(fromFile, spec) {
    const cleaned = stripQuery(spec).trim();
    if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('node:') || BUILTINS.has(cleaned)) return null;
    const bases = [];
    if (cleaned.startsWith('.')) {
      bases.push(resolve(dirname(fromFile), cleaned));
    } else if (isAbsolute(cleaned)) {
      const abs = resolve(cleaned);
      if (withinRoot(abs)) bases.push(abs);
    } else {
      bases.push(...resolveAliasBases(cleaned));
    }
    return firstExisting(bases);
  }

  function expandGlob(pattern, baseDirs, set = fileSet) {
    const pat = pattern.replace(/\\/g, '/');
    const out = new Set();
    const hasGlob = /[*?{[]/.test(pat);
    for (const baseDir of baseDirs) {
      const absPattern = isAbsolute(pat) ? resolve(pat) : resolve(baseDir, pat);
      if (!withinRoot(absPattern) && absPattern !== root) continue;
      const relPattern = relative(root, absPattern).replace(/\\/g, '/');
      if (!hasGlob) {
        if (set.has(absPattern)) out.add(absPattern);
        continue;
      }
      let re;
      try {
        re = globToRegExp(relPattern);
      } catch {
        continue;
      }
      for (const f of set) {
        const rel = relative(root, f).replace(/\\/g, '/');
        if (re.test(rel)) out.add(f);
      }
    }
    return [...out];
  }

  // ---------- 入口识别（收窄） ----------
  const entries = new Set();
  const packageRoots = [];
  const seenPkg = new Set();
  // 根目录始终算一个项目根（可能没有 package.json，如微信小程序）
  packageRoots.push({ dir: root, json: rootPkg });
  seenPkg.add(root);
  for (const p of state.packages) {
    if (p === join(root, 'package.json')) continue;
    const dir = dirname(p);
    if (seenPkg.has(dir) || GENERATED_DIR_RE.test(dir) || dir.split(/[\\/]/).includes('node_modules')) continue;
    seenPkg.add(dir);
    packageRoots.push({ dir, json: await loadJson(p) });
  }

  function addEntry(abs) {
    if (fileSet.has(abs)) entries.add(abs);
  }

  // 弱证据（字符串/约定引用）：在弱引用表上登记，用于降级置信度
  const weakRefs = new Map(); // target -> [{ from, kind }]
  function addWeak(target, from, kind) {
    if (!target || target === from) return;
    if (!weakRefs.has(target)) weakRefs.set(target, []);
    const list = weakRefs.get(target);
    if (!list.some((r) => r.from === from && r.kind === kind)) list.push({ from, kind });
  }

  function addEntryFrom(baseDir, value) {
    if (typeof value !== 'string') return;
    if (value.includes('*')) return;
    const cleaned = value.replace(/^\.\//, '');
    if (!isAbsolute(cleaned) && (cleaned.startsWith('node:') || cleaned.startsWith('http'))) return;
    const abs = isAbsolute(cleaned) ? resolve(cleaned) : resolve(baseDir, cleaned);
    if (withinRoot(abs) && fileSet.has(abs)) {
      addEntry(abs);
      return;
    }
    // 构建产物入口回推源码（unbuild/tsup 常见：dist/x.mjs ← src/x.ts）
    const m = cleaned.match(/^(?:dist|lib|build|out)\/(.+?)\.(?:[cm]?js|d\.ts)$/i);
    if (m) {
      const stem = m[1];
      for (const ext of CODE_EXTS) addEntry(resolve(baseDir, 'src', stem + ext));
      for (const ext of CODE_EXTS) addEntry(resolve(baseDir, 'src', stem, 'index' + ext));
    } else if (withinRoot(abs)) {
      addEntry(abs);
    }
  }

  function addEntryNames(baseDir) {
    for (const name of ENTRY_NAMES) {
      for (const ext of CODE_EXTS) addEntry(join(baseDir, name + ext));
    }
  }

  function scriptEntry(script) {
    if (typeof script !== 'string') return [];
    const out = [];
    for (const m of script.matchAll(/(?:^|[\s'"=])((?:\.{0,2}\/)?[\w@./-]+\.(?:[cm]?[jt]sx?|vue))/g)) {
      out.push(m[1]);
    }
    return out;
  }

  for (const pr of packageRoots) {
    const j = pr.json;
    if (j) {
      const fields = [j.main, j.module, j.browser, j.types, j.typings];
      if (typeof j.bin === 'object' && j.bin) Object.values(j.bin).forEach((b) => fields.push(b));
      else if (typeof j.bin === 'string') fields.push(j.bin);
      if (j.exports) collectExportStrings(j.exports, fields);
      for (const f of fields.filter(Boolean)) addEntryFrom(pr.dir, f);
      for (const script of Object.values(j.scripts || {})) {
        for (const token of scriptEntry(script)) addEntryFrom(pr.dir, token);
      }
      // git 钩子（simple-git-hooks）调用的脚本也是入口
      for (const hook of Object.values(j['simple-git-hooks'] || {})) {
        for (const token of scriptEntry(String(hook))) addEntryFrom(pr.dir, token);
      }
    }
    addEntryNames(pr.dir);
    const srcDir = join(pr.dir, 'src');
    addEntryNames(srcDir);
  }

  for (const f of files) {
    if (isConfigFile(f, root)) entries.add(f);
    if (isTestFile(f, root)) entries.add(f);
  }

  // 小程序 app.json 的 pages / subPackages 是框架入口（无 import 也会被加载）
  const appJsonPath = join(root, 'app.json');
  if (await existsFile(appJsonPath)) {
    const appJson = await loadJson(appJsonPath);
    const pages = []
      .concat(Array.isArray(appJson?.pages) ? appJson.pages : [])
      .concat(
        (Array.isArray(appJson?.subPackages) ? appJson.subPackages : appJson?.subpackages || [])
          .flatMap((p) => (Array.isArray(p?.pages) ? p.pages.map((x) => join(p.root || '', x)) : [])),
      );
    for (const p of pages) {
      if (typeof p !== 'string') continue;
      for (const ext of CODE_EXTS) addEntry(join(root, p + ext));
    }
  }

  // ---------- 框架约定入口（按依赖/配置识别，避免误伤普通目录） ----------
  const depNames = [];
  for (const pr of packageRoots) {
    const j = pr.json;
    if (!j) continue;
    for (const k of Object.keys({
      ...(j.dependencies || {}),
      ...(j.devDependencies || {}),
      ...(j.peerDependencies || {}),
    })) {
      if (!depNames.includes(k)) depNames.push(k);
    }
  }
  const hasDep = (name) => depNames.includes(name);
  const hasDepPrefix = (prefix) => depNames.some((d) => d.startsWith(prefix));
  const relOf = (f) => relative(root, f).replace(/\\/g, '/');
  const hasRootConfig = (re) => files.some((f) => re.test(relOf(f)));
  const addEntriesUnder = (dirRel, re) => {
    for (const pr of packageRoots) {
      const relDir = relOf(join(pr.dir, dirRel));
      for (const f of files) {
        const rel = relOf(f);
        if ((rel === relDir || rel.startsWith(relDir + '/')) && re.test(rel)) addEntry(f);
      }
    }
  };

  // 配置里点名的依赖与自动导入目录（unplugin-auto-import / vue-components / tsconfig extends）
  const autoImportDirs = [];
  const cfgFiles = files.filter((f) => isConfigFile(f, root));
  for (const cf of cfgFiles) {
    let code = '';
    try {
      code = await readFile(cf, 'utf8');
    } catch {
      continue;
    }
    for (const key of ['dirs', 'components', 'imports', 'resolvers', 'external']) {
      const re = new RegExp(key + '\\s*:\\s*\\[([\\s\\S]{0,800}?)\\]', 'g');
      for (const m of code.matchAll(re)) {
        if (key === 'dirs' || key === 'components') {
          autoImportDirs.push({ base: dirname(cf), text: m[1] });
          continue;
        }
        for (const q of m[1].matchAll(/['"`]([^'"`\n]+)['"`]/g)) {
          const tok = q[1].trim();
          if (!tok || tok.includes('${')) continue;
          configReferenced.add(toPackageName(tok));
        }
      }
    }
    // 配置文件里出现的字符串字面量也算“点名”（jsdom 环境、CLI 名称、preset 名等）
    for (const q of code.matchAll(/['"`]([^'"`\n]{1,120})['"`]/g)) {
      const tok = q[1].trim();
      if (!tok || tok.startsWith('.') || tok.includes('${') || /[\s\\]/.test(tok)) continue;
      configReferenced.add(toPackageName(tok));
    }
    // vitest coverage: { provider: 'v8' } → @vitest/coverage-v8；没写 provider 默认 v8
    if (/coverage\s*:/.test(code)) {
      const pm = code.match(/provider\s*:\s*['"]([^'"]+)['"]/);
      configReferenced.add('@vitest/coverage-' + (pm ? pm[1] : 'v8'));
    }
  }
  for (const { base, text } of autoImportDirs) {
    for (const q of text.matchAll(/['"`]([^'"`\n]+)['"`]/g)) {
      const tok = q[1].trim();
      if (!tok || tok.startsWith('.') || tok.includes('*') || tok.includes('${')) continue;
      const relDir = relOf(resolve(base, tok));
      for (const f of files) {
        const r = relOf(f);
        if (r === relDir || r.startsWith(relDir + '/')) addWeak(f, null, 'convention');
      }
    }
  }
  const frameworks = [];

  // Next.js：pages/ 路由、app/ 特殊文件、middleware/instrumentation
  if (hasDep('next') || hasRootConfig(/^next\.config\.[cm]?[jt]s$/)) {
    frameworks.push('next');
    addEntriesUnder('pages', /\.[cm]?[jt]sx?$/);
    addEntriesUnder('src/pages', /\.[cm]?[jt]sx?$/);
    for (const dir of ['app', 'src/app']) {
      addEntriesUnder(dir, /(^|\/)(page|layout|loading|error|global-error|template|not-found|route)\.[cm]?[jt]sx?$/);
    }
    for (const f of files) {
      if (/(^|\/)(src\/)?(middleware|instrumentation)\.[cm]?[jt]s$/.test(relOf(f))) addEntry(f);
    }
  }

  // Nuxt：pages/layouts/middleware/plugins/server 路由 + 自动导入目录
  if (hasDep('nuxt')) {
    frameworks.push('nuxt');
    for (const dir of ['pages', 'layouts', 'middleware', 'plugins', 'server/api', 'server/routes', 'server/middleware', 'server/plugins']) {
      addEntriesUnder(dir, /\.(vue|[cm]?[jt]sx?)$/);
    }
    for (const f of files) {
      const rel = relOf(f);
      if (/^(app|error)\.vue$/.test(rel) || /^nuxt\.config\.[cm]?[jt]s$/.test(rel)) addEntry(f);
      // Nuxt 模块的 runtime 目录由 addPlugin(resolve(runtimeDir, ...)) 按约定加载
      if (/(^|\/)runtime\//.test(rel) && /\.(vue|[cm]?[jt]sx?)$/.test(rel)) addWeak(f, null, 'convention');
      if (/(^|\/)(components|composables|utils)\//.test(rel) && /\.(vue|[cm]?[jt]sx?)$/.test(rel)) {
        addWeak(f, null, 'convention');
      }
    }
  }

  // Remix：app/routes 路由 + root/entry 文件
  if (hasDepPrefix('@remix-run/')) {
    frameworks.push('remix');
    addEntriesUnder('app/routes', /\.[cm]?[jt]sx?$/);
    for (const f of files) {
      if (/(^|\/)app\/(root|entry\.client|entry\.server)\.[cm]?[jt]sx?$/.test(relOf(f))) addEntry(f);
    }
  }

  // SvelteKit：src/routes + hooks
  if (hasDep('@sveltejs/kit')) {
    frameworks.push('sveltekit');
    addEntriesUnder('src/routes', /\.(svelte|[cm]?[jt]sx?)$/);
    for (const f of files) {
      if (/(^|\/)src\/hooks\.(client|server)\.[cm]?[jt]s$/.test(relOf(f))) addEntry(f);
    }
  }

  // Astro：src/pages + middleware + content 配置
  if (hasDep('astro')) {
    frameworks.push('astro');
    addEntriesUnder('src/pages', /\.(astro|[cm]?[jt]sx?)$/);
    for (const f of files) {
      if (/(^|\/)src\/(middleware\.[cm]?[jt]s|content\/config\.[cm]?[jt]s)$/.test(relOf(f))) addEntry(f);
    }
  }

  // Gatsby：src/pages + gatsby-* 入口
  if (hasDep('gatsby')) {
    frameworks.push('gatsby');
    addEntriesUnder('src/pages', /\.([cm]?[jt]sx?)$/);
    for (const f of files) {
      if (/^(gatsby-(config|node|browser|ssr))\.[cm]?[jt]s$/.test(relOf(f))) addEntry(f);
    }
  }

  // Expo Router：app 目录按路由加载
  if (hasDep('expo')) {
    frameworks.push('expo');
    addEntriesUnder('app', /\.[cm]?[jt]sx?$/);
  }

  // Storybook：stories 是扫描入口，本身没人 import
  if (hasDep('storybook') || hasDepPrefix('@storybook/') || hasRootConfig(/^\.storybook\//)) {
    frameworks.push('storybook');
    for (const f of files) {
      if (/\.stories?\.[cm]?[jt]sx?$/.test(relOf(f))) addEntry(f);
    }
  }

  // VitePress：.vitepress 是文档站配置与主题入口，页面本身按约定加载
  if (hasDep('vitepress')) {
    frameworks.push('vitepress');
    addEntriesUnder('.vitepress', /\.(js|ts|mjs|vue)$/);
  }

  // examples/playground/demo 是给人直接跑的样例（不是死代码）；templates 是复制出去的资源
  for (const f of files) {
    const rel = relOf(f);
    if (/(^|\/)(examples?|playgrounds?|demos?|benchmarks?)\//.test(rel)) addEntry(f);
    else if (/(^|\/)(templates?)\//.test(rel)) addWeak(f, null, 'convention');
  }

  // HTML 入口（Vite/CRA 风格）：index.html 的 module script / modulepreload 是真实入口
  for (const pr of packageRoots) {
    for (const htmlRel of ['index.html', 'src/index.html']) {
      const htmlPath = resolve(pr.dir, htmlRel);
      let html = '';
      try {
        if ((await stat(htmlPath)).isFile()) html = await readFile(htmlPath, 'utf8');
      } catch {
        continue;
      }
      const fromHtml = (srcAttr) => {
        const cleaned = stripQuery(srcAttr.trim());
        if (!cleaned) return;
        const abs = cleaned.startsWith('/') ? resolve(pr.dir, cleaned.slice(1)) : resolve(dirname(htmlPath), cleaned);
        addEntry(abs);
      };
      for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) fromHtml(m[1]);
      for (const m of html.matchAll(/<link[^>]+rel=["']modulepreload["'][^>]*href=["']([^"']+)["']/gi)) fromHtml(m[1]);
    }
  }


  const generated = files.filter((f) => GENERATED_DIR_RE.test(relative(root, f)));
  const seedReachable = new Set([...entries, ...generated, ...typeRoots]);

  // ---------- 引用图 ----------
  const edges = new Map();
  const fileRead = new Map();
  const specsAt = new Map();

  for (const f of files) {
    let code = '';
    try {
      code = await readFile(f, 'utf8');
    } catch {
      code = '';
    }
    fileRead.set(f, code);
    const specs = extractSpecifiers(code, f);
    specsAt.set(f, specs);
    const deps = new Set();
    for (const spec of specs) {
      const hit = resolveSpec(f, spec);
      if (hit) deps.add(hit);
    }
    edges.set(f, [...deps]);
  }

  // 配置字符串路径 → 强边（vite/webpack/next/umi/tsconfig 等）
  const configFiles = files.filter((f) => isConfigFile(f, root));
  for (const cf of configFiles) {
    const code = fileRead.get(cf) || '';
    for (const m of code.matchAll(/['"`]([^'"`\n]{1,300})['"`]/g)) {
      const token = m[1].trim();
      // 模板字符串路径（`./src/${name}.js`）按通配展开，不能因为含 ${} 就放弃
      if (token.includes('${')) {
        const globToken = token.replace(/\$\{[^}]*\}/g, '*');
        if (/[*?{[]/.test(globToken)) {
          for (const hit of expandGlob(globToken, [dirname(cf), root])) edges.get(cf).push(hit);
        }
        continue;
      }
      if (!looksLikePath(token)) continue;
      if (/[*?{[]/.test(token)) {
        // exclude/coverage/ignore 里的 glob 是排除范围，不是使用证据
        const around = code.slice(Math.max(0, (m.index || 0) - 320), m.index || 0);
        if (/(coverage|exclude|ignore|deny|never)/i.test(around)) continue;
        for (const hit of expandGlob(token, [dirname(cf), root])) edges.get(cf).push(hit);
        continue;
      }
      const bases = [];
      if (token.startsWith('@') || token.startsWith('~')) bases.push(...resolveAliasBases(token));
      else if (isAbsolute(token)) bases.push(resolve(token));
      else bases.push(resolve(dirname(cf), token), resolve(root, token));
      const hit = firstExisting(bases);
      if (hit) edges.get(cf).push(hit);
    }
    edges.set(cf, [...new Set(edges.get(cf))]);
  }

  // 路由表 / 组件字符串引用：中等置信（不判死，只提示）
  for (const f of files) {
    const code = fileRead.get(f) || '';
    for (const m of code.matchAll(/(?:component|wrappers?)\s*:\s*\[?\s*['"]([^'"]+)['"]/g)) {
      const token = m[1].trim();
      if (!token || token.includes('*')) continue;
      const bases = [];
      if (token.startsWith('@') || token.startsWith('~')) bases.push(...resolveAliasBases(token));
      else {
        const clean = token.replace(/^\.\//, '');
        bases.push(resolve(root, 'src', 'pages', clean), resolve(dirname(f), token), resolve(root, clean));
      }
      const hit = firstExisting(bases);
      if (hit) addWeak(hit, f, 'route');
    }
  }

  // 框架约定文件（Umi：global/loading/mock 目录）
  const deps = { ...(rootPkg?.dependencies || {}), ...(rootPkg?.devDependencies || {}) };
  const hasUmi = Object.keys(deps).some((d) => d === 'umi' || d.startsWith('@umijs/'))
    || files.some((f) => relative(root, f).replace(/\\/g, '/') === 'config/config.ts')
    || files.some((f) => /(^|[\\/])\.umirc\.[cm]?[jt]s$/.test(f));
  if (hasUmi) {
    for (const f of files) {
      const rel = relative(root, f).replace(/\\/g, '/');
      if (/^src\/(global|loading)\.[cm]?[jt]sx?$/.test(rel) || /^src\/global\.style\.[cm]?[jt]sx?$/.test(rel)) {
        addWeak(f, null, 'convention');
      } else if (/^mock\/.+\.(?:[cm]?[jt]sx?)$/.test(rel)) {
        addWeak(f, null, 'convention');
      } else if (/^src\/pages\/.+\/_mock\.[cm]?[jt]sx?$/.test(rel)) {
        addWeak(f, null, 'convention');
      }
    }
  }

  // 根目录一次性验证脚本（smoke/probe/bench…）是手跑工具，不当死代码
  for (const f of files) {
    const rel = relative(root, f).replace(/\\/g, '/');
    if (rel.includes('/')) continue;
    if (/(^|[-_.])(smoke|probe|verify|bench|check)([-_.]|$)/i.test(rel)) addWeak(f, null, 'convention');
  }

  // 文本/注释里的路径提及（README 命令、源码注释）→ 弱证据
  const docFiles = [];
  for (const tf of textFiles) {
    const base = tf.split(/[\\/]/).pop().toLowerCase();
    if (base === 'package-lock.json' || base === 'yarn.lock' || base === 'pnpm-lock.yaml') continue;
    let info;
    try {
      info = await stat(tf);
    } catch {
      continue;
    }
    if (info.size > 300 * 1024) continue;
    docFiles.push(tf);
  }
  const evidenceContents = [...fileRead.entries()].filter(([f]) => !GENERATED_DIR_RE.test(relative(root, f)));
  for (const tf of docFiles) {
    if (fileRead.has(tf)) continue;
    try {
      const code = await readFile(tf, 'utf8');
      evidenceContents.push([tf, code]);
    } catch {
      /* ignore */
    }
  }
  const weakPathRe = /(?:^|[\s'"`(（：:,;=])((?:\.{1,2}\/)?[A-Za-z0-9_@$.-]+(?:\/[A-Za-z0-9_@$.-]+)+\.(?:[cm]?[jt]sx?|vue|json))/g;
  for (const [from, code] of evidenceContents) {
    for (const m of code.matchAll(weakPathRe)) {
      const token = m[1].replace(/[,;:]+$/, '');
      if (!token || token.includes('${')) continue;
      const bases = [];
      if (token.startsWith('@') || token.startsWith('~')) bases.push(...resolveAliasBases(token));
      else if (isAbsolute(token)) bases.push(resolve(token));
      else bases.push(resolve(dirname(from), token), resolve(root, token));
      let hit = firstExisting(bases);
      if (!hit && !token.includes('/')) continue;
      if (hit) addWeak(hit, from, 'string');
    }
  }

  // URL/module 字符串里的路径（playground 用 `${location.origin}/src/x` 加载模块）
  const urlPathRe = /['"`](?:\$\{[^}]*\})?\.?\/?((?:src|app)\/[A-Za-z0-9_@$.-]+)['"`]/g;
  for (const [from, code] of evidenceContents) {
    for (const m of code.matchAll(urlPathRe)) {
      const token = m[1].replace(/[,;:]+$/, '');
      if (!token || token.includes('${') || token.length > 120) continue;
      const bases = [resolve(dirname(from), token)];
      for (const pr of packageRoots) bases.push(resolve(pr.dir, token));
      let hit = null;
      for (const b of bases) {
        hit = firstExisting([b]);
        if (hit) break;
      }
      if (hit && hit !== from) addWeak(hit, from, 'string');
    }
  }

  // ---------- 可达性 ----------
  const reachable = new Set();
  const queue = [...seedReachable].filter((e) => fileSet.has(e));
  while (queue.length) {
    const cur = queue.shift();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const d of edges.get(cur) || []) {
      if (fileSet.has(d)) queue.push(d);
    }
  }

  const incoming = new Map(files.map((f) => [f, 0]));
  const inboundBy = new Map(files.map((f) => [f, new Set()]));
  for (const [from, depsList] of edges) {
    for (const d of depsList) {
      if (incoming.has(d)) incoming.set(d, incoming.get(d) + 1);
      if (inboundBy.has(d)) inboundBy.get(d).add(from);
    }
  }


  function isDocFile(p) {
    return /\.(md|txt)$/i.test(p);
  }

  function classifyConfidence(f) {
    const refs = weakRefs.get(f) || [];
    let hasMedium = false;
    const mediumSources = [];
    const lowSources = [];
    for (const r of refs) {
      if (r.kind === 'route' || r.kind === 'convention') {
        hasMedium = true;
        mediumSources.push(r.kind === 'route' ? '路由/组件字符串' : '框架约定加载');
        continue;
      }
      if (!r.from) {
        hasMedium = true;
        mediumSources.push('框架约定加载');
        continue;
      }
      const fromReachable = reachable.has(r.from) || entries.has(r.from);
      if (fromReachable || isDocFile(r.from) || isConfigFile(r.from, root)) {
        hasMedium = true;
        mediumSources.push(`${relative(root, r.from)} 中的路径字符串`);
      } else {
        lowSources.push(`${relative(root, r.from)} 中的路径提及`);
      }
    }
    const deadInbound = [...(inboundBy.get(f) || [])].filter((r) => !reachable.has(r));
    if (deadInbound.length) lowSources.push(...deadInbound.map((r) => `${relative(root, r)} 引用了它（但该文件也不可达）`));
    if (hasMedium) return { confidence: 'medium', notes: [...new Set(mediumSources)].slice(0, 4) };
    if (lowSources.length) return { confidence: 'low', notes: [...new Set(lowSources)].slice(0, 4) };
    return { confidence: 'high', notes: [] };
  }

  const deadFiles = [];
  for (const f of files) {
    if (entries.has(f) || reachable.has(f) || generated.includes(f)) continue;
    const rel = relative(root, f).replace(/\\/g, '/');
    const inbound = incoming.get(f) || 0;
    let { confidence, notes } = classifyConfidence(f);
    // 类型声明文件（.d.ts）无法用引用图证明未使用：全局声明可被 tsconfig 拽入
    if (confidence === 'high' && /\.d\.[cm]?ts$/i.test(f)) {
      confidence = 'medium';
      notes = ['类型声明文件（.d.ts），无法从引用图证明未使用'];
    }
    const refs = [...(inboundBy.get(f) || [])].map((r) => ({
      file: relative(root, r),
      reachable: reachable.has(r),
    }));
    const evidence = [
      `扫描 ${files.length} 个源文件`,
      `${inbound} 处 import/require 引用它`,
      entries.size ? `从 ${entries.size} 个显式入口出发不可达` : '无入口定义，视为孤儿文件',
    ];
    if (confidence === 'medium') evidence.push(`仅有字符串/配置/约定证据：${notes.join('、')}`);
    if (confidence === 'low') evidence.push(`仅被不可达文件或注释提及：${notes.join('、')}`);
    deadFiles.push({
      file: rel,
      confidence,
      inbound,
      refs: refs.slice(0, 8),
      evidence,
      chain: refs.length
        ? refs.slice(0, 8).map((r) => `${r.file}${r.reachable ? '' : '（自身也不可达）'}`)
        : (confidence === 'high' ? ['没有任何文件引用它'] : ['仅有字符串/约定层面的引用痕迹']),
    });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  deadFiles.sort((a, b) => rank[a.confidence] - rank[b.confidence] || a.file.localeCompare(b.file));

  // ---------- 未使用依赖（根包 + monorepo 子包；只标「全仓库都没人 import」的） ----------
  const isBareSpec = (s) => !(s.startsWith('.') || s.startsWith('/') || isAbsolute(s) || BUILTINS.has(s));
  const aliasResolved = (s) => (s.startsWith('@') || s.startsWith('~')) && resolveAliasBases(s).length > 0;
  const globalImports = new Set();
  for (const [, specs] of specsAt) {
    for (const s of specs) {
      if (!isBareSpec(s) || aliasResolved(s)) continue;
      globalImports.add(toPackageName(s));
    }
  }
  const fileOwner = new Map();
  for (const f of files) {
    let best = root;
    for (const pr of packageRoots) {
      if ((f === pr.dir || f.startsWith(pr.dir + sep)) && pr.dir.length > best.length) best = pr.dir;
    }
    fileOwner.set(f, best);
  }
  // 脚本里点名的 CLI（bumpp/eslint/vitest 等）也算工具链使用
  const scriptReferenced = new Set();
  // node_modules 里已安装依赖的 bin 名 → 包名（biome → @biomejs/biome、max → @umijs/max）
  const binToPkg = new Map();
  for (const name of depNames) {
    try {
      const pj = JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8'));
      if (typeof pj.bin === 'string') binToPkg.set(name.split('/').pop(), name);
      else if (pj.bin && typeof pj.bin === 'object') {
        for (const bin of Object.keys(pj.bin)) binToPkg.set(bin, name);
      }
    } catch {
      /* 依赖未安装，跳过 bin 映射 */
    }
  }
  const scriptTexts = [];
  for (const pr of packageRoots) {
    const j = pr.dir === root ? rootPkg : pr.json;
    for (const s of Object.values(j?.scripts || {})) scriptTexts.push(String(s));
  }
  // husky hooks（.husky/commit-msg 里的 commitlint 也算使用）
  try {
    const huskyDir = join(root, '.husky');
    for (const entry of await readdir(huskyDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      try {
        scriptTexts.push(await readFile(join(huskyDir, entry.name), 'utf8'));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* 无 .husky 目录 */
  }
  for (const str of scriptTexts) {
    if (str.includes('--coverage')) configReferenced.add('@vitest/coverage-v8');
    if (str.includes('--ui')) configReferenced.add('@vitest/ui');
    for (const m of str.matchAll(/[A-Za-z0-9@._/-]+/g)) {
      scriptReferenced.add(toPackageName(m[0]));
      const binPkg = SCRIPT_BIN_PKGS[m[0]] || binToPkg.get(m[0]);
      if (binPkg) scriptReferenced.add(binPkg);
    }
  }
  // CI workflow（.github/workflows/*.yml）里点名的包：pkg-pr-new、发布/预览工具等
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const tf of textFiles) {
    if (!/\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i.test(tf)) continue;
    let code = '';
    try {
      code = await readFile(tf, 'utf8');
    } catch {
      continue;
    }
    for (const name of depNames) {
      if (configReferenced.has(name)) continue;
      const re = new RegExp(`(^|[^\\w@/-])${escapeRe(name)}([^\\w@/-]|$)`);
      if (re.test(code)) configReferenced.add(name);
    }
  }

  const unusedDeps = [];
  const toolchainDeps = [];
  const flagged = new Map();
  for (const pr of packageRoots) {
    const pkgJson = pr.dir === root ? rootPkg : pr.json;
    if (!pkgJson) continue;
    const pkgRel = pr.dir === root ? null : relative(root, pr.dir).replace(/\\/g, '/');
    // templates/examples/playground 是交付给用户的资源包，仓库自身不 import 它们，不报未用依赖
    if (pkgRel && /^(?:templates?|examples?|playgrounds?|demos?|benchmarks?)(?:\/|$)/.test(pkgRel)) continue;
    // 文档站包：依赖常在 md/typedoc 插件配置里使用，静态无法完整覆盖
    if (pkgRel && /(^|\/)docs?(?:\/|$)/.test(pkgRel)
      && ((pkgJson.dependencies && pkgJson.dependencies.vitepress) || (pkgJson.devDependencies && pkgJson.devDependencies.vitepress))) continue;
    const declared = { ...(pkgJson.dependencies || {}), ...(pkgJson.devDependencies || {}) };
    for (const name of Object.keys(declared)) {
      if (globalImports.has(name) || globalImports.has(toPackageName(name))) continue;
      // React 项目的 react-dom 是框架渲染层运行时：声明了 react 即视为使用
      if (name === 'react-dom' && declared.react) continue;
      if (configReferenced.has(name) || configReferenced.has(toPackageName(name))) continue;
      if (scriptReferenced.has(name) || scriptReferenced.has(toPackageName(name))) continue;
      if (TOOLCHAIN.has(name) || /^@types\/|^@babel\//.test(name) || /^@([\w-]+)\/eslint/.test(name) || name.includes('eslint')) {
        toolchainDeps.push({ name, workspace: pkgRel, note: '工具链依赖，通常不删' });
        continue;
      }
      if (flagged.has(name)) continue;
      const entry = {
        name,
        workspace: pkgRel,
        evidence: `扫描 ${files.length} 个源文件${pkgRel ? `（声明于 workspace ${pkgRel}）` : ''}，全仓库无 import/require 命中`,
      };
      flagged.set(name, entry);
      unusedDeps.push(entry);
    }
  }

  // 生成目录（.umi/.next 等）内部天然存在框架环，不参与业务循环依赖报告
  const cycleEdges = new Map();
  for (const [from, depsList] of edges) {
    if (generated.includes(from)) continue;
    cycleEdges.set(from, depsList.filter((d) => !generated.includes(d)));
  }
  const cycles = findCycles(cycleEdges).map((comp) => comp.map((f) => relative(root, f)));
  const byConfidence = { high: 0, medium: 0, low: 0 };
  for (const d of deadFiles) byConfidence[d.confidence] += 1;

  return {
    meta: {
      tool: 'agent-refactor',
      version: pkg.version,
      scannedAt: new Date().toISOString(),
      root,
      scannedFiles: files.length,
      frameworks,
      entryFiles: [...entries].map((f) => relative(root, f).replace(/\\/g, '/')).sort(),
      generatedFiles: generated.length,
      deadByConfidence: byConfidence,
      hasPackage: Boolean(rootPkg),
    },
    deadFiles,
    unusedDeps,
    toolchainDeps,
    cycles,
  };
}

function findCycles(edges) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const sccs = [];
  let counter = 0;

  const strongConnect = (v) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!edges.has(w)) continue;
      if (!index.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), index.get(w)));
      }
    }
    if (low.get(v) === index.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) sccs.push(comp);
    }
  };

  for (const v of edges.keys()) if (!index.has(v)) strongConnect(v);
  return sccs;
}

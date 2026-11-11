import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'coverage', 'tests',
  '.next', '.nuxt', '.output', 'vendor', '.turbo', '.cache',
]);

const CODE_EXTS = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue']);

const ENTRY_HINTS = /(^|[\\/])(index|main|app|entry)\.(js|mjs|cjs|jsx|ts|tsx|vue)$|(vite|rollup|webpack|jest|vitest|eslint|tailwind|postcss|astro|next|nuxt|svelte|playwright)\.config\.[cm]?[jt]s$|electron\.(js|ts)$|server\.(js|mjs|ts)$/i;

const TOOLCHAIN = new Set([
  'eslint', 'prettier', 'typescript', 'vite', 'vitest', 'jest', 'webpack', 'rollup',
  'esbuild', 'postcss', 'autoprefixer', 'tailwindcss', 'sass', 'less',
  'ts-node', 'lint-staged', 'husky', 'nodemon', 'cross-env', 'concurrently',
  'webpack-cli', 'rollup-plugin', '@vue/compiler-sfc', 'vue-tsc',
  'nodemon', 'rimraf', 'patch-package',
]);

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

function tryResolve(fromFile, spec) {
  const cleaned = stripQuery(spec);
  if (!cleaned.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), cleaned);
  const candidates = [
    base,
    base + '.js', base + '.mjs', base + '.cjs', base + '.jsx', base + '.ts',
    base + '.tsx', base + '.vue',
    join(base, 'index.js'), join(base, 'index.ts'), join(base, 'index.tsx'),
    join(base, 'index.jsx'), join(base, 'index.vue'), join(base, 'index.mjs'),
  ];
  return candidates;
}

async function exists(p) {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}

async function walk(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name) && !e.name.startsWith('.')) await walk(p, out);
    } else if (CODE_EXTS.has(extname(e.name))) {
      out.push(p);
    }
  }
}

async function loadPackage(root) {
  const candidates = [join(root, 'package.json')];
  for (const p of candidates) {
    try {
      const raw = await readFile(p, 'utf8');
      return { path: p, json: JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  }
  return null;
}

function detectEntries(files, root, pkg) {
  const entries = new Set();
  if (pkg?.json) {
    const j = pkg.json;
    const fields = [j.main, j.module, j.browser, j.exports];
    if (typeof j.bin === 'object') Object.values(j.bin).forEach((b) => fields.push(b));
    else if (typeof j.bin === 'string') fields.push(j.bin);
    for (const f of fields.filter(Boolean)) {
      if (typeof f === 'string' && !f.includes('*')) {
        const abs = resolve(root, f.replace(/^\.\//, ''));
        entries.add(abs);
      }
    }
    if (Array.isArray(j.exports)) j.exports.forEach((e) => { if (typeof e === 'string') entries.add(resolve(root, e)); });
    if (j.exports && typeof j.exports === 'object') {
      for (const v of Object.values(j.exports)) {
        if (typeof v === 'string') entries.add(resolve(root, v));
        else if (v && typeof v === 'object') Object.values(v).forEach((x) => { if (typeof x === 'string') entries.add(resolve(root, x)); });
      }
    }
  }
  for (const f of files) {
    if (ENTRY_HINTS.test(f)) {
      entries.add(f);
      continue;
    }
    const rel = relative(root, f).replace(/\\/g, '/');
    const depth = rel.split('/').length;
    // 根目录文件、scripts/、test/ 下的文件都是工具/入口，不当死代码（误删代价远大于漏报）
    if (depth === 1) {
      entries.add(f);
      continue;
    }
    if (/(^|\/)(scripts?|test|tests|__tests__)\//.test(rel)) {
      entries.add(f);
      continue;
    }
    if (/\.(test|spec)\.(js|ts|jsx|tsx|mjs|cjs)$/.test(rel)) {
      entries.add(f);
    }
  }
  return [...entries].filter((e) => files.includes(e));
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

export async function scanProject(rootDir) {
  const root = resolve(rootDir);
  const files = [];
  await walk(root, files);
  const pkg = await loadPackage(root);
  const entryFiles = detectEntries(files, root, pkg);
  const fileSet = new Set(files);

  const edges = new Map();
  const fileRead = new Map();
  const localSpecsAt = new Map();

  for (const f of files) {
    let code = '';
    try {
      code = await readFile(f, 'utf8');
    } catch {
      continue;
    }
    fileRead.set(f, code);
    const specs = extractSpecifiers(code, f);
    const resolvedDeps = [];
    for (const spec of specs) {
      if (spec.startsWith('.')) {
        const candidates = tryResolve(f, spec);
        let hit = null;
        for (const c of candidates) {
          if (await exists(c)) { hit = c; break; }
        }
        if (hit) resolvedDeps.push(hit);
      }
    }
    edges.set(f, [...new Set(resolvedDeps)]);
    localSpecsAt.set(f, specs);
  }

  // Reachability from entries (dead code = not reachable from any entry)
  const reachable = new Set();
  const queue = [...entryFiles].filter((e) => fileSet.has(e));
  while (queue.length) {
    const cur = queue.shift();
    if (reachable.has(cur)) continue;
    reachable.add(cur);
    for (const dep of edges.get(cur) || []) {
      if (fileSet.has(dep)) queue.push(dep);
    }
  }
  // Files with zero incoming edges AND no entry status are also suspicious (roots)
  const incoming = new Map(files.map((f) => [f, 0]));
  const inboundBy = new Map(files.map((f) => [f, new Set()]));
  for (const [from, deps] of edges) {
    for (const d of deps) {
      if (incoming.has(d)) incoming.set(d, incoming.get(d) + 1);
      if (inboundBy.has(d)) inboundBy.get(d).add(from);
    }
  }

  const deadFiles = [];
  for (const f of files) {
    if (entryFiles.includes(f)) continue;
    if (reachable.has(f)) continue;
    const inbound = incoming.get(f) || 0;
    const isEntryLike = ENTRY_HINTS.test(relative(root, f)) || f === root;
    if (isEntryLike) continue;
    const refs = [...(inboundBy.get(f) || [])].map((r) => ({
      file: relative(root, r),
      reachable: reachable.has(r),
    }));
    deadFiles.push({
      file: relative(root, f),
      inbound,
      refs: refs.slice(0, 8),
      evidence: [
        `扫描 ${files.length} 个源文件`,
        `${inbound} 处 import/require 引用它`,
        entryFiles.length ? `从 ${entryFiles.length} 个入口出发不可达` : `无入口定义，视为孤儿文件`,
      ],
      chain: refs.length
        ? refs.slice(0, 8).map((r) => `${r.file}${r.reachable ? '' : '（自身也不可达）'}`)
        : ['没有任何文件引用它'],
    });
  }

  // Unused dependencies
  const importedPkgs = new Set();
  for (const [, specs] of localSpecsAt) {
    for (const s of specs) {
      if (s.startsWith('.') || BUILTINS.has(s)) continue;
      importedPkgs.add(toPackageName(s));
    }
  }
  const allDeps = { ...(pkg?.json?.dependencies || {}), ...(pkg?.json?.devDependencies || {}) };
  const unusedDeps = [];
  const toolchainDeps = [];
  for (const name of Object.keys(allDeps)) {
    if (importedPkgs.has(name)) continue;
    const base = toPackageName(name);
    if (importedPkgs.has(base)) continue;
    if (TOOLCHAIN.has(name) || name.startsWith('@types/') || name.startsWith('@babel/')) {
      toolchainDeps.push({ name, note: '工具链依赖，通常不删' });
    } else if (/^@types\/|^@([\w-]+)\/eslint/.test(name) || name.includes('eslint')) {
      toolchainDeps.push({ name, note: '工具链依赖，通常不删' });
    } else {
      unusedDeps.push({ name, evidence: `扫描 ${files.length} 个源文件，无 import/require 命中` });
    }
  }

  const cycles = findCycles(edges).map((comp) => comp.map((f) => relative(root, f)));

  return {
    meta: {
      tool: 'agent-refactor',
      version: '0.1.0',
      scannedAt: new Date().toISOString(),
      root,
      scannedFiles: files.length,
      entryFiles: entryFiles.map((f) => relative(root, f)),
      hasPackage: Boolean(pkg),
    },
    deadFiles,
    unusedDeps,
    toolchainDeps,
    cycles,
  };
}


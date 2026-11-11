#!/usr/bin/env node
/**
 * 生成 agent-refactor 产品演示动画（真实 CLI 输出 → PNG 帧 → MP4 + GIF）。
 *
 * 用法:
 *   node scripts/record-demo.mjs [--keep-frames] [--skip-video]
 *
 * 流程:
 *   1. 复制 fixtures/demo-project 到 docs/demo/.work/demo（不动原 fixture）
 *   2. 真实执行 `node bin/cli.js scan .` 与 `node bin/cli.js fix . --yes`，录下原始输出
 *   3. Edge headless 截真实 HTML 报告
 *   4. 生成分镜 spec → scripts/demo_render.py 画帧
 *   5. ffmpeg 合成 demo.mp4 / demo.gif，ffprobe 校验时长与体积
 *
 * 依赖: node + python(Pillow) + ffmpeg + Edge（仅截图用）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const demoDir = path.join(root, 'docs', 'demo');
const workRoot = path.join(demoDir, '.work');
const work = path.join(workRoot, 'demo');
const framesDir = path.join(demoDir, 'frames');
const reportDir = path.join(demoDir, 'report');
const outMp4 = path.join(demoDir, 'demo.mp4');
const outGif = path.join(demoDir, 'demo.gif');
const cli = path.join(root, 'bin', 'cli.js');

const keepFrames = process.argv.includes('--keep-frames');
const skipVideo = process.argv.includes('--skip-video');

const FPS = 20;
const W = 1280;
const H = 720;
const FONT = 22;
const LINE_H = 32;

const C = {
  fg: [201, 209, 217],
  dim: [139, 148, 158],
  green: [63, 185, 80],
  cyan: [88, 166, 255],
  yellow: [255, 216, 102],
  red: [255, 107, 107],
  prompt: [86, 212, 221],
};

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function runCli(args, cwd) {
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    timeout: 120000,
  });
  if (r.status !== 0 && args[0] !== 'fix') {
    throw new Error('cli failed: ' + args.join(' ') + '\n' + (r.stderr || '') + (r.stdout || ''));
  }
  return { stdout: stripAnsi(r.stdout || ''), stderr: stripAnsi(r.stderr || ''), status: r.status };
}

function stripAnsi(s) {
  return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
}

function trimBlankEdges(lines) {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === '') a++;
  while (b > a && lines[b - 1].trim() === '') b--;
  return lines.slice(a, b);
}

function styleScanLine(line, prevHeader) {
  const s = line.trim();
  if (!s) return { kind: 'blank' };
  if (s.startsWith('agent-refactor')) return { color: C.cyan, bold: true, pause: 0.5 };
  if (s.includes('扫描') && s.includes('源文件')) return { color: C.dim, pause: 0.4 };
  if (s.startsWith('死代码') || s.startsWith('未使用依赖') || s.startsWith('循环依赖')) {
    return { color: C.fg, bold: true, pause: 0.35, header: true };
  }
  if (/循环/.test(s) && s.includes('→')) return { color: C.red, pause: 0.35 };
  if (s.startsWith('⚠')) return { color: C.yellow, pause: 0.18 };
  if (s.startsWith('└') || s.startsWith('↳')) return { color: C.dim };
  if (s.includes('未发现') && s.startsWith('✓')) return { color: C.green };
  if (s.startsWith('HTML 报告')) return { color: C.dim, pause: 0.5 };
  return { color: C.fg };
}

function styleFixLine(line) {
  const s = line.trim();
  if (!s) return { kind: 'blank' };
  if (s.startsWith('修复计划')) return { color: C.fg, bold: true, pause: 0.45 };
  if (s.startsWith('✓ 修复完成') || s.includes('PASSED')) return { color: C.green, pause: 0.3 };
  if (s.startsWith('- 删除') || s.startsWith('- 移除')) return { color: C.red, pause: 0.28 };
  if (s.startsWith('- ')) return { color: C.yellow, pause: 0.22 };
  if (s.startsWith('测试门禁通过')) return { color: C.dim, pause: 0.4 };
  if (s.startsWith('测试失败')) return { color: C.red, pause: 0.4 };
  return { color: C.dim };
}

// ---------- 1. 真实 CLI 输出 ----------
rmrf(workRoot);
ensureDir(workRoot);
fs.cpSync(path.join(root, 'fixtures', 'demo-project'), work, { recursive: true });
ensureDir(reportDir);

const scan = runCli(['scan', '.'], work);
const scanLines = trimBlankEdges(scan.stdout.split('\n'));
const scanStats = (() => {
  const r = runCli(['scan', '.', '--json'], work);
  const raw = r.stdout;
  const end = raw.lastIndexOf('}');
  const j = JSON.parse(raw.slice(raw.indexOf('{'), end + 1));
  return {
    files: j.meta.scannedFiles,
    dead: j.deadFiles.length,
    deps: j.unusedDeps.length,
    cycles: j.cycles.length,
  };
})();
const srcFiles = fs.readdirSync(path.join(work, 'src')).filter((f) => /\.(js|mjs|cjs|ts)$/.test(f));

const fix = runCli(['fix', '.', '--yes'], work);
const fixLines = trimBlankEdges(fix.stdout.split('\n'));

// rollback 实测（只取一行用于注解，不伪装成主流程）
const rb = path.join(workRoot, 'rb');
fs.cpSync(path.join(root, 'fixtures', 'demo-rollback'), rb, { recursive: true });
const rbOut = runCli(['fix', '.', '--yes'], rb);
const rbLine = rbOut.stdout.split('\n').map((l) => l.trim()).find((l) => l.startsWith('测试失败'));

// 真实 HTML 报告截图
const cardPng = path.join(reportDir, 'report-shot.png');
const edge = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find((p) => fs.existsSync(p));
if (edge) {
  const html = path.join(work, 'agent-refactor-report.html');
  const fileUrl = 'file:///' + html.replace(/\\/g, '/');
  // 需要独立的 user-data-dir，否则 headless 直接静默退出（踩过）
  const profile = path.join(workRoot, 'edge-profile');
  const sp = spawnSync(edge, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--user-data-dir=' + profile,
    '--force-device-scale-factor=1.5', '--window-size=1000,700',
    '--screenshot=' + cardPng, fileUrl], { encoding: 'utf8', timeout: 60000 });
  if (!fs.existsSync(cardPng)) {
    console.warn('report screenshot failed:', (sp.stderr || '').slice(-400));
  }
} else {
  console.warn('no Edge/Chrome found, report card will be skipped');
}

// ---------- 2. 分镜 ----------
const events = [];
const push = (e) => events.push(e);
let now = 0;

const scanPromptAt = 2.6;
push({ t: scanPromptAt, type: 'typing_prompt', prompt: '$ ', prompt_color: C.prompt,
  text: 'node bin/cli.js scan .', color: C.fg, dur: 1.5 });
push({ t: 4.3, type: 'progress', label: 'Scanning', total: scanStats.files,
  files: srcFiles, dur: 4.2 });

let t = 8.9;
const delay = 0.24;
for (const line of scanLines) {
  const st = styleScanLine(line);
  if (st.kind === 'blank') {
    push({ t, type: 'line', text: '', color: C.dim });
    t += 0.1;
    continue;
  }
  push({ t, type: 'line', text: line, color: st.color, bold: !!st.bold });
  t += delay + (st.pause || 0);
}
const scanEnd = t;
const cardIn = scanEnd + 1.3;
const cardOut = cardIn + 8.2;

const fixPromptAt = cardOut + 0.5;
push({ t: fixPromptAt, type: 'typing_prompt', prompt: '$ ', prompt_color: C.prompt,
  text: 'node bin/cli.js fix . --yes', color: C.fg, dur: 1.6 });

t = fixPromptAt + 1.9;
for (const line of fixLines) {
  const st = styleFixLine(line);
  if (st.kind === 'blank') {
    push({ t, type: 'line', text: '', color: C.dim });
    t += 0.1;
    continue;
  }
  push({ t, type: 'line', text: line, color: st.color, bold: !!st.bold });
  t += delay + (st.pause || 0);
}
const fixEnd = t;

// 注解（已实测的事实）
push({ t: fixEnd + 0.7, type: 'line', text: '  失败自动回滚：' + (rbLine || '测试失败，已自动回滚'),
  color: C.dim });
push({ t: fixEnd + 1.05, type: 'line', text: '  备份在系统临时目录，成功清理、失败原样恢复',
  color: C.dim });

const endingIn = Math.max(fixEnd + 2.4, cardOut + 12.5);
const duration = Math.ceil((endingIn + 9.0) * 10) / 10;

const spec = {
  width: W,
  height: H,
  fps: FPS,
  font_size: FONT,
  line_height: LINE_H,
  duration,
  out_dir: framesDir,
  terminal_in: 2.15,
  terminal_dim: cardIn,
  terminal_dim_alpha: 0.3,
  title_in: 0.15,
  title_out: 2.25,
  card_in: cardIn,
  card_out: cardOut,
  card_image: fs.existsSync(cardPng) ? cardPng : null,
  card_width: 820,
  card_crop: [40, 20, 1480, 920],
  ending_in: endingIn,
  events: events.map((e) => ({ ...e, t: Math.round(e.t * 1000) / 1000 })),
};

ensureDir(framesDir);
const specPath = path.join(demoDir, 'storyboard.json');
fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf8');

console.log('real scan: %d files / %d dead / %d unused deps / %d cycles',
  scanStats.files, scanStats.dead, scanStats.deps, scanStats.cycles);
console.log('scan output lines: %d, fix output lines: %d', scanLines.length, fixLines.length);
console.log('duration: %ss, events: %d, card: %s', duration, events.length, spec.card_image ? 'yes' : 'no');

if (skipVideo) {
  console.log('spec written:', specPath);
  process.exit(0);
}

// ---------- 3. 画帧 ----------
const py = spawnSync('python', [path.join(__dirname, 'demo_render.py'), specPath], {
  encoding: 'utf8', timeout: 900000,
});
process.stdout.write(py.stdout || '');
if (py.status !== 0) {
  console.error(py.stderr || 'render failed');
  process.exit(1);
}

// ---------- 4. 合成 ----------
function ff(args, label) {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args],
    { encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0) {
    console.error(label + ' failed:\n' + (r.stderr || '').slice(-2000));
    process.exit(1);
  }
}

ff(['-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20',
  '-movflags', '+faststart', '-r', String(FPS), outMp4], 'mp4');

const gifFps = 12;
ff(['-framerate', String(FPS), '-i', path.join(framesDir, 'f%05d.png'),
  '-vf', `fps=${gifFps},scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none`,
  '-loop', '0', outGif], 'gif');

// ---------- 5. 校验 ----------
function probe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=width,height,codec_name', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  return {
    duration: parseFloat(j.format.duration),
    size: parseInt(j.format.size, 10),
    w: j.streams?.[0]?.width,
    h: j.streams?.[0]?.height,
    codec: j.streams?.[0]?.codec_name,
  };
}

const mp4 = probe(outMp4);
const gif = probe(outGif);
const mb = (n) => (n / 1024 / 1024).toFixed(2) + 'MB';
console.log('\n== verify ==');
console.log('demo.mp4  %ss  %s  %dx%d %s', mp4.duration.toFixed(1), mb(mp4.size), mp4.w, mp4.h, mp4.codec);
console.log('demo.gif  %ss  %s  %dx%d', gif.duration.toFixed(1), mb(gif.size), gif.w, gif.h);

const okDur = mp4.duration >= 40 && mp4.duration <= 70;
const okMp4 = mp4.size <= 20 * 1024 * 1024;
const okGif = gif.size <= 15 * 1024 * 1024;
console.log('gates: duration %s | mp4<=20MB %s | gif<=15MB %s',
  okDur ? 'PASS' : 'FAIL', okMp4 ? 'PASS' : 'FAIL', okGif ? 'PASS' : 'FAIL');

// 收尾清理
fs.rmSync(workRoot, { recursive: true, force: true });
if (!keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });

if (!(okDur && okMp4 && okGif)) process.exit(2);
console.log('done');

import { writeFile } from 'node:fs/promises';

export function renderTerminal(result, chalk) {
  const { meta, deadFiles, unusedDeps, toolchainDeps, cycles } = result;
  const high = deadFiles.filter((d) => d.confidence === 'high');
  const unsure = deadFiles.filter((d) => d.confidence !== 'high');
  console.log('');
  console.log(chalk.bold.cyan('  agent-refactor 代码体检报告'));
  console.log(chalk.dim(`  扫描 ${meta.scannedFiles} 个源文件 · ${meta.scannedAt.slice(0, 10)}`));
  console.log('');

  console.log(chalk.bold(`  死代码 · 高置信（${high.length}）`));
  if (high.length === 0) console.log(chalk.green('    ✓ 未发现孤立文件'));
  for (const d of high.slice(0, 20)) {
    console.log(chalk.yellow(`    ⚠ [high] ${d.file}`));
    for (const e of d.evidence) console.log(chalk.dim(`       └ ${e}`));
    if (d.chain?.length) console.log(chalk.dim(`       ↳ 引用来源：${d.chain.join('、')}`));
  }
  if (high.length > 20) console.log(chalk.dim(`    …… 共 ${high.length} 项，见 HTML 报告`));
  console.log('');

  if (unsure.length) {
    console.log(chalk.bold(`  疑似死代码 · 不判死，需人工确认（${unsure.length}）`));
    for (const d of unsure.slice(0, 20)) {
      const label = d.confidence === 'medium' ? 'medium' : 'low';
      console.log(chalk.dim(`    ? [${label}] ${d.file}`));
      const note = d.evidence.find((e) => e.startsWith('仅有') || e.startsWith('仅被'));
      if (note) console.log(chalk.dim(`       └ ${note}`));
    }
    if (unsure.length > 20) console.log(chalk.dim(`    …… 共 ${unsure.length} 项，见 HTML 报告`));
    console.log('');
  }

  console.log(chalk.bold(`  未使用依赖（${unusedDeps.length}）`));
  if (unusedDeps.length === 0) console.log(chalk.green('    ✓ 未发现未用依赖'));
  for (const d of unusedDeps) {
    console.log(chalk.yellow(`    ⚠ ${d.name}`), chalk.dim(` ${d.evidence}`));
  }
  if (toolchainDeps.length) {
    console.log(chalk.dim(`    （工具链依赖 ${toolchainDeps.length} 个已排除：${toolchainDeps.map((t) => t.name).slice(0, 5).join(', ')}${toolchainDeps.length > 5 ? '…' : ''}）`));
  }
  console.log('');

  console.log(chalk.bold(`  循环依赖（${cycles.length}）`));
  if (cycles.length === 0) console.log(chalk.green('    ✓ 未发现循环'));
  for (const ring of cycles) {
    console.log(chalk.red(`    ⚠ ${ring.join(' → ')} → ${ring[0]}`));
  }
  console.log('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function writeHtmlReport(result, outPath) {
  const { meta, deadFiles, unusedDeps, toolchainDeps, cycles } = result;
  const projectName = meta.root ? String(meta.root).split(/[\\/]/).filter(Boolean).pop() : '';

  const highDead = deadFiles.filter((d) => d.confidence === 'high');
  const unsureDead = deadFiles.filter((d) => d.confidence !== 'high');

  const renderDeadRows = (list) => list.map((d) => `
    <div class="item">
      <div class="file">${escapeHtml(d.file)}<span class="badge">${escapeHtml(d.confidence || 'high')}</span></div>
      <div class="evidence">${d.evidence.map((e) => `<span class="chain">${escapeHtml(e)}</span>`).join('')}
      ${d.chain?.length ? `<span class="chain chain-src">↳ 引用来源：${escapeHtml(d.chain.join('、'))}</span>` : ''}</div>
    </div>`).join('');
  const deadRows = renderDeadRows(highDead);
  const unsureRows = renderDeadRows(unsureDead);

  const depRows = unusedDeps.map((d) => `
    <div class="item"><div class="file">${escapeHtml(d.name)}</div><div class="evidence">${escapeHtml(d.evidence)}</div></div>`).join('');

  const cycleRows = cycles.map((ring) => `
    <div class="item"><div class="file cycle">${ring.map(escapeHtml).join(' → ')} → ${escapeHtml(ring[0])}</div></div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>agent-refactor 代码体检报告</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0d1117; color:#c9d1d9; font-family:'Cascadia Code','Consolas',monospace; margin:0; padding:48px; }
  h1 { color:#58a6ff; font-size:20px; margin:0 0 4px; }
  .meta { color:#8b949e; font-size:12px; margin-bottom:32px; }
  h2 { color:#f0883e; font-size:14px; margin:32px 0 12px; border-bottom:1px solid #21262d; padding-bottom:6px; }
  .item { background:#161b22; border:1px solid #21262d; border-radius:6px; padding:10px 14px; margin-bottom:8px; }
  .file { color:#ffd866; font-weight:600; }
  .file.cycle { color:#ff6b6b; }
  .evidence { color:#8b949e; font-size:12px; margin-top:4px; }
  .chain { display:block; padding-left:12px; border-left:2px solid #30363d; margin-top:2px; }
  .ok { color:#3fb950; }
  .badge { display:inline-block; background:#21262d; border-radius:10px; padding:1px 8px; font-size:11px; color:#8b949e; margin-left:6px; }
</style>
</head>
<body>
  <h1>agent-refactor 代码体检报告</h1>
  <div class="meta">扫描 ${meta.scannedFiles} 个源文件 · ${escapeHtml(meta.scannedAt.slice(0, 10))}${projectName ? ` · 项目 ${escapeHtml(projectName)}` : ''}</div>

  <h2>死代码 · 高置信 <span class="badge">${highDead.length}</span></h2>
  ${deadRows || '<div class="item ok">✓ 未发现孤立文件</div>'}

  <h2>疑似死代码 · 不判死，需人工确认 <span class="badge">${unsureDead.length}</span></h2>
  ${unsureRows || '<div class="item ok">✓ 无低置信提示</div>'}

  <h2>未使用依赖 <span class="badge">${unusedDeps.length}</span></h2>
  ${depRows || '<div class="item ok">✓ 未发现未用依赖</div>'}
  ${toolchainDeps.length ? `<div class="meta">已排除工具链依赖 ${toolchainDeps.length} 个：${escapeHtml(toolchainDeps.map((t) => t.name).join(', '))}</div>` : ''}

  <h2>循环依赖 <span class="badge">${cycles.length}</span></h2>
  ${cycleRows || '<div class="item ok">✓ 未发现循环</div>'}

  <div class="meta" style="margin-top:40px">由 agent-refactor v${meta.version} 生成 · 每一条结论都附证据链</div>
</body>
</html>`;

  await writeFile(outPath, html, 'utf8');
  return outPath;
}

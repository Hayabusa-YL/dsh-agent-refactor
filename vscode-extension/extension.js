const vscode = require('vscode');
const { execFile } = require('node:child_process');
const { join } = require('node:path');

function plainMessage(d) {
  const conf = d.confidence || 'unknown';
  const ev = Array.isArray(d.evidence) && d.evidence.length ? d.evidence.join('；') : '没有被任何入口引用';
  return `死代码（${conf}）：${ev}`;
}

async function scanWorkspace() {
  const folder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (!folder) {
    vscode.window.showWarningMessage('Agent Refactor：请先打开一个项目文件夹');
    return;
  }
  const root = folder.uri.fsPath;
  const cliPath = vscode.workspace.getConfiguration('agentRefactor').get('cliPath', 'bin/cli.js');
  const cli = join(root, cliPath);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Agent Refactor 体检中…' },
    () =>
      new Promise((resolve) => {
        execFile(
          process.execPath,
          [cli, 'scan', root, '--json'],
          { cwd: root, maxBuffer: 20 * 1024 * 1024, timeout: 300000 },
          (err, stdout, stderr) => {
            let result = null;
            try {
              result = JSON.parse(stdout);
            } catch {
              /* fall through */
            }
            if (!result) {
              vscode.window.showErrorMessage(`Agent Refactor 扫描失败：${stderr || err?.message || '未知错误'}`);
              return resolve();
            }
            const byFile = new Map();
            const push = (file, severity, message) => {
              if (!file) return;
              const abs = join(root, file);
              if (!byFile.has(abs)) byFile.set(abs, []);
              byFile.get(abs).push(new vscode.Diagnostic(new vscode.Range(0, 0, 0, 1), message, severity));
            };
            for (const d of result.deadFiles || []) push(d.file, vscode.DiagnosticSeverity.Warning, plainMessage(d));
            for (const c of result.cycles || []) push(c[0], vscode.DiagnosticSeverity.Error, `循环依赖：${c.join(' → ')}`);

            const collection = vscode.languages.createDiagnosticCollection('agent-refactor');
            collection.clear();
            for (const [file, diags] of byFile) collection.set(vscode.Uri.file(file), diags);
            const count = (result.deadFiles || []).length + (result.unusedDeps || []).length + (result.cycles || []).length;
            vscode.window.showInformationMessage(
              count ? `Agent Refactor 体检完成：${count} 个问题（未用依赖 ${(result.unusedDeps || []).length} 个看通知）` : 'Agent Refactor 体检完成：没发现问题',
            );
            for (const d of result.unusedDeps || []) vscode.window.showWarningMessage(`未用依赖：${d.name}`);
            resolve();
          },
        );
      }),
  );
}

module.exports = {
  activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand('agentRefactor.scan', scanWorkspace));
  },
  deactivate() {},
};

import { scanProject } from '../src/scan.js'

const roots = ['fixtures/demo-project', 'fixtures/giant-app', 'fixtures/mini-leads', 'fixtures/real-repo']
for (const root of roots) {
  const r = await scanProject(root)
  const conf = {}
  for (const d of r.deadFiles) {
    const c = d.confidence || 'none'
    conf[c] = (conf[c] || 0) + 1
  }
  console.log(root + ' ' + JSON.stringify({ files: r.meta?.scannedFiles, dead: r.deadFiles.length, conf, unused: r.unusedDeps.length, cycles: r.cycles.length }))
}

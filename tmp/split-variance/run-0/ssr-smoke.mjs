import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const result = await build({
  entryPoints: ['src/App.jsx'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  jsx: 'automatic',
  external: ['react', 'react-dom'],
});
const code = result.outputFiles[0].text;
const mod = { exports: {} };
new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
const App = mod.exports.default;
const React = require('react');
const { renderToString } = require('react-dom/server');
const html = renderToString(React.createElement(App));
if (!html.includes('用户管理')) throw new Error('渲染结果缺少预期内容');
console.log('SSR smoke OK, html length =', html.length);

/**
 * 拆分后交互冒烟：jsdom 渲染 + 真实点击，验证拆分后的组件树能交互。
 * 用法：node dom-smoke.mjs
 */
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.Event = dom.window.Event;
global.getComputedStyle = dom.window.getComputedStyle;
global.IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = require('react-dom/test-utils');

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

const rootEl = document.getElementById('root');
const root = createRoot(rootEl);

await act(async () => {
  root.render(React.createElement(App));
});

const initial = rootEl.innerHTML;
if (!initial.includes('用户管理')) throw new Error('初始渲染缺少标题');
console.log('DOM smoke: 初始渲染 OK');

// 1. 展开筛选面板
const buttons = () => [...document.querySelectorAll('button')];
const filterBtn = buttons().find((b) => b.textContent.includes('筛选'));
if (!filterBtn) throw new Error('找不到筛选按钮');
await act(async () => {
  filterBtn.click();
});
if (!rootEl.innerHTML.includes('角色')) throw new Error('筛选面板未展开');
console.log('DOM smoke: 筛选面板展开 OK');

// 2. 打开新增弹窗
const addBtn = buttons().find((b) => b.textContent.includes('新增用户'));
if (!addBtn) throw new Error('找不到新增按钮');
await act(async () => {
  addBtn.click();
});
if (!rootEl.innerHTML.includes('新增用户') || !document.querySelector('h3')) throw new Error('新增弹窗未打开');
console.log('DOM smoke: 新增弹窗打开 OK');

// 3. 关闭弹窗
const cancelBtn = buttons().find((b) => b.textContent.trim() === '取消');
if (!cancelBtn) throw new Error('找不到取消按钮');
await act(async () => {
  cancelBtn.click();
});
if (document.querySelector('h3')) throw new Error('弹窗未关闭');
console.log('DOM smoke: 弹窗关闭 OK');

console.log('DOM smoke PASS');
process.exit(0);

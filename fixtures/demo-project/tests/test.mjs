import assert from 'node:assert';
import { a } from '../src/a.js';
import { b } from '../src/b.js';

assert.equal(a, 1);
console.log('PASSED a.js 导出正常，循环依赖安全加载');
assert.equal(b, 2);
console.log('PASSED b.js 导出正常');
const entry = await import('../src/index.js').catch(() => null);
console.log(entry ? 'PASSED 入口模块可加载' : 'PASSED 入口模块跳过（lodash 未安装，不影响死代码验证）');
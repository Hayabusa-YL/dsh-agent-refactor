import { test } from 'node:test';
import assert from 'node:assert';
import { validatePlan, validateGenerated } from '../src/splitter.js';

const goodPlan = {
  components: [
    {
      name: 'UserList',
      file: 'components/UserList.tsx',
      responsibility: '渲染用户列表',
      props: [{ name: 'users', type: 'User[]', source: 'parent.users' }],
    },
    {
      name: 'UserRow',
      file: 'components/UserRow.tsx',
      responsibility: '渲染单行用户',
      props: [{ name: 'user', type: 'User', source: 'UserList.user' }],
    },
  ],
  hooks: [{ name: 'useUsers', file: 'hooks/useUsers.ts', responsibility: '加载用户数据', state: ['users'] }],
  migration: ['新建 useUsers', '新建 UserRow', '新建 UserList', '改造父组件'],
};

test('validatePlan accepts a good plan', () => {
  assert.deepEqual(validatePlan(goodPlan), []);
});

test('validatePlan rejects bad names, missing props and migration', () => {
  const bad = {
    components: [{ name: 'bad-name', file: 'x.tsx', props: [] }],
    hooks: [{ name: 'notAHook', file: 'h.ts' }],
    migration: [],
  };
  const errs = validatePlan(bad);
  assert.ok(errs.length >= 3, `expected >=3 errors, got ${errs.length}: ${errs.join(' | ')}`);
});

test('validatePlan rejects too many components', () => {
  const many = { ...goodPlan, components: Array.from({ length: 9 }, (_, i) => ({ name: `C${i}`, file: `c${i}.tsx`, props: [] })) };
  assert.ok(validatePlan(many).some((e) => e.includes('数量')));
});

test('validateGenerated requires every planned file', () => {
  const gen = { files: [{ path: 'components/UserList.tsx', content: 'x' }], parent: { content: 'y' } };
  const errs = validateGenerated(gen, goodPlan);
  assert.ok(errs.some((e) => e.includes('UserRow')));
  assert.ok(errs.some((e) => e.includes('useUsers')));
});

test('validateGenerated accepts complete output', () => {
  const gen = {
    files: [
      { path: 'components/UserList.tsx', content: 'x' },
      { path: 'components/UserRow.tsx', content: 'x' },
      { path: 'hooks/useUsers.ts', content: 'x' },
    ],
    parent: { content: 'y' },
  };
  assert.deepEqual(validateGenerated(gen, goodPlan), []);
});

test('validateGenerated rejects JSX in .ts hook files', () => {
  const gen = {
    files: [
      { path: 'components/UserList.tsx', content: 'x' },
      { path: 'components/UserRow.tsx', content: 'x' },
      { path: 'hooks/useUsers.ts', content: 'export function useUsers() { return <Popover />; }' },
    ],
    parent: { content: 'y' },
  };
  const errs = validateGenerated(gen, goodPlan);
  assert.ok(errs.some((e) => e.includes('JSX')), errs.join(' | '));
});

test('validateGenerated accepts hooks without JSX', () => {
  const gen = {
    files: [
      { path: 'components/UserList.tsx', content: 'x' },
      { path: 'components/UserRow.tsx', content: 'x' },
      { path: 'hooks/useUsers.ts', content: 'export function useUsers() { return { users: [] }; }' },
    ],
    parent: { content: 'y' },
  };
  assert.deepEqual(validateGenerated(gen, goodPlan), []);
});

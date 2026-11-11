# 真实仓库案例：ant-design-pro 页面拆分（2026-11-15）

## 对象

- 仓库：`ant-design/ant-design-pro` v6.0.3（真实生产级 umi max 4 项目，1981 个依赖）
- 组件：`src/pages/form/advanced-form/index.tsx`，554 行（表单高级页：仓库管理 Card、任务管理 Card、成员可编辑表格、底部工具栏）
- 运行方式：在真实仓库根目录执行 `node <工具>/bin/cli.js split src/pages/form/advanced-form/index.tsx --yes --verify-cmd "npm run tsc"`

## 第一次尝试：失败（真实缺陷，门禁拦住）

LLM 生成时把 JSX 写进了 `.ts` hook 文件，umi 构建报：

```
src/pages/form/advanced-form/hooks/useFormError.ts:52:12: ERROR: Expected ">" but found "key"
src/pages/form/advanced-form/hooks/useMemberTable.ts:44:14: ERROR: Expected ">" but found "key"
```

构建门禁拦截，自动回滚，零残留（空目录也清理了）。

## 引擎修复

1. PLAN / GENERATE 提示词：hook 文件禁止返回或包含 JSX，需要渲染的逻辑必须做成组件
2. `validateGenerated` 新增静态检查：`.ts` 文件内容出现 JSX 标记 → 写入前直接拒绝
3. `rollback` 补空目录清理（`rmdir` 只删空目录）
4. 新增 2 个单测（覆盖 JSX 拦截与正常放行），全量 16 个测试全绿

## 第二次尝试：成功

- 554 行 → **58 行容器 + 4 个组件 + 1 个 hook**
- `npm run build`（umi max build）通过：17074ms
- `npm run tsc`（tsc --noEmit）通过
- `git status` 仅预期改动：index.tsx 修改 + components/、hooks/ 新增

## 产物结构

```
src/pages/form/advanced-form/
├─ index.tsx（58 行，容器：import + 组装 + 数据）
├─ components/
│  ├─ WarehouseFormCard.tsx（4.4KB，仓库管理表单）
│  ├─ TaskFormCard.tsx（4.1KB，任务管理表单）
│  ├─ MemberEditableTable.tsx（2.1KB，成员可编辑表格 + 类型导出）
│  └─ FormFooterToolbar.tsx（2.6KB，底部工具栏 + 错误 Popover）
└─ hooks/
   └─ useAdvancedForm.ts（0.9KB，提交/错误/key 逻辑，纯 TS 无 JSX）
```

## 诚实边界

- 构建 + 类型检查通过 ≠ 行为等价：页面交互（表单校验、成员增删、错误弹层定位）未做人工回归。
- 这是真实生产项目的一次真实拆分，不是 fixture 演示。

## 日志

- 失败输出：见本文档"第一次尝试"段的原始报错
- 成功输出：`✓ 拆分完成：写入 6 个文件，构建通过（17074ms）`

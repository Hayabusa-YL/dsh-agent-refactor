# 案例：550 行 Dashboard 拆分（2026-11-15）

## 演示（18 秒）

![scan 扫出问题、fix 安全修复的终端演示](demo/demo.gif)

scan 扫出死代码/未用依赖/循环依赖，fix 删除、跑测试门禁、通过才保留——失败自动回滚，最后 3 秒露出浏览器里的 HTML 报告。

## 来源

`fixtures/giant-app/src/App.tsx`——550 行 React 组件，模拟真实后台系统的用户管理页：三个 tab 面板、12 行表格、3 组筛选表单、新增/编辑弹窗、分页、确认对话框全部塞在一个文件里。

## 流程

1. `split` 命令：LLM 分析语义地图（状态/UI 区块/副作用/耦合点）→ 规划拆分计划 → 结构校验
2. 生成：1 个容器 + 6 个子组件 + 3 个 hooks + 共享类型
3. 门禁：vite 构建 + SSR 冒烟
4. 门禁不过 → 自动回滚（见下方失败案例）

## 拆后结构

```
App.jsx (100B, 入口)
└─ Dashboard.jsx (119 行, 容器: 状态编排 + 布局)
   ├─ components/DashboardToolbar.tsx   标题 + 筛选按钮 + 新增按钮
   ├─ components/FilterPanel.tsx        筛选表单面板
   ├─ components/UserTable.tsx          表格 + 行渲染
   ├─ components/Pagination.tsx         分页控件
   ├─ components/UserFormModal.tsx      新增/编辑弹窗
   ├─ components/ConfirmDialog.tsx     删除确认
   └─ hooks/useUserDashboard.ts         核心状态逻辑 (6.3KB)
      hooks/useUserFilters.ts          筛选状态 (1.6KB)
      hooks/useToast.ts                轻提示
```

## 实测数据

| 指标 | 拆前 | 拆后 |
| --- | --- | --- |
| 主文件行数 | 550 | 119 |
| 文件数 | 1 | 11 |
| 构建结果 | — | vite 通过（1648ms 首次） |
| SSR 冒烟 | — | 通过（HTML 1346 字符） |
| 单元测试 | — | 14 个全绿 |

## 失败案例（真实发生过，已收录）

第一次生成时，LLM 输出的代码有一个编译错误（TS 类型不匹配），门禁拦截：

```
✗ 拆分失败：构建失败
  error TS2339: Property 'xxx' does not exist on type 'yyy'
  已回滚 7 个文件（零残留）
```

回滚后文件树与拆分前完全一致——这是门禁有效性的直接证据。

## 局限（诚实说明）

- 拆前 550 行原文在实验中已被拆后版本覆盖，未保留逐字快照；本案例的拆前结构以审计记录（`memory/audit/split-engine-2026-11-15.md`）的结构分析为准。
- 行为等价性：构建 + SSR 冒烟只证明"能编译、结构在"，交互细节（tab 切换、弹窗表单校验）依赖人工回归。

## 日志

- `logs/build.log`：vite 构建完整输出（本案例重跑：479ms 缓存构建）
- `logs/ssr.log`：SSR 冒烟输出
- `logs/tests.log`：单元测试输出（14 pass / 0 fail）

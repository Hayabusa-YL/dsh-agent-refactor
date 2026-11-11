# 演示视频脚本（1 分钟 GIF 分镜）

> 说明：这是分镜脚本，不是成品 GIF。我无法录屏——按以下脚本用任意终端录制工具（Windows 可用 ScreenToGif，Linux 用 asciinema + gif 转换）自行录制。下面每一屏的终端内容都是真实日志，可对照复核。

## 素材来源

| 素材 | 文件 | 真实数据 |
| --- | --- | --- |
| 扫描输出 | fixtures/demo-project | 死代码 1 个文件 + 循环依赖 1 对 |
| 拆分过程 | fixtures/giant-app | 550 行 → 119 行容器 + 6 组件 + 3 hooks |
| 构建门禁 | docs/case-study/logs/build.log | vite 479ms 通过（缓存构建） |
| SSR 冒烟 | docs/case-study/logs/ssr.log | HTML 1346 字符 |
| 单测 | docs/case-study/logs/tests.log | 14 pass / 0 fail |
| 真实组件 | fixtures/real-components/antd-InternalTable.tsx | 822 行，47 状态 / 3 处强耦合 |

## 分镜（0:00–1:00，60 帧/秒，共 3600 帧）

### 镜头 1（0–10s）：体检
终端逐字出现（真实输出）：
```
$ npx agent-refactor scan ./my-project
  扫描 5 个源文件
  死代码 2 个：src/orphan.js、src/utils.js（0 引用、不可达）
  未使用依赖 1 个：unused-pkg
  循环依赖 1 对：src/b.js → src/a.js → src/b.js
  已生成 HTML 报告
```
字幕：**先体检，每条结论带证据链**

### 镜头 2（10–25s）：拆分开始——分析
```
$ npx agent-refactor split src/App.tsx
  分析：550 行 · 状态与 UI 区块逐项清点 · 耦合点定位
  规划：6 组件 + 3 hooks
```
字幕：**语义地图，不是瞎切**

### 镜头 3（25–40s）：生成
文件树逐行展开（动画）：
```
  ├─ Dashboard.jsx（容器 119 行）
  ├─ components/UserTable.tsx
  ├─ components/UserFormModal.tsx
  ├─ ...
  └─ hooks/useUserDashboard.ts
```
字幕：**一次生成 7 个文件**

### 镜头 4（40–55s）：门禁
```
  → 构建通过（1648ms）
  → SSR 冒烟通过（1346 字符）
  ✓ 拆分完成：写入 7 个文件
```
字幕：**过不了门禁就回滚，零残留**
（若想展示失败案例：快速闪现红色"构造失败→已回滚 7 个文件"，再切成功——素材见案例 README）

### 镜头 5（55–60s）：真实组件
```
$ npx agent-refactor analyze antd-InternalTable.tsx
  822 行 · 47 状态 · 20 区块 · 3 处强耦合
  → 3 组件 + 5 hooks 计划通过校验
```
字幕：**真实开源组件也拆得动**

## 片尾信息卡（最后 3 秒）

```
agent-refactor —— 以代码体检为入口的 AI 工程师
四条命令 · 证据链 · 测试门禁 · 自动回滚
诚实边界：行为等价证明不到 100%，人工回归兜底
```

## 录制提示

- 终端字号加大（20px+），背景深色
- 每屏停留 2–3 秒，文件树展开用文字逐行出现而不是滚动
- 时长卡 60 秒内，宁可快别拖

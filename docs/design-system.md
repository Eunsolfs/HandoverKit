# 易交接 —— 设计系统（v1）

> 气质：医疗/后勤场景的「可信、干净、克制」。参考瑞士现代主义网格 + 柔和医疗配色；拒绝霓虹色、重动效、AI 紫粉渐变。

## 1. 品牌与色彩

| 语义 | 浅色 | 深色 | 用途 |
| --- | --- | --- | --- |
| primary | teal-600 `#0d9488` | teal-400 `#2dd4bf` | 主按钮、选中态、品牌 |
| primary-foreground | `#f0fdfa` | `#042f2e` | 主色上的文字 |
| accent | emerald-600 `#059669` | emerald-400 `#34d399` | 成功、已接收、正向数据 |
| background | `#f8fafc`（微冷白） | `#0c1116` | 页面底色 |
| card | `#ffffff` | `#121a20` | 卡片/面板 |
| foreground | `#0f172a` | `#e6edf3` | 正文 |
| muted-foreground | `#64748b` | `#94a3b8` | 次要文字（对比度 ≥4.5:1） |
| border | `#e2e8f0` | `rgb(255 255 255 / 10%)` | 分隔线 |
| destructive | `#dc2626` | `#f87171` | 危险操作 |
| warning | amber-500 `#f59e0b` | amber-400 | 低库存、待审批 |
| info | sky-600 `#0284c7` | sky-400 | 提示 |

用 oklch 写入 `packages/ui/src/styles/globals.css` 的 `:root` 与 `.dark`，保留 shadcn 语义变量名；chart-1..5 用 teal→emerald→sky→amber→rose 的序列，保证图表区分度。

## 2. 字体与排版

- 拉丁/数字：Geist Variable（已内置）；中文：`"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC"` 回退。
- 字号：12 / 14 / 16 / 18 / 20 / 24 / 30 / 36；正文 14–16，表格 13–14，页面标题 24–30（`tracking-tight`）。
- 数字使用 `tabular-nums`；库存、数量右对齐。
- 行高：正文 1.6；标题 1.2。

## 3. 布局

- 应用外壳：桌面左侧边栏 248px（Logo、主导航、底部用户/主题）；顶栏 56px（面包屑/页面标题、团队切换、快捷操作）；内容区 `max-w-[1200px]`，页面内边距 24–32。
- 移动端（<1024px）：侧边栏收进抽屉；底部不放 tab bar，扫码页使用单列卡片；触控目标 ≥44px。
- 栅格：12 列，间距 16/24；卡片圆角 `--radius: 0.75rem`（12px），页面区块间距 24。
- 阴影克制：卡片默认 `shadow-xs` + 边框；浮层 `shadow-lg`。

## 4. 组件与状态

- 基础：shadcn（Button/Card/Input/Label/Checkbox/Dialog/Select/Table/DropdownMenu/Sonner/Badge/Tabs/Tooltip）。
- 业务组件：StatusBadge（待接收/已接收/已交班/已撤销/待审批/已解决）、StatCard、PageHeader、EmptyState、ConfirmDialog、DataTable + Pagination、DateRangeFilter、ItemPicker（从仓库选择，禁止手输）、QuantityStepper、PatientFields、QrPanel。
- 状态完备：每个列表具备加载骨架、空状态（含下一步引导）、错误态（重试）；表单内联错误；提交按钮 loading/disabled；操作成功 toast。
- 图标：lucide-react，统一 `size-4`/`size-5`，禁止 emoji 作为结构图标。
- 动效：150–250ms ease-out；尊重 `prefers-reduced-motion`；不做页面级复杂编排。

## 5. 关键页面模式

| 页面 | 模式 |
| --- | --- |
| 登录 | 左品牌区（浅 teal 底 + 几何装饰）右表单卡；验证码点击刷新；错误内联；演示账号提示仅开发环境 |
| 工作台 | 顶部问候 + 当日交接状态主卡；4 个指标卡；快捷操作（接班核对/用物登记/交班表）；低库存与待审批提醒 |
| 交接记录 | 周期切换（日/周/月/年）+ 状态筛选 + 表格；详情两栏（左清单，右侧验收/交班信息与操作） |
| 扫码页 | 移动优先：事项名 + 日期 + 状态；三个 Tabs；物品清单用卡片行，步进器调数量；固定底部主按钮 |
| 统计 | 周期切换 + 4 指标卡 + 趋势图 + 物品排行 + 明细表 |
| 管理表格 | 工具栏（搜索/筛选/新建）+ 表格 + 分页；行内操作收敛到 DropdownMenu |

## 6. 无障碍与验收

- 所有交互可键盘操作，焦点可见（`ring-2`）。
- 表单 label 与 input 关联；错误用 `aria-describedby`。
- 深浅色分别检查对比度：正文 ≥4.5:1，次要文字 ≥3:1。
- 图标按钮必须有 `aria-label`；状态不能只靠颜色表达（配文字/图标）。
- 375px 宽度无横向滚动；表格在移动端改为卡片列表。

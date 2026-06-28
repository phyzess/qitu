# UI 与设计系统

Status: accepted baseline
Date: 2026-06-28

## 1. 目标

`qitu` 应提供严肃、现代、适合内部系统的视觉基线，而不是通用 admin template。

UI 气质：

1. 安静。
2. 信息密度高但可读。
3. 快。
4. 可审计。
5. 适合重复工作。
6. 现代，但没有装饰噪音。

## 2. 技术基线

```text
React
shadcn/ui Base UI
Tailwind
Extend UI for file/import/review surfaces
visx-only chart primitives
```

## 3. Package 分层

```text
packages/ui
packages/design-system
packages/charts
```

`packages/ui` 负责：

1. App shell。
2. Topbar 一级导航和二级 route tabs。
3. Command/search 入口、theme 控件和 user trigger/panel。
4. Layout。
5. Forms。
6. Tables。
7. Modals。
8. Review surfaces。
9. Timeline components。

`packages/design-system` 负责：

1. Color tokens。
2. Typography tokens。
3. Spacing。
4. Shadows。
5. Motion。
6. Radius。
7. Theme variables。

`packages/charts` 负责：

1. Time series。
2. Bar chart。
3. Donut chart。
4. Scatter/compare chart。
5. Tooltip、legend、crosshair。

## 4. 设计规则

1. 内部工具不做 landing page，首屏就是工作界面。
2. 使用紧凑 page header。
3. 多用色阶和克制 shadow，少用过多线条。
4. card 要浅、少、目的明确。
5. 不把 card 套在 card 里。
6. toolbar、grid、counter、tile、chart shell 使用稳定尺寸。
7. 字号不随 viewport width 缩放。
8. 指标数字使用 tabular numbers。
9. chart engine 只在 `@qitu/charts` 内部暴露，业务页面不直接依赖 chart engine。

有登录态的 app shell 必须是可访问的真实路由，而不是单个 stateful demo screen。基线路由：

```text
/login
/overview
/sources
/imports
/reviews
/audit
/users
/account
```

未登录、已登录、admin-only、not-found、loading、empty、error 状态要保持同一套视觉语言。账号入口属于 authenticated topbar，退出登录属于从该入口打开的 user panel；用户管理应该由 RBAC 保护，而不是只存在于测试代码里。

Shell 交互规则：

1. 一级导航只把现有 route 归并到少量业务中立分组。
2. 当前一级分组的子路由显示在 topbar 的二级导航行。
3. 一级导航可以在 session storage 中记住每个分组最近访问的子 route，但只存 route id。
4. Topbar command search 必须是可用的 `Cmd/Ctrl+K` 控件，可搜索 route 与 app-owned 数据投影。
5. 登录后的账号入口打开 user panel，包含 profile、RBAC role、允许时的 user management 入口、theme 切换与 logout。
6. Theme 切换由 tokens 驱动，支持 light、dark、system，不改变 reusable package 的业务语义。
7. 桌面端 route navigation 不使用侧边栏或 side rail；drawer 只作为紧凑或移动端 disclosure pattern。
8. 桌面端一级导航采用 oodon system shape：纯 icon main route buttons、克制 active underline，然后是 divider 与相邻 active/hover live label。
9. 空间受限时，一级导航保持纯 icon，并可以隐藏相邻 live label。
10. 二级 route tab 使用 text-only，并通过 active underline 表达当前页。
11. 搜索入口放在 topbar action cluster：紧凑宽度用纯 icon，宽屏用 icon + text + shortcut。
12. Theme 使用纯 icon 控件。人员 trigger 是身份入口，例如 avatar/initial + chevron；具体用户动作属于 panel 内。

视觉提取规则：

1. qitu 保留自己的 business-neutral token 名称和组件契约。
2. oodon 作为非业务视觉层参考：OKLCH 紫灰中性色、紧凑控件、柔和 chroma 状态色、细线与克制阴影。
3. 主表面使用共享层级 tokens：`--surface-panel`、`--surface-row`、`--surface-row-hover`、`--surface-row-active`、`--surface-field` 与 `--popover`；app 页面不应硬编码 RGB overlay 或一次性 surface 色值。
4. 控件遵循 28/32/36px 尺度，使用 `--radius-control` 与共享 focus ring。
5. shadow 主要留给 overlay 或 active affordance；普通 card 用 surface tone + 单条细线表达层级。
6. Icon chip、avatar/initial trigger、form field、list action、table cell、overlay backdrop 应使用 `packages/ui` 的共享 utility，而不是页面内临时 Tailwind recipe。

Surface 层级规则：

1. App background 使用 `--bg` 与 `--app-bg-gradient`；topbar 使用 `--topbar-bg`，不添加底部分割线或阴影。
2. 普通页面 panel 使用 `.qitu-surface`：`--surface-panel`、`--surface-panel-border` 与轻微 inset highlight。
3. 内嵌 metric、list row、guardrail、timeline item、data state 使用 `.qitu-surface-subtle`：`--surface-row` 与 `--surface-row-border`。
4. Hover 的内嵌 row 升到 `--surface-row-hover`；选中或 active row 升到 `--surface-row-active` 并使用 `--shadow-active-ring`。
5. Form control 与只读 field 使用 `--input-bg`、`--input-border`、`--surface-row` 与 `--shadow-focus-ring`；不要在页面内临时发明 field 背景。
6. Review table cell 与 list row 使用同一 row surface。表格结构靠 spacing 和 radius，不使用局部 shadow。
7. Search dialog、popover、user panel 额外加 `.qitu-overlay-surface`，使用 `--popover` 与 `--shadow-overlay`；普通页面 panel 不使用 overlay shadow。
8. 层级使用 `--z-shell`、`--z-shell-front`、`--z-overlay-backdrop` 与 `--z-overlay`，不使用页面级 z-index 数字。

控件精修规则：

1. Topbar actions 共用 36px control track。搜索在紧凑宽度下是纯 icon，宽屏下是 icon + 可截断 label + 20px keyboard shortcut。
2. Keyboard shortcut chip 使用共享 kbd 样式：20px 高、10px mono 字体、tabular numbers、`--radius-control` 和 tonal surface 背景。
3. Refresh、theme 这类重复工具使用纯 icon button。含义不能只靠 icon 清楚表达的命令，才使用 text + icon。
4. 登录后的 user trigger 是 36px 身份控件，包含 32px avatar/initial 与 chevron；具体用户动作留在 panel 内。
5. Form input 和 select 使用 32px control height、`--radius-control`、`--input-bg`、`--input-border`、紧凑 control 字体和共享 focus ring。
6. Account/runtime 的只读行使用共享 label/value field grid，而不是页面内临时 flex row。value 必须稳定截断、对齐，并在适合时使用 tabular number。

Oodon parity 规则：

1. qitu design tokens 先镜像 oodon 的 semantic color tree，再暴露 `--bg`、`--text`、`--line`、`--surface` 等 qitu 兼容别名。
2. Topbar 一级导航使用 oodon 的 icon-button route controls，并保留 divider 与 live label。不要把 route text 放进一级 button。
3. 普通 panel 通过 `--surface-panel`、`--surface-row` 与 `--surface-row-active` 做 oodon 式 tone separation；除非表达 overlay 或 active state，否则不要使用页面级 border 或 shadow。
4. Topbar active indicator 使用与 oodon 相同的 chroma token，不引入页面级 underline 色值。
5. Topbar 不画底部分割线；内容区分依靠 spacing 和 surface tone。

## 5. 字体方向

默认 token：

```text
--font-ui
--font-doc
--font-reading
--font-number
--font-mono
```

建议：

1. UI：MiSans 或系统 CJK sans fallback。
2. 正式文档：Noto Serif SC。
3. 阅读模板：可选 LXGW WenKai Screen。
4. 数字：UI font + Fira Code fallback。
5. Mono：Fira Code。

## 6. Review 页面模式

每个 review 页面应包含：

1. Source summary。
2. Parser/rule version。
3. Timeline。
4. Staged data summary。
5. Issues and conflicts。
6. Primary decision actions。
7. Audit preview。
8. 有权限时可访问 raw file。

viewer 投影：

1. 状态摘要。
2. 时间线摘要。
3. 不展示 raw file。
4. 不展示敏感 review detail。
5. 不展示敏感 parsed rows。

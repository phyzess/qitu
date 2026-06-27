# UI 与设计系统

Status: draft  
Date: 2026-06-27

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
2. 导航。
3. Layout。
4. Forms。
5. Tables。
6. Modals。
7. Review surfaces。
8. Timeline components。

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

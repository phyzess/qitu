# UI 组件来源台账

状态：accepted baseline  
日期：2026-07-10

这个台账记录 `@qitu/ui` shared primitives 的来源和合规状态，防止页面里重新手写“长得像 shadcn”的控件。

## 规则

1. Registry-backed primitives 通过根目录 shadcn workflow 安装或刷新，写入目标是 `packages/ui/components.json`。
2. 直接 `@base-ui/react` import 只允许出现在 `packages/ui` 的 registry-backed primitive 内，或作为迁移债记录在本文件。
3. App 页面只消费 `@qitu/ui`，不能直接 import Base UI，也不能用 page-local Tailwind recipe 复刻通用控件。
4. qitu compositions 应基于 registry-backed primitive，保持命名、props 和文案 business-neutral。
5. bespoke primitive 需要 decision-log 说明为什么 registry 和现有 qitu composition 不够用。
6. `AlertDialog`、`Calendar`、`Command`、`Dialog`、`DropdownMenu`、`Select` 等 registry-backed primitive 可以保留
   facade 文件，同时把 `react-day-picker` class map / parts、cmdk dialog/input/list/item wiring，或
   Base UI root/content/layout/action、trigger/content/item wiring、submenu、choice item 等实现拆入
   package-internal modules；对外 `@qitu/ui` export seam 必须保持稳定。
7. `InputGroup` 等 registry-pattern composition 也可以保留 facade 文件，同时把 group container、addon
   alignment、button size adapter 和 input/textarea control adapter 拆入 package-internal modules。
8. `UploadQueue` 等 qitu layout composition 可以保留 facade 文件，同时把 public types、dropzone root、
   empty/compact state 和 row/action rendering 拆入 package-internal modules。
9. `Table` 等 registry-pattern primitive 可以保留 facade 文件，同时把 scroll-area contract、table
   sections 和 cell/head/caption wrappers 拆入 package-internal modules。

## 当前来源

| 类别             | Primitives                                                                                                                                                  | 来源                                                                  | 状态      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- |
| Registry-backed  | AlertDialog, Button, Calendar, Checkbox, Command, Dialog, Drawer, DropdownMenu, Input, Popover, RadioGroup, Select, Separator, Sheet, Table, Tabs, Textarea | shadcn/Base UI registry、`react-day-picker`、`cmdk`、`vaul`           | Compliant |
| Registry pattern | Badge, Card, InputGroup                                                                                                                                     | shadcn registry pattern                                               | Compliant |
| qitu composition | ConfirmDialog, DateField, DetailDrawer, Menu, SegmentedControl, StatusBadge, TableScrollArea                                                                | 组合现有 shadcn/qitu primitives                                       | Compliant |
| qitu layout      | BatchActionBar, DataToolbar, FilterBar, ListFrame, ListActionRow, UploadQueue, WorkbenchPage, WorkbenchGrid, ContextPanel                                   | qitu token、semantic layout 与 shared responsive contract             | Compliant |
| qitu-specific    | AnimatedIcon, App shell, Qitu mark, Surface/DataState/Timeline/MetricStrip                                                                                  | accessible business-neutral shell、workbench 与 grouped icon registry | Compliant |

## 交互与本地化契约

1. `AppShell` 负责 skip navigation、可选 route-heading label、document-title update，以及真实
   `contentKey` 变化后的 focus transfer。First mount 不抢占 main content focus；link wrapper 保留
   modified-click、external-target 与 download 的浏览器原生行为。
2. `Calendar` 继续以 registry component 为 backing。Qitu wrapper 增加 locale-code seam，用于 month
   rendering 与 day metadata；`DateField` 从 app-owned dictionary 接收 localized full-date day name
   与显式 month/year dropdown label。
3. `WorkbenchPage`、`WorkbenchGrid`、`ContextPanel` 是 layout composition，不是业务 page template。
   `context`、`context-wide`、`data` 与 `split` variants 在 shared 1180px breakpoint 变成单列。
4. Shared motion 必须遵守 `prefers-reduced-motion`；需要 motion 时优先使用 opacity 或 transform，
   也不能只靠动画传递状态。

## 相邻 Chart Layer

App 页面会同时消费 `@qitu/ui` 与 `@qitu/charts`，因此 chart layer 也记录在本来源台账中。

| Surface                 | 文件                                                                            | 来源                                 | Shared contract                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| TimeSeriesChart         | `packages/charts/src/time-series-chart.tsx`                                     | qitu facade 后的 visx scale/shape    | Responsive width、pointer inspection、Arrow/Home/End/Escape keyboard inspection、live text announcement、app-owned labels |
| BarChart                | `packages/charts/src/bar-chart.tsx`                                             | qitu facade 后的 visx scale/shape    | Horizontal/vertical layout、focusable marks、pointer/focus tooltip、可选 interactive legend                               |
| DonutChart              | `packages/charts/src/donut-chart.tsx`                                           | qitu facade 后的 visx shape          | Focusable segments、pointer/focus tooltip、可选 interactive legend、total summary                                         |
| Chart interaction/style | `packages/charts/src/chart-interaction.tsx` 与 `packages/charts/src/styles.css` | qitu composition 与 canonical tokens | Native legend buttons、合法 list semantics、focus ring、package-owned tooltip/legend styles、reduced-motion fallback      |

Chart label、tooltip copy、announcement 与业务解释都属于 app-owned input。Application 不能直接
import `@visx/*`，也不能复制 chart interaction CSS。

## 维护规则

1. 刷新或新增 shared primitive 时，同步更新本台账，并保持 `vp run smoke` 通过。
2. 当 app 页面需要通用交互或布局 primitive 时，先补到这里，不要让 page-local lookalike 成为默认路径。
3. Calendar label 与 chart interaction props 属于 accessibility input。新增 locale 或 chart surface
   时必须提供有意义的 app-owned copy，并保持 keyboard/browser checks 通过。

# Dashboard collection

Chart polish: Analytics and Finance reuse `ChartTooltipContent` with a local rounded overlay, aligned tabular values, and readable series labels. Pointer interaction does not draw a plot outline; keyboard focus appears around the chart frame, and arrow-key inspection remains available. Desktop and 390px mobile chart states were inspected, with captures named `polish-*` in `.impeccable/review/dashboards`. This is a local refinement, not a replacement design system.

Six interactive dashboard examples plus a seventh Orders classic list extend Kernel’s Operations desk at `/dashboards`. Run `pnpm dev`, then open [the collection](http://127.0.0.1:3000/dashboards).

| Example | Fragment | Try it |
| --- | --- | --- |
| Analytics | `/dashboards#analytics` | Change metric/date range and export the chart series as CSV. |
| Sales CRM | `/dashboards#sales` | Search deals, switch pipeline/list, inspect a deal, and change its stage. |
| Commerce | `/dashboards#commerce` | Search/filter orders, select records, and mark them shipped. |
| Finance | `/dashboards#finance` | Filter transactions beside cash flow and category budgets. |
| Projects | `/dashboards#projects` | Filter by assignee, switch board/list, and update task status. |
| Support | `/dashboards#support` | Search/filter conversations, resolve/reopen tickets, and add demo replies. |
| Orders | `/dashboards#orders` | Search/filter and sort orders, select page rows, inspect/update records, create an order, and paginate. CSV export is implemented; download verification is pending. |

All people, values, and records are fictional. Changes are session-only React state: they survive switching examples but reset on reload or leaving and remounting the route. Replies are not sent, and no authentication or business-data access is required by the collection. Some overview metrics are illustrative summaries rather than totals of the small sample lists. Orders starts with 24 separate synthetic records; it does not share the Commerce example’s data.

The route is defined in [`src/routes/dashboards.tsx`](../src/routes/dashboards.tsx); the original six examples and their sample data share [`src/components/dashboard-gallery.tsx`](../src/components/dashboard-gallery.tsx). The seventh example and its independent sample data live in [`src/components/dashboard-orders.tsx`](../src/components/dashboard-orders.tsx). Styles are scoped to the collection in [`src/styles.css`](../src/styles.css), after the `Dashboard collection` comment, using existing Button, Badge, ToggleGroup, input, and chart components. Local design variants are recorded in the [surface brief](../.impeccable/surfaces/src-components-dashboard-gallery-tsx.md); the global Operations desk system remains unchanged.

Historical validation for the original six examples: TypeScript and production build passed; browser checks exercised the core workflows and verified no document-level horizontal overflow across all six examples. The visual reviewer returned **ship** from 13 desktop/mobile captures in `.impeccable/review/dashboards`. Below-fold mobile visual coverage was limited. To repeat static/build checks, run `pnpm typecheck` and `pnpm build`.

Orders extension validation: TypeScript and production build passed. Browser checks exercised search, filters, sorting, page selection, row actions, order creation, and pagination; the CSV download was not verified. Five additional captures in `.impeccable/review/dashboards` cover Orders desktop/mobile, the desktop row menu, mobile creation, and mobile pagination (`orders-desktop.png`, `orders-mobile.png`, `orders-menu-desktop.png`, `orders-create-mobile.png`, `orders-pagination-mobile.png`). A general reviewer substituting for the finish reviewer returned **ship** for Orders after reviewing all five captures, with no material fixes. This is separate from the original six-example ship disposition.

On the checked 375px mobile viewport, outer boxes were contained and the 1000px table used its horizontal scroll region. The root still reported `scrollWidth: 963` while the body measured 375px; the gallery-specific body `overflow-x: clip` rule prevents visible root horizontal scrolling. This is not evidence that root scroll width equals viewport width. The Orders reference page’s content was inspected, but its visual browser navigation timed out.

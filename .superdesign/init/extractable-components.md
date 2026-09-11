# Extractable components

What is worth lifting into reusable Superdesign `DraftComponent` entities.
This codebase puts identity in CSS classes rather than components, so the
list is short by design: buttons, chips and cards are a `className`, not a
component, and belong inline in drafts.

## Layout — on most pages

## AppShell
- Source: `web/src/components/layout/shell.tsx` (344 ln)
- Category: layout
- Description: top bar — logo, 9 nav pills, live-shift ticker, search, key badge, eye toggle, avatar menu
- Extractable props: activeItem (string, default "dashboard"), liveAmount (string, default ""), liveRunning (boolean, default false), amountsHidden (boolean, default false)
- Hardcoded: the nine labels and their icons, the «S» mark, all CSS

## NextShell
- Source: `app/src/routes/_app.tsx` (~120 ln)
- Category: layout
- Description: the second front's top bar — same nine destinations, Radix + lucide
- Extractable props: activeItem (string, default "/")
- Hardcoded: nav labels, icons, the «S» mark

## PhoneTabBar
- Source: `mobile/src/components/tab-bar.tsx`
- Category: layout
- Description: six tabs with a spring-animated pill behind the active one
- Extractable props: activeIndex (number, default 0)
- Hardcoded: six labels, six icons

## Basic — repeated UI patterns

## Tile
- Source: `web/src/components/dashboard/tiles.tsx` (1101 ln) — the `Tile` wrapper plus 22 tile bodies
- Category: basic
- Description: one figure with a label above, a hint below, an icon; the dashboard's atom
- Extractable props: label (string), value (string), hint (string), tone (string, default ""), icon (string)
- Hardcoded: `.tile` / `.tile-label` / `.tile-value` CSS, tabular-nums
- Note: this is the single most-repeated unit in the product — 22 on the dashboard alone, and near-identical `Kpi`/`Hero`/`Big` variants exist on `/stats`, `/report` and `/wrapped`. **Unifying those four is the highest-value structural win of the redesign.**

## Panel
- Source: `app/src/components/ui/panel.tsx`, and `.panel-head` in web `globals.css`
- Category: basic
- Description: card with a title, a hint line, and content — the wrapper around every chart
- Extractable props: title (string), hint (string)

## Empty
- Source: `web/src/components/ui/empty.tsx` (45 ln)
- Category: basic
- Description: what a tab says before it has anything to say — icon disc, title, one line, one action
- Extractable props: icon (string), title (string), body (string), actionLabel (string), actionHref (string)

## DayPanel
- Source: `web/src/components/dashboard/day-panel.tsx` (1474 ln)
- Category: basic
- Description: the right-hand column of the dashboard — one day: shifts, non-working states, tips, colour, note, events
- Note: the largest file in the product and the screen the owner named first. Worth extracting despite the size, because every redesign decision about density shows here first.

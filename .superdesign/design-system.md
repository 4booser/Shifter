# Shifter — design system

## Product context

Shifter counts shift work properly. The people using it are bartenders,
cooks, waiters, hosts — hospitality, Ukraine and the Russian-speaking
diaspora, mostly on a phone, often standing up, often at 2am after a shift.
They are the weak side of every negotiation about their own pay, and the
product's entire reason to exist is to put a number on their side of the
table that they can show somebody.

That sets the tone more than any adjective would: **this is a document, not a
dashboard.** A payslip, a record, a receipt — something you hand to a manager
when you disagree about what you are owed. It has to look like it is telling
the truth.

### Jobs to be done

1. Put a shift in the calendar in one tap and know what it will pay.
2. Watch a running shift count itself, with the phone in a pocket.
3. Know what is owed, by whom, and how late it is.
4. Show somebody a record — an employer, a landlord, a bank.
5. Find extra work when the month is short.

### Key screens, in the order they matter

| | |
|---|---|
| **Calendar + day panel** | the home screen; month grid, 22-tile overview strip, one day open on the right. The owner named this first. |
| **Stats** | what the month came to, what it is made of, how it compares |
| **Payouts** | what is owed and how late |
| **Report / payslip / CV** | the printable, showable documents |
| **Bank** | the other side of the same number — what actually arrived |
| **Rota / gigs** | other people: who is on, and where the extra work is |

### Product principles that constrain design

- **The shared rota never shows anybody's wage.** Who is on, when — never how much.
- **The bank token never leaves the browser.** The server never sees a statement.
- **No forecasts the data cannot carry.** A rate needs an hour under it; a colour is a claim about a number's sign.

## Where the current design stands

Not a blank slate. Ten themes, ~60 component classes, a user-chosen accent
written onto the root at runtime, contrast reasoned about in comments, chart
series validated against colourblind separation. The bones are good.

Three things are worth naming as the redesign's real targets:

**1. One typeface doing every job.** Inter, everywhere, on all three
clients. It is the safe default and it makes a document about somebody's
year read like a settings page. Nothing else in the system is generic — the
warm paper ground, the ten palettes, the tabular figures are all choices.
The type is the one place no choice was made.

**2. Thirty-seven chart shapes.** The web front defines `AreaChart`,
`ColumnChart`, `Donut`, `Heatmap`, `HourDial`, `ClockRing`, `ProgressRing`,
`MoneyFlow`, `MonthBars`, `PunchcardChart`, `RankBars`, `TipWeek`,
`TrendLine`, `WaterfallChart`, `WeekBandsChart`, `Plot`, `DaysAtGlance`
plus a parallel bank family. **`/stats` alone speaks nine of those dialects**,
and five shapes — `HourDial`, `PunchcardChart`, `TipWeek`, `WaterfallChart`,
`DaysAtGlance` — are drawn by nobody. On one screen: horizontal bars with a
decorative left-to-right gradient, plain vertical columns, stacked columns, a
punchcard, a three-series line, and a donut. Six grammars, one question.
The second front answers the same questions with **four** — `Climb`, `Bars`,
`Split`, `Panel` — and reads better for it.

**3. Four names for one tile.** `Tile` (dashboard), `Kpi` (stats), `Hero`
(report), `Big` (wrapped) are the same object — a figure, a label above, a
hint below, sometimes a delta. Four implementations that drift apart: the
one on `/report` learned to colour by sign; the others had to be taught
separately, one bug at a time.

### What must not change

- Tokens stay CSS variables on `documentElement`; the accent arrives from JS.
- `tabular-nums` on every figure that sits in a column.
- The ten themes and the user's sliders (radius, font size, density, motion).
- Status colour (good / danger / warn) stays a separate axis from series colour.
- Every number keeps its locale: «9,5 ч», «₴221 380», «−156 ₴» with a real minus.

## The two directions to compare

Both must obey the token contract above. They differ in identity, not in
plumbing.

### A — «Ведомость» (the ledger)

The document thesis taken seriously. A record that a manager cannot argue
with. Reference points: a wage book, a till receipt, a printed timesheet —
not a fintech dashboard.

- **Type**: a real display face for figures and headings with actual
  character (a grotesque with tight apertures, or a condensed sans that can
  set «₴221 380» big without shouting), Inter kept for body and UI. The
  figure is the hero of every screen, so the figure gets the typeface.
- **Structure**: rules, not cards. Horizontal hairlines separating rows the
  way a ledger does; the card reserved for things that genuinely are objects
  (a day, a gig, a place). Less floating, more page.
- **Charts**: one family. A bar, a line, a split. Everything else becomes one
  of those three or stops being a chart and becomes a number with a word.
- **Signature**: the running-shift ticker as a live line of the ledger —
  the figure incrementing in place, in the document's own type, not a widget
  bolted to the nav.

### B — «Смена» (the shift)

Built from the thing itself rather than from documents: the night, the
hours, the clock. Warmer, more physical, more of the 2am in it.

- **Type**: a display face with warmth and a little eccentricity for
  headings and big figures; body stays quiet.
- **Structure**: time as the organising axis. The day panel as a vertical
  strip of hours rather than a list of rows; the month as a field of nights;
  night hours carried by ground rather than by a badge.
- **Charts**: still one family, but time-first — the same bar/line/split,
  with the hour and the day as first-class axes instead of a category list.
- **Signature**: the day's colour. The app already lets a person paint a day;
  in this direction that paint becomes the page's own weather rather than a
  dot in a corner.

## Motion

`--motion` is a user slider and `data-motion="reduced"` turns everything off.
Enter transitions 140–220ms on `cubic-bezier(.2,.7,.3,1)`. Numbers roll
(`NumberFlow`) rather than swap. Nothing loops. Nothing moves on scroll that
did not need to.

## Round 3 — «Стекло» (Liquid Glass), the direction this round follows

The owner asked for it in so many words: glass on the whole screen and on
every screen, as elaborate as it can be made, with many small details, with
charts that are pleasant and not crooked, and with no holes or seams. This
section overrides A and B above for the four screens in this round
(`/bank`, `/stats`, `/wrapped`, `/schedule`). The product principles and the
token contract still stand; nothing below may break them.

### The thesis

The page is a sheet of glass laid over a lit room. The room is a colour field
made from the user's own accent and the theme ground; the glass panes sit on
it and refract it. Every number lives on a pane, every chart is drawn on a
pane, the navigation is a floating pane. The eye reads depth first, content
second — and the content is dense, exact and tabular, so the depth never
reads as decoration.

### The material — exact CSS, not adjectives

Scene (behind everything, `position: fixed`, `inset: 0`, `z-index: -1`):

    ground     background: var(--bg)
    orb 1      radial 55vw circle at 12% 8%,  color-mix(in oklab, var(--accent) 42%, transparent) → transparent 70%
    orb 2      radial 45vw circle at 88% 22%, color-mix(in oklab, var(--s3) 26%, transparent)    → transparent 70%
    orb 3      radial 50vw circle at 55% 96%, color-mix(in oklab, var(--s2) 16%, transparent)    → transparent 70%
    grain      optional 3% noise via an SVG feTurbulence data: URI, never a bitmap

The orbs do not move. On dark grounds (`dark night ocean plum gradient`) the
same three orbs at 1.4× the alpha; `ocean` and `plum` keep their own hue
because `--accent` and `--s*` already shift there.

Pane (`.glass`) — the one card of this round:

    background       color-mix(in srgb, var(--surface) 64%, transparent)
    backdrop-filter  blur(18px) saturate(140%)
    border           1px solid color-mix(in srgb, var(--border) 72%, transparent)
    box-shadow       inset 0 1px 0 rgb(255 255 255 / 55%),   /* the top-edge highlight */
                     0 14px 44px -20px rgb(28 27 24 / 28%)
    border-radius    var(--radius-card)

Dark grounds: surface at 56%, highlight `rgb(255 255 255 / 12%)`, shadow
`rgb(0 0 0 / 55%)`.

Thick pane (`.glass-hero`, one per screen): surface 76%, blur 28px, plus a
specular sheen — `::before` with a radial at 18% 0% of `rgb(255 255 255 / 34%)`
fading out by 42%, `mix-blend-mode: soft-light` on dark.

Well (`.glass-well`, the inset that charts and tables sit in):

    background   color-mix(in srgb, var(--surface-2) 58%, transparent)
    box-shadow   inset 0 1px 2px rgb(28 27 24 / 8%)
    radius       calc(var(--radius-card) - 8px)   /* the pane keeps 14–18px of padding; this is the nearest
                                                    concentric radius that still reads as a rounded well */

Controls (`.glass-pill`, segments, buttons, the nav): capsule, surface 70%,
blur 12px, the same 1px top highlight; the active segment is a solid
`var(--accent)` with `var(--accent-ink)` text — an active control is never
glass, so it can be told from its neighbours at a glance.

Depth order, fixed: ground → orbs → panes → wells → controls → tooltips.
A pane never sits directly on a pane; between them there is always a well.
Radii step down from pane to well to control; a well's radius is the pane's
radius minus 8px.

Readability floor: body text on a pane must measure ≥ 4.5:1 over the busiest
orb. Where a pane lies over orb 1, its surface opacity goes to 78%. Figures
are `var(--text)`; hints are `var(--faint)`; nothing is set in the accent
except one figure per screen and the active control.

`[data-glass='off']` (an existing user switch) turns every pane into a plain
`var(--surface)` card with `var(--shadow)` — the layout must survive that.

### Type, colour, numbers — unchanged contract

Inter only. Hero figure 2.6rem/800/−0.03em, tile figure 1.5rem/800, table
figure 0.95rem/600, all `tabular-nums`. `--accent` arrives from JS; series
are `--s1…--s5` by entity; `good/danger/warn` are status and never a series.
Locale stays: «₴21 572,88», «9,5 ч», «−720 ₴» with a real minus. No hex
literals in a draft outside `:root`.

### Charts on glass — one family

- Line: 2px `var(--accent)` with a soft glow (`drop-shadow(0 0 6px
  color-mix(in srgb, var(--accent) 45%, transparent))`); area fill is a
  vertical gradient accent 26% → 0; the last point gets a 6px dot with a 2px
  surface ring and a direct label; a dashed continuation is only ever drawn
  from recorded pace, and never when fewer than five records exist.
- Bars: 4px radius at the data end only, 2px surface gap between segments,
  weekend bars tinted `var(--surface-2)` under the fill, max bar direct-labelled.
- Rings: 10px stroke, track `var(--border)` at 60%, fill accent; the number
  sits inside in the tile figure size. A clock is 24 segments of 15°, each
  coloured by its hour's step — never a single progress arc.
- Heat cells: 5-step accent ramp (`--heat-1…--heat-5`, mixed from the accent
  and `--surface-2`, never opacity), 18px cells on a 22px pitch that never
  stretch, seven rows (a week has seven days), a hollow cell for a day
  without a record — a sparse year keeps its cell size and its month labels
  stay on the grid. The legend names the steps in money and counts the days.
- Grid: hairlines `var(--border)` at 50%, never more than four, on one
  linear scale per axis with the coordinates computed from the numbers; axis
  labels 11.5px `var(--faint)`; a legend with coloured swatches whenever
  there are two series; no dual axes anywhere; tooltips are small panes
  (`.tip`) with a 1px highlight; opacity is never a second value channel.
- A chart with one point draws the point and says so in words under it.

### «Мелкие детали» — the detail budget, and what a detail is allowed to be

Every pane carries: a title, a one-line hint under it, one control or one
figure on the right, and a footer fact in `--faint` («по 13 записанным
дням», «без записей — понедельники»). A footer fact is taken from the data,
never invented: no «обновлено 16:05» unless the data carries a timestamp. Tiles carry a delta chip and a seven-point
sparkline in a well. Tables carry unit captions in the header, right-aligned
tabular figures, hairline rows, and a totals row on a thicker hairline. Charts
carry tick rulers, a today marker, the max and the last value labelled.
People carry a colour dot, initials in a ring, a trainee mark, an hours count.

A detail is information or it is cut. No sparkline without data behind it, no
badge without a state, no icon without a noun.

### No holes — the layout law

A 12-column grid, `gap: 16px`. Legal rows: 12 · 8+4 · 6+6 · 4+4+4 · 3+3+3+3 ·
2×6. Every row fills all twelve columns, and every pane in a row is stretched
to the row's height (`align-items: stretch`; content inside uses
`flex-direction: column` with the footer pushed down by `margin-top: auto`).
A pane with nothing to show does not exist as a box: it collapses to a
one-line strip in the footer of the pane above it («Отпуск: пока ничего не
просили · Попросить»). A grid of N items picks a column count that divides N,
or the tail is filled with a ghost pane that names the next thing («следующая
награда — Сотня, 100 смен»).

### Sparse data — the owner's own account

The owner has four months of records and half of September. Every screen is
designed twice: with the dense demo, and with three shifts — and the sparse
form is written on the page itself, in a closing pane «Как экран ведёт себя
на трёх сменах», one line per pane, plus what each row does when a
neighbour collapses. On
three shifts: tiles show «—» and say why in the hint; the year heat keeps its
cell size; a one-point line is a dot; forecasts are absent, not zero; the
weekday table lists only days that have a record; the awards grid shows the
earned ones first and the ghost names the nearest.

### Navigation, unchanged

The top bar is the same nine items in the same order («Календарь График
Подработки Выплаты Банк Статистика Помощник Твой год Ваш послужной список»),
the S mark at the left, search ⌘K · eye · account at the right, and the demo
banner above it when the account is a demo. It becomes a floating glass
capsule with the active item solid accent. Nothing is added to it.

### Motion

One orchestrated page-load: panes rise 12px and fade in over 220ms on
`cubic-bezier(.2,.7,.3,1)`, staggered 30ms in reading order. Numbers roll
once. Charts draw once. Hover answers the pointer on charts and rows only.
`data-motion="reduced"` turns all of it off.

### The four screens — what each one is

**/bank** (reference: the Shakuro finance dashboard, frames on the canvas).
Taken from it: the bank card as an object (a glass card with the account's
last four digits, the balance on it, the accent as its tint); a row of quick
actions under it (Обновить · Догрузить · Заморозить · Отключить) as icon
pills; the weekly stacked bars with a hover tooltip; the category list with a
per-category share bar; the transaction list with a glyph per category; the
segmented period control. Not taken: the sidebar (Shifter has a top bar), the
upgrade box, avatars, and every number in the shot.

    [ Банк · сентябрь 2026 ◂ ▸ ................................. Выгрузить выписку ]
    [ card object + quick actions (4) | Хватит на — half ring (2) | Обычный день (2) | Ближайшие деньги (2) | Ушло (2) ]
    [ До следующих денег — forecast line + upcoming list (8)   | Приходит само — subscriptions (4) ]
    [ Куда уходит — category rows (8)                          | Куда делся месяц — donut + legend (4) ]
    [ Месяц по дням — 30 bars (6)                              | Пришло против ушло — paired bars (6) ]
    [ Темп — this vs last month (6)                            | Состав трат по месяцам — stacked (6) ]
    [ Куда ходите (4) | Сколько платит час (4) | Цена закрытия (4) ]
    [ Рабочие дни против выходных (4) | Форма трат (4) | Против прошлого месяца (4) ]
    [ Сами операции — grouped by day, glyph · name · category chip · time · amount, search + seg (12) ]

**/stats**

    [ Статистика · period seg · from/to ..................... Отчёт Сравнить PNG Сторис XLSX ]
    [ six tiles, sparkline + delta each (2×6) ]
    [ Заработано за период — line with pace (8) | Цель ring (4, top) / Ваш час mini-line (4, bottom) ]
    [ Год в квадратах (12) ]
    [ Как собрались деньги — one bar, deductions under it (8) | Чаевые нал/карта · Лучший день · Надбавки (4, three strips) ]
    [ Круглые сутки — clock ring + 4 strips (6) | Дни недели — table with seg Деньги/Часы/Ставка (6) ]
    [ Двенадцать месяцев — stacked rows (8) | Что кормит месяц — shift table (4) ]
    [ Дозаполнить (6) | Ночи между сменами (6) ]
    [ Места бок о бок — table (12) ]

**/wrapped**

    [ Твой год · Посмотреть карточками · Скачать постер ..................... ◂ 2026 ▸ ]
    [ HERO thick pane: ghost «2026», title («Железная смена»), the figure, four band cells (12) ]
    [ Месяц за месяцем — ranked rows with last-year tick (8) | Из чего сложился год — bar + legend + deductions (4) ]
    [ Форма года — heat with month labels on the grid (12) ]
    [ Ваш год словами — the paragraph (8) | Куда идёт год — pace (4) ]
    [ Рекорды года — 2×4 tiles with glyphs (8) | Что стоила работа + Посчитано, но не в руках (4, stacked) ]
    [ Ритм недели — seg + 7 rows (6) | Награды — 4×5 with the ghost «следующая» (6) ]

**/schedule** — the rota is the hero, not a strip between settings.

    [ Сентябрь 2026 · seg График/Планирование ....... По людям/По сменам · Неделя/Месяц · Картинка · Сегодня ◂ ▸ ]
    [ Сейчас на смене — live rows with a progress ring and «ещё 1 ч 13 мин» (8) | Внимание — chips: дни без людей, только новички, короткий перерыв (4) ]
    [ ROTA BOARD (12): a thick pane. Header = day number + weekday letter, weekends tinted, today a solid accent column,
      days with nobody hatched. One row per person: colour dot, initials ring, name, 🎓 for a trainee, hours at the right.
      Cells = glass pills with the shift glyph and «08–16»; «ты» row pinned first. Footer row = how many are on, per day. ]
    [ Общак (4) | Передача смены + стоп-лист (4) | Обмены + Отпуск (4) ]   ← equal height; an empty one is a one-line strip
    [ Вы в этом графике — name, colour, three switches (6) | Кто делится заработком — bars, only for those who opted in (6) ]

The rota board never shows money. Only «Кто делится заработком» does, and
only for members who switched sharing on.

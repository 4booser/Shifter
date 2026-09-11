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

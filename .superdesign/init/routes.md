# Routes — Shifter

Three clients, one product. The web front is what ships at shifter.ink; the
second front is being built beside it at `/next`; the phone is Expo Router.

## web/ — Next.js 15 App Router, static export

Shell: `web/src/components/layout/shell.tsx` wraps every signed-in page —
top nav (9 pills), live-shift ticker in the bar, search, eye (hide amounts),
avatar menu. `src/app/layout.tsx` is the root: stamps theme before paint,
mounts `Boot`.

| path | file | what it renders |
|---|---|---|
| `/` | `app/page.tsx` | signed in → redirect to `/dashboard`; signed out → `components/landing/landing.tsx` |
| `/dashboard` | `app/dashboard/page.tsx` | **the main screen.** 22-tile overview strip, month grid, right sidebar with the day panel, insight ticker |
| `/stats` | `app/stats/page.tsx` (1319 ln) | month/year KPIs, earned-over-period climb, what-the-money-is-made-of split, weekday bars, zones, what-if sliders |
| `/report` | `app/report/page.tsx` | printable month/year report: 6 heroes, week-shape heatmap, year shape, day-by-day table, tax regime |
| `/payouts` | `app/payouts/page.tsx` | next money, waiting total, period rows with status, what-a-period-comes-to bars |
| `/bank` | `app/bank/page.tsx` | monobank token → statement, balance curve, runway, spending, work-costs |
| `/schedule` | `app/schedule/page.tsx` (912 ln) | shared rota, week grid, covers, manager planner |
| `/team` | `app/team/page.tsx` | crew, invite code, join/create |
| `/gigs` | `app/gigs/page.tsx` (1319 ln) | the board: 36 role chips, filters, gig cards, my listings, my replies, people |
| `/wrapped` | `app/wrapped/page.tsx` | the year as a poster: hero, 12 months, records, story cards |
| `/compare` | `app/compare/page.tsx` | two periods side by side, cumulative climb, fact table |
| `/assistant` | `app/assistant/page.tsx` | ask-about-your-months chat + raise-conversation composer + period-in-words |
| `/cv` | `app/cv/page.tsx` | the record: months in the trade, month-by-month table, roles, private chronicle |
| `/payslip` | `app/payslip/page.tsx` | a period's payslip, printable |
| `/contract` | `app/contract/page.tsx` | contract terms reader |
| `/account` | `app/account/page.tsx` (940 ln) | settings: look, money, calendar, account, password, 2FA, sessions |
| `/webhooks` | `app/webhooks/page.tsx` | outgoing webhooks |
| `/status` | `app/status/page.tsx` | public uptime |
| `/roadmap` | `app/roadmap/page.tsx` | public, what shipped / building / queued |
| `/whats-new` | `app/whats-new/page.tsx` | changelog |
| `/login` `/register` `/reset` | | auth, centred card on `.auth-scene` |
| `/join` | `app/join/page.tsx` | crew invite landing |
| `not-found.tsx` | | 404 in the app's own skin |

Server-rendered, outside Next entirely:

| path | file | note |
|---|---|---|
| `/c/{slug}` | `server/.../ShareController.cs` `Card` | **public CV card** — a stranger's view, hand-written HTML+CSS, no client |
| `/g/{slug}` | `server/.../ShareController.cs` `Preview` | **public gig preview** — og: tags for chat unfurls |

## app/ — Vite + TanStack Router, ships to /next

Shell: `src/routes/_app.tsx` — 9 nav pills, same product, different code.
Radix primitives, lucide icons, `cn()` from tailwind-merge.

| path | file |
|---|---|
| `/next/` | `routes/_app/index.tsx` → `screens/dashboard.tsx` — calendar + tiles + day panel |
| `/next/shifts` | `screens/shifts.tsx` — templates |
| `/next/places` | `screens/places.tsx` — venues and their pay rules |
| `/next/schedule` | `screens/schedule.tsx` — rota |
| `/next/gigs` | `screens/gigs.tsx` |
| `/next/payouts` | `screens/payouts.tsx` |
| `/next/bank` | `screens/bank.tsx` |
| `/next/stats` | `screens/stats.tsx` |
| `/next/wrapped` | `screens/wrapped.tsx` |
| `/next/account` | `screens/account.tsx` |
| `/next/sign-in` | `routes/sign-in.tsx` |

## mobile/ — Expo Router

Six tabs (`(tabs)/_layout.tsx`, custom `components/tab-bar.tsx` with a
spring-animated pill): Календарь, График, Подработки, Выплаты, Банк,
Статистика. Plus ~24 stacked screens: `live`, `day/[date]`, `templates`,
`places`, `costs`, `crew`, `board`, `create-gig`, `my-listings`, `report`,
`year`, `compare`, `assistant`, `contract`, `payslip`, `record`, `search`,
`import`, `import-ics`, `settings`, `settings-alerts`, `settings-data`,
`settings-keys`, `login`.

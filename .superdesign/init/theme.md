# Theme — Shifter

Three clients share one visual idea and three implementations of it.

## Part 1 — Compact token summary

### The shape of the system

Tailwind supplies layout utilities; identity lives in CSS variables. Every
theme redefines the same dozen names, so no component knows which palette is
active. The accent is written onto the root element from JS at runtime,
because the user picks it freely from a 15-swatch palette — a component can
never hardcode it.

`bindSettingsToDocument()` (web `src/lib/settings/store.ts`, app
`app/src/lib/settings/store.ts`) stamps on `document.documentElement`:

| written | from | note |
|---|---|---|
| `lang` | settings.language | ru / uk / en |
| `data-theme` | settings.theme | 10 values, below |
| `data-density` | comfortable \| compact | |
| `data-motion` | full \| reduced | |
| `data-weekends` | on \| off | calendar tint |
| `data-glass` | on \| off | |
| `--accent`, `--accent-hover`, `--accent-ink`, `--ring`, `--accent-soft` | settings.accent | derived by `lighten`/`readable`/`hexToRgba` |
| `--radius`, `--radius-lg` | settings.roundness | slider, 12px default |
| `--font-size` | settings.fontScale | slider, 15px default |
| `--motion` | settings.motionSpeed | 0 when reduced |

### Palette — light (`:root`, "paper")

    --bg          #f4f2ed   warm paper ground
    --surface     #fdfcfa   card
    --surface-2   #f1efe9   inset panel
    --border      #e2ded4
    --border-strong #c9c4b6
    --text        #1c1b18   ink
    --muted       #6d6a61
    --faint       #6b675b   hints — 4.5:1 against the warmest inset, deliberately
    --accent      #4f46e5   first-paint fallback only; JS overwrites
    --danger      #c73e4e     --danger-soft  rgb(199 62 78 / 10%)
    --good        #1b7f4d     --good-soft    rgb(27 127 77 / 10%)
    --warn        #a16207     --warn-soft    rgb(161 98 7 / 12%)
    --shadow      0 1px 2px rgb(28 27 24/5%), 0 8px 24px -12px rgb(28 27 24/12%)

### Palette — dark family (`dark`, `night`, `ocean`, `plum`, `gradient`)

    --accent      #8b8ef7   a light-theme indigo read 2.6:1 here; this is the fix
    --text        #eceef2     --muted #9aa0ac     --faint #888e99
    --danger      #f07884     --good  #52c98a     --warn  #e0a63c

### All ten grounds

| theme | --bg | --surface | --surface-2 | --border |
|---|---|---|---|---|
| paper (`:root`) | `#f4f2ed` | `#fdfcfa` | `#f1efe9` | `#e2ded4` |
| grey | `#eef0f2` | `#fafbfc` | `#eef0f2` | `#dcdfe3` |
| sand | `#f3ead9` | `#fdf8ee` | `#f2ebdb` | `#e4d9c0` |
| mint | `#e9f1ec` | `#f9fcfa` | `#eaf2ed` | `#d6e2da` |
| dark | `#17181c` | `#1f2126` | `#26282e` | `#30333b` |
| night | `#0b0c10` | `#14151a` | `#1b1d23` | `#26282f` |
| ocean | `#0a1420` | `#101d2c` | `#162536` | `#223447` |
| plum | `#150f1d` | `#1e1729` | `#261e33` | `#362c46` |
| gradient | `#0b0c10` | `#14151a` | `#1b1d23` | `#26282f` |
| system | follows `prefers-color-scheme` onto paper or dark | | | |

### Chart series — validated against the dataviz six checks

    light   --s1 #2a78d6   --s2 #eb6834   --s3 #1baf7a   --s4 #b5449c   --s5 #7a8f2e
    dark    --s1 #3987e5   --s2 #d95926   --s3 #199e70   --s4 #c25bab   --s5 #7f9433
    --heat  var(--accent)

Slots are assigned by entity, never by rank. Status colour (`good`/`danger`/
`warn`) is a separate axis and never doubles as a series.

### Type

**One typeface across the whole product: Inter**, loaded via
`next/font/google` as `--font-inter`, subsets latin + cyrillic. Everything
else is weight and size:

    body        var(--font-size) = 15px, line-height 1.55
    .tile-value ~1.6rem, 800, letter-spacing -0.02em, tabular-nums
    .tile-label 0.7rem, 600, uppercase, letter-spacing 0.04em, muted
    .field-hint 0.82rem, --faint
    .field-label 0.78rem, 600, muted
    headings    -0.02em tracking, 700–900

`.tabular` (font-variant-numeric: tabular-nums) is applied to every figure
that sits in a column. Money, hours and counts are always tabular.

### Radius / spacing / motion

    --radius     12px (user slider, 4–20)
    --radius-lg  radius + 4
    cards        var(--radius-card) = radius + 6
    gaps         Tailwind scale; cards gap-3, sections gap-4/5
    --motion     1 (user slider); 0 when "less motion" is on
    transitions  140–220ms, cubic-bezier(.2,.7,.3,1) for enter

### Component classes (web `globals.css`, ~60)

    .card .cards .cards-tight .tile .tile-label .tile-value .panel-head
    .btn .btn-primary .btn-quiet .btn-danger .btn-warn .btn-sm .btn-armed
    .field-input .field-label .field-hint .chip .chip-accent .chip-good
    .chip-danger .chip-warn .seg .seg-btn .nav-pill .badge-card .insight
    .goal-bar .donut-arc .ring-track .ring-fill .chart-grow .draw-line
    .skeleton .shimmer .toast .toast-stack .tour-card .palette .swatch
    .reveal .rise .pop .lift .tilt .glow .fade-in .cell-in .page-enter
    .auth-scene .deck .done-scene .live-dot .confetti-piece .landing-marquee

### The second front (`app/`, served at /next)

`app/src/index.css`, 450 lines. Same idea, fewer themes, different names:
`--ink` instead of `--text`, `--surface-2`, `--accent-foreground`. Uses
`radix-ui` primitives + `lucide-react` icons + `tailwind-merge`'s `cn()`,
none of which exist on the web front. This divergence is real and is one of
the things a shared redesign would close.

### The phone (`mobile/`)

`mobile/src/constants/theme.ts` — a plain TS object, two palettes only:

    light  text #26221a  textSecondary #6f6a5e  background #f6f1e7
           backgroundElement #fdfaf3  backgroundSelected #efe8d8
           border #e4dcc9  accent #4f46e5  accentSoft rgba(79,70,229,.10)
           good #177a4b  danger #b3372f
    dark   text #ece9e2  textSecondary #a09b8f  background #16140f
           backgroundElement #1f1c15  backgroundSelected #2a2619
           border #332f22  accent #7b7ef5  accentSoft rgba(123,126,245,.14)
           good #4fc98d  danger #e06a63

Note the phone's ground is warmer and browner (`#f6f1e7` / `#16140f`) than
the web's paper (`#f4f2ed` / `#17181c`), and it has no user-chosen accent, no
ten themes, and no density/roundness/font-size sliders. Styling is
`StyleSheet.create` inside a `makeStyles(palette)` factory per file, plus
NativeWind for a few utilities. Charts are Skia (`@shopify/react-native-skia`
+ `victory-native`).

## Part 2 — Raw sources

See, in the repo:

- `web/src/app/globals.css` — 1686 lines, the whole system
- `app/src/index.css` — 450 lines, the second front
- `mobile/src/constants/theme.ts` — 52 lines
- `mobile/global.css` — 33 lines, NativeWind entry

No `tailwind.config.*` on any front: all three are Tailwind v4, configured
in CSS via `@theme inline` (web `globals.css:214`).

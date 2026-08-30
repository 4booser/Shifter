/**
 * The performance budget, enforced where it is spent.
 *
 * Every exported page lists the scripts it loads; this sums their raw bytes
 * and fails the build when a page grows past its allowance. The numbers are
 * deliberately snug — about 15% over today's heaviest — so a stray library
 * import shows up as a red build instead of as a slower phone.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'out');

// Bytes of JavaScript each page may load: today's weight plus 15%. There is
// no default on purpose — a new page fails until somebody grants it a line
// here, which is the moment its weight becomes a decision.
const BUDGETS = {
  '404': 542_720,
  'account': 1_096_704,
  'assistant': 1_063_936,
  'bank': 1_325_056,
  'compare': 1_074_176,
  'contract': 1_057_792,
  'cv': 1_060_864,
  'dashboard': 1_511_424,
  'gigs': 1_114_112,
  'index': 1_035_264,
  'join': 957_440,
  'login': 980_992,
  'payouts': 1_130_496,
  'payslip': 1_059_840,
  'register': 980_992,
  'report': 1_114_112,
  'reset': 966_656,
  'roadmap': 567_296,
  'schedule': 1_147_904,
  'stats': 1_181_696,
  'status': 968_704,
  'team': 1_063_936,
  'webhooks': 1_073_152,
  'whats-new': 1_057_792,
  'wrapped': 1_103_872,
};

const failures = [];
const rows = [];

for (const file of readdirSync(OUT)) {
  if (!file.endsWith('.html')) continue;

  const name = file.replace(/\.html$/, '');
  const html = readFileSync(path.join(OUT, file), 'utf8');
  const sources = [...new Set([...html.matchAll(/src="(\/_next\/[^"]+\.js)"/g)].map((m) => m[1]))];

  let total = 0;

  for (const source of sources) {
    total += statSync(path.join(OUT, source)).size;
  }

  const budget = BUDGETS[name];

  if (budget === undefined) {
    failures.push(`${name}: new page — grant it a budget line in scripts/budget.mjs`);
    continue;
  }

  rows.push({ page: name, kb: Math.round(total / 1024), budget: Math.round(budget / 1024) });

  if (total > budget) failures.push(`${name}: ${Math.round(total / 1024)} kB > ${Math.round(budget / 1024)} kB`);
}

rows.sort((a, b) => b.kb - a.kb);
for (const row of rows.slice(0, 8)) {
  console.log(`${String(row.kb).padStart(5)} kB / ${row.budget} kB  ${row.page}`);
}

if (failures.length > 0) {
  console.error('\nOver budget:\n' + failures.join('\n'));
  process.exit(1);
}

console.log(`\nAll ${rows.length} pages within budget.`);

import { chromium } from '@playwright/test';
const shot = '/private/tmp/claude-501/-Users-abooser-Documents-repos-Shifter/594825d7-ad3e-4f83-8b27-d2f1105ca36d/scratchpad';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 180)));
for (const [path, name] of [['/', 'm-calendar'], ['/payouts', 'm-payouts'], ['/schedule', 'm-schedule'], ['/bank', 'm-bank']]) {
  await p.goto(`http://localhost:5300${path}`);
  await p.waitForTimeout(1400);
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(name.padEnd(13), wide ? `OVERFLOW ${sw}px` : 'ok');
  await p.screenshot({ path: `${shot}/${name}.png`, fullPage: true });
}
await b.close();

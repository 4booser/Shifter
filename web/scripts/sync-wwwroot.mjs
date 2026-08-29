// Copies the static export into the API's wwwroot, replacing what was there.
// A script rather than a shell line so it works the same on the Windows
// machines `dotnet publish` sometimes runs on.
import { cpSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, 'out');
const wwwroot = path.join(path.dirname(root), 'server', 'wwwroot');

if (!existsSync(out)) {
  console.error('No out/ directory — did `next build` run?');
  process.exit(1);
}

rmSync(wwwroot, { recursive: true, force: true });
cpSync(out, wwwroot, { recursive: true });

// The service worker's death certificate: every deploy stamps a fresh build
// id into its cache names, so the previous worker's caches are swept on the
// first activation. An unstamped worker is exactly the one that survived
// three deploys.
const sw = path.join(wwwroot, 'sw.js');

if (existsSync(sw)) {
  const stamp = Date.now().toString(36);

  writeFileSync(sw, readFileSync(sw, 'utf8').replaceAll('__BUILD__', stamp));
  console.log(`Stamped sw.js with build ${stamp}`);
}

console.log(`Copied ${out} -> ${wwwroot}`);

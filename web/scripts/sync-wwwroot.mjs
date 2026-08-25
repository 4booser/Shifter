// Copies the static export into the API's wwwroot, replacing what was there.
// A script rather than a shell line so it works the same on the Windows
// machines `dotnet publish` sometimes runs on.
import { cpSync, rmSync, existsSync } from 'node:fs';
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
console.log(`Copied ${out} -> ${wwwroot}`);

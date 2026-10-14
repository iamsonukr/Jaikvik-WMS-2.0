import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const standalone = path.join(root, '.next', 'standalone');

// Next.js traces server dependencies but leaves static assets out of standalone.
// Run after each successful build so the server serves assets from that build.
await access(path.join(standalone, 'server.js'));
await mkdir(path.join(standalone, '.next'), { recursive: true });
await cp(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });

const publicDir = path.join(root, 'public');
await mkdir(path.join(standalone, 'public'), { recursive: true });
let hasPublic = true;
try {
  await access(publicDir);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  hasPublic = false;
}
if (hasPublic) await cp(publicDir, path.join(standalone, 'public'), { recursive: true });
console.log('Standalone server packaged with CSS, JavaScript and public assets.');

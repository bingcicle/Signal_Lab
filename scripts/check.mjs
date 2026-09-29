import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
let count = 0;
for (const directory of ['src', 'scripts', 'test']) {
  for (const file of await readdir(new URL(`${directory}/`, root))) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    const path = fileURLToPath(new URL(`${directory}/${file}`, root));
    const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
    count++;
  }
}
console.log(`Syntax checked: ${count} JavaScript files.`);

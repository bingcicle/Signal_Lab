import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'src', 'assets']) {
  await cp(new URL(file, root), new URL(file, output), { recursive: true });
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Static build ready in dist/. No compilation or dependencies required.');

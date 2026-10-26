import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = {};
async function include(relative) {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('caption-') || ['capture-note.txt', 'walkthrough-frames.txt'].includes(entry.name)) continue;
    if (entry.isDirectory()) await include(`${relative}/${entry.name}`);
    else if (entry.isFile()) await add(`${relative}/${entry.name}`);
  }
}
async function add(relative) {
  files[`scadlatch/${relative}`] = new Uint8Array(await readFile(join(root, relative)));
}
// Explicit public-source allowlist: no runtime, cache, credentials, git history,
// installed packages, or unrelated parent-workspace research enters the archive.
for (const directory of ['src', 'public', 'examples', 'docs', 'scripts']) await include(directory);
for (const filename of ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts',
  'index.html', '.gitignore', 'README.md', 'README.zh-CN.md', 'LICENSE',
  'THIRD_PARTY_NOTICES.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'engine-notes.md']) await add(filename);
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const directory = join(root, '.cache', 'releases');
await mkdir(directory, { recursive: true });
const output = join(directory, `scadlatch-${version}.zip`);
const archive = zipSync(files, { level: 6 });
await writeFile(output, archive);
console.log(JSON.stringify({ output, files: Object.keys(files).length, bytes: archive.length }));

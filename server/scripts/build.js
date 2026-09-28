import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const targets = [
  'config',
  'controllers',
  'middlewares',
  'models',
  'routes',
  'scripts',
  'src',
  'tests',
  'utils',
  'validators',
];

function collect(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collect(full));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      files.push(full);
    }
  }

  return files;
}

const files = [];

for (const target of targets) {
  const full = join(root, target);
  try {
    if (statSync(full).isDirectory()) files.push(...collect(full));
  } catch {
    continue;
  }
}

const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({ file: relative(root, file), message: (result.stderr || '').trim() });
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure.file}\n${failure.message}\n`);
  }
  console.error(`build failed: ${failures.length} of ${files.length} file(s) have syntax errors`);
  process.exit(1);
}

console.log(`build ok: verified ${files.length} file(s)`);

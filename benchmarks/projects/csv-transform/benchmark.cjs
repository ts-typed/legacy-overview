'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = __dirname;
const count = Number(process.argv[2] ?? 10_000);
const results = ['baseline', 'typed'].map((mode) => {
  const entry = path.join(root, mode === 'baseline' ? 'dist-baseline' : 'dist', 'benchmark.js');
  const output = spawnSync(process.execPath, [entry, String(count)], { cwd: root, encoding: 'utf8' });
  if (output.status !== 0) throw new Error(output.stderr || `CSV ${mode} benchmark failed`);
  return { mode, ...JSON.parse(output.stdout) };
});
process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);

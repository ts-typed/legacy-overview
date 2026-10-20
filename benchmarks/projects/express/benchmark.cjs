'use strict';

const { spawn } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const path = require('node:path');

const SAMPLE_COUNT = 7;
const WARMUP_COUNT = 2;
const COUNTS = [1, 50, 10_000];
const root = __dirname;

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  return { samples: sorted.length, median: sorted[Math.floor(sorted.length / 2)], mean: sorted.reduce((a, b) => a + b, 0) / sorted.length };
}

async function start(mode) {
  const entry = path.join(root, mode === 'baseline' ? 'dist-baseline' : 'dist', 'server.js');
  const child = spawn(process.execPath, [entry], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  const port = await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      output += chunk.toString();
      const match = output.match(/READY (\d+)/);
      if (match) resolve(Number(match[1]));
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Express ${mode} exited before ready (${code})`)));
  });
  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function measure(mode, count, optimized) {
  const server = await start(mode);
  const url = `${server.baseUrl}/${optimized ? 'users-optimized' : 'users'}?count=${count}`;
  const request = async () => {
    const response = await fetch(url);
    if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (body.length !== count || Object.hasOwn(body[0], 'passwordHash')) throw new Error('invalid response invariant');
  };
  for (let i = 0; i < WARMUP_COUNT; i += 1) await request();
  const samples = [];
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const started = performance.now();
    await request();
    samples.push(performance.now() - started);
  }
  server.child.kill('SIGTERM');
  await new Promise((resolve) => server.child.once('exit', resolve));
  return { mode, optimized, count, ...summarize(samples) };
}

(async () => {
  const results = [];
  for (const mode of ['baseline', 'typed']) for (const count of COUNTS) results.push(await measure(mode, count, false));
  for (const count of COUNTS) results.push(await measure('typed', count, true));
  process.stdout.write(`${JSON.stringify({ node: process.version, results }, null, 2)}\n`);
})().catch((error) => { process.stderr.write(`${error.stack ?? error}\n`); process.exitCode = 1; });

import { performance } from 'node:perf_hooks';
import { convertCsv, createCsv } from './converter';

const count = Number(process.argv[2] ?? 10_000);
const csv = createCsv(count, 0);
const warmup = 2;
const samples = 7;
for (let index = 0; index < warmup; index += 1) convertCsv(csv);
const durations: number[] = [];
for (let index = 0; index < samples; index += 1) {
  const started = performance.now();
  const result = convertCsv(csv);
  if (result.rows.length !== count || result.rejected !== 0) throw new Error('CSV invariant failed');
  durations.push(performance.now() - started);
}
durations.sort((left, right) => left - right);
process.stdout.write(`${JSON.stringify({ node: process.version, count, samples, medianMilliseconds: durations[Math.floor(samples / 2)], meanMilliseconds: durations.reduce((a, b) => a + b, 0) / samples })}\n`);

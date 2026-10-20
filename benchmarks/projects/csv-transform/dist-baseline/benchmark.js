"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_perf_hooks_1 = require("node:perf_hooks");
const converter_1 = require("./converter");
const count = Number(process.argv[2] ?? 10_000);
const csv = (0, converter_1.createCsv)(count, 0);
const warmup = 2;
const samples = 7;
for (let index = 0; index < warmup; index += 1)
    (0, converter_1.convertCsv)(csv);
const durations = [];
for (let index = 0; index < samples; index += 1) {
    const started = node_perf_hooks_1.performance.now();
    const result = (0, converter_1.convertCsv)(csv);
    if (result.rows.length !== count || result.rejected !== 0)
        throw new Error('CSV invariant failed');
    durations.push(node_perf_hooks_1.performance.now() - started);
}
durations.sort((left, right) => left - right);
process.stdout.write(`${JSON.stringify({ node: process.version, count, samples, medianMilliseconds: durations[Math.floor(samples / 2)], meanMilliseconds: durations.reduce((a, b) => a + b, 0) / samples })}\n`);
//# sourceMappingURL=benchmark.js.map
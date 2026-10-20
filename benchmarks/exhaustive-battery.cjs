'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const projects = [
  { name: 'express', directory: path.join(root, 'projects', 'express'), benchmark: ['npm', 'run', 'benchmark'] },
  { name: 'csv-1k', directory: path.join(root, 'projects', 'csv-transform'), benchmark: ['npm', 'run', 'benchmark', '--', '1000'] },
  { name: 'csv-10k', directory: path.join(root, 'projects', 'csv-transform'), benchmark: ['npm', 'run', 'benchmark', '--', '10000'] },
  { name: 'csv-50k', directory: path.join(root, 'projects', 'csv-transform'), benchmark: ['npm', 'run', 'benchmark', '--', '50000'] },
];

function run(command, args, directory) {
  const output = execFileSync(command, args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return output.trim();
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  projects: [],
};

for (const project of projects) {
  run('npm', ['test'], project.directory);
  const output = run(project.benchmark[0], project.benchmark.slice(1), project.directory);
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) throw new Error(`Benchmark ${project.name} did not return JSON`);
  report.projects.push({ name: project.name, benchmark: JSON.parse(output.slice(jsonStart)) });
}

const destination = process.env.TS_TYPED_BATTERY_REPORT;
if (destination !== undefined) {
  fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

# ts-typed performance battery

This standalone harness measures runtime validation and HTTP response costs for
the published `@ts-typed/compiler` and `@ts-typed/nestjs` packages. It is not
part of either published package and is intentionally excluded from their test
suites.

```bash
cd benchmarks/performance
npm install
npm run benchmark
```

To save machine-readable output, invoke the benchmark directly (the `npm run`
header would otherwise precede the JSON):

```bash
node benchmark.cjs > performance-report.json
```

The benchmark creates 10,000 TypeORM entities in an in-memory SQLite database,
projects each entity into a response without `passwordHash`, and compares
baseline and protected paths in Express and NestJS. It also measures primitive,
object, and array validation without HTTP.

The generated JSON is a local measurement, not a cross-machine SLA. See
[`docs/performance.md`](../../docs/performance.md) for methodology, reference
results, limitations, and interpretation.

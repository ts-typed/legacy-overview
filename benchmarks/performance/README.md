# ts-typed performance battery

This standalone harness measures runtime validation and HTTP response costs for
the compiler working tree and the published Nest integration. It is not part of
either package and is intentionally excluded from their test suites.

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
projects each entity into a response without `passwordHash`, and compares the
baseline, normal `protectValue`, and `TTOptImmut` (`protectOptimizedImmutableValue`)
paths in Express and NestJS. It measures batches of 1, 50, and 10,000 items,
plus primitive, object, and array validation without HTTP. Every HTTP response
is checked for the requested size and for absence of `passwordHash`.

The generated JSON is a local measurement, not a cross-machine SLA. See
[`docs/performance.md`](../../docs/performance.md) for methodology, reference
results, limitations, and interpretation.

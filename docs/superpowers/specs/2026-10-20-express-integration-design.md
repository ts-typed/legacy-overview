# Design: Express integration package

## Goal

Add a first-class Express integration package, published as `@ts-typed/express`, that translates `StrictTypeError` instances produced by `@ts-typed/compiler` into safe HTTP responses without coupling the compiler to Express.

## Repository and package boundary

- Create the public repository `ts-typed/express`.
- Add it to this repository as `system/frameworks/express` using the existing Git submodule pattern.
- Use `@ts-typed/compiler` as a runtime dependency.
- Use Express and its type declarations as peer/dev dependencies; support Express 4 and 5 on Node 18+.
- Keep all Express-specific code outside `@ts-typed/compiler`.

## Public API

```ts
import { typedErrorHandler } from '@ts-typed/express';

app.use('/users', usersRouter);
app.use(typedErrorHandler());
```

`typedErrorHandler(options?)` returns a standard four-argument Express error middleware. It handles `StrictTypeError` and `AggregateStrictTypeError`, and calls `next(error)` for unrelated errors.

Options will allow an application to configure the response shape and logging hook without exposing raw values or stack traces by default.

## Error mapping

- Client-facing violations return HTTP 400 unless a `TypeErrorResponse` status overrides them.
- Server-populated values and return/resolve violations return HTTP 500 unless an explicit response status overrides them.
- Aggregate violations preserve the safe diagnostic list in the response.
- Responses include safe diagnostic metadata (`code`, `propertyPath`, `expected`, `received`, `contractKind`, and `operation`) but never the received raw value or stack trace.
- Non-`StrictTypeError` errors are delegated to the next Express error handler.

## Verification

The package must include:

- unit tests for status mapping, safe response serialization, aggregates, custom response status/message, and delegation;
- an integration test using an Express app and `supertest`-style HTTP assertions;
- `typecheck`, `build`, `test`, and `npm pack --dry-run` CI checks;
- a release workflow that publishes from `main` using the repository `NPM_TOKEN` secret.

## Documentation

The README will document installation, middleware order, default responses, custom options, error delegation, and a complete DTO example. The root README and docs usage guide will link to the new package after the submodule is added.

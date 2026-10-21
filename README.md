# ts-typed

`ts-typed` adds runtime checks to materializable TypeScript contracts. The compiler validates explicit and inferred contracts at supported variables, fields, parameters, returns and expressions, then reports protected, partial, unsupported and intentionally open points.

This repository holds the project's specification, architecture notes and usage docs. The code lives in its own repositories, one per published package:

- [`ts-typed/ts-typed`](https://github.com/ts-typed/ts-typed) ([npm](https://www.npmjs.com/package/@ts-typed/core)) — core compiler, CLI and runtime (`@ts-typed/core`, works with any TypeScript project, no framework required). **[Full documentation](https://github.com/ts-typed/ts-typed#readme)**: configuration reference, every decorator, supported language features, the `StrictTypeError` shape, known limitations.
- [`ts-typed/nestjs`](https://github.com/ts-typed/nestjs) ([npm](https://www.npmjs.com/package/@ts-typed/nestjs)) — NestJS integration (`@ts-typed/nestjs`): project resolution adapter, `StrictTypeErrorFilter`, `StrictTypeHttpError`. **[Full documentation](https://github.com/ts-typed/nestjs#readme)**: how the 400/500 status is decided, `ServerPopulated()`/`TypeErrorResponse()` usage, building a custom filter.
- [`ts-typed/express`](https://github.com/ts-typed/express) ([npm](https://www.npmjs.com/package/@ts-typed/express)) — Express integration (`@ts-typed/express`): `typedErrorHandler()` middleware, safe 400/500 mapping, aggregate error responses and custom response hooks. **[Full documentation](https://github.com/ts-typed/express#readme)**.
- [`ts-typed/validators`](https://github.com/ts-typed/validators) ([npm](https://www.npmjs.com/package/@ts-typed/validators)) — document/data validators (`@ts-typed/validators`) built on `@ts-typed/core`'s `ValueObject`: Brazil-specific (`CPF`, `CNPJ`, `PIS`/`Pasep`/`Nis`/`Nit`, `CEP`, `Placa`, `CNH`, via `@ts-typed/validators/br`) and global (`FullName`, `Email`, `CreditCard`, via `@ts-typed/validators/global`). **[Full documentation](https://github.com/ts-typed/validators#readme)**.

**[ts-typed.com](https://ts-typed.com)** has the full documentation site (English/Portuguese), with in-depth guides and examples for every package — source in [`ts-typed/ts-typed.com`](https://github.com/ts-typed/ts-typed.com).

## Quickstart

```bash
npm install --save-dev @ts-typed/core
npx ts-typed init
npx ts-typed build
```

`init` creates `typets.config.json` without replacing an existing file. See [`@ts-typed/core`'s README](https://github.com/ts-typed/ts-typed#readme) for the full configuration reference, and [`@ts-typed/nestjs`'s README](https://github.com/ts-typed/nestjs#readme) for the NestJS integration (`StrictTypeErrorFilter`, per-field custom error messages, Entity-vs-DTO disambiguation).

## TypeScript to JavaScript

You write the type and ts-typed guarantees that it is applied.

```ts
interface User {
  id: number;
  name: string;
}

function loadUser(user: User) {
  return findUserById(user.id);
}
```

With `tsc`, interfaces disappear:

```js
function loadUser(user) {
  return findUserById(user.id);
}
```

With `ts-typed`, the generated JavaScript keeps the contract at the boundary:

```js
function loadUser(user) {
  if (typeof user.name !== 'string') {
    throw new StrictTypeError('user.name');
  }
  if (typeof user.id !== 'number') {
    throw new StrictTypeError('user.id');
  }
  return findUserById(user.id);
}
```

The generated snippet is simplified for readability; the compiler emits the runtime schema and protection code automatically.

## Compatibility

The project preserves application compatibility when JavaScript cannot completely intercept a mutation, particularly external aliases, dynamic code and unsupported built-ins. These cases are warnings by default rather than hidden successes. `any`, `unknown`, and declarations without an annotation or initializer remain explicitly open and are listed separately in coverage output. Both package READMEs have a "Known limitations" section listing every current scope boundary and why it exists.

Background docs, kept for historical/design context: [full specification](docs/SPEC.md), [architecture](docs/architecture.md), [quick-start guide](docs/usage/quickstart.md), [performance notes and the reproducible Express/Nest/TypeORM battery](docs/performance.md). The two package READMEs above are the up-to-date, maintained reference for what's actually supported today — check those first.

## License

Apache-2.0 permits commercial use, modification, redistribution and sale. Redistributed copies and derivatives must retain the applicable license and notice requirements. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

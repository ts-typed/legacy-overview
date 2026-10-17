# ts-typed

`ts-typed` adds runtime checks to materializable TypeScript contracts. The compiler validates explicit and inferred contracts at supported variables, fields, parameters, returns and expressions, then reports protected, partial, unsupported and intentionally open points.

This repository holds the project's specification, architecture notes and usage docs. The code lives in its own repositories, one per published package:

- [`ts-typed/compiler`](https://github.com/ts-typed/compiler) — core compiler, CLI and runtime (`@ts-typed/compiler`, works with any TypeScript project, no framework required).
- [`ts-typed/nestjs`](https://github.com/ts-typed/nestjs) — NestJS integration (`@ts-typed/nestjs`): project resolution adapter and `StrictTypeError` HTTP exception filter.

## Install and build

```bash
npm install --save-dev @ts-typed/compiler
npx ts-typed init
npx ts-typed build
```

`init` creates `typets.config.json` without replacing an existing file. The default configuration enables ncc bundling and prints localized warnings for contracts that cannot receive complete runtime protection. Set `compiler.onUnsupported` to `"error"` to fail the build when such a contract is found.

```json
{
  "$schema": "./node_modules/@ts-typed/compiler/schema.json",
  "integration": "typescript",
  "entry": "src/main.ts",
  "tsconfig": "tsconfig.json",
  "outDir": "dist",
  "allowExtraPropertiesAll": false,
  "compiler": {
    "sourceMap": true,
    "onUnsupported": "warn",
    "strictClass": false,
    "enforcePrivate": true,
    "enforceReadonly": true
  },
  "ncc": { "enabled": true }
}
```

Use `@AllowExtraProperties()` on a class or supported property when a closed object needs extra keys. Runtime violations throw `StrictTypeError`, whose `toJSON()` excludes raw values and stack traces.

## NestJS

Install `@ts-typed/nestjs` alongside the compiler and select it in `typets.config.json`:

```json
{ "integration": "@ts-typed/nestjs" }
```

When `npx ts-typed init` detects NestJS and `@ts-typed/nestjs` is installed, it asks whether to register `StrictTypeErrorFilter` globally. On confirmation it safely adds `app.useGlobalFilters(new StrictTypeErrorFilter())` to a conventional `main.ts`; rerunning the command does not duplicate the registration. The filter maps `StrictTypeError` to a Nest `HttpException` response with status 400 and safe metadata only. It does not replace DTO pipes or instantiate DTOs.

## Compatibility

The project preserves application compatibility when JavaScript cannot completely intercept a mutation, particularly external aliases, dynamic code and unsupported built-ins. These cases are warnings by default rather than hidden successes. `any`, `unknown`, and declarations without an annotation or initializer remain explicitly open and are listed separately in coverage output.

Read the [full specification](docs/SPEC.md), [architecture](docs/architecture.md), [quick-start guide](docs/usage/quickstart.md) and [performance notes](docs/performance.md) before relying on a boundary with strict coverage requirements.

## License

Apache-2.0 permits commercial use, modification, redistribution and sale. Redistributed copies and derivatives must retain the applicable license and notice requirements. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

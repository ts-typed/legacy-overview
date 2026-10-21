# Uso rápido

## TypeScript puro

Instale o compilador e gere a configuração na raiz do projeto consumidor:

```bash
npm install --save-dev @ts-typed/compiler
npx ts-typed init
npx ts-typed build
```

O `init` escolhe `tsconfig.build.json` quando ele existe; caso contrário, usa `tsconfig.json`. O builder escreve a saída em `outDir` de maneira atômica e pode gerar um bundle ncc. Use `--no-bundle`, `--minify` ou `--sourcemap` apenas para alterar a execução atual.

Uma fronteira tipada recebe validação completa quando o schema runtime pode ser materializado. Por exemplo, `IResponse<IUser>` produz um schema para `status`, `message` e todos os campos de `data`. Tipos abertos (`any`, `unknown`) são reportados como abertos; tipos restritivos sem schema confiável recebem um warning localizado.

Você escreve o tipo e o ts-typed garante que ele será aplicado:

```ts
interface User {
  id: number;
  name: string;
}

function loadUser(user: User) {
  return findUserById(user.id);
}
```

Com `tsc`, a interface desaparece do JavaScript. Com `ts-typed`, o JavaScript gerado inclui a verificação de `user.name` e `user.id` antes de executar o método. O trecho abaixo é uma representação resumida do código gerado:

```js
function loadUser(user) {
  if (typeof user.name !== 'string') throw new StrictTypeError('user.name');
  if (typeof user.id !== 'number') throw new StrictTypeError('user.id');
  return findUserById(user.id);
}
```

```ts
import { StrictTypeError } from '@ts-typed/compiler';

interface IUser {
  name: string;
  age: number;
}

function saveUser(user: IUser): IUser {
  return user;
}

try {
  saveUser({ name: 'Ada', age: 'not-a-number' } as unknown as IUser);
} catch (error: unknown) {
  if (error instanceof StrictTypeError) {
    console.error(error.toJSON());
  }
}
```

## Objetos com chaves extras

Objetos protegidos são fechados por padrão. Use `@AllowExtraProperties()` quando uma classe ou propriedade deve aceitar dados extras, sem relaxar os campos conhecidos. `allowExtraPropertiesAll: true` faz o mesmo para todo o projeto.

## NestJS

Instale a integração e selecione-a:

```bash
npm install --save-dev @ts-typed/compiler @ts-typed/nestjs
```

```json
{ "integration": "@ts-typed/nestjs" }
```

O adaptador é carregado pela API pública do núcleo. Em um terminal interativo, `npx ts-typed init` detecta NestJS e pergunta se deve registrar `StrictTypeErrorFilter` globalmente. Ao confirmar, ele altera somente um `main.ts` convencional que contenha `const app = await NestFactory.create(...)`, adicionando o import e `app.useGlobalFilters(new StrictTypeErrorFilter())`. A operação é idempotente. O filtro cria a resposta Nest `HttpException` 400 sem incluir payload ou stack; ainda pode ser registrado manualmente com `@UseFilters()` ou como `APP_FILTER`.

## Cobertura estrita

O padrão é `compiler.onUnsupported: "warn"`, priorizando compatibilidade. Troque para `"error"` quando o projeto deve recusar o build se houver contrato parcial ou não materializável. Leia a seção de limites da [SPEC](../SPEC.md) antes de usar esse modo como política de segurança.

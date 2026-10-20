# Otimizações de DTOs imutáveis

`TTOptImmut<T>` é a opção explícita para respostas grandes formadas somente por
POJOs e arrays que não devem mudar depois de cruzar uma fronteira tipada.

```ts
import type { TTOptImmut } from '@ts-typed/compiler';

interface IUserData {
  id: number;
  name: string;
  email: string;
}

type UsersResponse = TTOptImmut<IUserData[]>;

function listUsers(): UsersResponse {
  return users.map(({ passwordHash: _passwordHash, ...user }) => user);
}
```

O compilador ainda valida todos os campos antes de devolver a resposta. Depois
disso, em vez de instalar um accessor por campo, ele congela profundamente o
grafo com `Object.freeze`. Assim, TypeScript torna o resultado `readonly` e o
JavaScript bloqueia qualquer alteração posterior com `TypeError` nativo.

## Quando usar

Use `TTOptImmut<IUserData[]>` para um lote inteiro de DTOs somente leitura.
Essa forma deixa **o array e seus itens** imutáveis. `TTOptImmut<IUserData>[]`
deixa cada item imutável, mas mantém o array externo mutável; prefira a primeira
forma para respostas HTTP.

É apropriado quando a aplicação projeta uma entity em um DTO novo, por exemplo
com `.map()` para remover `passwordHash`, e não precisa modificar esse DTO depois.

Não use em entities, instâncias de classes, `Date`, `Map`, `Set`, funções,
objetos com accessors, índices dinâmicos, unions ou intersections. O compilador
emite `TT_UNSUPPORTED_TYPE` para esses casos; não há fallback silencioso para a
proteção mutável normal. Use o tipo original nesses casos para preservar os
guards de mutação do `protectValue`.

## Garantias e compatibilidade

`TTOptImmut` conserva as propriedades de um POJO normal: `Object.keys`, spread,
`JSON.stringify` e `structuredClone` continuam enxergando os campos. A função
de runtime valida antes de congelar, portanto um valor inválido lança
`StrictTypeError` e permanece não congelado.

A troca é consciente: após a fronteira não há escrita válida nem inválida. Uma
tentativa de `dto.name = 'Grace'` falha com `TypeError`, enquanto o caminho
normal permite escritas compatíveis e rejeita somente as incompatíveis com
`StrictTypeError`.

## Resultado da bateria local

No ambiente documentado em [performance.md](./performance.md), o caminho
`project + protectValue` de 10.000 DTOs teve mediana de **44,83 ms**. Com
`TTOptImmut`, a mesma validação e projeção teve **10,58 ms**: cerca de **4,2x**
mais rápido, sem deixar de validar nem permitir mutação posterior. A diferença
vem de evitar milhares de accessors e estados de guard, não de pular validação.

Para um único item, o ganho é pequeno em termos absolutos. Para 50 itens ou
mais, e principalmente em lotes muito grandes, a estratégia reduz a parcela de
runtime que antes era dominada por instalação de guards.

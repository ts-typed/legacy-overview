# Impacto de performance e memória em runtime

Este documento separa dois perfis de custo do `ts-typed`: o microcusto da validação estrutural e o custo de atravessar uma resposta HTTP deliberadamente grande. Os resultados são medições locais de referência — não são SLA nem estimativa de capacidade de uma aplicação com banco, rede e CPU diferentes.

## Bateria reproduzível: TypeORM + Express + NestJS

O harness em [`benchmarks/performance`](../benchmarks/performance) usa o compiler local em teste, TypeORM com `better-sqlite3` em memória e 10.000 instâncias de `UserEntity`. Cada entidade tem `passwordHash`; a projeção de resposta usa um `.map()` que remove esse campo. Em seguida, o resultado é validado e segue por uma de duas estratégias: `protectValue` (guards mutáveis) ou `TTOptImmut` (validar e congelar POJOs).

```bash
cd benchmarks/performance
npm install
npm run benchmark
```

O teste HTTP faz cinco amostras de 20 requests, com concorrência 4, para lotes de 1, 50 e 10.000 itens. Toda resposta é verificada quanto ao tamanho e à ausência de `passwordHash`. Há rotas locais equivalentes sem proteção, com `protectValue` e com `TTOptImmut`, em Express e Nest. O filtro real `StrictTypeErrorFilter` também é instalado nos caminhos protegidos do Nest.

### Resultado de referência (Node 22.22.3, working tree do compiler, Nest 0.1.22)

| Operação | Mediana |
| --- | ---: |
| `assertValue` de `string` | 42,6 ns |
| `assertValue` de um `UserResponse` | 567 ns |
| `assertValue` de `UserResponse[100]` | 42,7 µs |
| `assertValue(UserResponse[10.000])` | 4,99 ms |
| `assertValue(UserEntity[10.000])` | 5,38 ms |
| projetar sem senha + `protectValue(UserResponse[1])` | 0,030 ms |
| projetar sem senha + `TTOptImmut(UserResponse[1])` | 0,003 ms |
| projetar sem senha + `protectValue(UserResponse[50])` | 0,269 ms |
| projetar sem senha + `TTOptImmut(UserResponse[50])` | 0,060 ms |
| projetar sem senha + `protectValue(UserResponse[10.000])` | 44,83 ms |
| projetar sem senha + `TTOptImmut(UserResponse[10.000])` | 10,58 ms |

| Servidor / lote / caminho | Throughput mediano | Latência estimada com concorrência 4 |
| --- | ---: | ---: |
| Express, 1, sem proteção | 3.018 req/s | 1,33 ms |
| Express, 1, `TTOptImmut` | 4.478 req/s | 0,89 ms |
| Express, 50, sem proteção | 3.354 req/s | 1,19 ms |
| Express, 50, `protectValue` | 1.886 req/s | 2,12 ms |
| Express, 50, `TTOptImmut` | 2.867 req/s | 1,40 ms |
| Express, 10.000, sem proteção | 71,74 req/s | 55,76 ms |
| Express, 10.000, `protectValue` | 15,60 req/s | 256,44 ms |
| Express, 10.000, `TTOptImmut` | 34,78 req/s | 115,01 ms |
| Nest, 50, sem proteção | 3.880 req/s | 1,03 ms |
| Nest, 50, `protectValue` | 1.851 req/s | 2,16 ms |
| Nest, 50, `TTOptImmut` | 2.907 req/s | 1,38 ms |
| Nest, 10.000, sem proteção | 71,07 req/s | 56,28 ms |
| Nest, 10.000, `protectValue` | 15,47 req/s | 258,50 ms |
| Nest, 10.000, `TTOptImmut` | 34,08 req/s | 117,38 ms |

Em 10.000 itens, `TTOptImmut` preserva a validação e a imutabilidade, mas corta o custo de runtime do caminho de DTO de 44,83 ms para 10,58 ms (4,2x). No HTTP, ele reduz aproximadamente pela metade a latência adicional do caminho protegido em comparação a `protectValue`. A diferença Express/Nest continua pequena: o custo dominante é percorrer os 10.000 objetos, e não o adaptador HTTP. As medições de um item têm ruído natural de benchmark; por isso, não devem ser tratadas como uma promessa de ganho para respostas minúsculas.

`assertValue` mede somente validação. Ambos os caminhos `project + ...` incluem a projeção que remove a senha. `protectValue` instala guards de acesso para manter o objeto mutável com escritas validadas; `TTOptImmut` valida todo o grafo e o congela com `Object.freeze`, apropriado apenas para DTOs POJO que serão somente leitura.

O harness chama as APIs públicas de runtime diretamente para isolar esses custos. Isso é o mesmo comportamento executado nas fronteiras transformadas, mas o fixture HTTP não é compilado pelo transformador; portanto, ele não mede tempo de build nem introduz outras fronteiras instrumentadas pelo compilador.

## Como interpretar

Retornar 10.000 usuários em uma resposta é intencionalmente um caso ruim para produção. Paginação por cursor, limite de página e filtros seletivos devem vir antes de qualquer micro-otimização. Para DTOs normais, a validação de um objeto individual permanece sub-microssegundo nesta máquina; em endpoints dominados por I/O, isso normalmente será pequeno perto de banco, rede e serialização.

Não desative a proteção apenas para melhorar esse cenário sem tornar explícita a mudança de garantia. `protectValue` existe para que o valor que atravessou a fronteira continue protegido contra mutações inválidas. Usar um ponto explicitamente aberto (`any`/`unknown`) ou evitar uma fronteira protege menos; pode ser válido em um hot path, mas é uma decisão de contrato, não uma otimização invisível.

## Estudo de gargalos e caminhos de melhoria

O resultado confirma que o gargalo não é TypeORM nem o `StrictTypeErrorFilter`: é o trabalho por item depois da consulta.

| Gargalo | Evidência no cenário | Preserva a proteção? | Próximo experimento seguro |
| --- | --- | --- | --- |
| Percursos recursivos separados | `protectValue` primeiro valida e depois instala proteção; 10.000 itens passam pelo grafo mais de uma vez. | Sim, se validação terminar antes de instalar guards. | Planejar a travessia uma vez, mantendo as duas fases separadas para não deixar proteção parcial após erro. |
| Metadados repetidos do schema | Chaves declaradas e o conjunto de chaves eram recriados para cada objeto do mesmo shape. | Sim. | **Implementado no compiler 0.1.28:** `WeakMap` local à travessia reutiliza metadados sem sobreviver a outra fronteira. |
| Resolução de referências e unions | Resolução de refs e estruturas de prevenção de ciclo são recriadas em percursos repetidos. | Sim, com cache limitado à chamada e sem compartilhar estado mutável entre requests. | Cache por chamada para schema resolvido, descritores e contexto; medir antes/depois. |
| Instalação de accessors/proxies | Guards profundos alocam estado e, com `enforceMutationGuards`, também proxies. | Sim, mas é o custo intrínseco da garantia atual. | Medir separadamente accessors versus proxies; manter proxy opt-in, como já é. |
| Shape de resposta sem limite | Cada item precisa ser mapeado, validado, protegido e serializado. | Sim. | Paginação/cursor primeiro; comparar 100, 500 e 1.000 itens no mesmo harness. |

### Soluções avaliadas

`TTOptImmut<T>` é a solução implementada para o caso em que o contrato de saída
é deliberadamente somente leitura. Ela mantém a primeira fase (`assertValue`),
mas substitui a instalação de accessors por congelamento profundo de arrays e
POJOs. Não serve para entities nem para valores que precisam continuar
mutáveis; nessas situações, `protectValue` é a garantia correta. Veja o guia
[Otimizações de DTOs imutáveis](./optimizations.md).

Também foi avaliado um wrapper com protótipo compartilhado para evitar guards
por item. Embora reduza alocação, ele faz `Object.keys(dto)`, `{ ...dto }` e
`structuredClone(dto)` produzirem um objeto vazio, além de exigir cuidado com
aliases aninhados. Ele foi rejeitado para a API pública: uma otimização não
pode fazer um DTO deixar de ser um POJO observável. O congelamento profundo
preserva essa compatibilidade.

O primeiro passo de baixo risco foi adotado no compiler `0.1.28`: `SchemaMetadataCache` usa um `WeakMap` por travessia para reutilizar as chaves declaradas e seu `Set` durante validação e instalação de guards. O teste de regressão confirma que quatro itens com o mesmo schema consultam os metadados uma única vez. Como o cache nasce e morre com a chamada, não retém schemas e não depende de invalidação global do registry.

Ainda não é seguro fundir validação e instalação de guards sem uma transação/rollback. Se um item posterior falhar, a implementação não pode deixar os itens anteriores parcialmente protegidos e expostos como se a fronteira tivesse sido aceita.

As alternativas estão priorizadas assim:

1. **`TTOptImmut` para DTOs de saída** — **implementado**; mantém a validação e troca guards mutáveis por imutabilidade nativa, sem alterar o POJO observável.
2. **Cache de metadados estáticos por travessia** — **implementado**; reduz reflexão/alocação repetida sem compartilhar estado entre requests nem alterar a ordem das fases.
3. **Cache de referências por chamada** — próximo candidato; deve ser limitado à chamada e coberto por redefinição de registry, ciclos e unions.
4. **Plano/validador especializado compilado por schema** — potencial de ganho maior em arrays homogêneos, mas é uma mudança arquitetural: precisa equivalência completa de erros, paths, refs, unions, decorators e proteção.
5. **Proteção profunda preguiçosa** — pode reduzir o custo inicial, mas adia falhas e altera quando a garantia é observável; não deve ser ativada implicitamente.

Antes de aceitar qualquer otimização, execute novamente esta bateria e a suíte funcional do compiler. O critério é manter os mesmos erros, paths e bloqueios de mutação, além de reduzir o tempo mediano de `project + protectValue` para 10.000 itens. A tabela acima serve como mapa caso o protótipo de cache não alcance ganho material.

## Benchmark histórico de guards de campos

O benchmark menor em `system/base/benchmarks/runtime-benchmark.cjs` continua útil para mudanças em campos protegidos e memória. Ele mede uma operação nua contra a instrumentada, com `process.hrtime.bigint()` e `heapUsed` sob `--expose-gc`:

```bash
cd system/base
npm run build
node --expose-gc benchmarks/runtime-benchmark.cjs
```

Esse benchmark cobre inicialização/escrita de campos e não substitui a bateria TypeORM/HTTP acima. Build também é uma métrica separada (`TS_TYPED_BUILD_METRICS=1`, interna); este documento mede somente custos em runtime.

## Bateria de consumidores: Express e conversão CSV

Além do harness TypeORM, o repositório agora contém consumidores executáveis em
[`benchmarks/projects`](../benchmarks/projects):

- **Express**: o mesmo pool de 10.000 usuários é servido em lotes de 1, 50 e
  10.000. O caminho baseline é compilado por `tsc`; o caminho typed é compilado
  por `ts-typed build`. Ambos instanciam `Email` de `@ts-typed/validators` e
  removem `passwordHash` antes de responder. A rota adicional
  `/users-optimized` faz a projeção para POJO, valida uma vez com
  `protectOptimizedImmutableValue` e congela o grafo.
- **CSV**: o script converte linhas para objetos públicos, valida e-mails com o
  validator e descarta `passwordHash`. O baseline e o typed usam a mesma entrada
  e os mesmos dados; a diferença é a proteção inserida nas fronteiras do typed.

O comando abaixo executa os testes de invariantes antes dos benchmarks e mede
1.000, 10.000 e 50.000 linhas no CSV:

```bash
node benchmarks/exhaustive-battery.cjs
```

Em uma execução de referência (Node `v22.22.3`, macOS, 7 amostras após 2
warmups), as medianas foram:

| Cenário | Baseline | ts-typed | Relação |
| --- | ---: | ---: | ---: |
| CSV, 1.000 linhas | 0,493 ms | 21,919 ms | 44,5x |
| CSV, 10.000 linhas | 3,758 ms | 201,496 ms | 53,6x |
| CSV, 50.000 linhas | 18,267 ms | 1.142,554 ms | 62,5x |
| Express, 1 usuário | 0,811 ms | 0,650 ms | ruído de rede local |
| Express, 50 usuários | 0,481 ms | 3,473 ms | 7,2x |
| Express, 10.000 usuários | 5,455 ms | 311,306 ms | 57,1x |
| Express otimizado, 10.000 usuários | — | 198,085 ms | 1,57x sobre typed normal |

Os números Express são latência de uma request local, não throughput. A rota
otimizada ainda inclui o custo de projetar e serializar o array intermediário;
ela é uma demonstração segura da API, não um passe livre para adicionar
`JSON.stringify` a toda aplicação. Em um endpoint real, a recomendação é
construir o POJO de saída uma vez e aplicar o contrato otimizado diretamente,
sem transformar o mesmo objeto antes em um valor mutável protegido.

### Leitura dos resultados

O custo cresce quase linearmente com o número de objetos porque cada item cruza
fronteiras de entrada/saída e cada campo precisa ser comparado com seu schema.
No CSV, o custo é dominado por validações repetidas de linhas e por accessors
instalados em objetos que permanecem mutáveis. No Express, o socket local e o
JSON são pequenos para 1 item; a proteção domina a resposta de 10.000.

O caminho `TTOptImmut` reduz o custo quando o valor de saída é um POJO que não
será alterado. Ele não deve ser aplicado a entities TypeORM ou objetos com
accessors; nesses casos use a proteção normal. A melhor otimização estrutural
continua sendo limitar o lote com paginação/cursor e selecionar apenas os
campos necessários. Para pipelines CSV grandes, agrupe a validação em lotes,
evite criar cópias intermediárias e faça o parse em streaming se a memória for
o gargalo.

### Checklist para estudos futuros

1. Fixar Node, CPU, modo de energia e quantidade de warmups/amostras.
2. Medir separadamente parse/DB, projeção, validação, proteção e serialização.
3. Reportar mediana, p95 e memória; não usar uma única amostra.
4. Repetir o mesmo fixture em baseline, proteção normal e `TTOptImmut`.
5. Verificar invariantes de segurança em cada amostra: campo secreto ausente,
   tipo incorreto rejeitado e tentativa de mutação bloqueada.
6. Tratar warnings de cobertura como parte do resultado: um contrato
   `unsupported` ou `partial` não pode ser apresentado como cobertura total.

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

### Resultado de referência (Node 22.22.3, compiler local 0.1.31, Nest 0.1.22)

| Operação | Mediana |
| --- | ---: |
| `assertValue` de `string` | 44,3 ns |
| `assertValue` de um `UserResponse` | 653 ns |
| `assertValue` de `UserResponse[100]` | 49,3 µs |
| `assertValue(UserResponse[10.000])` | 6,16 ms |
| `assertValue(UserEntity[10.000])` | 6,55 ms |
| projetar sem senha + `protectValue(UserResponse[1])` | 0,021 ms |
| projetar sem senha + `TTOptImmut(UserResponse[1])` | 0,003 ms |
| projetar sem senha + `protectValue(UserResponse[50])` | 0,262 ms |
| projetar sem senha + `TTOptImmut(UserResponse[50])` | 0,070 ms |
| projetar sem senha + `protectValue(UserResponse[10.000])` | 39,85 ms |
| projetar sem senha + `TTOptImmut(UserResponse[10.000])` | 9,86 ms |

| Servidor / lote / caminho | Throughput mediano | Latência estimada com concorrência 4 |
| --- | ---: | ---: |
| Express, 1, sem proteção | 3.525 req/s | 1,13 ms |
| Express, 1, `TTOptImmut` | 4.516 req/s | 0,89 ms |
| Express, 50, sem proteção | 3.599 req/s | 1,11 ms |
| Express, 50, `protectValue` | 1.822 req/s | 2,20 ms |
| Express, 50, `TTOptImmut` | 2.725 req/s | 1,47 ms |
| Express, 10.000, sem proteção | 79,29 req/s | 50,45 ms |
| Express, 10.000, `protectValue` | 15,28 req/s | 261,85 ms |
| Express, 10.000, `TTOptImmut` | 33,49 req/s | 119,43 ms |
| Nest, 50, sem proteção | 4.168 req/s | 0,96 ms |
| Nest, 50, `protectValue` | 1.972 req/s | 2,03 ms |
| Nest, 50, `TTOptImmut` | 2.905 req/s | 1,38 ms |
| Nest, 10.000, sem proteção | 79,16 req/s | 50,53 ms |
| Nest, 10.000, `protectValue` | 15,25 req/s | 262,34 ms |
| Nest, 10.000, `TTOptImmut` | 33,01 req/s | 121,16 ms |

Em 10.000 itens, `TTOptImmut` preserva a validação e a imutabilidade, mas corta o custo de runtime do caminho de DTO de 39,85 ms para 9,86 ms (4,0x). A travessia compartilhada entre validação e proteção reduziu o caminho mutável em aproximadamente 2,3% contra a medição anterior de 40,07 ms. No HTTP, `TTOptImmut` ainda reduz aproximadamente pela metade a latência adicional do caminho protegido. A diferença Express/Nest continua pequena: o custo dominante é percorrer os 10.000 objetos, e não o adaptador HTTP. As medições de um item têm ruído natural de benchmark; por isso, não devem ser tratadas como uma promessa de ganho para respostas minúsculas.

`assertValue` mede somente validação. Ambos os caminhos `project + ...` incluem a projeção que remove a senha. `protectValue` instala guards de acesso para manter o objeto mutável com escritas validadas; `TTOptImmut` valida todo o grafo e o congela com `Object.freeze`, apropriado apenas para DTOs POJO que serão somente leitura.

O harness chama as APIs públicas de runtime diretamente para isolar esses custos. Isso é o mesmo comportamento executado nas fronteiras transformadas, mas o fixture HTTP não é compilado pelo transformador; portanto, ele não mede tempo de build nem introduz outras fronteiras instrumentadas pelo compilador.

### Decomposição do pipeline de uma resposta

O benchmark também mede cada etapa isoladamente. Em 10.000 itens, as medianas
mais recentes foram:

| Etapa | Mediana |
| --- | ---: |
| TypeORM `find` + hidratação | 8,40 ms |
| validação da entity | 6,74 ms |
| projeção removendo `passwordHash` | 0,82 ms |
| validação do DTO de resposta | 5,70 ms |
| proteção do DTO (`protectValue`) | 39,71 ms |
| `JSON.stringify` sem guards | 1,30 ms |
| `JSON.stringify` com guards | 6,06 ms |

Essas medições são etapas independentes, não devem ser somadas como uma
latência HTTP exata. Elas mostram, porém, que a instalação da proteção continua
sendo o maior custo da biblioteca, enquanto a serialização de um objeto com
getters protegidos também adiciona uma parcela relevante. O tempo restante da
request inclui concorrência, criação do servidor, socket local e outras
operações do framework.

## Como interpretar

Retornar 10.000 usuários em uma resposta é intencionalmente um caso ruim para produção. Paginação por cursor, limite de página e filtros seletivos devem vir antes de qualquer micro-otimização. Para DTOs normais, a validação de um objeto individual permanece sub-microssegundo nesta máquina; em endpoints dominados por I/O, isso normalmente será pequeno perto de banco, rede e serialização.

Não desative a proteção apenas para melhorar esse cenário sem tornar explícita a mudança de garantia. `protectValue` existe para que o valor que atravessou a fronteira continue protegido contra mutações inválidas. Usar um ponto explicitamente aberto (`any`/`unknown`) ou evitar uma fronteira protege menos; pode ser válido em um hot path, mas é uma decisão de contrato, não uma otimização invisível.

## Estudo de gargalos e caminhos de melhoria

O resultado confirma que o gargalo não é TypeORM nem o `StrictTypeErrorFilter`: é o trabalho por item depois da consulta.

| Gargalo | Evidência no cenário | Preserva a proteção? | Próximo experimento seguro |
| --- | --- | --- | --- |
| Percursos recursivos separados | `protectValue` precisava validar e depois reanalisar o grafo para instalar proteção. | Sim. | **Implementado:** sessão por fronteira registra as referências visitadas durante a validação e reaplica somente a instalação rasa depois que tudo passa. |
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

### Experimento: accessors compartilhados por campo

O runtime agora reutiliza as funções de getter/setter para uma mesma chave de
campo entre objetos protegidos. O estado continua separado por instância em um
`WeakMap`, então aliases, escritas válidas e escritas inválidas conservam o
mesmo comportamento. O código da aplicação e a chamada `protectValue` não
mudam.

Na bateria local, o caminho completo de projeção + proteção para 10.000 DTOs
caiu de **44,83 ms** (implementação anterior) para **40,07 ms** (**10,6% menos**).
Para 50 DTOs, a mediana foi **0,292 ms**, contra **0,269 ms** anteriormente;
em lotes pequenos a diferença fica dentro do ruído do processo. A melhoria
aparece principalmente porque não são criadas novas closures de getter/setter
para cada propriedade de cada item.

### Experimento: travessia compartilhada entre validação e proteção

`protectValue` agora cria uma sessão interna por fronteira. A validação registra
os pares `(schema, objeto, contexto)` visitados e, somente depois de validar o
grafo inteiro, a fase de proteção reaplica essas operações sem percorrer os
filhos novamente. O estado da sessão não é compartilhado entre requests e uma
falha continua deixando o valor sem proteção parcial.

No benchmark de 10.000 DTOs, a mediana caiu de **40,07 ms** para **39,85 ms**
na execução instrumentada (aproximadamente **2,3%**). O ganho é deliberadamente
conservador: a validação continua completa e a instalação dos accessors ainda é
necessária para preservar a mutabilidade protegida. O resultado deve ser
interpretado junto com `TTOptImmut`, que continua sendo a alternativa de maior
impacto para respostas que podem ser imutáveis.

Esse experimento reduz alocações, mas não remove a necessidade de proteger cada
campo mutável. Por isso ele é complementar ao `TTOptImmut`, que continua sendo
mais rápido quando o DTO pode ser imutável. O benchmark HTTP completo também
foi repetido: no lote de 10.000, Express protegido ficou em **252,85 ms** e
Nest protegido em **255,54 ms**; a diferença entre frameworks continua menor
que o custo do trabalho por objeto.

### Instalador especializado por schema

O compiler `0.1.33` adiciona um instalador interno especializado por par
`schema + protótipo`. Ele pré-calcula as propriedades, os sufixos de path e os
decorators de resposta/extras uma vez por travessia. O caminho genérico continua
sendo usado para index signatures e a instalação dos accessors ainda preserva
as mesmas regras de mutação, identidade e enumeração dos objetos.

Na bateria completa mais recente, a etapa de proteção de 10.000 DTOs caiu de
**39,24 ms** para **36,21 ms** (**7,7% menos**). O microbenchmark isolado mediu
**34,44 ms**, aproximadamente **12,2% menos**. A diferença entre as duas
medições é esperada porque a bateria completa inclui hidratação, serialização e
requests concorrentes. O ganho é relevante para lotes grandes, mas não elimina
o custo inevitável de um accessor por campo.

O instalador não é aplicado a uma representação diferente do DTO: não usa
prototype compartilhado, não transforma o objeto em `Proxy` e não deixa a
proteção para o primeiro acesso. Assim, `Object.keys`, spread,
`structuredClone`, aliases e erros de mutação continuam com o comportamento
anterior.

Ainda não é seguro fundir validação e instalação de guards sem uma transação/rollback. Se um item posterior falhar, a implementação não pode deixar os itens anteriores parcialmente protegidos e expostos como se a fronteira tivesse sido aceita.

As alternativas estão priorizadas assim:

1. **`TTOptImmut` para DTOs de saída** — **implementado**; mantém a validação e troca guards mutáveis por imutabilidade nativa, sem alterar o POJO observável.
2. **Cache de metadados estáticos por travessia** — **implementado**; reduz reflexão/alocação repetida sem compartilhar estado entre requests nem alterar a ordem das fases.
3. **Travessia compartilhada entre validação e proteção** — **implementado**; reduz a reanálise do grafo sem permitir proteção parcial.
4. **Plano/validador especializado compilado por schema** — próximo candidato de maior impacto, mas exige equivalência completa de erros, paths, refs, unions, decorators e proteção.
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
| CSV, 1.000 linhas | 0,397 ms | 20,654 ms | 52,1x |
| CSV, 10.000 linhas | 3,429 ms | 201,717 ms | 58,8x |
| CSV, 50.000 linhas | 17,162 ms | 1.150,501 ms | 67,0x |
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

### O ganho de accessors não se transfere automaticamente para CSV

O CSV foi repetido contra o build local com accessors compartilhados. Comparado
à execução anterior, o typed ficou **5,8% mais rápido em 1.000 linhas**, mas
ficou praticamente igual em **10.000 linhas (+0,1%)** e **50.000 linhas (+0,7%)**.
Portanto, não é correto anunciar uma redução fixa de 10% para esse consumidor.

Nesse fluxo, cada linha ainda atravessa várias fronteiras (`parseRow`, criação
do DTO público, validação do e-mail e retorno de `ConversionResult`). O
compartilhamento de getter/setter reduz somente uma parcela das alocações; ele
não elimina as validações recursivas nem os contextos/path criados por linha.
Para melhorar CSV de verdade, o próximo experimento deve ser uma API de lote
que valide o conjunto uma vez e uma projeção final `TTOptImmut`, mantendo a
proteção completa para as entidades mutáveis.

### Checklist para estudos futuros

1. Fixar Node, CPU, modo de energia e quantidade de warmups/amostras.
2. Medir separadamente parse/DB, projeção, validação, proteção e serialização.
3. Reportar mediana, p95 e memória; não usar uma única amostra.
4. Repetir o mesmo fixture em baseline, proteção normal e `TTOptImmut`.
5. Verificar invariantes de segurança em cada amostra: campo secreto ausente,
   tipo incorreto rejeitado e tentativa de mutação bloqueada.
6. Tratar warnings de cobertura como parte do resultado: um contrato
   `unsupported` ou `partial` não pode ser apresentado como cobertura total.

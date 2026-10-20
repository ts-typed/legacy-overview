# Impacto de performance e memória em runtime

Este documento separa dois perfis de custo do `ts-typed`: o microcusto da validação estrutural e o custo de atravessar uma resposta HTTP deliberadamente grande. Os resultados são medições locais de referência — não são SLA nem estimativa de capacidade de uma aplicação com banco, rede e CPU diferentes.

## Bateria reproduzível: TypeORM + Express + NestJS

O harness em [`benchmarks/performance`](../benchmarks/performance) usa os pacotes publicados, TypeORM com `better-sqlite3` em memória e 10.000 instâncias de `UserEntity`. Cada entidade tem `passwordHash`; a projeção de resposta usa um `.map()` que remove esse campo. Em seguida, o resultado é validado/protegido como `UserResponse[]`.

```bash
cd benchmarks/performance
npm install
npm run benchmark
```

O teste HTTP faz cinco amostras de 20 requests, com concorrência 4, e verifica em toda resposta que existem 10.000 itens e que `passwordHash` não vazou. Há quatro rotas locais equivalentes: Express sem proteção, Express protegido, Nest sem proteção e Nest protegido. O filtro real `StrictTypeErrorFilter` também é instalado no Nest.

### Resultado de referência (Node 22.22.3)

| Operação | Mediana |
| --- | ---: |
| `assertValue` de `string` | 29,0 ns |
| `assertValue` de um `UserResponse` | 536 ns |
| `assertValue` de `UserResponse[100]` | 58,9 µs |
| `assertValue(UserResponse[10.000])` | 6,20 ms |
| `assertValue(UserEntity[10.000])` | 7,58 ms |
| projetar sem senha + `protectValue(UserResponse[10.000])` | 47,1 ms |

| Servidor / caminho | Throughput mediano | Latência estimada com concorrência 4 |
| --- | ---: | ---: |
| Express, projeção sem proteção | 77,06 req/s | 51,9 ms |
| Express, projetar + proteger | 14,59 req/s | 274,2 ms |
| Nest, projeção sem proteção | 76,28 req/s | 52,4 ms |
| Nest, projetar + proteger | 14,41 req/s | 277,6 ms |

Neste cenário extremo, a proteção reduz o throughput em aproximadamente 81% e adiciona cerca de 222–225 ms à estimativa de latência sob concorrência 4. A diferença Express/Nest é pequena: o custo dominante é percorrer e proteger os 10.000 objetos, e não o adaptador HTTP. O banco também é propositalmente em memória; com um banco remoto lento, a participação relativa do runtime tende a cair, mas o custo absoluto de percorrer a coleção continua existindo.

`assertValue` mede somente validação. O caminho `project + protectValue` inclui a projeção que remove a senha e a proteção profunda do resultado. O `.map()` de projeção é simples; a maior parte do acréscimo vem da proteção do grafo de 10.000 objetos.

O harness chama as APIs públicas de runtime diretamente para isolar esses custos. Isso é o mesmo comportamento executado nas fronteiras transformadas, mas o fixture HTTP não é compilado pelo transformador; portanto, ele não mede tempo de build nem introduz outras fronteiras instrumentadas pelo compilador.

## Como interpretar

Retornar 10.000 usuários em uma resposta é intencionalmente um caso ruim para produção. Paginação por cursor, limite de página e filtros seletivos devem vir antes de qualquer micro-otimização. Para DTOs normais, a validação de um objeto individual permanece sub-microssegundo nesta máquina; em endpoints dominados por I/O, isso normalmente será pequeno perto de banco, rede e serialização.

Não desative a proteção apenas para melhorar esse cenário sem tornar explícita a mudança de garantia. `protectValue` existe para que o valor que atravessou a fronteira continue protegido contra mutações inválidas. Usar um ponto explicitamente aberto (`any`/`unknown`) ou evitar uma fronteira protege menos; pode ser válido em um hot path, mas é uma decisão de contrato, não uma otimização invisível.

## Estudo de gargalos e caminhos de melhoria

O resultado confirma que o gargalo não é TypeORM nem o `StrictTypeErrorFilter`: é o trabalho por item depois da consulta.

| Gargalo | Evidência no cenário | Preserva a proteção? | Próximo experimento seguro |
| --- | --- | --- | --- |
| Percursos recursivos separados | `protectValue` primeiro valida e depois instala proteção; 10.000 itens passam pelo grafo mais de uma vez. | Sim, se validação terminar antes de instalar guards. | Planejar a travessia uma vez, mantendo as duas fases separadas para não deixar proteção parcial após erro. |
| Metadados repetidos do schema | Chaves declaradas, descritores e contexto são consultados para cada objeto de mesmo shape. | Sim. | Cachear metadados imutáveis por schema (`WeakMap`), com invalidação quando o registry recebe uma definição nova. |
| Resolução de referências e unions | Resolução de refs e estruturas de prevenção de ciclo são recriadas em percursos repetidos. | Sim, com cache limitado à chamada e sem compartilhar estado mutável entre requests. | Cache por chamada para schema resolvido, descritores e contexto; medir antes/depois. |
| Instalação de accessors/proxies | Guards profundos alocam estado e, com `enforceMutationGuards`, também proxies. | Sim, mas é o custo intrínseco da garantia atual. | Medir separadamente accessors versus proxies; manter proxy opt-in, como já é. |
| Shape de resposta sem limite | Cada item precisa ser mapeado, validado, protegido e serializado. | Sim. | Paginação/cursor primeiro; comparar 100, 500 e 1.000 itens no mesmo harness. |

### Soluções avaliadas

Ainda não há uma alteração de runtime adotada nesta rodada: não seria seguro fundir validação e instalação de guards sem uma transação/rollback. Se um item posterior falhar, a implementação não pode deixar os itens anteriores parcialmente protegidos e expostos como se a fronteira tivesse sido aceita.

As alternativas estão priorizadas assim:

1. **Cache de metadados estáticos de schema e referências** — melhor relação risco/ganho esperado; não muda o contrato e deve ser coberto por testes de redefinição de schema, refs e unions.
2. **Cache de travessia por chamada** — reduz consultas repetidas sem compartilhar objetos entre requests; exige teste de ciclos e de erros agregados.
3. **Plano/validador especializado compilado por schema** — potencial de ganho maior em arrays homogêneos, mas é uma mudança arquitetural: precisa equivalência completa de erros, paths, refs, unions, decorators e proteção.
4. **Proteção profunda preguiçosa** — pode reduzir o custo inicial, mas adia falhas e altera quando a garantia é observável; não deve ser ativada implicitamente.
5. **Abrir o boundary em hot paths** — custo baixo, mas reduz a proteção; só deve ser uma escolha explícita e documentada da aplicação.

Antes de aceitar qualquer otimização, execute novamente esta bateria e a suíte funcional do compiler. O critério é manter os mesmos erros, paths e bloqueios de mutação, além de reduzir o tempo mediano de `project + protectValue` para 10.000 itens. A tabela acima serve como mapa caso o protótipo de cache não alcance ganho material.

## Benchmark histórico de guards de campos

O benchmark menor em `system/base/benchmarks/runtime-benchmark.cjs` continua útil para mudanças em campos protegidos e memória. Ele mede uma operação nua contra a instrumentada, com `process.hrtime.bigint()` e `heapUsed` sob `--expose-gc`:

```bash
cd system/base
npm run build
node --expose-gc benchmarks/runtime-benchmark.cjs
```

Esse benchmark cobre inicialização/escrita de campos e não substitui a bateria TypeORM/HTTP acima. Build também é uma métrica separada (`TS_TYPED_BUILD_METRICS=1`, interna); este documento mede somente custos em runtime.

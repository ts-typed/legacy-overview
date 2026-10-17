# Impacto de performance e memória em runtime

Este documento mede o custo, em tempo de execução, de instrumentar código TypeScript com `ts-typed` — ou seja, o preço pago a cada validação (`assertValue`, `protectValue`) e a cada campo de classe guardado (`installFieldGuard`), não o tempo de build (esse está em `TS_TYPED_BUILD_METRICS`, uma métrica interna separada, ver `system/base/src/compiler/build/build-metrics.ts`).

## Metodologia

Script: `system/base/benchmarks/runtime-benchmark.cjs` (não publicado no pacote npm, não roda em `npm test`; existe só para reproduzir estas medições após mudanças no runtime). Compara, lado a lado, a operação "nua" (sem proteção) contra a mesma operação instrumentada, usando `process.hrtime.bigint()` para tempo e `process.memoryUsage().heapUsed` (com `--expose-gc` e coleta forçada entre medições) para memória. Hardware/condições variam entre máquinas — os números abaixo são de referência relativa (quantas vezes mais caro), não um SLA.

Reprodução:
```bash
cd system/base && npm run build
node --expose-gc benchmarks/runtime-benchmark.cjs
```

## Resultados (amostra local, 2M–200k iterações por cenário)

| Cenário | Sem proteção | Com proteção | Razão |
| --- | --- | --- | --- |
| Validar um `number` (`assertValue`) | 3.9 ns/op | 46.5 ns/op | ~12x |
| Validar um objeto de 3 campos (`assertValue`) | 5.5 ns/op | 437.3 ns/op | ~111x |
| Inicializar valor + proteção profunda (`protectValue`) | 7.8 ns/op | 2566.6 ns/op | ~330x |
| Construir instância + instalar guard de campo (uma vez) | 6.7 ns/op | 664.2 ns/op | ~99x |
| Escrita em campo já guardado (regime permanente) | 3.6 ns/op | 118.5 ns/op | ~30x |
| Memória por instância com 1 campo guardado | 42 bytes | 834 bytes | ~20x |

## Leitura dos números

- **Em termos absolutos, tudo isso ainda é muito rápido.** Mesmo o pior caso medido (objeto de 3 campos via `assertValue`, ~437ns) permite dezenas de milhões de validações por segundo numa CPU comum. Para o padrão de uso típico — validar o corpo de uma requisição HTTP, os argumentos de uma chamada de serviço, um campo de classe que muda algumas vezes por request — esse custo é irrelevante perto da latência de I/O (banco de dados, rede, disco) que domina a maioria das aplicações Node/NestJS.
- **O custo cresce com a profundidade/tamanho do shape, não é fixo.** Um objeto com mais campos ou com propriedades aninhadas custa proporcionalmente mais, porque a validação é estrutural e recursiva por natureza (não há como validar um objeto aninhado sem percorrê-lo). `protectValue` é o mais caro dos cenários porque, além de validar, instala proteção profunda recursivamente (percorre arrays/objetos aninhados instalando guards) — ele é usado nas fronteiras de atribuição (`initialize`/`set` de variável, parâmetro, campo), não em cada leitura.
- **O overhead de memória por instância guardada é o ponto que mais merece atenção em escala.** Cada campo guardado troca uma propriedade de dado simples por um par de acessor (getter/setter) mais o estado de rastreamento do guard (contratos, valor, flags) — na amostra, ~20x mais bytes por instância com um único campo guardado. Para aplicações que mantêm **milhões de instâncias protegidas vivas em memória simultaneamente** (ex.: um cache enorme de entidades de domínio), isso é um fator real de dimensionamento de heap a considerar; para o padrão request-scoped típico de APIs HTTP (instâncias vivem durante uma requisição e são coletadas), o efeito é transitório e normalmente não é o gargalo.
- **A escrita em regime permanente (~30x) é o número mais relevante para hot loops.** Campos guardados que são escritos repetidamente dentro de um loop apertado (não só uma vez por request) são onde a proteção mais se nota proporcionalmente, ainda que em termos absolutos (118ns) continue sendo uma fração de microssegundo.

## Quando isso importa de verdade

- **Quase nunca** para APIs HTTP/gRPC típicas dominadas por I/O (bancos, filas, chamadas externas) — a validação estrutural é ruído perto da latência de rede.
- **Pode importar** em: processamento em lote de alto volume (milhões de registros por segundo), hot loops numéricos/matemáticos com campos guardados escritos a cada iteração, ou serviços que mantêm um número muito grande de instâncias protegidas vivas simultaneamente em memória.
- Nesses casos, as opções documentadas no projeto para reduzir custo em pontos específicos, sem perder a proteção do resto da aplicação, são: isolar a estrutura quente com um tipo `any`/`unknown` explícito (torna esse ponto "aberto" por regra documentada, não um limite escondido) ou restringir a validação profunda a fronteiras (parâmetros/retornos de função pública), evitando reconstruir/revalidar o mesmo valor repetidamente dentro de um loop interno.

## Não medido aqui

Overhead de **build** (tempo de compilação/bundling) é uma métrica separada e já instrumentada (`TS_TYPED_BUILD_METRICS=1`, interna, não documentada publicamente — ver `system/base/src/compiler/build/build-metrics.ts`). Este documento cobre apenas o custo pago pela aplicação já compilada, em produção, a cada validação/escrita.

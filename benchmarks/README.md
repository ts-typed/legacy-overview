# Bateria de consumidores

Esta pasta contém consumidores pequenos e reproduzíveis para comparar o mesmo
fluxo com TypeScript puro e com o compiler ts-typed:

- `projects/express`: rotas Express para 1, 50 e 10.000 usuários, com
  `@ts-typed/validators` e uma rota explícita de DTO imutável otimizado.
- `projects/csv-transform`: conversão CSV, validação de e-mail e remoção do
  hash; mede 1.000, 10.000 e 50.000 linhas.
- `../teste-ts-typed/system`: consumidor NestJS com TypeORM, suite funcional e
  testes de build/start já existentes.

Execute a bateria local completa (o benchmark Express precisa de loopback):

```bash
node benchmarks/exhaustive-battery.cjs
```

Para salvar o relatório sem adicioná-lo ao Git:

```bash
TS_TYPED_BATTERY_REPORT=/tmp/ts-typed-battery.json node benchmarks/exhaustive-battery.cjs
```

O runner roda os testes de cada consumidor antes de medir. Os números são
medianas locais, com warmup, e devem ser comparados somente entre variantes
executadas no mesmo processo/máquina. A interpretação e os gargalos estão em
[`docs/performance.md`](../docs/performance.md).

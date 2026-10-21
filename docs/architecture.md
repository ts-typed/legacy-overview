# Arquitetura do ts-typed

O ts-typed é organizado como um workspace npm em `system/`. O núcleo não depende de frameworks. Integrações usam sua API pública e mantêm dependências, build e testes em pacotes próprios.

| Local | Responsabilidade |
| --- | --- |
| `system/base` | Pacote `@ts-typed/compiler`: contratos, runtime, configuração, API de integração, compilador e CLI `ts-typed` |
| `system/frameworks/<id>` | Comportamento específico e testes de cada framework |
| `devops` | Infraestrutura, CI/CD, empacotamento e release |
| `.github/workflows` | Entradas mínimas descobertas pelo GitHub Actions |
| `docs` | Spec, arquitetura e guias públicos |

Os pacotes vivem em repositórios próprios e são consumidos neste repositório por submódulos Git. `typescript` é a integração padrão, sem exigir framework instalado. `@ts-typed/nestjs` e `@ts-typed/express` são adaptadores HTTP separados; o compiler permanece agnóstico de framework. Angular, React, Vue e Next.js continuam como possibilidades de expansão.

O núcleo exporta a API de integração em `@ts-typed/compiler/integration`. Na versão 1, um adaptador declara `apiVersion: 1`, `name` e o hook síncrono `resolveProject(context)`, que recebe a raiz do consumidor e retorna uma resolução de projeto validada. Um adaptador pode expor opcionalmente `installGlobalStrictTypeErrorFilter(context)` para o fluxo interativo de `init`; o núcleo apenas pede confirmação e o adaptador é responsável por editar seus próprios arquivos. O builder resolve o adaptador selecionado antes de criar o programa TypeScript. Módulos incompatíveis falham. A integração não pode relaxar contratos nem duplicar a identidade do runtime.

A configuração global do consumidor é `typets.config.json`, na raiz do consumidor. A organização do repositório da ferramenta não exige que o consumidor mova seus arquivos para `system/`.

A validação de um valor em um momento específico não equivale à proteção permanente de suas referências. A instrumentação precisa preservar os contratos após mutações, inclusive por aliases. As provas executáveis em `system/base/tests/feasibility` demonstram por que envolver apenas o campo com um Proxy é insuficiente. O projeto prioriza compatibilidade: fronteiras ou operações sem proteção completa geram warnings localizados, sem bloquear o build por padrão. `compiler.onUnsupported: "error"` permite optar por cobertura estrita. O relatório separa contratos protegidos, parciais, não protegidos e abertos.

Planos, checkpoints e relatórios de execução são locais e estão no `.gitignore`. Código-fonte, testes e esta documentação são versionáveis.

# SPEC — ts-typed: proteção de contratos TypeScript em runtime para NestJS

> Status: implementação local validada; publicação npm ainda não executada. Compatibilidade priorizada; limites de proteção geram warnings localizados conforme §6.2.
> Pacote principal: `@ts-typed/compiler`; integração Nest: `@ts-typed/nestjs`; CLI: `ts-typed`.
> Plataforma inicial: TypeScript puro e NestJS, Node.js/CommonJS; arquitetura extensível por pacotes.

## 1. Pedido e objetivo

O projeto NestJS deve rejeitar em tempo de execução valores incompatíveis com seus contratos TypeScript em todos os pontos tipáveis do código do projeto, inclusive quando a escrita vem de `any`, casts, módulos externos ou dados HTTP. Proteger tipos explicitamente anotados e tipos inferidos pelo TypeScript: propriedades, variáveis, constantes, parâmetros, construtores, funções, métodos e retornos.

Um ponto tipável só fica aberto quando seu tipo efetivo é `any` ou `unknown`, ou, para uma declaração de variável/campo, quando foi declarado sem anotação e sem inicializador. Parâmetros e retornos com tipo contextual ou inferido restritivo continuam protegidos mesmo sem anotação. Objetos não aceitam propriedades extras por padrão. A configuração global `allowExtraPropertiesAll` ou um decorator permite liberar extras explicitamente, mantendo a validação das propriedades conhecidas. Violações produzem uma classe de erro pública que a aplicação pode capturar e tratar.

A referência a Java expressa a intenção de impedir valores incompatíveis em runtime. A semântica de tipos continua sendo a do TypeScript, com a regra adicional de objetos fechados descrita abaixo; não se pretende reproduzir o sistema de tipos da JVM.

**Política confirmada em 2026-10-16:** priorizar compatibilidade. Contratos suportados são validados e violações produzem `StrictTypeError`. Casos com proteção parcial ou ausente continuam compilando com warnings obrigatórios e localizados; nunca marcar esses casos como totalmente protegidos. `compiler.onUnsupported` é `warn` por padrão e pode ser `error` para projetos que optarem por cobertura estrita. Erros estáticos TS, configuração inválida e falhas do build continuam fatais.

## 2. Contexto e entregáveis

O repositório contém a especificação e a fundação inicial; a implementação completa ainda não foi consolidada. Criar um compilador/builder que lê os fontes antes da remoção dos tipos, gera validações e preserva o funcionamento do NestJS, incluindo DI, decorators e metadata.

Entregar:

- Biblioteca/CLI TypeScript, configuração e schema JSON.
- Runtime público exportando `StrictTypeError` e `AllowExtraProperties`.
- Transformer e análise com `typescript.Program`/`TypeChecker`.
- Build sem bundle para diagnóstico e build com `@vercel/ncc` para deploy.
- Relatório de cobertura, testes, aplicação Nest de exemplo e documentação de compatibilidade.

Não exigir imports para ativar proteção. Imports são necessários somente para usar o decorator ou tratar o erro público. O pacote que exporta esses símbolos precisa estar disponível como dependência de execução no modo sem bundle; no bundle, os símbolos são incluídos preservando sua identidade.

### 2.1 Organização obrigatória do repositório

```text
ts-typed/
├── system/
│   ├── package.json             # Workspace privado e scripts integrados
│   ├── package-lock.json
│   ├── tsconfig.json            # Regras TS compartilhadas
│   ├── base/                   # Pacote ts-typed, independente de framework
│   │   ├── package.json
│   │   ├── schema.json
│   │   ├── src/{cli,compiler,runtime,config,bundler,integration}/
│   │   └── tests/
│   └── frameworks/
│       ├── nestjs/              # Pacote/adaptador NestJS, build e testes próprios
│       └── <framework>/         # Express, Angular, React, Vue, Next.js etc. quando implementados
├── devops/                     # Scripts CI/CD, release, infraestrutura e containers
├── docs/                       # Specs, arquitetura, guias e documentação permanente
├── .github/workflows/          # Entrypoints mínimos exigidos pelo GitHub Actions
├── README.md
├── LICENSE
└── NOTICE
```

- O núcleo geral fica em `system/base/`; código específico de cada framework fica somente em `system/frameworks/<id>/`, incluindo configuração de build, dependências, fixtures e testes específicos. A exceção à regra anterior de projeto único diretamente em system foi solicitada pelo usuário: system agora é workspace de pacotes.
- São subprojetos/pacotes no mesmo Git, não repositórios Git aninhados nem submodules. Cada um tem package.json, entrada pública, build e testes independentes. Um repositório independente poderá ser extraído depois sem acoplar o núcleo.
- O pacote público principal é `@ts-typed/compiler`; integrações usam `@ts-typed/<id>`. Os nomes foram reservados, mas nenhuma publicação é executada automaticamente.
- O núcleo não importa frameworks; integrações dependem da API pública do núcleo e declaram framework em peerDependencies opcionais/obrigatórias conforme uso. Não duplicar runtime, classes de erro ou schemas.
- TypeScript puro funciona sem adaptador e sem Nest instalado. Express genérico usa o núcleo; criar adaptador Express apenas se houver comportamento específico. Frameworks futuros não são declarados suportados só por terem nomes na documentação.
- Adaptador recebe contexto tipado de projeto/compilação e devolve entry/configuração/diagnósticos por hooks públicos versionados. Não pode desabilitar proteção, mudar schemas internos ou incluir tipos sem cobertura. Nenhum adaptador pode depender de caminhos privados do núcleo.
- Detecção automática só escolhe integração quando inequívoca; `integration` em typets.config.json permite `typescript` (default) ou um módulo de adaptador explícito. Módulos informados são código do projeto: resolver relativamente à raiz e executar apenas o adaptador escolhido, nunca varrer/executar plugins arbitrários. Adaptador ausente/incompatível bloqueia build.
- Angular, React, Vue, Next.js e demais frameworks terão pacotes próprios quando implementados; JSX/TSX, ESM/browser/SSR e plugins de compilação requerem provas e testes próprios. CommonJS/Node é apenas a plataforma inicial, não restrição arquitetural permanente do núcleo.
- Infraestrutura e scripts operacionais ficam em devops. GitHub Actions exige .github/workflows: ali manter apenas triggers/permissões/orquestração mínima que chama devops.
- Documentação pública fica em docs, salvo README/LICENSE/NOTICE da raiz e cópias necessárias à distribuição npm. Planos, checkpoints, resumos e relatórios de execução são locais e ignorados pelo Git (.ai-orchestration/, docs/plans/, docs/implementations/, .superpowers/); código-fonte, testes, spec e guias de uso continuam versionáveis. A organização não muda os diretórios de projetos consumidores: typets.config.json continua na raiz deles.
- Builds/testes partem de system com workspaces; publicação usa cada pacote. README/licença/NOTICE são preparados automaticamente no empacotamento, sem cópias manuais divergentes. Não publicar fixtures, infraestrutura, checkpoints ou temporários.

### 2.2 README e uso público

O README da raiz deve ser a entrada útil para usuários externos e refletir o estado real do projeto. Enquanto só existir especificação, informar explicitamente que não há implementação/release pronta e apresentar comandos futuros como planejados, sem badges ou garantias de funcionalidades inexistentes.

Para a entrega implementada, incluir: propósito, requisitos Node/TypeScript/Nest suportados, instalação, `init`, configuração, exemplo de proteção profunda e generics, tratamento de `StrictTypeError`, decorator e `allowExtraPropertiesAll`, build com/sem ncc, limites de suporte, uso por empresas/licenciamento, contribuição e links para guias em `docs/`. Validar exemplos e links relativos tanto no GitHub quanto no README exibido no npm; não usar caminhos absolutos da máquina do autor.

Documentar setup de contribuição (`cd system`, instalação, testes/build dos workspaces), fluxo de mudanças e regras de contribuição. Documentação operacional de pipelines/releases fica em `docs/`, apontando para implementações em `devops/`.

### 2.3 Distribuição e licenciamento

Decisão confirmada pelo autor: permitir uso, modificação, distribuição e venda, inclusive por empresas e projetos derivados, preservando os créditos e avisos do original. Esta decisão substitui a proibição comercial anterior.

Adotar **Apache License 2.0**, sem acrescentar cláusula de proibição comercial. Preservar licença, avisos aplicáveis de autoria/atribuição e indicar arquivos modificados conforme a licença. Incluir `NOTICE` identificando ts-typed e sua origem; inserir o link do repositório original quando a URL pública for confirmada. Não inventar URL, titularidade ou nomes de autores.

Usar o ts-typed original como dependência/upstream e contribuir melhorias nele é uma recomendação de comunidade, não uma exigência para usuários ou forks. Não exigir publicidade, link na interface ou exclusividade como condição adicional da Apache-2.0. Atribuição não implica endosso do autor ao projeto derivado.

LICENSE já contém o texto oficial inalterado da Apache-2.0, e NOTICE identifica o projeto. Completar avisos de autoria e URL de origem com informações confirmadas antes da publicação. Incluir ambos no pacote npm; usar `Apache-2.0` nos metadados do pacote. README e documentação devem descrever o projeto como open source sob Apache-2.0 após os arquivos de licença estarem presentes.

Distinguir código do consumidor, runtime redistribuído e componentes de terceiros. Preservar licenças/avisos das dependências e assets empacotados. A licença do ts-typed não obriga produtos consumidores ou derivados a serem gratuitos nem a publicar todo seu código-fonte.

Referência: https://www.apache.org/licenses/LICENSE-2.0.html .

## 3. Contrato de tipagem

### 3.1 Seleção de contratos

| Declaração | Comportamento |
| --- | --- |
| `name: string = ''` | Protegida como `string` |
| `name = ''` | Protegida pelo tipo inferido pelo checker, normalmente `string` |
| `status = 'ACTIVE' as const` | Protegida pelo literal inferido |
| `payload: any` ou `payload: any = 1` | Aberta |
| `payload: unknown` ou `payload: unknown = 1` | Aberta; preservar restrições estáticas de `unknown` |
| `payload;` | Aberta pela ausência de anotação e inicializador |
| `name!: string` | Protegida; inicialização adiada conforme §3.4 |
| `name?: string` | Protegida, permitindo `undefined` |
| `items = []` | Usar o tipo efetivo do checker; não inventar `any[]` |

A abertura de um campo não abre outros campos nem toda a classe. Um contêiner como `any[]` continua sendo um array: aceita elementos arbitrários, mas rejeita receber um número. `Record<string, any>` continua exigindo um objeto compatível com seu contrato. Uniões simplificadas pelo checker para `any` ou `unknown` seguem a regra de abertura.

Não converter erros estáticos para avisos para permitir campos abertos. Por exemplo, se `noImplicitAny` rejeitar `payload;`, o build deve reportar o erro original. O usuário pode declarar `payload: any` ou configurar o TypeScript normalmente.

### 3.2 Tipos obrigatórios e cobertura

Proteger primitivas (`string`, `number`, `boolean`, `bigint`, `symbol`), literais, `null`, `undefined`, uniões, interseções, opcionais, arrays, tuplas, enums, objetos estruturais, interfaces, aliases, classes, tipos recursivos e generics resolvidos. Tipos mapeados/condicionais devem ser resolvidos pelo checker quando houver schema concreto.

- Não fazer coerção: `'25'` não satisfaz `number`.
- `number` aceita `NaN` e infinitos; restrições de domínio não são tipagem.
- `never` não aceita nenhum valor.
- Opcionais ausentes são aceitos; escrita explícita de `undefined` respeita `exactOptionalPropertyTypes` e o contrato de escrita do TypeScript.
- `strictNullChecks: true` é obrigatório. Configuração incompatível deve falhar com diagnóstico claro.
- Preservar regras estáticas de `readonly`; modificações por casts também devem respeitar o contrato de imutabilidade quando aplicável.
- Referências de classe usam compatibilidade estrutural quando essa é a semântica do tipo. Tipos com identidade nominal, membros privados ou built-ins exigem schemas específicos; não reduzir tudo a `instanceof` ou objeto simples.
- Funções como valores de propriedades exigem ao menos a verificação de que são funções. Se a assinatura restritiva não puder ser garantida quando chamada através da propriedade protegida, emitir warning de cobertura parcial; não declarar a assinatura protegida apenas com `typeof`.

Tipos externos opacos, parâmetros genéricos apagados ou outros contratos sem schema confiável geram warnings e permanecem sem a validação não materializável. Documentar a alternativa de fornecer suporte ao schema ou alterar conscientemente a declaração para um tipo aberto. Não alterar tipos-fonte nem converter silenciosamente contratos restritivos em `any`.

### 3.3 Alcance

Cobrir propriedades declaradas em classes do projeto: públicas, `private`, `protected`, `#private`, estáticas, parameter properties, propriedades herdadas, accessors tipados e propriedades decoradas. Cobrir também propriedades de objetos/arrays vinculados a esses campos, inclusive referências compartilhadas e ciclos.

Declarar explicitamente o tratamento de chaves computadas e símbolos. Se não houver suporte comprovado, emitir warning localizado e preservar o comportamento original. Propriedades `declare` não são campos criados automaticamente: validar sua implementação concreta ou diagnosticar a ausência de um ponto de proteção.

Uma classe/objeto fechado também rejeita novas propriedades não declaradas. Isso inclui classes sem campos restritivos: um campo aberto permite qualquer valor naquele nome, não novos nomes arbitrários.

Cobrir também variáveis/constantes locais e de módulo, parâmetros, retornos, funções nomeadas/anônimas/arrow, métodos, callbacks, assinaturas de chamada/construção, construtores, closures, bindings de desestruturação, getters/setters e expressões que estabelecem contratos, conforme §3.6–3.10. `type`, interface e declarações `.d.ts` fornecem schemas; não são valores instrumentados por si.

Não instrumentar internamente bibliotecas de terceiros. Validar seus valores nas fronteiras tipadas do projeto, incluindo imports, argumentos de chamadas externas e resultados utilizados pelo projeto. Uma anotação de DTO em parâmetro deve validar a estrutura do body recebido em runtime, sem depender de instanciar a classe nem substituir a transformação/coerção do Nest. Não instanciar DTOs implicitamente.

### 3.4 Inicialização

Validar inicializadores e escritas durante construtores, inclusive quando usam valores vindos de `any`. Não deixar uma janela sem proteção durante a inicialização.

Um campo sem inicializador pode permanecer temporariamente não inicializado até sua primeira escrita. Essa condição é um estado interno distinto de uma atribuição explícita de `undefined`; a primeira escrita já precisa ser válida. Para inicializadores explícitos, `undefined` só é aceito quando compatível com o tipo.

Preservar ordem dos inicializadores, `super()`, execução de construtores e metadata. Inicializadores que escrevem em outros campos também precisam ser validados. Herança não pode sobrescrever ou remover a proteção instalada pela classe base. Compor o schema da hierarquia concreta antes da validação: campos declarados pela subclasse não são extras da base. Contratos de instância e estáticos são separados. Uma subclasse pode declarar novos campos, sempre validados, inclusive quando herda a permissão de extras da base.

### 3.5 Mutações profundas e aliases

A proteção continua depois da atribuição:

```ts
class ProfileService {
  name = '';
  roles: string[] = [];
  profile: { name: string } = { name: '' };
}

(service as any).name = 123;               // StrictTypeError
(service.roles as any).push(123);          // StrictTypeError
(service.profile as any).name = 123;       // StrictTypeError
(service.profile as any).extra = true;     // StrictTypeError
Object.assign(service, { name: 123 });     // StrictTypeError
```

Cobrir escrita por índice, `push`, `splice`, demais operações mutantes de arrays, redefinição de descritores, `Reflect.set`, `Reflect.defineProperty`, `delete` e mudanças de protótipo capazes de invalidar o contrato. Excluir campo obrigatório falha; remover campo opcional pode ser aceito se o resultado satisfizer o schema. Tuplas devem preservar posições, tipos e tamanho permitido.

Validar referências preexistentes, não apenas o acesso pelo campo:

```ts
const source = { name: 'Patrick' };
service.profile = source;
(source as any).name = 123; // Também deve ser rejeitado
```

Aliases externos não controláveis são aceitos por compatibilidade; advertir sobre a mutação que pode escapar. Validar na entrada e nas escritas controladas, preservando identidade quando possível. Não afirmar interceptação de todas as escritas por aliases.

Uma referência compartilhada entre campos deve satisfazer todos os contratos ativos. Definir registro e liberação desses vínculos sem vazamento de memória. Validadores devem suportar ciclos sem recursão infinita e manter caminhos úteis nos erros.

A operação rejeitada não pode deixar o alvo protegido inválido. Para operações compostas, validar antes de alterar o alvo ou usar estratégia transacional. `Object.assign` pode preservar escritas anteriores válidas, mas nunca aplicar a escrita inválida. Métodos mutantes de arrays devem rejeitar a operação inteira quando seu resultado violar o contrato.

### 3.6 Variáveis, constantes e expressões

- Validar inicialização e cada escrita de `let`, `var` e bindings de módulo, usando o tipo declarado/inferido do símbolo, não um tipo artificialmente ampliado pelo valor que chega via `any`.
- Validar inicialização de `const` e manter proteção profunda de seus objetos/arrays. `const` impede reatribuir o binding, não torna o objeto imutável.
- Cobrir atribuições simples, compostas, incrementos/decrementos, bindings desestruturados, defaults, rest e variáveis de `for..of`/`for..in`. Preservar ordem de avaliação e não executar expressões/getters duas vezes.
- Respeitar TDZ, hoisting, closures, live bindings de imports/exports e escopo original. Uma variável ainda não inicializada não equivale a aceitar uma escrita inválida.
- `as T`, sintaxe `<T>`, non-null assertion e `satisfies` não podem abrir buracos: validar o contrato restritivo afirmado no ponto da expressão, antes do consumo. Cast para `any`/`unknown` não remove contratos já ligados à origem ou ao destino. `satisfies` não muda o tipo inferido da expressão.
- Tipos refinados por fluxo de controle não criam um novo contrato permanente para o binding. Escritas continuam respeitando o tipo de escrita original; assertions/predicados usados para estabelecer um refinamento restritivo devem ser verificados, sem confiar cegamente em funções que retornam `true`.

```ts
interface IResponse<T> {
  status: number;
  data: T;
  message: string;
}
interface IUser { name: string; age: number; mail: string; }

const response: IResponse<IUser> = externalPayload as any;
// Valida status/message e todos os campos de data, antes de aceitar o valor.
(response.data as any).age = '25'; // StrictTypeError

let total = 0;
total = externalPayload as any; // Exige number em runtime.
```

### 3.7 Funções, métodos e construtores

- Validar parâmetros antes da primeira instrução do corpo, inclusive em chamadas por `any`, módulos externos, `call`, `apply` e `bind`. Preservar `this`, aridade observável quando necessária e identidade de funções aceitas; incompatibilidade segue §6.2.
- Cobrir tipos inferidos contextualmente em callbacks/arrows, parâmetros opcionais, defaults, rest, desestruturação e parâmetro `this` quando restritivo. Defaults seguem a ordem JS; falha não pode permitir entrada no corpo com contrato inválido.
- Validar cada retorno explícito e o retorno implícito de arrow functions; verificar caminhos que terminam sem `return`. Avaliar o valor retornado uma única vez e preservar `try/finally`.
- Retorno `void` permite valores descartados conforme semântica TS; não confundir com retorno explicitamente `undefined`, que exige esse valor. `never` não permite conclusão normal, mas permite lançar erro ou não terminar.
- Construtores validam argumentos antes de seus usos e a instância resultante conforme o contrato de construção. Em derivados, respeitar a proibição de acessar `this` antes de `super()`; parameter properties validam parâmetro e campo.
- Overloads: a chamada deve satisfazer ao menos uma assinatura pública completa, respeitando a relação entre argumentos e retorno. O tipo mais permissivo da implementação não substitui os contratos públicos. Quando o checker resolve a chamada a uma assinatura concreta, usar seu contrato de retorno. Em chamadas dinâmicas sem assinatura estática selecionada, exigir que o retorno satisfaça todos os contratos das assinaturas aplicáveis; se essa ambiguidade não puder ser resolvida com segurança, rejeitar a chamada. Não selecionar a assinatura apenas pelo retorno.
- Funções recebidas como valores também têm contratos de chamada: callbacks de terceiros não são aceitos como plenamente protegidos só por serem funções. Para chamadas realizadas fora do projeto, instalar uma fronteira de invocação/retorno na própria função exportada ou vinculada, não apenas nos call sites transformados; preservar identidade e comportamento; caso não seja possível proteger todas as chamadas, emitir warning e validar as fronteiras controladas.
- Reatribuição de um parâmetro tipado durante o corpo e objetos retornados continuam protegidos, inclusive por aliases. Não desativar contratos apenas porque a função já retornou enquanto referências protegidas permanecerem acessíveis.

### 3.8 Async, promises, generators e coleções

- Em `async`, validar os parâmetros e o valor resolvido conforme `Promise<T>`. Uma violação de retorno rejeita a promise com `StrictTypeError`; chamada assíncrona não deve ser convertida em API síncrona.
- Uma propriedade/variável `Promise<T>` valida o contêiner e seu resultado. Se não houver como proteger aliases e resultado, aceitar a vinculação com warning e validar onde for controlável, conforme §6.2. Valores resolvidos só ficam disponíveis pela fronteira protegida após validação. Não criar rejeições não tratadas artificiais nem presumir que somente `instanceof Promise` cobre thenables. Identidade e aliases de promises entram na prova de viabilidade.
- Generators/async generators validam valores de `yield`, retorno final e valores enviados por `next`, conforme `Generator<Yield, Return, Next>` e variantes. Preservar protocolo de iterator, `throw`, `return` e encerramento.
- `Map<K,V>`, `Set<T>` e demais built-ins com estado tipado exigem adapters: validar conteúdo inicial, mutações, iteração e aliases. `Date`, arrays tipados e instâncias opacas não podem ser aceitos como objetos vazios apenas por falta de chaves enumeráveis. A matriz inicial obrigatória de adapters compreende Map, Set, Date, Promise/thenables, arrays tipados e protocolos Iterator/AsyncIterator/Generator; WeakMap/WeakSet e demais built-ins sem adapter comprovado geram warning de cobertura ausente, sem aceitação estrutural fictícia. Contratos de domínio como formato de e-mail continuam fora da validação de tipos.

### 3.9 Generics e tipos avançados

Resolver instâncias concretas como `IResponse<IUser>` antes do emit, gerando schemas recursivos completos. Em funções/classes genéricas, transportar descritores de tipo quando o tipo restritivo depender de `T`, seja explícito ou inferido; cobrir chamadas aninhadas, recursão, constraints e factories.

```ts
function identity<T>(value: T): T { return value; }
const user = identity<IUser>(externalPayload as any); // Valida IUser na entrada e saída.
```

O transporte dos schemas não pode mudar a API pública observável nem quebrar chamadas externas. Se o checker realmente resolver `T` como `any`/`unknown`, o contrato correspondente fica aberto pela regra geral. Isso difere de um `T` restritivo cujo descritor foi perdido: ausência de informação não autoriza convertê-lo para `any`. Em fronteira sem descritor suficiente, não inferir o contrato apenas do valor recebido, pois isso tornaria qualquer valor autovalidável. Usar contratos concretos verificáveis onde disponíveis; ausência de descritor gera warning conforme §6.2. A constraint é um mínimo e não substitui a instância concreta de `T` quando ela for conhecida.

Resolver `keyof`, indexed access, mapped types, conditional types, template literal types, intersections e uniões discriminadas quando concretos. Marcas puramente estáticas sem testemunho runtime verificável exigem diagnóstico; não inventar equivalência runtime. Tipos de assinatura, predicados `x is T` e funções `asserts` devem validar o valor refinado contra um schema materializável de `T` quando usados pelo código protegido; não tentar provar semanticamente a implementação arbitrária do predicado. Sem schema verificável, emitir warning e preservar a fronteira.

### 3.10 Fronteiras e cobertura total

A cobertura pertence ao código do projeto selecionado pelo tsconfig. Imports e exports com contratos restritivos devem ser protegidos nas fronteiras, inclusive bibliotecas JS/.d.ts, reexports e callbacks. Não alterar contratos estáticos nem prometer instrumentação interna de código nativo, `eval`, `Function` ou código de terceiros que não passa por fronteiras controláveis.

Código dinâmico (`eval`/`Function`) está fora da análise dos fontes. Valores oriundos dele são validados ao cruzar contratos protegidos; acessos que possam contornar esses contratos geram warnings. Essa limitação consta no relatório de cobertura.

Todo ponto restritivo encontrado deve aparecer no relatório como protegido, parcial ou não protegido. Casos parciais/ausentes geram warnings com arquivo/linha/coluna, nome e motivo. Campos abertos por regra são classificados separadamente; não são falhas de suporte. O critério de completude inclui a transparência da cobertura em todas as categorias tipáveis.

## 4. Objetos fechados e decorator de extras

### 4.1 Regra padrão

Objetos estruturais e instâncias protegidas rejeitam propriedades extras na atribuição inicial, substituição e mutações posteriores. Validar chaves próprias string e symbol, inclusive não enumeráveis quando fazem parte dos dados. Não confundir métodos do protótipo e infraestrutura do runtime com dados extras.

```ts
class Service {
  profile: { name: string } = { name: '' };
}

(service as any).profile = { name: 'Patrick', age: 25 }; // Erro
```

Assinaturas de índice são permissões explícitas do tipo: `Record<string, number>` aceita chaves string arbitrárias, validando seus valores. Não exigir decorator para chaves já permitidas pelo tipo. Propriedades desconhecidas não autorizadas continuam bloqueadas.

### 4.2 Liberação global

`allowExtraPropertiesAll: false` é o default. Com `true`, todos os objetos/instâncias protegidos aceitam extras, inclusive objetos aninhados, mantendo a validação dos campos declarados, assinaturas de índice e demais contratos. A configuração não torna um campo `string` aberto nem ignora valores inválidos dentro de propriedades conhecidas.

Com o default `false`, `@AllowExtraProperties()` permite exceções locais. Com `true`, o decorator é redundante e permitido. Não existe decorator de bloqueio local nesta entrega. Chaves extras continuam fora do tipo estático se não houver assinatura de índice. Arrays/tuplas continuam respeitando tipos dos elementos, tamanho e demais invariantes: liberar extras não libera índices incompatíveis.

### 4.3 API proposta

```ts
import { AllowExtraProperties } from '@ts-typed/compiler';

@AllowExtraProperties()
class Metadata {
  source: string = '';
}

class ProfileService {
  @AllowExtraProperties()
  profile: { name: string } = { name: '' };
}
```

Decisão de projeto: suportar o decorator tanto em classes quanto em propriedades cujo contrato contenha objetos.

- Em classe: permite campos extras nas instâncias dessa classe. Herança preserva essa permissão nas instâncias derivadas; documentar esse comportamento.
- Em propriedade: permite extras no objeto diretamente atribuído àquele campo. Em arrays/tuplas, aplica-se aos objetos que são elementos diretos. Não abre automaticamente objetos aninhados.
- O decorator permite qualquer valor nas chaves extras, mas **não** relaxa os tipos, a obrigatoriedade ou a validação profunda das chaves declaradas.
- Interfaces, aliases e variáveis não recebem decorators TypeScript diretamente. Para um contrato usado apenas em variável/parâmetro/retorno, usar `allowExtraPropertiesAll` ou uma classe de contrato com `@AllowExtraProperties()`; não inventar sintaxe de decorator em bindings. Decorators em parâmetros/métodos para liberar extras não fazem parte desta API. A proteção desses pontos continua obrigatória.
- Em campo primitivo sem alternativa de objeto, o uso é erro de configuração no build.
- O decorator não torna válido um contrato que continua proibido por outro vínculo da mesma referência compartilhada.
- Extras não fazem parte automaticamente do tipo estático. Para acessá-los sem casts, declarar assinatura de índice ou outro tipo adequado. O decorator não altera a checagem estática.
- Decorators de terceiros não podem excluir o campo da proteção. Incompatibilidades precisam emitir warning e informar o decorator/campo envolvido, preservando o comportamento da aplicação.

### 4.4 `@StrictClass()` / `@StructuralClass()`

Decisão de projeto (2026-10-16): classes referenciadas por outros contratos (ex.: argumento genérico, propriedade tipada pela classe) são validadas **estruturalmente** por padrão — igual a uma interface equivalente — porque essa é a semântica estrutural real do TypeScript; reduzir isso a `instanceof` por padrão rejeitaria em runtime valores que o próprio `tsc` aceita. `compiler.strictClass` (padrão `false`) controla o default do projeto; os decorators de classe `@StrictClass()` e `@StructuralClass()` sobrescrevem esse default por classe (têm precedência sobre o config global) e são herdados por subclasses, salvo override explícito na subclasse.

- `@StrictClass()`: exige `instanceof` da classe na validação, além da checagem estrutural.
- `@StructuralClass()`: força validação estrutural mesmo com `compiler.strictClass: true` global.
- A checagem de `instanceof` depende de o compilador conseguir embutir uma referência viva ao construtor da classe no ponto de validação. Isso é possível quando a classe está declarada no mesmo arquivo do contrato que a referencia, ou em outro arquivo desde que importada por nome ali (`import { Classe } from '...'`, inclusive `import type`); o compilador sintetiza seu próprio import/require para essa referência. Quando a classe só é alcançável por inferência ou por um namespace import (`import * as ns from '...'`), não há como resolver uma referência por nome: a validação cai para estrutural e, quando `compiler.strictClass` global é `true`, emite warning de cobertura informando a limitação em vez de fingir a checagem nominal.
- Membros antigos `private`/`protected` do TypeScript não têm efeito em runtime e são tratados como campos públicos comuns para fins de validação estrutural. Um campo `#private` verdadeiro (ECMAScript) não é alcançável via `Reflect` e torna o contrato não suportado, com warning honesto, independente de `strictClass`.

### 4.5 `compiler.enforcePrivate` e `compiler.enforceReadonly`

Decisão de projeto (2026-10-16): por padrão o TypeScript ignora `private` e `readonly` em runtime — ambos são apagados na emissão, sem nenhum efeito prático. `compiler.enforcePrivate` e `compiler.enforceReadonly` (ambos boolean, padrão `true`, independentes um do outro) fazem o compilador garantir essas garantias de verdade, deixando as classes protegidas como foram desenhadas no código-fonte TypeScript.

**`enforcePrivate`:** reescreve um campo `private` (apenas `PropertyDeclaration` simples; parameter properties como `constructor(private foo: string)` permanecem sempre não suportadas, sem conversão) em um par de acessor `#private` real do ECMAScript, com armazenamento também `#private`. Toda referência ao campo dentro do corpo da própria classe (o único lugar onde `private` do TypeScript já permite acesso) é reescrita por símbolo do checker, não por texto. Fora da classe o campo deixa de existir sob o nome público — não há mais leitura/escrita reflexiva nenhuma, nem mesmo via `(obj as any).campo`, que passa a criar silenciosamente uma propriedade pública nova e não relacionada, sem tocar o valor real.

- Um campo `private` convertido acessado em qualquer lugar do programa via colchetes (`obj['campo']`) falha o build: não existe equivalente de bracket notation para `#private`, e essa falha é deliberadamente fatal, não um warning descartável.
- A varredura de bracket notation só detecta o padrão quando o tipo estático no ponto de acesso ainda carrega a classe (`b['campo']` com `b: Box`). Acesso via `any` antes do colchete (`(b as any)['campo']`) é indetectável por natureza e documentado como limite honesto.
- Um campo com identidade nominal exigida (`strictClass`/`@StrictClass()`) que também vira `#private` continua funcionando: a conversão só afeta como o campo é armazenado/acessado dentro da própria classe, não a referência `instanceOf` externa da classe inteira.
- Um campo `private` que já seja `#private` nativo, `static`, ou tenha um método (não propriedade) não é afetado por esta opção.

**`enforceReadonly`:** um campo `readonly` passa a validar normalmente (como qualquer outro campo guardado) enquanto o construtor da classe que o declara ainda está executando — TypeScript permite reatribuir um `readonly` quantas vezes forem necessárias dentro desse construtor — e trava contra qualquer escrita futura assim que esse construtor termina (inclusive por `return` antecipado ou exceção, via `try/finally`), lançando `StrictTypeError` com código `READONLY_PROPERTY` a partir daí.

- `enforcePrivate` e `enforceReadonly` combinam-se livremente: `private readonly foo` (padrão comum de injeção de dependência) vira um acessor `#private` que também trava após a construção.
- Sem `enforceReadonly`, campos `readonly` continuam exatamente como antes (sem nenhuma proteção), preservando compatibilidade para quem desabilitar a opção.

## 5. Classe de erro pública

Exportar uma única identidade pública de `StrictTypeError extends TypeError`, usada pelo código emitido e pelos imports da aplicação, tanto com bundle quanto sem bundle.

```ts
export type StrictTypeErrorCode =
  | 'TYPE_MISMATCH'
  | 'EXTRA_PROPERTY'
  | 'REQUIRED_PROPERTY'
  | 'READONLY_PROPERTY'
  | 'INVALID_MUTATION';

export interface StrictTypeErrorInfo {
  code: StrictTypeErrorCode;
  className?: string;
  functionName?: string;
  contractKind: 'property' | 'variable' | 'parameter' | 'return' | 'expression' | 'yield' | 'construction';
  propertyPath: string;
  expected: string;
  received: string;
  operation: 'initialize' | 'set' | 'define' | 'delete' | 'mutate' | 'argument' | 'return' | 'resolve' | 'yield' | 'assert';
}

export class StrictTypeError extends TypeError {
  readonly code: StrictTypeErrorCode;
  readonly className?: string;
  readonly functionName?: string;
  readonly contractKind: StrictTypeErrorInfo['contractKind'];
  readonly propertyPath: string;
  readonly expected: string;
  readonly received: string;
  readonly operation: StrictTypeErrorInfo['operation'];
  constructor(info: StrictTypeErrorInfo);
  toJSON(): StrictTypeErrorInfo;
}
```

Exemplo: `StrictTypeError: ProfileService.profile.name expected string, received number`.

- `name` deve ser `StrictTypeError`; `instanceof StrictTypeError` e `instanceof TypeError` devem funcionar no projeto consumidor.
- Caminhos identificam qualquer contrato, incluindo `response.data.age`, `createUser.arguments[0].mail`, `loadUser.return.data.name` e campos/índices. `className` é opcional para funções e variáveis fora de classes; `functionName` identifica a função quando aplicável. Não depender de nomes preservados pela minificação para compor os contextos.
- Para extras, indicar a chave rejeitada e o contrato fechado esperado.
- Não incluir o valor recebido, stack ou dados sensíveis em `toJSON()`; `received` descreve o tipo/categoria.
- Falhas de compilação/configuração têm diagnósticos próprios e exit code não zero; não simular erro de tipagem runtime para falha interna do builder.

Documentar captura em `try/catch` e filtro NestJS usando `instanceof`. A biblioteca não decide automaticamente o status HTTP: violação em entrada pode ser mapeada pelo projeto; falha interna não deve ser exposta como erro do cliente por padrão.

## 6. Arquitetura e viabilidade

### 6.1 Pipeline

1. Resolver `tsconfig.build.json` ou `tsconfig.json`, incluindo `extends`, includes/excludes e opções; delegar entry/sourceRoot/tsConfigPath e metadata específica ao adaptador Nest quando selecionado.
2. Usar a versão de `typescript` do projeto, construir `Program`/`TypeChecker` e falhar diante de erros estáticos.
3. Classificar cada ponto tipável como protegido, parcial, não protegido ou aberto pelas regras do §3.1.
4. Gerar schemas de runtime com referências estáveis para tipos recursivos e contratos de escrita.
5. Aplicar transformação antes do emit, preservando decorators, `experimentalDecorators`, `emitDecoratorMetadata` e DI.
6. Emitir código instrumentado e runtime em staging, sem modificar os fontes consumidores.
7. Validar resolução de módulos, aliases `paths`/`baseUrl`, entry e runtime público.
8. Publicar saída sem bundle ou empacotar o JS emitido com a API de `@vercel/ncc`.
9. Gerar relatório de cobertura e manifesto de assets/externals; substituir a saída apenas após build válido.

### 6.2 Não assumir que accessors ou Proxy resolvem tudo

A estratégia anterior de instalar accessors após inicializadores não cumpre este contrato: perde mutações profundas, campos privados, extras e aliases. Um Proxy colocado somente na propriedade também não intercepta escrita por uma referência anterior do objeto original.

Antes da implementação completa, produzir uma prova de viabilidade cobrindo:

- Aliases anteriores à atribuição, criação de novas chaves e operações reflexivas.
- Identidade (`===`), referências compartilhadas, ciclos e objetos congelados/não extensíveis.
- `#private`, accessors, static, herança e inicialização.
- Integração real com decorators, DI, serializers e objetos de bibliotecas.

A arquitetura combina schemas gerados no build, checks de fronteiras/operações e proteção de campos quando compatível. Preservar identidade, protótipos, metadata e semântica de inicialização. Proxy/cópia não pode ser introduzido silenciosamente mudando referências públicas apenas para alegar proteção completa.

**Resultado do gate e decisão:** provas mostram que aliases externos e operações reflexivas podem escapar de guards locais. O usuário optou por aceitar esses casos com warnings em vez de rejeitar a aplicação. O gate de arquitetura está resolvido; a implementação pode prosseguir com cobertura explícita.

### 6.3 Contrato de warnings

Cada warning deve incluir código estável (`TT_UNSUPPORTED_TYPE`, `TT_PARTIAL_ALIAS`, `TT_UNSUPPORTED_SYNTAX` ou equivalente), arquivo-fonte, linha/coluna de base1, categoria do contrato (propriedade/variável/parâmetro/retorno/etc.), nome/caminho do item, motivo e limite exato. Exemplo:

```text
src/users.ts:12:3 warning TT_PARTIAL_ALIAS: response — atribuição validada; mutações por aliases externos podem escapar.
```

- Sempre imprimir warnings, inclusive com diagnóstico summary/quiet do ncc; agrupar também resumo por arquivo com contagens protegido/parcial/não protegido/aberto.
- Manifesto JSON contém todos os itens e warnings, não apenas contadores. Não incluir valores de payloads.
- Não emitir warnings para `any`/`unknown` deliberados, mas listá-los como abertos. Um tipo restritivo não materializável nunca é listado como aberto por acidente.
- `compiler.onUnsupported: warn` padrão: build termina normalmente se somente esses warnings existirem. `error`: mesmos diagnósticos tornam build fatal antes da publicação da saída. Erros TS/configuração/IO permanecem fatais nos dois modos.
- Warnings de alias/reflexão são associados ao ponto de vínculo tipado, mesmo que a escrita externa só aconteça em runtime; não é necessário saber o arquivo interno da biblioteca para advertir sobre a fronteira.
- Não prometemos detectar semanticamente todos os bypasses de JavaScript arbitrário. Publicar limites conhecidos e advertir de forma conservadora nas fronteiras afetadas.

## 7. Integrações, NestJS e distribuição

- Implementar detalhes Nest exclusivamente no pacote `system/frameworks/nestjs`; o núcleo oferece hooks genéricos e permanece utilizável em TS puro.
- Integrar por scripts executando `ts-typed build`, sem presumir builder nativo do Nest CLI.
- Preservar providers, controllers, escopos, constructor injection e metadata.
- Tentar proteger propriedades decoradas sem quebrar metadata; incompatibilidades comprovadas geram warning localizado, nunca exclusão silenciosa.
- Testar a aplicação real, incluindo rota HTTP e captura de `StrictTypeError` por filtro.
- Bibliotecas que redefinem campos, como ORMs/serializers, exigem compatibilidade comprovada; registrar diagnóstico preciso quando incompatíveis.
- CommonJS é o alvo inicial; ESM/NodeNext incompatível falha claramente. Angular e watch/HMR ficam fora desta entrega.
- Runtime público não pode depender apenas de um helper privado gerado: import do erro/decorator precisa resolver e compartilhar identidade com os guards.

## 8. CLI, configuração e bundle

### 8.1 Arquivo na raiz e inicialização

O nome do projeto e CLI é **`ts-typed`**; o pacote npm principal é **`@ts-typed/compiler`**. O arquivo global padrão é **`typets.config.json`**, na raiz do projeto consumidor, ao lado de `package.json` e `tsconfig.json`. O nome do arquivo é uma decisão desta especificação baseada no exemplo solicitado pelo usuário.

```text
npm install --save-dev @ts-typed/compiler
npx ts-typed init
npx ts-typed build
npx ts-typed build --config ./typets.config.json
npx ts-typed --help
```

`init` cria o arquivo quando ausente e é idempotente. Preserva configurações existentes e mostra diff/obtém confirmação antes de sobrescrever scripts. Scripts sugeridos: `build`, `build:debug` e `start:prod`. Quando detectar um projeto NestJS e a integração `@ts-typed/nestjs` estiver instalada, em terminal interativo deve perguntar se o usuário deseja registrar globalmente `StrictTypeErrorFilter`. Após confirmação, o adaptador altera apenas um `main.ts` reconhecido com `const app = await NestFactory.create(...)`, adicionando `app.useGlobalFilters(new StrictTypeErrorFilter())`; a repetição não duplica a alteração. O filtro deve converter `StrictTypeError` em uma resposta Nest `HttpException` HTTP 400 com metadados seguros, sem valor recebido ou stack.

A instalação do pacote tenta criar o mesmo arquivo apenas quando identifica uma raiz consumidora que declara `@ts-typed/compiler` como dependência. Nunca cria na raiz interna de `node_modules`, altera outros projetos ou sobrescreve um arquivo existente. Se scripts de instalação estiverem desabilitados, o ambiente não permitir escrita ou houver ambiguidade de workspace, `npx ts-typed init` conclui a configuração. O caminho via `init` é obrigatório e confiável; o build sem configuração deve orientar sua execução.

### 8.2 Configuração global

Toda opção global pública do projeto deve ter representação no arquivo: compilação, validação, bundling, assets, saída e diagnósticos. Não manter opções exclusivas em flags, variáveis de ambiente ou arquivos paralelos. Opções do compilador TypeScript continuam no `tsconfig` referenciado, sem duplicá-las.

Exemplo de arquivo gerado, com opções e defaults explícitos:

```json
{
  "$schema": "./node_modules/@ts-typed/compiler/schema.json",
  "extends": null,
  "integration": "typescript",
  "entry": "src/main.ts",
  "tsconfig": "tsconfig.build.json",
  "outDir": "dist",
  "allowExtraPropertiesAll": false,
  "compiler": {
    "sourceMap": true,
    "onUnsupported": "warn",
    "strictClass": false,
    "enforcePrivate": true,
    "enforceReadonly": true
  },
  "ncc": {
    "enabled": true,
    "minify": false,
    "sourceMap": true,
    "sourceMapRegister": false,
    "target": "es2020",
    "externals": [],
    "cache": false,
    "license": null,
    "quiet": false,
    "debugLog": false
  },
  "assets": [],
  "diagnostics": {
    "format": "pretty",
    "coverage": "summary",
    "reportFile": null
  }
}
```

Contrato das opções:

| Opção | Tipo e comportamento |
| --- | --- |
| `$schema` | Caminho/URI do JSON Schema publicado pelo pacote |
| `integration` | `typescript` ou módulo explícito de adaptador; default independente de framework |
| `extends` | Caminho de outra configuração ou `null`; herança com detecção de ciclos |
| `entry` | Caminho do entry TypeScript; gerado com base no projeto Nest |
| `tsconfig` | Caminho do tsconfig; init prefere build config existente, senão tsconfig.json |
| `outDir` | Diretório de saída; padrão `dist` |
| `allowExtraPropertiesAll` | Boolean, padrão `false`; `true` libera extras globalmente, sem relaxar tipos conhecidos |
| `compiler.onUnsupported` | `warn` (default) ou `error`; transparência de cobertura é obrigatória nos dois modos |
| `compiler.sourceMap` | Geração de mapas do JS instrumentado |
| `compiler.strictClass` | Boolean, padrão `true`; modo default de validação para contratos tipados por classe. `false` valida estruturalmente (como uma interface equivalente, igual à tipagem estrutural do próprio TypeScript — um objeto literal com o mesmo formato público é aceito mesmo sem ser `instanceof`). `true` exige `instanceof` onde o compilador conseguir embutir uma referência viva à classe (mesmo arquivo do ponto de validação, ou outro arquivo quando a classe é importada por nome ali; quando só é alcançável por inferência ou namespace import, cai para estrutural com warning). Pode ser sobrescrito por classe com `@StrictClass()`/`@StructuralClass()`, que têm precedência sobre este default |
| `compiler.enforcePrivate` | Boolean, padrão `true`; converte campos `private` declarados diretamente em campos ECMAScript `#private` quando a sintaxe pode ser preservada. Parameter properties recebem warning de suporte ausente. |
| `compiler.enforceReadonly` | Boolean, padrão `true`; bloqueia nova escrita em campos `readonly` depois da construção, mantendo `StrictTypeError` como erro público. |
| `ncc.enabled` | Ativa bundle; `false` emite módulos instrumentados e requer dependências instaladas |
| `ncc.minify` | Minificação do bundle |
| `ncc.sourceMap` | Geração de maps do bundle; exige mapas intermediários para apontar ao TS original |
| `ncc.sourceMapRegister` | Inclusão do registro de mapas suportado pelo ncc |
| `ncc.target` | Target JS do bundle; validar compatibilidade com saída TS e Node suportado |
| `ncc.externals` | Lista de módulos externos, registrados como dependências necessárias no relatório |
| `ncc.cache` | Ativar/desativar cache do bundler |
| `ncc.license` | Nome do arquivo de licenças gerado, ou `null` |
| `ncc.quiet`, `ncc.debugLog` | Controle dos logs específicos do bundler |
| `assets` | Lista de objetos `{ "from": "...", "to": "..." }`; caminhos/globs de origem e destino relativo à saída |
| `diagnostics.format` | `pretty` ou `json` |
| `diagnostics.coverage` | `summary` ou `detailed`; não altera rigor da validação |
| `diagnostics.reportFile` | Caminho do manifesto JSON ou `null` |

Validar a API real da versão de ncc adotada antes de implementar essas opções; adaptar internamente a interface pública, nunca repassar configurações arbitrárias sem validação. Qualquer nova opção global exige atualização simultânea do schema, template, documentação e testes.

### 8.3 Sugestões, validação e precedência

- Publicar `schema.json` no pacote e inserir `$schema` no arquivo gerado. Editores compatíveis devem oferecer autocomplete, descrições, tipos, valores permitidos, defaults e diagnóstico de opções desconhecidas, como na experiência de configuração do TypeScript.
- Cada propriedade do schema deve ter descrição e default quando aplicável. Objetos de configuração rejeitam chaves desconhecidas; arrays e caminhos também são validados.
- Usar JSON válido, sem comentários ou vírgulas finais. As sugestões vêm do schema; não depender de comentários para documentar as opções.
- Precedência: defaults < configuração herdada < arquivo do projeto < flags explícitas da execução. Mesclar objetos por chave e substituir arrays integralmente.
- Resolver caminhos relativos ao arquivo que os declarou, inclusive em `extends`. Não depender do diretório corrente do shell para resolver paths internos.
- Flags de conveniência como `--no-bundle`, `--minify` e `--sourcemap` devem corresponder a opções documentadas do JSON. `--sourcemap` ativa mapas tanto no compilador quanto no bundle. Não persistir overrides automaticamente.
- Configuração inválida, combinação incompatível ou opção desconhecida impede build com caminho da opção e motivo. Validar também opções de ncc quando bundling estiver desativado, embora não sejam executadas.
- A configuração efetiva, incluindo overrides, aparece no manifesto sem dados sensíveis. Não incluir ambiente/secrets por conveniência.

A validação dos contratos restritivos suportados é obrigatória. Tipos não suportados geram warnings obrigatórios por padrão; compiler.onUnsupported:error torna-os fatais. Não oferecer opção para ocultar os warnings e anunciar cobertura completa. `allowExtraPropertiesAll` altera somente a regra de campos extras, conforme §4; não abre campos declarados com tipos restritivos.

### 8.4 Bundle e relatório

O relatório distingue campos protegidos, campos abertos (`any`, `unknown`, sem anotação/inicializador), permissões de extras globais/locais e warnings/erros com `arquivo:linha:coluna`. Campos abertos são comportamento intencional, não suporte ausente.

Usar ncc sobre JavaScript já instrumentado, nunca diretamente sobre fontes TS. Publicar `dist/index.js`, maps e assets, preservando permissões e validando caminhos. Não prometer arquivo único para dependências nativas/dinâmicas. `ncc.externals` impede anunciar saída standalone completa. No modo sem bundle, dependências instaladas são necessárias.

Não apagar uma saída válida antes de concluir um novo build. Suportar caminhos com espaços e Windows/macOS/Linux.

## 9. Critérios de aceite

Os critérios descrevem a proteção alvo. Onde a construção ainda não tiver suporte, é obrigatório um warning específico e um teste de compatibilidade; não registrar o item como protegido. Os casos suportados abaixo devem rejeitar valores inválidos em runtime.

| ID | Cenário | Resultado |
| --- | --- | --- |
| A01 | Tipo explícito ou inferido recebe valor incompatível via cast/any/módulo externo | `StrictTypeError`; valor anterior preservado |
| A02 | Campo `any`, `unknown` ou sem anotação/inicializador | Aceita valores arbitrários; respeita compilação TS |
| A03 | `any[]` recebe número; array recebe elemento incompatível | Rejeita conforme contrato do contêiner/elemento |
| A04 | Inicializador inválido e escrita inválida no construtor | Rejeita antes de disponibilizar instância válida |
| A05 | Campo sem inicializador | Estado inicial tolerado; primeira escrita validada |
| A06 | `null`, `undefined`, opcionais e `exactOptionalPropertyTypes` | Respeita contrato efetivo de escrita |
| A07 | `push`, `splice`, índice, length e mutações de tupla | Invariantes preservados; operação inválida não altera alvo |
| A08 | Objeto aninhado, recursivo e referência compartilhada | Validação profunda sem loop; todos os vínculos respeitados |
| A09 | Alias anterior à atribuição modifica campo ou adiciona extra | Valida operações controladas; alias externo aceito com warning de cobertura parcial |
| A10 | Extra na atribuição, mutação, defineProperty ou Object.assign | Rejeita por padrão |
| A11 | Decorator em classe e propriedade | Aceita extras; campos conhecidos seguem protegidos; aninhados continuam fechados |
| A12 | Assinatura de índice | Aceita chaves permitidas e valida valores |
| A13 | Private, protected, #private, static e parameter properties | Protegidos quando suportados; demais casos compilam com warning específico |
| A14 | Herança, accessors, decorators e ordem de inicialização | Proteção e comportamento Nest preservados |
| A15 | Delete, redefinição de descritor e protótipo | Não permitem invalidar contrato |
| A16 | Readonly e tipos não representáveis | Imutabilidade protegida onde suportada; suporte ausente gera warning |
| A17 | Classe de erro importada pelo consumidor | `instanceof`, códigos, caminhos e `toJSON()` corretos; sem dados sensíveis |
| A18 | Nest provider com DI, controller e filtro HTTP | Aplicação inicia e erro é tratável pelo projeto |
| A19 | Build com tipo restritivo não suportado | Default compila com warning localizado; onUnsupported:error falha antes do emit final |
| A20 | Build sem bundle e bundle com minify/maps | Executam e mantêm a mesma identidade do erro |
| A21 | Fixture empacotável em diretório isolado sem node_modules | Inicia Nest, responde HTTP e encerra corretamente |
| A22 | Assets, externals, aliases e caminhos com espaços | Resolução correta e relatório fiel |
| A23 | Build/init | Fontes preservados; scripts existentes não são sobrescritos silenciosamente |
| A24 | Objetos não extensíveis, identidade e aliases externos não controláveis | Compatibilidade preservada; falta de proteção aparece em warning e manifesto |
| A25 | Instalação elegível ou `ts-typed init` | Cria `typets.config.json` na raiz com schema; nunca sobrescreve configuração existente |
| A26 | Editor compatível com JSON Schema | Sugere todas as opções, documenta defaults e sinaliza valores/chaves inválidos |
| A27 | `allowExtraPropertiesAll` false/true | Default bloqueia extras; true libera globalmente sem relaxar campos conhecidos |
| A28 | Extends, paths e flags | Precedência e resolução de caminhos respeitadas; ciclos/combinações inválidas falham |
| A29 | Inventário de opções globais | Toda opção está no JSON, schema, template, documentação e testes; ncc ativável/desativável pelo arquivo |
| A30 | `const response: IResponse<IUser>` com payload externo | Valida objeto completo, campos ausentes/extras e mutação posterior de data |
| A31 | Let/var/const e bindings de módulo com tipos explícitos/inferidos | Inicialização e escritas válidas aceitas; inválidas rejeitadas; const mantém proteção profunda |
| A32 | Desestruturação/default/rest/loops/closures/atribuições compostas | Contratos respeitados sem dupla avaliação nem mudança de escopo |
| A33 | Parâmetros de função/método/construtor/callback | Valida na entrada, inclusive chamadas externas, call/apply/bind e tipos contextuais |
| A34 | Retornos explícitos/implícitos, getters, void/undefined/never e finally | Contrato correto sem alteração da semântica de execução |
| A35 | Overloads e funções recebidas como valores | Relação argumentos/retorno validada; typeof function sozinho não basta |
| A36 | Async, Promise/thenable e resultado resolvido | Resultado inválido rejeita com StrictTypeError; aliases sem proteção geram warning específico |
| A37 | Generator/async generator | Yield, next e retorno final validados preservando protocolos |
| A38 | Generics explícitos/inferidos, constraints e factories | Schema concreto transportado; ausência de informação não vira any silencioso |
| A39 | Map/Set/built-ins tipados | Conteúdo e mutações protegidos quando suportados; demais casos aceitos com warning |
| A40 | Assertions, satisfies, predicados e tipos avançados | Contratos restritivos verificados; casts não removem proteção existente |
| A41 | Imports/exports/reexports e bibliotecas JS/.d.ts | Fronteiras protegidas sem presumir instrumentação interna de terceiros |
| A42 | Diagnósticos e erro fora de classes | Cobertura inclui todos os pontos; erro informa função/tipo de contrato/caminho |
| A43 | Organização do repositório | Núcleo em system/base e integrações isoladas em system/frameworks; operação em devops; documentação em docs; exceções explícitas respeitadas |
| A44 | GitHub Actions | Workflows descobertos em .github/workflows chamam automações de devops com cwd correto |
| A45 | README público e pacote npm | Comandos e links válidos; estado do produto fiel; README/licença/schema incluídos no pacote |
| A46 | Licenciamento e publicação | Política comercial confirmada formalizada em LICENSE e metadados coerentes antes de release; dependências preservam avisos |
| A47 | TypeScript puro sem dependências Nest | Núcleo compila/protege sem carregar framework; integração padrão typescript |
| A48 | Workspace e adaptador Nest | Build/testes por pacote; alterações específicas confinadas a frameworks/nestjs |
| A49 | Novo adaptador e configuração integration | Usa API pública versionada; módulo inválido/ausente falha; não duplica runtime nem relaxa garantia |
| A50 | Init NestJS e filtro global | Em terminal interativo, pergunta antes de registrar `StrictTypeErrorFilter`; edição de bootstrap reconhecido é idempotente e mapeia a violação para `HttpException` 400 segura |

Testes unitários para schemas/erros e integração com fontes compilados, aplicação Nest e processos Node. Testar resultados observáveis, não apenas a presença de código gerado. Não usar serviços externos. Comparar execução com e sem bundle e verificar JS emitido nas combinações suportadas de target/useDefineForClassFields.

## 10. Plano de implementação e riscos

1. Provas de viabilidade concluídas; priorizar compatibilidade conforme decisão. Registrar cobertura parcial/ausente em warnings e manifesto, sem prometer garantia universal.
2. Organizar system/devops/docs, definir pacote e configuração em system, CI mínimo em .github/workflows e preparar README público fiel ao estado. Criar CLI, runtime público, schemas e classe de erro com identidade única.
3. Implementar análise de tipos/classificação, incluindo tipos inferidos e permissões de extras.
4. Implementar proteção de propriedades, variáveis, constantes, desestruturação, expressões e inicialização.
5. Implementar contratos de parâmetros, funções/métodos, construtores, retornos, overloads, async/generators, fronteiras externas e transporte de schemas genéricos.
6. Implementar contêineres profundos, aliases, ciclos, operações reflexivas e invariantes.
7. Integrar `AllowExtraProperties`, decorators de terceiros e Nest; fechar testes reais.
8. Implementar `typets.config.json`, init/instalação elegível, herança, schema/autocomplete, precedência, relatório e integração ncc/assets/maps; conferir inventário completo de opções globais.
9. Executar a matriz completa, documentar compatibilidade e exemplos. Validar README e conteúdo npm; incluir Apache-2.0 e NOTICE com autoria confirmada antes de publicar release.

Riscos principais: abrangência de todas as construções TS, preservação de avaliação/escopo, fronteiras externas, protocolos async e apagamento de generics, aliases mantidos por terceiros, identidade de proxies, campos não configuráveis, decoradores que alteram descritores, efeitos colaterais de setters e custo de validação profunda. Medir overhead e memória em workloads representativos; não reduzir cobertura silenciosamente para melhorar desempenho.

**Definition of Done:** critérios A01–A49 atendidos sob a política de compatibilidade. Contratos suportados têm testes runtime e casos sem suporte têm warnings obrigatórios e testes que comprovam compilação compatível. Não confundir suporte parcial com proteção total. README e documentação incluem instalação, uso, decorator, erro público e evidências da matriz de compatibilidade.

## 11. Referências para a implementação

- TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- ncc: https://github.com/vercel/ncc
- Nest CLI: https://docs.nestjs.com/cli/usages

As referências orientam a pesquisa na implementação; esta revisão define requisitos e não afirma viabilidade já comprovada.

**Execução autorizada em 2026-10-16:** arquitetura/plano criados, fundação iniciada; decisão posterior por compatibilidade + warnings libera as fases dependentes. Não declarar proteção total de itens parciais.

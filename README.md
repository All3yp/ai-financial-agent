# AI Financial Agent

Aplicação de pesquisa financeira com chat, cinco agentes tradicionais e uma equipe quantitativa determinística. Combina consultas externas com cálculos locais de mercado e carteira; não executa ordens nem integra corretora. Uso educacional e de pesquisa, sem garantia de exatidão, disponibilidade ou resultado financeiro.

## Índice

- [Capacidades atuais](#capacidades-atuais)
- [Documentação](#documentação)
- [Início rápido](#início-rápido)
- [Receita quantitativa](#receita-quantitativa)
- [API e CLI](#api-e-cli)
- [Comandos de desenvolvimento](#comandos-de-desenvolvimento)
- [Limites e segurança](#limites-e-segurança)

## Capacidades atuais

| Caminho | O que faz | Requisitos e limites |
| --- | --- | --- |
| Chat em `/` | Pesquisa de preços, demonstrações, métricas e notícias com ferramentas financeiras | Sessão, PostgreSQL, modelo compatível e credenciais de dados; modelos auxiliares e configurações têm limitações |
| Workflows em `/agents` | Full Analysis, Bull vs Bear Debate, Stock Screening e Portfolio Monitor manual | Research, Analysis, Screener, Monitor e Report; chaves no servidor e Inngest; possível execução duplicada |
| Quantitative em `/agents` | Regime de mercado, ranking de proxies setoriais, horizontes históricos e risco opcional de carteira | JSON do usuário, quatro especialistas e orquestrador; cálculo sem LLM ou aquisição automática de preços |
| SEC EDGAR | Filings, fatos XBRL e extração parcial de Business, Risk Factors e MD&A | Contato real, cobertura limitada e avisos; não reconstrói demonstrações completas |
| FRED | Curva de juros e inflação histórica com vintage `asOf` | Chave do usuário, datas e limites explícitos; sem previsão ou calendário econômico |
| Ferramentas locais | VaR/CVaR, volatilidade, drawdown, correlações, choques, otimização long-only e PCA/OLS de fatores | Históricos fornecidos; otimização/fatores são ferramentas separadas, não etapas integradas à equipe quantitativa |

Analysis preserva `financial_metrics` dos peers e aplica perspectiva/instrução bull ou bear, tratando dados de fonte como evidência não confiável. Monitor ordena `historical.prices` por data e compara as duas últimas observações válidas, com datas nos detalhes do alerta, sem alegar movimento de “hoje”; `current_ratio=0` é reconhecido. Relatórios LLM continuam sujeitos a erros.

Stack: Next.js App Router, React, TypeScript, AI SDK, PostgreSQL/Drizzle, NextAuth, Inngest e `ml-matrix`.

## Documentação

- [Guia do usuário](docs/GUIA_DO_USUARIO.md): instalação, privacidade, chat, workflows, JSON quantitativo, comandos, API e troubleshooting.
- [Arquitetura e agentes](docs/ARQUITETURA_E_AGENTES.md): contratos, execução, matemática, fontes, limitações e backlog.
- [Verificação local](docs/VALIDACAO.md): testes, build, validação visual e o que não foi confirmado ao vivo.
- [Exemplos e advertências](docs/exemplos/README.md): uso da única [fixture quantitativa completa](docs/exemplos/quantitative-fixture.json), com mercado e carteira sintéticos.

## Início rápido

### 1. Instalar dependências

Na raiz do repositório, use Node.js compatível com Next.js 15 (20 ou 22 são opções práticas), pnpm e PostgreSQL acessível. O projeto não impõe uma versão de Node via `engines`.

```sh
pnpm install
```

### 2. Configurar o ambiente

O [helper de ambiente](scripts/setup-env.mjs) escreve `.env`, gera `AUTH_SECRET` e configura contato para a SEC, preservando valores existentes:

```sh
env SEC_CONTACT_EMAIL='SEU_EMAIL_REAL' node scripts/setup-env.mjs
```

**Substitua `SEU_EMAIL_REAL` por contato válido e monitorado.** O placeholder não é válido; o helper também pode usar contato do Git ou perguntar interativamente. A identificação SEC é requisito desse helper, não do cálculo quantitativo via CLI. Revise `POSTGRES_URL` e credenciais: o helper não cria o banco nem substitui automaticamente URL/chaves já existentes e vazias. Seus padrões locais não são credenciais de produção.

Alternativa manual: use [.env.example](.env.example) como referência, configure `.env` ou `.env.local`, gere um `AUTH_SECRET` forte (por exemplo, `openssl rand -base64 32`) e preencha `POSTGRES_URL` com usuário, senha, host e banco reais. Para consultas SEC, configure `SEC_USER_AGENT` com nome da aplicação e contato real; [.env.sec.example](.env.sec.example) é somente placeholder e não é carregado automaticamente. O template não lista todas as variáveis hoje suportadas; consulte a [tabela completa do guia](docs/GUIA_DO_USUARIO.md#23-variáveis-por-finalidade).

Para workflows tradicionais, configure `OPENAI_API_KEY`, `OPENAI_BASE_URL` e `OPENAI_PROVIDER_NAME` no servidor. Para dados, use `FINANCIAL_DATA_PROVIDER` e as chaves aplicáveis: `FMP_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `TWELVE_DATA_API_KEY` ou `FINANCIAL_DATASETS_API_KEY`. Screener por filtros exige Financial Datasets. FRED usa `FRED_API_KEY`; upload de imagens usa `BLOB_READ_WRITE_TOKEN`. Não publique segredos nem versione arquivos de ambiente.

O [instalador local](setup-local.sh) é opcional:

```sh
env SEC_CONTACT_EMAIL='SEU_EMAIL_REAL' bash setup-local.sh
```

Ele pode pedir `sudo`, depende da distribuição e não garante senha/autenticação PostgreSQL. Confira os [limites do instalador](docs/GUIA_DO_USUARIO.md#25-instalador-opcional) antes de executá-lo.

### 3. Preparar banco e iniciar

Crie banco e usuário PostgreSQL, configure `POSTGRES_URL` e execute na raiz:

```sh
pnpm db:migrate
pnpm dev
```

Abra `http://localhost:3000/` para chat e `http://localhost:3000/agents` para workflows e Quantitative. Use a porta anunciada pelo Next se a 3000 estiver ocupada. Conversas existentes ficam em `/chat/{id}`, não em uma página `/chat`.

A sessão é gerada automaticamente por cookie `fingerprint` e usuário no banco. Isso não é autenticação convencional endurecida: os formulários de login/cadastro não validam a senha na autorização atual. Não exponha a instalação a usuários não confiáveis sem revisão de identidade e permissões.

### 4. Inngest e chaves do chat

Para workflows, configure `INNGEST_DEV=1` no ambiente local da aplicação quando necessário e reinicie-a. Em outro terminal:

```sh
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

O painel local normalmente fica em `http://localhost:8288`; confira as URLs da CLI, que pode ser baixada por `npx`. Operação hospedada requer event/signing keys e configuração do serviço. O trigger aguarda envio do evento antes da execução HTTP e pode executar novamente pelo consumidor Inngest.

No menu do usuário, abra `Configure API keys` para cadastrar provedor OpenAI-compatible e modelos. As chaves do chat são enviadas pelo navegador; configurar `OPENAI_*` no servidor não equivale a configurar esse cadastro. O catálogo do servidor e os modelos auxiliares restringem compatibilidade: adicionar um modelo personalizado não basta. O gate de envio ainda usa chave legada local, e a seleção visual de provedor não garante sincronização da chave efetivamente enviada. Veja o [guia de configuração](docs/GUIA_DO_USUARIO.md#41-configurar-modelo-e-dados).

## Receita quantitativa

Com dependências instaladas, execute a receita testada, sem banco, sessão, rede ou chaves de LLM para o cálculo:

```sh
pnpm agent:analyze --input docs/exemplos/quantitative-fixture.json --mode=quantitative
```

A [fixture](docs/exemplos/quantitative-fixture.json) contém mercado e carteira: 21 datas comuns, de 2026-09-01 a 2026-09-21, para **20 retornos**. Define horizontes `[5,10,20]` e janelas de regime/volatilidade de 20 explicitamente; uma janela de 20 exige 21 preços. Sem essa configuração, os defaults de mercado exigem 201 datas.

**Não contém dados financeiros reais.** Preços e tickers são fictícios; há fins de semana, não sessões reais de mercado. A amostra mínima produz aviso de poucos retornos e não valida anualização, sinais ou performance. Leia as [advertências dos exemplos](docs/exemplos/README.md). Não há fixture separada de carteira.

Para testar a interface, abra `/agents`, selecione `Quantitative`, escolha esse JSON e clique em `Analyze`. Confira conflitos, warnings e limitations; o download preserva a saída completa. O navegador exige sessão e banco, embora o cálculo não use LLM. Nenhum upload cadastra uma carteira persistente.

## API e CLI

| Entrada | Contrato |
| --- | --- |
| `POST /api/agents/quantitative` | `{market, portfolio?}`; sessão, JSON UTF-8 até 1 MiB; resposta calculada direta |
| `POST /api/portfolio/risk` | Objeto de carteira isolado; sessão, mesmo limite de 1 MiB; resposta direta |
| `POST /api/agents/trigger` | `{workflowType,data}` com `analysis`, `debate`, `screening` ou `monitoring`; envelope `success/data` |
| `pnpm agent:analyze --input arquivo --mode=quantitative` | Equipe quantitativa; modo opcional, somente `quantitative` |
| `pnpm portfolio:report /caminho/portfolio.json` | Apenas objeto de carteira, não a fixture inteira da equipe; um argumento posicional |

As CLIs leem JSON local e não adquirem preços, migram banco ou executam modelo. Para stdout somente JSON, use `pnpm exec tsx scripts/agent-analyze.ts --input docs/exemplos/quantitative-fixture.json --mode=quantitative`; scripts pnpm podem imprimir cabeçalhos. Schemas, limites e exemplos curl com cookies de sessão legítima estão no [guia completo](docs/GUIA_DO_USUARIO.md#8-comandos-e-api). Não existe tipo `quantitative` no trigger tradicional nem API pública dedicada a otimização/fatores; estes são tools locais do chat.

## Comandos de desenvolvimento

Conforme [package.json](package.json):

| Comando | Efeito |
| --- | --- |
| `pnpm test` | Testes locais, incluindo mocks/fixtures; não certificam provedores ao vivo |
| `pnpm typecheck` | TypeScript sem emissão |
| `pnpm build:app` | Somente `next build`; avaliação de rotas ainda pode depender do ambiente |
| `pnpm build` | **Migra o banco configurado antes de `next build`** |
| `pnpm db:migrate` | Aplica migrações existentes |
| `pnpm dev` | Servidor Next em desenvolvimento |
| `pnpm start` | Servidor de produção após build |
| `pnpm lint`, `pnpm lint:fix`, `pnpm format` | Podem escrever arquivos; não são verificações apenas de leitura |

O [migrador](lib/db/migrate.ts) carrega `.env.local` e depois `.env` sem override; ambiente exportado tem prioridade. Drizzle Kit, via [drizzle.config.ts](drizzle.config.ts), carrega somente `.env.local`: `db:generate/studio/push/pull/check/up` podem precisar da URL exportada ou nesse arquivo. Execute na raiz e controle backups/migrações antes de build ou mudanças de schema.

## Limites e segurança

- Cobertura, preços ajustados, histórico, cotas e custos dependem de provedor e plano. Twelve Data só fornece preços neste adaptador; Alpha Vantage tem histórico compact e restrições de fundamentos. Não há promessa de cobertura universal ou dados gratuitos. Modelos fixos e sufixos `:free` não garantem disponibilidade/gratuidade.
- Chaves manuais ficam em `localStorage`, sem cofre criptografado, e são transmitidas ao servidor/provedor. Trate-as como sensíveis a scripts da origem, extensões e XSS. Use HTTPS, escopo mínimo e rotação; avalie logs/tracing e destinos de dados.
- PostgreSQL guarda conteúdo de chat; conversas públicas são compartilháveis e imagens no Blob são públicas. Identidade automática não constitui isolamento multiusuário endurecido. Audite autorização, propriedade, retenção e exclusão antes de produção.
- `History`, status dos cards e configuração de alertas no dashboard têm placeholders. Crons não têm timezone explícito/feriados e monitoramento agendado ainda busca carteiras vazias; notificações e persistência de workflows não estão prontas.
- O stream do chat está conectado e preserva pergunta/anexos; falha após texto parcial requer nova tentativa sem misturar um fallback. O DELETE chamado pelo histórico ainda não tem handler na rota. Execução dupla tradicional, modelos auxiliares fixos, perda de metadados no Research e memória por processo permanecem limitações reais. Consulte o [backlog atual](docs/ARQUITETURA_E_AGENTES.md#10-limitações-e-backlog).
- Não há ordens, importação persistente de carteira, forecast quantitativo, replay automático de crises ou certificação de calendários/ajustes. Cálculos históricos e interpretações LLM não são aconselhamento financeiro nem garantia de retornos futuros.

Código sob [Apache-2.0](LICENSE); a licença não concede direitos sobre dados, notícias ou serviços externos. Verifique termos SEC/FRED, licenciamento e credenciais por usuário aplicáveis antes de operar.



# Guia do usuário

Este guia descreve a implementação consultada em 8 de outubro de 2026, incluindo o painel quantitativo integrado em `/agents`. A aplicação combina chat financeiro, consultas a fontes externas, workflows de agentes e cálculos quantitativos locais. Não executa ordens, não é uma corretora e não garante a exatidão de textos produzidos por modelos nem resultados futuros.

Para detalhes técnicos e limitações dos agentes, consulte [Arquitetura e agentes](ARQUITETURA_E_AGENTES.md). Nomes de botões estão em inglês porque essa é a interface atual.

## 1. O que você pode fazer

| Área | Disponível hoje | Dependências e ressalvas |
| --- | --- | --- |
| Chat em `/` | Perguntar sobre empresas, preços, demonstrações, métricas, notícias, SEC, macroeconomia e análises locais | Sessão, PostgreSQL, modelo compatível e credenciais de dados; a API de chat exige chave de modelo e configuração financeira mesmo para perguntas que só precisariam de aritmética |
| Conversas em `/chat/{id}` | Reabrir histórico, copiar respostas, votar, editar mensagens e alterar visibilidade | Histórico no banco; uma conversa pública pode ser lida por terceiros com o endereço |
| Workflows em `/agents` | Full Analysis, Bull vs Bear Debate, Stock Screening e Portfolio Monitor manual | Chaves do servidor; envio ao Inngest precede execução HTTP; possível execução duplicada |
| Quantitative em `/agents` | Selecionar JSON, analisar mercado e setores, incluir risco de carteira, ver conflitos e avisos, baixar JSON | Sessão para HTTP, históricos fornecidos pelo usuário; sem LLM ou aquisição automática de preços |
| CLI quantitativa | Analisar o mesmo contrato JSON sem navegador | Node.js e dependências instaladas; sem sessão, PostgreSQL ou chave de modelo para o cálculo |
| CLI de carteira | VaR/CVaR, volatilidade, drawdown, concentração, correlações e choques explícitos | Históricos e posições fornecidos pelo usuário; não importa carteira para o banco |
| Ferramentas locais no chat | Otimização limitada e PCA/regressão de fatores, além de risco e mercado | A matemática é determinística; o chat que a invoca continua dependendo de LLM e dos requisitos gerais da API |
| Anexos no chat | JPEG e PNG de até 5 MiB por arquivo | Sessão, Vercel Blob e modelo capaz de lidar com imagens; arquivos são gravados com acesso público |

Não há importação persistente de carteira, integração com corretora, ingestão CSV pelo dashboard quantitativo, atualização automática dos históricos enviados, replay de crises pronto, FedWatch, calendário de divulgações ou previsão quantitativa. A aba `History` dos agentes e vários controles de monitoramento são placeholders, não serviços concluídos.

## 2. Preparação local

### 2.1 Pré-requisitos

Use uma versão de Node.js compatível com Next.js 15 e com as APIs utilizadas, como `fetch`, `TextDecoder` e `AbortSignal.timeout`. Node.js 20 ou 22 é uma escolha prática; o projeto não declara `engines` para impor uma versão. Instale pnpm, Git e PostgreSQL. O script de instalação tenta usar PostgreSQL 16, mas a aplicação conecta pela URL configurada.

Execute na raiz do repositório:

```sh
pnpm install
```

Não coloque segredos em comandos versionados, documentos, screenshots ou mensagens de chat.

### 2.2 Gerar ambiente com contato real para a SEC

O helper [scripts/setup-env.mjs](../scripts/setup-env.mjs) escreve `.env`, gera `AUTH_SECRET` quando necessário e monta `SEC_USER_AGENT`. Ele procura contato em `SEC_CONTACT_EMAIL`, no e-mail do Git ou em pergunta interativa. Use o seu contato real, não o texto abaixo:

```sh
env SEC_CONTACT_EMAIL='SEU_EMAIL_REAL' node scripts/setup-env.mjs
```

Substitua `SEU_EMAIL_REAL` por um endereço válido e monitorado. O placeholder acima não passa na validação. Alternativamente, forneça `SEC_USER_AGENT` com nome da aplicação e contato real. `SEC_CONTACT_EMAIL` é entrada do helper, não uma chave usada diretamente pelo cliente SEC.

O helper preserva valores já presentes. Em especial, não preenche automaticamente um `POSTGRES_URL=` vazio já existente; as substituições de campos vazios são específicas para `AUTH_SECRET` e `SEC_USER_AGENT`. Se você partir de [.env.example](../.env.example), revise explicitamente URL do banco e chaves. Não é necessário copiar o exemplo antes de executar o helper.

[.env.sec.example](../.env.sec.example) é apenas placeholder, não é carregado automaticamente e não configura acesso real à SEC. Os testes de SEC usam respostas simuladas; passar nos testes não comprova acesso à rede nem validade do contato.

### 2.3 Variáveis por finalidade

| Variável | Utilização |
| --- | --- |
| `AUTH_SECRET` | Sessões NextAuth; mantenha estável e secreto |
| `POSTGRES_URL` | Banco de usuários, conversas, mensagens, votos e documentos |
| `OPENAI_API_KEY` | Modelo dos agentes tradicionais executados no servidor |
| `OPENAI_BASE_URL` | Endpoint OpenAI-compatible; helper usa `https://openrouter.ai/api/v1` |
| `OPENAI_PROVIDER_NAME` | Identificação do provedor no adaptador; helper usa `openrouter` |
| `FINANCIAL_DATA_PROVIDER` | `auto`, `fmp`, `alpha-vantage`, `twelve-data` ou `financial-datasets` |
| `FMP_API_KEY` | Financial Modeling Prep, conforme operações e permissões do plano |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage, com limitações de histórico e períodos |
| `TWELVE_DATA_API_KEY` | Twelve Data; adaptador atual só oferece preços |
| `FINANCIAL_DATASETS_API_KEY` | Financial Datasets; obrigatório para screener por filtros |
| `SEC_USER_AGENT` | Identificação com contato real para SEC EDGAR |
| `FRED_API_KEY` | Chave FRED do usuário a quem se destina o uso |
| `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Envio e verificação de eventos na operação hospedada |
| `INNGEST_DEV` | Modo de desenvolvimento local, quando configurado com `1` |
| `BLOB_READ_WRITE_TOKEN` | Upload de imagens ao Vercel Blob |
| `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`, `LANGCHAIN_TRACING_V2` | Configuração de tracing, quando utilizada; avaliar destino e retenção dos dados |

O helper não cria todas as variáveis Inngest do exemplo. Configure-as quando necessárias. Não suponha que uma chave em `.env` aparecerá automaticamente no navegador: o chat recebe a chave do modelo no corpo da requisição, enquanto os agentes tradicionais leem o ambiente do servidor.

### 2.4 Banco e migrações

Crie previamente o banco e um usuário PostgreSQL autorizado, configure `POSTGRES_URL` e execute:

```sh
pnpm db:migrate
pnpm dev
```

O migrador [lib/db/migrate.ts](../lib/db/migrate.ts) carrega `.env.local` e depois `.env` com dotenv, sem `override`. Portanto, variáveis exportadas no processo têm prioridade; entre arquivos, valores já carregados de `.env.local` prevalecem, inclusive valores vazios. Migrações vêm de `./lib/db/migrations`, relativo ao diretório de execução: execute na raiz.

Os comandos `db:generate/studio/push/pull/check/up` usam [drizzle.config.ts](../drizzle.config.ts), que carrega somente `.env.local`, não `.env`. Para esses comandos, configure `POSTGRES_URL` no ambiente do processo ou em `.env.local`; o arquivo gerado pelo helper sozinho pode não bastar. Essa diferença não se aplica a `db:migrate`, que usa o migrador próprio.

Abra `http://localhost:3000/` para novo chat e `http://localhost:3000/agents` para agentes. Se Next escolher outra porta, use a URL impressa no terminal. Não há página inicial em `/chat`: o caminho de uma conversa existente é `/chat/{id}`.

### 2.5 Instalador opcional

```sh
env SEC_CONTACT_EMAIL='SEU_EMAIL_REAL' bash setup-local.sh
```

[setup-local.sh](../setup-local.sh) instala dependências, executa o helper, tenta instalar/iniciar PostgreSQL se `psql` não existir, cria o banco e roda migrações. Pode pedir `sudo`, depender da distribuição e falhar com autenticação peer ou permissões do usuário `postgres`. Detectar `psql` não comprova que o servidor está ativo. O script anuncia credenciais locais padrão, mas não assegura a criação/configuração dessa senha; ajuste o PostgreSQL e a URL ao ambiente real. Não reutilize esses padrões em produção e não execute comandos de reset de banco sem backup.

## 3. Sessão e privacidade

Ao carregar a aplicação, `AuthCheck` tenta login automático. O servidor cria ou reutiliza um cookie `fingerprint`, deriva um e-mail `user-...@auto.generated`, busca/cria o usuário no PostgreSQL e emite a sessão NextAuth. Esse fingerprint é aleatório e armazenado, não uma análise de hardware. A criação do usuário depende de banco acessível e migrado.

As páginas `/login` e `/register` existem, mas o provedor Credentials atual **não valida a senha informada**: ele autoriza pela identidade automática. Cadastro e login visuais não constituem autenticação multiusuário endurecida. Apagar cookies ou usar outro perfil de navegador pode criar outra identidade e retirar o acesso pela interface às conversas privadas anteriores.

As APIs quantitativas exigem `session.user.id`; estar autenticado não elimina as limitações do mecanismo de identidade. O middleware permite navegação e não é, sozinho, uma barreira de autorização. Não publique a aplicação para usuários não confiáveis sem revisão de autenticação e autorização.

Chaves manuais de provedores ficam em `localStorage`, sem cofre criptografado. O chat envia a chave selecionada, a base URL e a chave financeira ao servidor, que consulta serviços externos. Elas não ficam exclusivamente no dispositivo. Scripts da mesma origem, extensões e ataques XSS podem expor esse armazenamento. Use HTTPS, provedores confiáveis, chaves de escopo mínimo e revogação quando necessário. Remover cookies não apaga automaticamente as chaves do `localStorage`.

Conversas e dados de ferramentas podem ficar no PostgreSQL. Anexos do chat são públicos no Blob. Históricos quantitativos são enviados ao servidor para processamento; não são cadastrados como carteira persistente, mas resultados/tarefas também podem existir na memória do processo. Logs, tracing e infraestrutura externa têm suas próprias políticas de retenção. Não confunda `Cache-Control: no-store` com garantia de ausência de qualquer registro.

## 4. Usar o chat

### 4.1 Configurar modelo e dados

No menu do usuário, abra `Configure API keys`. Cadastre um provedor com nome, chave e URL OpenAI-compatible, marque o padrão e selecione os modelos habilitados. Há cadastro de modelos personalizados, mas compatibilidade efetiva depende também do catálogo reconhecido no servidor e do endpoint externo; não basta inserir um nome na interface.

O modal permite configurar a chave legada de Financial Datasets. FMP, Alpha Vantage, Twelve Data e FRED são configuráveis no servidor; a API de chat também aceita `financialData` e `fredApiKey`, mas o componente atual de chat não fornece formulários completos para esses campos. A chave FRED, quando enviada diretamente, deve ter 32 caracteres minúsculos alfanuméricos. Cada usuário pretendido deve usar sua própria chave conforme os termos FRED; uma variável compartilhada no servidor não implementa gestão individual de credenciais.

Há duas limitações de configuração a observar:

- O envio pelo formulário verifica `openaiApiKey` local legada e define o limite gratuito como zero. Uma chave apenas em `modelProviders` pode não satisfazer essa verificação e abrir novamente o modal.
- O seletor visual de provedor não deve ser tratado como prova de qual chave foi enviada. O chat mantém sua própria seleção; confira o comportamento efetivo antes de alternar credenciais e considere recarregar a página após mudanças.

### 4.2 Conversas e ações

Digite a pergunta e envie por `Enter` ou pelo botão de envio; `Shift+Enter` insere uma linha. `@` oferece sugestões locais de alguns tickers, não uma busca universal de instrumentos. O botão de parar interrompe a resposta no cliente, sem garantir cancelamento de todas as consultas ou tarefas já iniciadas no servidor.

Use `New Chat` para voltar a `/`. O histórico lateral reabre conversas e oferece controles de visibilidade e exclusão. Porém, a exclusão pede `DELETE /api/chat`, método não implementado na rota atual: o controle não comprova remoção do banco. Respostas têm cópia e votos; mensagens do usuário podem ser editadas e reenviadas, afetando a continuação da conversa. Não use visibilidade pública para informação privada. Outros visitantes leem a página pública em modo somente leitura, mas isso não substitui uma auditoria das APIs e ações de escrita.

A interface herdada possui área de documentos/código, versões, cópia e execução de código Python via Pyodide no navegador. A lista atual de ferramentas do chat é financeira: não conte com geração automática de documentos/código por ferramentas que não estão registradas. Não execute código gerado sem revisão.

O anexo do chat aceita somente JPEG/PNG de até 5 MiB. Não há suporte atual a PDF nessa rota, apesar de descrições antigas de configuração mencionarem PDFs. O upload JSON da aba Quantitative é um fluxo separado, não usa Blob e tem limite de 1 MiB.

### 4.3 Pedidos úteis

- “Consulte receitas, fluxo de caixa e dívida de AAPL por trimestre; informe fonte, datas e campos indisponíveis.”
- “Liste os 10-K de uma empresa na SEC e mostre `historyComplete` e avisos de cobertura.”
- “Leia Risk Factors e MD&A do accessionNumber encontrado; diferencie texto da fonte e sua interpretação.”
- “Consulte CPIAUCSL entre datas explícitas, usando uma vintage `asOf`; não preencha valores ausentes.”
- “Com estes históricos ajustados reais, calcule risco e correlações; preserve avisos e limitações.”

O chat escolhe ferramentas por LLM. Pedir uma função não garante que ela será chamada corretamente. Confira números e origem nos resultados. O título inicial usa `gpt-4.1-mini-2025-04-14`; a decomposição da consulta usa `gpt-4.1-nano-2025-04-14`, além do modelo selecionado. Um provedor que suporta apenas o modelo principal pode falhar nessas etapas auxiliares. Fallbacks recebidos pela API não garantem recuperação do título ou da decomposição.

O resultado do modelo é conectado ao stream da resposta, junto dos eventos de estado. A pergunta e os anexos são preservados quando subtarefas são acrescentadas. Após falha com conteúdo parcial, a rota não mistura uma resposta de fallback com o texto já enviado: solicita nova tentativa. O protocolo tem teste com modelo simulado; isso não valida compatibilidade, disponibilidade ou fidelidade de modelos reais. Falhas nos modelos auxiliares de título/decomposição ainda podem impedir a resposta.

## 5. Dados externos: limites que importam

O roteador normaliza resultados e acrescenta `metadata` com provedor, horário de coleta e avisos. Campos ausentes são `null`, não zero. Um período aceito pelo schema não significa disponibilidade no plano contratado.

| Fonte | Implementação atual | Limites relevantes |
| --- | --- | --- |
| Financial Datasets | Preços, fundamentos, notícias e filtros financeiros | Credenciais e plano determinam cobertura; é a única fonte do screener por filtros |
| FMP | Preços, demonstrações, métricas e notícias | Preços apenas diários com multiplicador 1; TTM de métricas pode ser snapshot sem data de relatório |
| Alpha Vantage | Preços diários, demonstrações anuais/trimestrais, overview TTM e notícias | Histórico compact de até 100 pregões; sem métricas históricas anual/trimestral e sem demonstrações TTM neste adaptador |
| Twelve Data | Preços | Só diário com multiplicador 1, até 5.000 pontos; market cap e volume podem faltar |
| SEC EDGAR | Descoberta de filings, fatos XBRL e extração parcial de seções | Contato real; limites de páginas, conceitos e texto; não reconstrói demonstrações completas |
| FRED | Curva de juros e inflação histórica por vintage | Chave do usuário, datas explícitas, sem previsão ou calendário econômico |

Em `auto`, preços tentam Twelve Data, FMP, Alpha Vantage e Financial Datasets, nessa ordem, usando apenas fontes com chave. Fundamentos/notícias tentam FMP, Alpha Vantage e Financial Datasets; filtros usam apenas Financial Datasets. Seleção explícita não oferece fallback para outro provedor. Uma chave Financial Datasets legada pode fazer a resolução padrão escolher esse provedor em vez de `auto`; configure `FINANCIAL_DATA_PROVIDER=auto` se essa for sua intenção.

Demonstrações/métricas aceitam `quarterly`, `annual` e `ttm`, com `limit` de 4 a 5.000, padrão 5 nas ferramentas; datas opcionais `report_period_gte/lte` delimitam relatórios. Notícias e screener aceitam limites de 1 a 5.000. Preços expõem intervalos `second`, `minute`, `day`, `week`, `month`, `year`, mas fontes alternativas só implementam diário. Intervalo e faixa de datas não garantem histórico completo nem preços ajustados adequados para risco.

SEC: `getSECFilings` aceita `10-K`, `10-Q`, `8-K`, limite 1 a 100 (padrão 10), histórico ligado por padrão, emendas desligadas e 1 a 20 páginas de arquivo (padrão 5). Preserve `historyComplete` e warnings. Fatos aceitam taxonomias `us-gaap`, `ifrs-full`, `dei`, 1 a 20 conceitos e 1 a 100 observações por conceito (padrão 20); `asOf` filtra a data de publicação. Valores acumulados YTD não são automaticamente trimestres isolados. Seções exigem accessionNumber descoberto e `10-K`/`10-Q`; limite por seção de 1 a 50.000 caracteres (padrão 20.000). Podem vir `null` ou truncadas; não é OCR nem parser universal. Texto externo é dado não confiável, nunca instrução a executar.

FRED: `startDate <= endDate <= asOf`, todas datas reais `YYYY-MM-DD`. Curva: no máximo 366 dias inclusivos, séries `DGS2`, `DGS10`, `DGS3MO`; juros em porcentagem, spreads 10 anos menos curto prazo em pontos percentuais. Inflação: até dez anos, 1 a 5 séries distintas entre `CPIAUCSL`, `CPILFESL`, `PCEPI`, `PCEPILFE`, `PPIACO`, variação anual fornecida por `units=pc1`, não mensal. Ausências permanecem `null`, spreads usam só datas comuns não nulas, não há forward-fill. Vintage, revisões e atraso de publicação importam.

## 6. Workflows tradicionais em `/agents`

Na aba `Workflows`:

1. **Full Analysis:** informe ticker e peers separados por vírgula. Research coleta dados; Analysis gera interpretação; Report produz Markdown. O resultado pode conter recomendação textual, não validada como conselho de investimento.
2. **Bull vs Bear Debate:** informe ticker e pergunta. O código coleta pesquisa, executa duas análises e uma síntese LLM, depois relatório. `buildAnalysisPrompt` aplica `perspective` bull/bear e `instruction`, pede evidências e contraevidências sem inventar fatos e sinaliza dados financeiros da fonte como evidência não confiável, não instruções. As perspectivas orientam o modelo, mas não garantem teses corretas ou necessariamente opostas. Opcionalmente, configure `EVIDENCE_GAP_DECISION_MODE=deterministic` no servidor para verificar antes das análises se preços, demonstrações, cash flows e métricas contêm valores financeiros reconhecidos e linhas com datas válidas. Linhas metadata-only, ausentes, malformadas ou sem data param o run como unresolved; o modo padrão `off` mantém o fluxo existente. A verificação não aplica limite de idade nem confirma atualidade, qualidade, conflitos ou notícias recentes.
3. **Stock Screening:** informe critérios JSON. Exemplo de estrutura: `{"roe":{"min":15},"peRatio":{"max":20},"debtToEquity":{"max":0.5}}`. Aliases incluem `roe`, `peRatio`, `debtToEquity`, `revenueGrowth`, `payoutRatio` e `pegRatio`; valores devem respeitar unidades do provedor. Não inclua `name` no objeto de critérios como se fosse filtro.
4. **Portfolio Monitor:** informe array de posições, por exemplo `[{"ticker":"AAPL","costBasis":150,"shares":10}]`. Esse exemplo ilustra campos, não uma carteira real. `costBasis` é preço de custo por ação, não valor total. A consulta manual não salva posições nem configura alertas recorrentes.

Os workflows manuais são enfileirados no Inngest e retornam `202`; não executam uma cópia síncrona na requisição. A aba `History` mostra runs owner-scoped persistidos e atualiza o estado enquanto aberta. A mesma `Idempotency-Key` UUID e entrada reutilizam o run; mudanças de entrada com a mesma chave retornam conflito. Os cards em `Agents` começam em `idle` e não acompanham tarefas reais. `Test Run`, controles de olho desses cards e `Configure Alert Rules` não têm ações implementadas.

Analysis preserva as métricas normalizadas dos peers em `financial_metrics`. Monitor usa `latestHistoricalPricePair` sobre `historical.prices`: filtra closes finitos positivos, ordena por data e seleciona a observação mais recente e a anterior. O alerta descreve movimento **entre observações disponíveis**, não movimento de “hoje”, e inclui `latestDate` e `previousDate` nos detalhes. Datas podem não ser pregões consecutivos. O check de liquidez reconhece `current_ratio=0` como valor numérico abaixo de 1. Sem dados suficientes ou cobertura adequada, ausência de alertas não significa ausência de risco.

Os gatilhos tradicionais esperam o envio ao Inngest e depois executam sincronamente. Se o consumidor Inngest processar o evento, o mesmo pedido também roda em background, com potencial duplicação de custos e resultados. Se o envio falhar, a execução HTTP nem começa. A resposta do dashboard não é acompanhamento do job em background.

O cron de monitoramento é `0 9-16 * * 1-5`; o screener diário usa `0 17 * * 1-5`. Não há timezone explícito: crons Inngest sem prefixo de timezone usam UTC por padrão, não horário Eastern garantido. Não há ajuste de feriados de bolsa. O monitoramento busca atualmente `[]` em vez de carteiras do banco; notificações e persistência dos resultados são TODOs.

## 7. Quantitative: preparar e analisar JSON

### 7.1 Passo a passo

1. Abra `/agents` com sessão e selecione `Quantitative`.
2. Clique em `Input JSON` e escolha arquivo JSON UTF-8 de até **1.048.576 bytes (1 MiB)**.
3. Clique em `Analyze`. O corpo do arquivo é enviado a `POST /api/agents/quantitative` com a sessão do navegador; não são necessárias chaves de LLM para esse cálculo.
4. Confira `As of`, regime, volatilidade, horizontes, setores líderes e setores atrás do benchmark.
5. Se houver `portfolio`, confira valor, VaR/CVaR, drawdown e maior peso. Sem carteira aparece `Not evaluated` e o JSON tem risco `null`.
6. Leia `Evidence conflicts` e `Warnings & limitations`. Divergências não são resolvidas por votação nem transformadas em recomendação.
7. Use o ícone de download para obter `quantitative-{asOf}.json`. O arquivo inclui a saída completa, mais detalhada que a tela. Use `Clear analysis` para limpar o estado local.

Trocar de arquivo limpa o resultado. Durante execução, os controles principais ficam desabilitados. Não existe importação persistente, agendamento ou refresh automático dessa carteira. Preserve por conta própria origem, licença, data da exportação, moeda e método de ajuste: o JSON numérico não comprova esses atributos.

### 7.2 Contrato de mercado

O objeto raiz é estrito: `market` obrigatório, `portfolio` opcional, sem campos extras. Dentro de `market`:

| Campo | Significado e limites |
| --- | --- |
| `histories` | 2 a 12 séries; exatamente benchmark e proxies selecionados, sem séries extras |
| `marketTicker` | Benchmark escolhido pelo usuário |
| `sectorTickers` | 1 a 11 proxies distintos, nunca o benchmark |
| `ticker` | Texto de 1 a 40 caracteres, aparado e convertido para maiúsculas |
| `prices` | 1 a 501 pontos por série, com `date` real e `price` finito positivo; datas únicas |
| `priceBasis` | `TOTAL_RETURN` ou `ADJUSTED_PRICE`, declaração do usuário, não certificação automática |
| `asOf` | Corte inclusivo; pontos posteriores ficam fora da análise de mercado |
| `horizons` | 1 a 12 inteiros distintos entre 1 e 500; padrão `[20,60,200]` |
| `config.regimeWindow` | 1 a 500, padrão 200 |
| `config.volatilityWindow` | 2 a 500, padrão 20 |
| `config.trendThreshold` | Fração de 0 a 1, padrão 0,02 |
| `config.annualizationFactor` | Positivo, até 366, padrão 252 |
| `config.volatileThreshold` | Fração positiva, padrão 0,25 |
| `config.crisisThreshold` | Fração positiva maior que `volatileThreshold`, padrão 0,60 |

São necessárias pelo menos `max(horizons, regimeWindow, volatilityWindow) + 1` datas **comuns**, após o corte `asOf`. O padrão exige 201 preços comuns. Janelas contam intervalos entre observações, não dias corridos. Não há preenchimento de buracos; lacunas podem distorcer interpretação diária e anualização. `asOf` efetivo é a última data comum, que pode ser anterior ao solicitado.

Use históricos reais na mesma moeda e base de ajuste. Proxies podem ser ETFs ou índices adequados, mas seu ticker não prova composição setorial. Não misture preços sem ajuste de splits, moedas ou convenções de distribuição. `ADJUSTED_PRICE` não permite inferir que dividendos foram reinvestidos. O sistema não faz conversão cambial.

### 7.3 Exemplo esquemático, não executável

Os dois preços abaixo servem **apenas para mostrar a estrutura**, são ilustrativos e não representam dados reais. Mesmo com janelas pequenas, o trecho não contém observações suficientes para volatilidade e risco. Complete históricos com uma fonte licenciada antes de usar:

```json
{
  "market": {
    "marketTicker": "BENCHMARK",
    "sectorTickers": ["SECTOR_PROXY"],
    "priceBasis": "ADJUSTED_PRICE",
    "asOf": "2026-09-30",
    "horizons": [20, 60, 200],
    "histories": [
      {"ticker": "BENCHMARK", "prices": [{"date": "2026-09-29", "price": 100}, {"date": "2026-09-30", "price": 101}]},
      {"ticker": "SECTOR_PROXY", "prices": [{"date": "2026-09-29", "price": 50}, {"date": "2026-09-30", "price": 49}]}
    ]
  },
  "portfolio": {
    "currency": "USD",
    "confidence": 0.95,
    "positions": [{"ticker": "HOLDING", "shares": 10, "currentPrice": 101}],
    "histories": [{"ticker": "HOLDING", "prices": [{"date": "2026-09-29", "price": 100}, {"date": "2026-09-30", "price": 101}]}]
  }
}
```

Para um exemplo **completo e executável**, use a única [fixture quantitativa](exemplos/quantitative-fixture.json) e leia as [instruções e advertências dos exemplos](exemplos/README.md). Ela já inclui `market` e `portfolio`; não há arquivo separado de fixture de carteira. São 21 datas comuns de 2026-09-01 a 2026-09-21, que produzem 20 retornos, com horizontes `[5,10,20]` e `regimeWindow=20`/`volatilityWindow=20` explícitos. Janelas de 20 exigem 21 preços; os defaults de mercado exigiriam 201 e não servem para esta amostra.

Todos os tickers e preços são fictícios, **sem dados financeiros reais**. As datas incluem fins de semana, não representam sessões de bolsa e não validam anualização ou sinais de investimento. Os 20 retornos são apenas o mínimo de execução de risco; o aviso de amostra curta é esperado. Fixture sintética serve para testar transporte e aritmética, nunca para orientar investimento.

### 7.4 Carteira opcional e relatório isolado

O bloco `portfolio` tem o mesmo contrato usado por `POST /api/portfolio/risk` e `pnpm portfolio:report`:

| Campo | Regras |
| --- | --- |
| `positions` | 1 a 10 posições, `ticker`, `shares` e `currentPrice`; números finitos estritamente positivos |
| `histories` | 1 a 10 séries; exatamente uma por ticker das posições, sem faltas ou extras |
| `ticker` | Até 32 caracteres, aparado, **sensível a maiúsculas**; agregue posições repetidas antes |
| `prices` | Até 251 pontos por histórico; no mínimo 21 datas comuns para 20 retornos |
| `currency` | Texto não vazio de até 16 caracteres; rótulo de unidade, não conversor FX |
| `confidence` | Estritamente entre 0 e 1, padrão 0,95 |
| `scenarios` | Opcional, até 10 cenários com nome de até 128 caracteres e choque para cada posição |

Cada cenário tem `name` e `returns`, mapa com todas as posições, sem tickers adicionais, até 10 chaves de até 32 caracteres. Choques são retornos decimais finitos maiores ou iguais a -1: -0,20 significa perda de 20%. Não há cenário implícito nem choque zero assumido para posição ausente. Usar nome de uma crise não cria replay histórico dessa crise.

Carteira não possui `asOf` de entrada e não é recortada pela data do mercado. Se terminar em data diferente, o orquestrador registra `AS_OF_MISMATCH`. `currentPrice` não precisa ser o último preço histórico; VaR monetário usa o valor atual fornecido. Recomenda-se 250 retornos/251 preços; 20 retornos são um piso de execução, não evidência estatística robusta. Não há shorts, caixa, alavancagem, fluxos, taxas, impostos ou conversão cambial modelados.

### 7.5 Como ler a saída

Retornos, perdas, volatilidade, pesos e drawdown são frações: `0.05` significa 5%. Valores monetários usam a moeda declarada; o painel formata números em estilo `en-US`.

- `specialists.marketRegime`: direção e regime heurístico `BULL_TRENDING`, `BULL_VOLATILE`, `BEAR_TRENDING`, `BEAR_VOLATILE`, `SIDEWAYS` ou `CRISIS`. São rótulos descritivos de momentum e volatilidade, não previsão de crise.
- `specialists.sectorRotation`: ranking por retorno absoluto e excesso de retorno sobre o benchmark por horizonte. Um setor pode subir e ainda perder para o mercado; empates de retorno compartilham rank.
- `specialists.timeHorizon`: pares de evidências mercado/setores para cada janela; não é forecast de diferentes prazos futuros.
- `specialists.risk.report`: risco, correlações e stress explícito da carteira, quando fornecida.
- `valueAtRisk.returnLoss`: quantil histórico nearest-rank das perdas `-retorno`. Permanece **com sinal**; uma amostra só de ganhos pode gerar VaR negativo.
- `conditionalValueAtRisk.returnLoss`: média da pior massa `(1-confidence) × número de retornos`, com contribuição fracionária na observação de fronteira. Não é simplesmente a média de todas as perdas maiores ou iguais ao VaR.
- `amount`: perda fracionária multiplicada pelo **valor atual** da carteira. CVaR também preserva sinal; não é uma perda futura garantida.
- `historicalValues`, `dailyReturns`: quantidades atuais fixas aplicadas aos preços passados; não é a rentabilidade efetivamente realizada por uma carteira que mudou ao longo do tempo. “Daily” pressupõe sessões consecutivas; lacunas tornam intervalos multi-dia.
- `annualizedVolatility`: desvio-padrão amostral dos retornos vezes raiz de 252 para carteira. Mercado permite fator configurado.
- `maxDrawdown`: maior queda fracionária não negativa de um pico histórico acumulado.
- `concentration`: pesos atuais, maior peso, Herfindahl e número efetivo de posições (`1/Herfindahl`).
- `correlations.matrix`: Pearson de retornos alinhados, não preços. Série de variância zero produz `null`, inclusive na diagonal; não interprete como zero correlação.
- `stressTests`: valor estressado, lucro/prejuízo com sinal e retorno dos choques explicitamente fornecidos. Sem cenários, lista vazia.
- `conflicts`: desacordos de sinais entre horizontes de mercado, regime e horizontes, setor absoluto/relativo, setor positivo mas atrás do mercado e datas de carteira/mercado distintas. Ausência de conflito não certifica os dados nem cria consenso de investimento.

## 8. Comandos e API

### 8.1 Cookbook de comandos

Receita testada com a [fixture completa](exemplos/quantitative-fixture.json), sem banco, sessão, rede ou chave de modelo para o cálculo:

```sh
pnpm agent:analyze --input docs/exemplos/quantitative-fixture.json --mode=quantitative
```

A saída usa horizontes 5/10/20, data final 2026-09-21 e 20 retornos de carteira a partir de 21 datas. Preserve os warnings e limitations: dados fictícios com fins de semana e amostra mínima não são validação financeira. Consulte o [README dos exemplos](exemplos/README.md).

Os caminhos absolutos abaixo são exemplos a substituir por seus arquivos completos. `portfolio:report` exige apenas o objeto `portfolio`, não o JSON inteiro da equipe. Os relatórios escritos por redirecionamento podem conter informação financeira privada.

```sh
pnpm agent:analyze --input /caminho/quantitative.json --mode=quantitative
pnpm agent:analyze --input=/caminho/quantitative.json
pnpm portfolio:report /caminho/portfolio.json
```

`agent:analyze` aceita `--input arquivo` ou `--input=arquivo`; `--mode quantitative` ou `--mode=quantitative` é opcional e só aceita `quantitative`. Argumentos desconhecidos, repetidos ou sem valor falham. `portfolio:report` aceita exatamente um argumento posicional, não `--input`. Ambos leem UTF-8 até 1 MiB, escrevem JSON em stdout, erros em stderr e retornam código 0 ou 1. Não chamam modelo, não buscam preços e não salvam carteira no banco.

Para obter stdout contendo só JSON usando diretamente o executor:

```sh
pnpm exec tsx scripts/agent-analyze.ts --input /caminho/quantitative.json --mode=quantitative > quantitative-result.json
pnpm exec tsx scripts/portfolio-report.ts /caminho/portfolio.json > portfolio-result.json
```

Comandos de desenvolvimento e banco, conforme [package.json](../package.json):

| Comando | Efeito |
| --- | --- |
| `pnpm dev` | Next dev com Turbo |
| `pnpm test` | Testes de APIs, ferramentas, agentes, mercado, carteira e scripts; muitos usam mocks/fixtures |
| `pnpm typecheck` | `tsc --noEmit --incremental false` |
| `pnpm build:app` | Apenas `next build`; pode depender de ambiente/banco durante avaliação de rotas |
| `pnpm build` | **Executa migrações** e depois `next build`; pode alterar o banco apontado por `POSTGRES_URL` |
| `pnpm start` | Servidor de produção após build |
| `pnpm lint` | Next lint e Biome com `--write --unsafe`; **pode modificar arquivos**, não é só leitura |
| `pnpm lint:fix` | Next lint com fix e Biome com escrita |
| `pnpm format` | Formatação com escrita |
| `pnpm db:generate` | Gera migrações Drizzle para mudanças de schema |
| `pnpm db:migrate` | Aplica migrações existentes |
| `pnpm db:studio` | Abre Drizzle Studio; acesso ao banco, não painel de carteira |
| `pnpm db:push` | Aplica schema diretamente; não substitui disciplina de migrações e backup |
| `pnpm db:pull` | Introspecção do banco |
| `pnpm db:check`, `pnpm db:up` | Operações de verificação/atualização de artefatos Drizzle; confira impacto antes de usar |

Teste quantitativo focado:

```sh
pnpm exec tsx --test lib/agents/quantitative.test.ts lib/agents/quantitative-http.test.ts lib/agents/quantitative-client.test.ts scripts/agent-analyze.test.ts
```

### 8.2 Inngest local

Em outro terminal, com a aplicação disponível:

```sh
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

O Dev Server normalmente oferece painel em `http://localhost:8288`; use os endereços impressos pela versão instalada. `npx` pode baixar a CLI da rede. Configure `INNGEST_DEV=1` para o processo da aplicação quando necessário e reinicie-o após alterar ambiente. Há também descoberta automática com `npx inngest-cli dev`. A instalação da CLI não conclui TODOs de banco ou notificação nem transforma os horários UTC em pregões Eastern.

### 8.3 Chamadas autenticadas com curl

Use um arquivo de cookies exportado de uma **sessão legítima já aberta** nessa instalação, em formato Netscape aceito pelo curl. Cookie de sessão é segredo: não o publique nem o versiona. Os exemplos não geram token fictício e não contornam autenticação:

```sh
curl --fail-with-body --cookie /caminho/privado/session-cookies.txt \
  -H 'Content-Type: application/json' \
  --data-binary @/caminho/quantitative.json \
  http://localhost:3000/api/agents/quantitative

curl --fail-with-body --cookie /caminho/privado/session-cookies.txt \
  -H 'Content-Type: application/json' \
  --data-binary @/caminho/portfolio.json \
  http://localhost:3000/api/portfolio/risk

curl --fail-with-body --cookie /caminho/privado/session-cookies.txt \
  -H 'Content-Type: application/json' \
  --data '{"workflowType":"screening","data":{"criteria":{"roe":{"min":15},"peRatio":{"max":20}}}}' \
  http://localhost:3000/api/agents/trigger
```

Quantitative e risk retornam diretamente o objeto calculado, sem envelope `success/data`. Exigem `application/json`, sessão e até 1 MiB; respostas usam `Cache-Control: no-store`. HTTP 401 indica ausência de sessão; 413 tamanho; 400 formato, configuração ou cálculo inválido; 503 falha de serviço/autenticação fora do cálculo. Mensagens são deliberadamente genéricas e não detalham todas as causas numéricas.

Trigger usa `{workflowType,data}` e retorna `{success:true,data}` no sucesso; tipos aceitos são `analysis`, `debate`, `screening`, `monitoring`. Não há tipo `quantitative` ou `report` nesse switch. Relatório independente é evento Inngest interno, não uma opção desse endpoint. A rota tradicional não usa o mesmo leitor limitado a 1 MiB nem o mesmo contrato estrito das APIs quantitativas.

## 9. Troubleshooting

| Sintoma | Verificação e ação |
| --- | --- |
| Migração sem `POSTGRES_URL` ou conexão recusada | Execute na raiz; confira ambiente exportado, `.env.local`, `.env`, banco criado, serviço ativo, usuário e permissões |
| Helper não muda URL/chave vazia | Ele preserva a maioria dos valores existentes; preencha explicitamente, sem expor segredos |
| SEC exige identificação ou retorna 403/429 | Configure contato real em `SEC_USER_AGENT`, confira rede/política fair access; não use o placeholder nem aumente chamadas indiscriminadamente |
| FRED inválido/incompleto | Chave correta do usuário, 32 caracteres minúsculos alfanuméricos; datas/vintage, limites e revisões; resultados incompletos são rejeitados |
| 401 no quantitativo | Aguarde login automático, confirme cookies da mesma origem e banco; CLI não precisa de sessão |
| 413 / Input exceeds 1 MiB | Reduza número de séries/pontos/campos; verifique bytes UTF-8, não só caracteres |
| Invalid histories/configuration | JSON sem comentários, UTF-8 válido, nomes de campos exatos, sem extras, datas reais únicas, preços positivos e limites de arrays |
| Falta de observações alinhadas | Conte a interseção após `asOf`; padrões exigem 201 preços de mercado e risco ao menos 21. Não invente nem interpole dados para passar |
| Carteira não coincide com mercado | Carteira é amostra independente sem corte pelo `asOf` de mercado; confira `AS_OF_MISMATCH` e corrija o recorte na origem |
| Relatório mostra VaR negativo ou correlação `null` | Pode ser comportamento matemático esperado: perdas com sinal e variância zero. Não substitua por zero |
| Otimização rejeita cap ou não converge | `maxWeight >= 1/n`; cap não trivial só em minimum-variance; datas idênticas, covariância, ridge, tolerância e limites de iteração |
| Regressão de fatores falha | Datas exatamente alinhadas, pesos completos somando 1 e fatores independentes; séries constantes/colineares e carteira sem variância são rejeitadas |
| Chat reabre modal apesar de provedor cadastrado | Verificação usa chave legada local; configuração de provedores e gate do formulário não estão plenamente harmonizados |
| Estados do chat aparecem, mas não há resposta textual | Verifique modelos auxiliares, compatibilidade do endpoint e erros do servidor; o stream está conectado, mas provedores reais não são certificados pelos testes simulados |
| Delete parece concluir, mas conversa permanece | O frontend chama DELETE sem handler atual em `/api/chat`; não considere os dados excluídos |
| Model not found / modelo auxiliar indisponível | Confira catálogo do servidor, URL e modelos fixos de título/decomposição/Analysis/Report, não apenas o seletor |
| Workflow falha antes de pesquisar | Envio Inngest é aguardado primeiro; confira Dev Server, modo local e configuração de eventos |
| Research parcial ou Monitor sem alertas de preço | Confira cobertura, closes válidos e as datas mais recente/anterior em `historical.prices`; o movimento é entre observações, não necessariamente diário. Ausência de alerta não prova ausência de risco |
| Testes passam, acesso externo falha | Mocks não verificam plano, licenciamento, cotas, e-mail real, autenticação nem disponibilidade ao vivo |
| History vazia / cards sempre idle | Placeholders e estado local, não telemetria persistente |
| PDF rejeitado / Blob falha | Rota aceita apenas JPEG/PNG; confira token Blob e implicações de acesso público |

## 10. Antes de operar em produção

- Substitua identidade automática por autenticação verificável; audite autorização de rotas, ações, propriedade de chats/documentos e isolamento por usuário.
- Não use senha/URL local padrão; mantenha segredos no gerenciador da infraestrutura, HTTPS, rotação e controles de acesso.
- Restrinja endpoints de provedores aceitos, transporte de chaves e exposição em logs; `localStorage` não é um cofre.
- Faça backup do PostgreSQL e planeje migrações: `pnpm build` pode alterar o banco. Separe build e deploy quando apropriado.
- Configure Inngest com chaves e verificação, timezone/feriados adequados, deduplicação e observabilidade; resolva execução dupla antes de prometer jobs confiáveis.
- Implemente persistência de tarefas/carteiras e notificações antes de anunciar monitoramento recorrente.
- Revise custos de LLM, chamadas auxiliares, retries, eventos duplicados, cotas de dados, Blob e tracing. Sufixo `:free` não garante gratuidade ou disponibilidade futura.
- Verifique licenças de dados, redistribuição de notícias/filings, termos SEC/FRED e chaves por usuário; a licença Apache-2.0 do código não concede direitos sobre dados externos.
- Documente consentimento, retenção, exclusão, compartilhamento público e acesso a anexos. Não envie posições ou documentos confidenciais sem avaliar destinos.
- Valide metodologia, unidade, ajuste, calendários, amostra e resultados; nenhum relatório substitui revisão humana ou aconselhamento financeiro autorizado.

Os documentos explicam o estado atual, não certificam um deployment nem alegam validação de dados reais. Limitações e backlog técnico estão detalhados em [Arquitetura e agentes](ARQUITETURA_E_AGENTES.md#10-limitações-e-backlog).
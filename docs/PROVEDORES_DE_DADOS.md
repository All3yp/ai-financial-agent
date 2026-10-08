# Provedores e fontes de dados

Este guia incorpora as alternativas propostas pelo usuário e distingue a oferta
dos fornecedores das integrações existentes no projeto. Não valida preços,
gratuidade, licenças ou disponibilidade de endpoints comerciais. Confira esses
itens na documentação oficial e no plano da sua conta antes de usar.

Financial Datasets permanece suportado. Nenhuma alternativa o remove, nenhuma
assinatura é ativada automaticamente e serviços complementares não são
substitutos universais para todas as ferramentas financeiras.

## Estado das integrações

| Fonte | Uso proposto | Estado real neste projeto |
| --- | --- | --- |
| [Financial Datasets](https://docs.financialdatasets.ai/) | Preços, fundamentos, screener e notícias | Integrado; padrão quando sua chave existe e não há escolha explícita |
| [FMP](https://site.financialmodelingprep.com/developer/docs) | Alternativa geral para pesquisa de ações | Integrado para preços diários, demonstrações, métricas e notícias; acesso depende do plano; screener atual não usa FMP |
| [EODHD](https://eodhd.com/financial-apis) | Cobertura internacional e históricos | Candidato, sem adaptador ou variável de configuração implementados; [planos oficiais](https://eodhd.com/pricing) precisam ser verificados |
| [Twelve Data](https://twelvedata.com/docs) | Séries temporais, intraday e streaming | Adaptador atual somente para preços diários; intraday, indicadores e WebSocket ainda não integrados |
| [Alpha Vantage](https://www.alphavantage.co/documentation/) | Protótipos e consultas pequenas | Integrado para preços diários compactos, notícias, demonstrações anuais/trimestrais e snapshot TTM de métricas |
| [Yahoo/yfinance](https://ranaroussi.github.io/yfinance/) | Pesquisa pessoal e preparação de históricos | Não integrado; biblioteca Python de acesso não oficial, sem garantia de disponibilidade ou autorização para produção/redistribuição |
| [SEC EDGAR](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) | Fonte primária de disclosures norte-americanos | Filings, fatos Company Facts e seções HTML integrados com cobertura e limitações explícitas; não fornece cotações nem reconstrói demonstrações completas |
| [FRED](https://fred.stlouisfed.org/docs/api/fred/) | Contexto macroeconômico | Curva de juros e inflação com vintage integradas; PIB, desemprego e demais séries ainda não expostos como ferramentas gerais |
| [Nasdaq Data Link](https://docs.data.nasdaq.com/) | Datasets econômicos e financeiros especializados | Candidato; contratos, formatos, licença e custo variam por dataset |
| [CoinGecko](https://docs.coingecko.com/) | Preços e contexto de criptoativos | Candidato; não há ferramenta CoinGecko nem análise on-chain implementada |
| [GDELT](https://www.gdeltproject.org/data.html) | Descoberta de notícias e eventos globais | Candidato; sentimento financeiro, deduplicação e interpretação de eventos não implementados |

O suporte do fornecedor a cripto, forex, ETFs ou transcrições não significa
suporte de ponta a ponta neste aplicativo. Símbolos, moeda, bolsas, ajuste de
preços e schemas de retorno precisam ser verificados por operação.

## Escolha por objetivo

- **Pesquisa geral de ações:** Financial Datasets ou FMP, conforme endpoints e
  direitos disponíveis. Compare custo por workflow, não apenas mensalidade.
- **Cobertura internacional:** avaliar EODHD contra bolsas, instrumentos,
  identificação de símbolos, moeda e histórico ajustado realmente necessários.
- **Intraday e streaming:** avaliar Twelve Data; implementar esse transporte é
  trabalho separado do adaptador diário existente.
- **Disclosures dos EUA e macro:** SEC + FRED complementam dados de mercado.
  Não substituem preços ajustados, screener ou consenso de analistas.
- **Pesquisa pessoal com orçamento baixo:** avaliar exportações autorizadas de
  yfinance junto de SEC/FRED. Gratuidade de acesso não concede direitos de uso
  comercial, redistribuição ou um SLA.
- **Cripto:** avaliar CoinGecko como fonte específica, sem confundir preços com
  dados on-chain, funding, derivativos ou liquidez executável.
- **Eventos/notícias:** avaliar GDELT como descoberta. Cobertura midiática e
  métricas de tom não equivalem automaticamente a sentimento financeiro validado.
- **Pesquisa reproduzível:** guardar dados autorizados, parâmetros, fonte,
  vintage, moeda e convenções de ajuste. Parquet/DuckDB são candidatos de
  armazenamento, não infraestrutura já integrada.
- **Integração com agentes externos:** um servidor MCP próprio pode expor
  contratos validados no futuro. Este repositório não implementa esse servidor;
  MCP não elimina licenciamento, autenticação, cotas ou qualidade dos dados.

## Selecionar uma alternativa já integrada

Configure a chave correspondente no ambiente do servidor e selecione o provedor.
Exemplo de seleção, sem incluir segredos no comando:

```sh
env FINANCIAL_DATA_PROVIDER=fmp pnpm dev
```

Valores aceitos: `financial-datasets`, `fmp`, `alpha-vantage`, `twelve-data`,
`auto`. Chaves: `FINANCIAL_DATASETS_API_KEY`, `FMP_API_KEY`,
`ALPHA_VANTAGE_API_KEY` e `TWELVE_DATA_API_KEY`.

Não use `eodhd`, `coingecko`, `yahoo`, `gdelt` ou `nasdaq` nessa variável: eles
não estão no schema e a seleção será rejeitada. SEC e FRED usam ferramentas e
configurações próprias, `SEC_USER_AGENT` e `FRED_API_KEY`, respectivamente.

O chat também aceita `financialData: { provider, apiKeys }` na requisição, além
do campo legado `financialDatasetsApiKey`. A janela de chaves da interface ainda
não gerencia todas as alternativas; configurar o servidor ou usar a API não
equivale a ter seletor completo de dados no navegador. Consulte o
[guia do usuário](GUIA_DO_USUARIO.md) para os bloqueios atuais do envio do chat.

Sem seleção explícita, uma chave Financial Datasets configurada tem prioridade.
Escolher um provedor explicitamente não ativa fallback silencioso. Em `auto`,
preços preferem Twelve Data e fundamentos/notícias preferem FMP, tentando depois
alternativas configuradas conforme a operação. Isso pode consumir cotas de mais
de um serviço. Screener por filtros ainda exige Financial Datasets.

## Critérios antes de integrar uma nova fonte

1. Confirmar endpoint, autenticação, plano, cotas e licença para o uso pretendido.
2. Verificar bolsas, símbolos, moeda, timezone, atrasos e convenções de ajustes.
3. Definir schemas e testes reais de contrato, mantendo ausência como `null`,
   sem fabricar zeros ou prometer equivalência de campos distintos.
4. Limitar requisições, payloads, cache e retries; não vazar chaves em URLs de
   erro, logs, tracing ou mensagens retornadas ao usuário.
5. Preservar datas de publicação/vintage para evitar revisões futuras em análises
   históricas; nunca misturar YTD com trimestre isolado.
6. Testar erros de plano, símbolo inexistente, rate limit, formatos inválidos,
   ajuste de splits/dividendos e cobertura parcial.
7. Atualizar guias, UI e roadmap sem marcar funcionalidades apenas planejadas
   como disponíveis.

Custos totais incluem consultas repetidas, símbolos, créditos, modelos, retries
e armazenamento. Os caches atuais são locais por cliente/processo, não um cache
persistente compartilhado ou um sistema distribuído de controle de cotas.

## Próximas integrações candidatas

EODHD é candidato para ampliar cobertura internacional; CoinGecko para separar
cripto da pesquisa de ações; GDELT para pesquisa de eventos. A ordem depende da
necessidade de instrumentos, autorização de acesso e contrato verificável.
Nasdaq Data Link exige escolha de datasets concretos, não apenas do agregador.
yfinance é melhor avaliado como preparação/exportação de históricos de pesquisa,
sem tornar um acesso não oficial dependência obrigatória do servidor Next.js.

Esses itens continuam pendentes. Não foram feitas chamadas reais, aquisições de
planos, criação de contas ou promessas sobre preços e free tiers neste guia.
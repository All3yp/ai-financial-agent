# Verificação local

Esta verificação distingue testes de implementação, interface e serviços reais.
Não certifica modelos, fontes pagas, qualidade dos históricos ou implantação.

## Comandos reproduzíveis

Nesta entrega, os 184 testes passaram, o TypeScript completo passou e o build
de produção passou. O editor não apresentou erros. Avisos de lint do projeto
continuam possíveis e não equivalem a falhas de compilação.

```sh
pnpm test
pnpm typecheck
pnpm build:app
pnpm agent:analyze --input docs/exemplos/quantitative-fixture.json --mode=quantitative
```

`build:app` não executa migrações. `pnpm build` migra o banco configurado antes
do build; não use como simples verificação contra um banco sem autorização.

## Interface verificada

O painel `/agents` foi servido localmente em `http://localhost:3011`. O fluxo
existente de sessão automática foi utilizado, sem remover autenticação. A fixture
fictícia do diretório [exemplos](exemplos/README.md) foi enviada ao endpoint real
local, que executou os cálculos sem modelo ou fonte externa.

- Estado vazio com execução/exportação desabilitadas.
- Upload da fixture e resultado consistente com a CLI: valor USD 144, VaR USD
  14,4, CVaR USD 28,8, drawdown 28% e três horizontes históricos.
- Avisos e limitações presentes, incluindo amostra de 20 retornos.
- Limpeza retorna ao estado vazio.
- JSON inválido exibe erro e não habilita exportação.
- Layouts 1440 x 1000 e 390 x 844 inspecionados por screenshots e medidas DOM,
  sem overflow horizontal da página ou sobreposição observada.
- Botão de exportação gera link `blob:` com nome
  `quantitative-2026-09-21.json`. O arquivo baixado foi posteriormente encontrado
  no workspace e seu JSON é exatamente igual à saída atual da CLI para a fixture
  versionada. Ele contém somente resultados sintéticos de `TEST_*`, é ignorado
  pelo Git e não substitui a entrada reproduzível
  `docs/exemplos/quantitative-fixture.json`.

Não foram enviados dados financeiros reais ou segredos aos provedores. O acesso
à aplicação pode criar a identidade automática e sessão no banco local; não
houve migrações nem ingestão persistente de carteira.

## Regressões corrigidas

O Monitor lê o envelope normalizado de preços, escolhe as últimas observações
válidas por data e reconhece razão corrente zero. Analysis preserva métricas dos
pares e utiliza perspectivas bull/bear distintas. Testes simulados cobrem os
contratos, não a qualidade de análises geradas por modelos reais.

O chat conecta o stream do SDK ao cliente e preserva pergunta/anexos ao adicionar
subtarefas. O protocolo de texto tem teste com modelo simulado. Nenhuma chave de
modelo real foi utilizada para validar qualidade ou compatibilidade externa.

Veja [Arquitetura e agentes](ARQUITETURA_E_AGENTES.md) e
[Guia do usuário](GUIA_DO_USUARIO.md) para limitações ainda não resolvidas.
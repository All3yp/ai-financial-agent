# Fixtures de demonstração

Os preços e tickers deste diretório são **fictícios**, exclusivamente para testar
o contrato de entrada e a interface. Os pontos incluem fins de semana; não são
sessões reais de mercado e não validam anualização, sinais ou retornos futuros.
Nunca misture estas fixtures com dados reais nem interprete os resultados como
pesquisa de investimentos. O mínimo de 20 retornos foi escolhido para um exemplo
compacto; as advertências de amostra insuficiente fazem parte da demonstração.

Execute a equipe sem banco, sessão, rede ou chaves de modelo:

```sh
pnpm agent:analyze --input docs/exemplos/quantitative-fixture.json --mode=quantitative
```

Para verificar a interface, abra `/agents`, selecione `Quantitative`, escolha
o arquivo e execute `Analyze`. O endpoint requer uma sessão autenticada, portanto
o navegador depende do banco e da configuração da aplicação. A carteira deste
exemplo é somente entrada de cálculo; não é gravada no banco.

Para seu uso real, substitua **todos** os tickers, datas e preços por históricos
compatíveis, documente a fonte e os ajustes, e configure os horizontes de acordo
com a quantidade de observações. As declarações de moeda e base de preços são
responsabilidade do usuário, não verificações externas executadas pelo projeto.
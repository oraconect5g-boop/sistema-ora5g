# Regras de negócio puras

Funções sem banco, sem rede e sem tela, usadas pelo servidor, pela demonstração e, no futuro, pelo worker e pela loja online. Cada regra cita a decisão do proprietário de onde veio.

| Arquivo | Regra | Origem |
|---|---|---|
| `dinheiro.ts` | Dinheiro em centavos inteiros; leitura e formatação em reais | BASE_CONSOLIDADA §3 |
| `identificadores.ts` | IMEI e ICCID com dígito verificador | Lacuna L-04 (digitação manual) |
| `desconto.ts` | Limite de desconto pelo menor entre o teto da categoria e a margem mínima após a taxa do meio | DEC-U26, DEC-U27, DEC-U41 |
| `pagamento.ts` | Pagamento misto, troco só em dinheiro, venda financiada (entrada + financeira, sem juros), e-mail obrigatório na PayJoy | DEC-U28, DEC-U29, DEC-U30, DEC-U38 |
| `venda.ts` | Tipos de item e exigências, totais, valor de face da recarga separado, produção por categoria (telecom só confirmada) | Invariantes 1, 3, 4 e 6; DEC-U46 |

**Parâmetros de negócio** (margem mínima, teto por categoria, taxas dos meios) **ainda não foram definidos** pelo proprietário. Eles entram como configuração, nunca fixados no código; os valores da demonstração são exemplos.

Testes: `npm test -w @ora5g/dominio`.

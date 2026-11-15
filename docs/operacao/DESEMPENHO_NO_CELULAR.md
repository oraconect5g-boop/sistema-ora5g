# Desempenho no celular

Lote QUAL-010a, de 15/11/2026, para o requisito ORA-QUAL-010 ("performance mobile e testes em dispositivos/internet reais"; aceite: "SLOs aprovados e comparados com resultado").

O vendedor usa o próprio celular, muitas vezes com a internet do plano dele. Uma tela lenta atrasa a venda na frente do cliente. Por isso o desempenho é medido de três jeitos:

1. **o tamanho de cada tela**, conferido no CI a cada mudança;
2. **o tempo num celular simulado com internet lenta**, medido à mão para comparar versões;
3. **o tempo do banco para concluir a venda**, medido nos testes de carga (QUAL-012a).

Nenhum dos três substitui o teste no celular e na internet da loja piloto. Esse teste fica para a piloto, com o vendedor.

## 1. O tamanho de cada tela (no CI)

O script `scripts/orcamento-de-desempenho.mjs` lê o build de produção e soma, para cada tela, o JavaScript e o CSS que o navegador baixa na primeira visita, comprimidos como na rede (gzip). Depois compara a soma com o orçamento de [`orcamento-de-desempenho.json`](orcamento-de-desempenho.json). O CI roda `node scripts/orcamento-de-desempenho.mjs --conferir` depois do build e falha se alguma tela passar do limite. Subir um limite exige um motivo escrito no próprio arquivo.

O que entra na conta de cada tela:

- os arquivos que o Next carrega em toda página (o React e o próprio Next);
- os arquivos da tela no manifesto do build: o layout, a página, o erro e o "não encontrado".

Os polyfills ficam de fora, porque só navegador antigo os baixa. A soma é um teto do que a tela baixa, não um tempo.

Medido no build de 15/11/2026 (79 telas):

| Tela | JavaScript (KB, comprimido) | Limite |
|---|---:|---:|
| Comum a todas (React e Next) | 128,3 | — |
| `/entrar` | 146,2 | 200 |
| `/inicio`, `/caixa`, `/notas` | 158,9 | 200 |
| `/estoque` | 159,9 | 200 |
| `/vendas/[id]` (comprovante) | 161,7 | 200 |
| `/vender` (PDV) | 171,8 | 200 |
| `/demo/connect` (a maior fora das exceções) | 183,7 | 200 |
| `/conta/seguranca` | 225,4 | 260 (exceção) |
| `/catalogo`, `/catalogo/lote`, `/assistencia/[id]` | 236,2 a 236,5 | 260 (exceção) |

O CSS é um arquivo só para todas as telas: 15,6 KB, com limite de 20 KB.

As quatro exceções carregam o cliente do Supabase no navegador (67 KB). Ele envia as fotos direto ao armazenamento privado e cadastra o segundo fator.

**Melhoria possível, ainda não feita:** carregar esse cliente só quando a pessoa vai enviar a foto ou cadastrar o celular. As quatro telas ficariam com cerca de 67 KB a menos na primeira visita.

## 2. O tempo num celular simulado (manual)

O script `scripts/medir-no-celular.mjs` abre cada endereço no Chromium do Playwright com estas condições:

- **aparelho:** tela de 360 px e toque, com o processador 4 vezes mais lento;
- **rede:** 4G lento, com os valores do "Slow 4G" do Lighthouse (150 ms de ida e volta, 1,6 Mbit/s para baixar e 750 kbit/s para subir);
- **cache:** desligado em todas as medidas.

Cada tela é medida três vezes, e vale a mediana. Os campos medidos são:

- **1º byte:** quando chega o primeiro byte da página;
- **1º desenho:** quando aparece a primeira coisa na tela;
- **maior desenho (LCP):** quando aparece o maior elemento da tela;
- **bloqueio:** a soma, em toda a carga, do que cada tarefa longa de JavaScript passa de 50 ms (perto do TBT do Lighthouse);
- **carregada:** quando a página termina de carregar;
- **baixado:** quanto foi baixado ao todo.

Medido na homologação (`ora5g.com.br`, versão `22a47c4`) em 15/11/2026, só nas telas sem login:

| Tela | 1º byte | 1º desenho | Maior desenho (LCP) | Bloqueio | Carregada | Baixado | JavaScript baixado |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/entrar` | 0,16 s | 0,88 s | 0,88 s | 51 ms | 1,42 s | 223 KB | 164 KB |
| `/` | 0,16 s | 0,88 s | 0,88 s | 64 ms | 1,42 s | 220 KB | 163 KB |
| `/demo/vender` (PDV da demonstração) | 0,16 s | 0,92 s | 0,92 s | 73 ms | 1,63 s | 243 KB | 177 KB |
| `/demo` | 0,16 s | 0,94 s | 0,94 s | 134 ms | 1,51 s | 241 KB | 158 KB |
| `/demo/connect` | 0,15 s | 0,92 s | 0,92 s | 108 ms | 1,64 s | 266 KB | 183 KB |

O JavaScript baixado passa um pouco da conta do item 1. Duas coisas explicam a diferença: o navegador também busca as telas dos links que aparecem na tela, e o servidor comprime de outro jeito.

**Limites desta medida:**

- as telas com login (o PDV real, o caixa, o início) não foram medidas: falta um usuário de teste, que depende da chave do Supabase que não está no servidor (J1);
- o servidor é o da homologação, não o de produção;
- a simulação não é o aparelho real.

## 3. O banco (QUAL-012a)

Oito vendedores vendendo ao mesmo tempo num PostgreSQL 17 de teste: a conclusão da venda levou entre 59 e 79 ms para 95% das vendas, em quatro rodadas. Os detalhes estão em `packages/banco/src/carga-e-recuperacao.test.ts`.

## Metas propostas (o proprietário aprova ou muda)

| Meta | Proposta | Hoje | Onde se mede |
|---|---|---|---|
| Maior desenho (LCP) de cada tela, no celular simulado com 4G lento | até 2,5 s | 0,88 a 0,94 s (telas sem login) | item 2 |
| Bloqueio por JavaScript, no mesmo celular simulado | até 200 ms | 51 a 134 ms | item 2 |
| JavaScript da primeira visita, por tela | até 200 KB comprimido (260 KB nas quatro exceções) | até 183,7 KB (236,5 KB nas exceções) | item 1, no CI |
| Concluir a venda no banco (95% das vendas) | até 1 s | 59 a 79 ms no banco de teste | item 3 |
| Na piloto, no celular e na internet da loja | abrir o PDV e concluir uma venda simples em até 3 s cada | — | com o vendedor, na loja piloto |

As metas de LCP e de bloqueio usam o "bom" do Google:

- [Web Vitals](https://web.dev/articles/vitals) e [Largest Contentful Paint no Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-largest-contentful-paint): LCP até 2,5 s;
- [Total Blocking Time](https://web.dev/articles/tbt): até 200 ms no celular.

As outras são propostas do projeto. Todas valem até o proprietário aprovar ou mudar.

## Como medir de novo

Primeiro o build; depois o tamanho de cada tela; por fim o tempo no celular simulado:

```bash
npm run build
```

```bash
node scripts/orcamento-de-desempenho.mjs
```

```bash
node scripts/medir-no-celular.mjs https://ora5g.com.br /entrar / /demo/vender /demo /demo/connect
```

Para comparar sem limitar a rede e o processador, use `REDE=livre`. Para mais medidas por tela, use `VEZES=5`.

## O que falta

- O proprietário aprovar (ou mudar) as metas.
- Medir as telas com login (PDV, caixa, início): depende do usuário de teste (J1).
- O teste no celular e na internet da loja piloto, com o vendedor.
- A melhoria das quatro exceções (o cliente do Supabase carregado só na hora do envio).

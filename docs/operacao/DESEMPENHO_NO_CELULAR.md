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
| `/conta/seguranca` | 159,1 (225,4 antes do QUAL-010b) | 200 |
| `/catalogo`, `/catalogo/lote`, `/assistencia/[id]` | 169,8 a 170,3 (236,2 a 236,5 antes do QUAL-010b) | 200 |
| `/demo/connect` (a maior) | 183,7 | 200 |

O CSS é um arquivo só para todas as telas: 15,6 KB, com limite de 20 KB.

Até o QUAL-010b, quatro telas (o catálogo, as fotos em lote, a OS da assistência e a segurança da conta) carregavam na primeira visita o cliente do Supabase no navegador (67 KB comprimidos), que envia as fotos direto ao armazenamento privado e cadastra o segundo fator. Elas eram exceções do orçamento, com limite de 260 KB. Desde o QUAL-010b, o cliente vem só quando a pessoa envia a foto ou mexe no celular (`apps/plataforma/src/lib/supabase/navegador.ts`): as quatro telas caíram cerca de 66 KB cada, e o orçamento ficou sem exceções.

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

## 4. O caminho do servidor até o banco (VEL-a, 16/11/2026)

As telas com login demoram por um motivo só: cada tela fazia muitas idas ao banco, uma depois da outra, e cada ida custa caro porque o servidor da homologação fica longe do banco.

### 4.1 Antes: o que o proprietário mediu no navegador (conta do dono, boa internet)

| Tela ou ação | Tempo |
|---|---:|
| `/saude/versao` (sem banco) | 0,14 s |
| `/caixa` | 1,2 s até o primeiro byte |
| `/clientes` | 1,8 s |
| `/catalogo`, `/estoque`, `/vender`, `/vendas` | 2,5 a 2,8 s |
| `/vender` com busca (`?q=`) | 4,7 s |
| `/inicio`, `/financeiro`, `/relatorios`, `/metas` | 0,5 a 0,7 s para começar, 2,0 a 2,6 s para terminar |
| Botão "Adicionar" do PDV | 3,6 s |
| Botão "Tirar" do PDV | 5,9 s |

Durante a espera o botão não travava e nada avisava que o pedido tinha sido enviado.

### 4.2 Antes: quanto custa uma ida ao banco, medido no servidor

Com `curl -w`, do servidor da homologação até o Supabase (`ora5g-dev`, São Paulo):

| Medida | Tempo |
|---|---:|
| Pedido em conexão nova (inteiro) | 0,42 a 0,44 s |
| — dos quais, abrir a conexão | 0,12 s |
| — dos quais, terminar a criptografia (TLS) | 0,26 s (acumulado) |
| Pedido em conexão reaproveitada | 0,16 a 0,20 s |
| `/saude/versao` no próprio servidor | 0,008 s |
| `/saude` no próprio servidor | 0,48 s |
| `/saude/versao` pelo domínio | 0,012 s |

Com o Node do servidor (o mesmo que roda a plataforma), antes de qualquer mudança:

| Medida | Tempo |
|---|---:|
| 1º pedido (conexão nova) | 0,64 s |
| Pedidos seguintes (reaproveitada) | 0,16 s |
| Depois de 3 s parado | 0,16 s |
| Depois de 6 s parado | 0,42 s (a conexão já tinha sido fechada) |
| Depois de 15 s parado | 0,41 s |
| 32 pedidos ao mesmo tempo, depois de parado | 0,90 s o mais lento (0,73 s a mediana) |
| 6 pedidos ao mesmo tempo, com as conexões abertas | 0,18 a 0,20 s |

O servidor está a cerca de 0,12 s de qualquer destino na internet (o terceiro salto da rota já mostra 128 ms), então a distância não é do Supabase: é do servidor da homologação. `ping` médio: São Paulo 123 ms, Virgínia 141 ms, Ohio 164 ms, Oregon 209 ms, Frankfurt 222 ms. **Na produção, o servidor da plataforma e o banco devem ficar na mesma região** (decisão do proprietário, D-027 e D-044): só isso tira a maior parte do tempo de cada ida.

### 4.3 Antes: quantas idas cada tela fazia

Conta simples: uma tela leva perto de 0,42 s (primeira ida, em conexão nova) mais 0,17 s para cada ida seguinte.

| Tela | Idas em fila | Tempo esperado |
|---|---:|---:|
| Qualquer tela com menu | conferir a sessão no serviço de login + situação da sessão + as leituras da tela + 32 pedidos do menu ao mesmo tempo + 2 contagens | — |
| `/caixa` | cerca de 7 | 1,2 s |
| `/vender` com venda aberta, sem busca | 10 a 13 | 2,0 a 2,4 s |
| `/vender` com busca | mais 3 da busca, mais detalhes, preços, fotos e endereços das fotos | 4 s ou mais |
| Uma ação do carrinho | sessão + ação + a tela inteira de novo | 3,2 a 3,6 s |

### 4.4 A conexão mantida aberta (medido antes de aplicar)

O Node fecha a conexão parada depois de 4 s. Com a conexão mantida por mais tempo, no mesmo servidor:

| Medida | Padrão do Node | Mantendo aberta |
|---|---:|---:|
| Depois de 6 s parado | 0,42 s | 0,18 s |
| Depois de 15 s parado | 0,41 s | 0,17 s |
| Depois de 30 s parado | — | 0,17 s |
| Depois de 60 s parado | — | 0,17 s |
| Depois de 100 s parado | — | 0,40 s (o outro lado fechou) |

Por isso a plataforma passa a manter a conexão com o banco aberta por 60 s.

### 4.5 O que mudou no VEL-a

- **Uma ida só para a sessão e o menu.** A função `molde_da_sessao` responde de uma vez a situação da sessão, as permissões do menu, o nome, o papel e as duas contagens. Antes eram 2 idas em fila e 34 pedidos ao mesmo tempo.
- **Sem ida ao serviço de login a cada tela.** A plataforma confere a assinatura do crachá da sessão no próprio servidor (`getClaims`, ADR-010). Quem decide se a sessão vale continua sendo o banco, a cada pedido.
- **O PDV lê a venda numa ida só** (`pdv_tela`): caixa, venda aberta, carrinho com preço, campanha, ordem de serviço e aprovação, e as maquininhas.
- **A conexão com o banco fica aberta por 60 s.**
- **Todo botão de ação trava e mostra um texto de espera** assim que é tocado.

### 4.6 Depois

*A preencher depois da publicação do lote, com as mesmas medidas.*

## Metas propostas (o proprietário aprova ou muda)

| Meta | Proposta | Hoje | Onde se mede |
|---|---|---|---|
| Maior desenho (LCP) de cada tela, no celular simulado com 4G lento | até 2,5 s | 0,88 a 0,94 s (telas sem login) | item 2 |
| Bloqueio por JavaScript, no mesmo celular simulado | até 200 ms | 51 a 134 ms | item 2 |
| JavaScript da primeira visita, por tela | até 200 KB comprimido | até 183,7 KB | item 1, no CI |
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

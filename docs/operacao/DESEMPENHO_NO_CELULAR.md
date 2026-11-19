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

### 4.4 A conexão mantida aberta

O Node fecha a conexão que ficou 4 s parada. A plataforma passa a mantê-la aberta por até **180 s** (`apps/plataforma/src/lib/supabase/conexao-mantida.ts`; ADR-010, decisão 4).

**Por que 180 s.** O Supabase não avisa por quanto tempo guarda a conexão. Medido em 16/11, ele fechou a conexão parada aos 400 s, nas nove vezes. O pedido que sai no instante desse fechamento falha, e o Node não repete (conferido no Node do servidor e fixado em teste). Por isso o nosso limite fica abaixo da metade do deles: a nossa conexão fecha antes, e o pedido seguinte abre outra.

**Antes e depois, no servidor.** A mesma versão da plataforma, num servidor de teste na máquina da homologação, sem e com a conexão mantida. É o tempo inteiro de duas telas públicas, cada uma com uma ida ao Supabase (a vitrine da loja online, hoje sem produto marcado, e a conferência do serviço de login):

| Medida | `/loja` antes | `/loja` depois | `/saude` antes | `/saude` depois |
|---|---:|---:|---:|---:|
| Primeiro pedido depois de o servidor subir | 0,85 s | 0,89 s | — | — |
| 1 s depois do pedido anterior | 0,21 s | 0,21 s | 0,18 s | 0,18 s |
| Depois de 8 s parada | 0,47 s | 0,21 s | 0,42 s | 0,17 s |
| 10 s depois do último pedido da outra tela | — | — | 0,59 s | 0,20 s |
| Depois de 30 s parada | 0,65 s | 0,19 s | 0,57 s | 0,18 s |
| Depois de 100 s parada | não medido | 0,42 s | não medido | 0,40 s |

**Quanto tempo parada ela continua rápida.** Outro roteiro, no mesmo servidor, com a conexão mantida por 180 s: o mesmo pedido leve (`GET /auth/v1/health`) depois de pausas diferentes, contando as conexões abertas e fechadas.

| Pausa antes do pedido | Tempo | Conexão |
|---|---:|---|
| Nenhuma (logo em seguida) | 0,18 e 0,19 s | a mesma |
| 45 s | 0,16 e 0,15 s | a mesma |
| 60 s | 0,15 e 0,15 s | a mesma |
| 75 s | 0,16 e 0,36 s | a mesma |
| 90 s | 0,35 e 0,16 s | a mesma |
| 100 s | 0,17 s | a mesma |
| 105 s | 0,17 e 0,17 s | a mesma |
| 120 s | 0,42 e 0,60 s | a mesma |
| 170 s | 0,16 s | a mesma |
| 175 s | 0,58 s | a mesma |
| 190 s | 0,69 s | outra (a nossa fechou aos 180 s) |

O que as medidas mostram:

- até 60 s parada, a ida foi rápida nas 4 medidas (0,15 a 0,16 s);
- de 75 a 175 s, foi lenta (0,35 a 0,60 s) em 5 das 11, sempre na mesma conexão, sem abrir outra. A causa não foi identificada; não é conexão nova, porque o contador ficou em uma só;
- as duas medidas dentro do servidor depois de 100 s (tabela anterior) também foram lentas: 0,42 e 0,40 s.

Limite desta medida: o vigia da homologação pede a `/saude` a cada 5 minutos, e esse pedido também vai ao Supabase, de outro processo e por outra conexão. Três das onze medidas (as duas de 105 s e a de 170 s) tiveram um pedido do vigia no meio da pausa, e as três foram rápidas. Das oito sem ele, cinco foram lentas e três rápidas. Isso não prova a causa. A hipótese, ainda não testada, é que algum trecho do lado do Supabase esfria depois de cerca de um minuto sem pedidos do projeto.

Na prática: com pedidos a menos de um minuto um do outro, a ida fica em 0,15 a 0,20 s. Depois de mais de um minuto sem ninguém usar, a primeira ida pode levar de 0,35 a 0,60 s, como antes.

### 4.5 O que mudou no VEL-a

- **Uma ida só para a sessão e o menu.** A função `molde_da_sessao` responde de uma vez a situação da sessão, as permissões do menu, o nome, o papel e as duas contagens. Antes eram 2 idas em fila (o serviço de login e a situação da sessão) e mais 34 pedidos (32 ao mesmo tempo e, depois, 2 contagens).
- **Sem ida ao serviço de login a cada tela**, quando o projeto assina os tokens com a chave assimétrica. A plataforma confere a assinatura do token da sessão no próprio servidor (`getClaims`, ADR-010, decisão 1). Quem decide se a sessão vale continua sendo o banco, a cada pedido. Falta confirmar com um login qual chave assina os tokens de hoje: o `ora5g-dev` publica uma chave assimétrica, mas isso não prova qual está em uso.
- **O PDV lê a venda numa ida só** (`pdv_tela`): caixa, venda aberta, carrinho com preço, campanha, ordem de serviço e aprovação, e as maquininhas. Abrir o PDV sem busca passou de 10 a 13 idas em fila para duas rodadas. Uma ação do carrinho passou a ser quatro rodadas: a sessão, a ação e a tela de novo (duas).
- **As outras telas mais usadas** (Vendas, Estoque, Catálogo, Clientes e Caixa) ganharam a sessão e o menu numa ida, mas ainda fazem as próprias leituras como antes. A leitura única de cada uma fica para o VEL-b.
- **A conexão com o banco fica aberta por até 180 s parada** (antes, 4 s): seção 4.4.
- **Todo botão de envio trava e mostra um texto de espera** assim que é tocado, e toda tela do menu mostra um esqueleto enquanto carrega.
- **Log de tempos, desligado no dia a dia.** Com `ORA_MEDIR_TEMPOS=1`, o servidor escreve uma linha por ida ao Supabase, só com o método, o caminho (sem o que vem depois do `?`), o código da resposta e o tempo (veja "Como medir de novo").

### 4.6 Depois

**No servidor, sem login (16/11):** a tabela da seção 4.4.

**Na homologação, sem login (17/11):** o lote foi ao ar em `087ef53` (build 00:40), com o log de tempos ligado. Uma medida de cada, feita do próprio servidor pelo domínio (não conta a rede do celular): `/entrar` em 0,03 s; `/vender`, `/inicio` e `/caixa` respondem 307 para a entrada em 0,02 a 0,04 s, sem ida ao banco; `/loja` em 0,44 s, com uma ida ao banco de 0,43 s (a primeira depois de o serviço subir, com a conexão nova).

**Com login, na homologação:** a preencher com o roteiro de aceite, pedido em 17/11. O proprietário repete no navegador as medidas da seção 4.1 (`docs/aceite/VEL-a.md`), e o log de tempos mostra as idas de cada tela. Até o pedido do aceite, nenhum pedido com login tinha chegado à versão publicada: não há conta de teste (J1).

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

### Telas com login (proposta de 16/11/2026, lote VEL-a)

| O que | Antes (16/11, navegador do proprietário) | Meta proposta | Onde se mede |
|---|---:|---:|---|
| Retorno ao toque: o botão trava e avisa; a tela nova mostra o esqueleto | nenhum | na hora | `retorno-imediato.test.ts`, `esqueletos.test.ts` e o roteiro de aceite |
| Abrir o PDV (`/vender`) | 2,5 a 2,8 s | até 1,5 s | navegador do proprietário e log de tempos |
| Buscar no PDV, com a venda aberta | 4,7 s | até 2 s | os mesmos |
| Botões "Adicionar" e "Tirar" | 3,6 s e 5,9 s | até 2 s cada | os mesmos |
| Botão "Concluir venda" (venda simples, em dinheiro) | não medido | até 3 s | os mesmos |
| Vendas, Estoque, Catálogo, Clientes e Caixa | 1,2 a 2,8 s | até 2 s, a partir do VEL-b | os mesmos |

**De onde saem os números.** Cada ida ao banco custa de 0,16 a 0,20 s com a conexão aberta (seção 4.2). Abrir o PDV são 2 rodadas; a busca dentro da venda, até 3 a mais; uma ação do carrinho, 4 (seção 4.5). Só de idas, a conta dá perto de 0,4 s, 1,0 s e 0,8 s. A montagem da tela, a rede do celular e o desenho somam o resto.

A folga das metas cobre dois casos:

- a primeira ida depois de mais de um minuto sem uso pode levar de 0,35 a 0,60 s (seção 4.4);
- se o token da sessão ainda for assinado com o segredo compartilhado, cada leitura da sessão ganha uma ida ao serviço de login (seção 4.5).

O "depois" destas linhas ainda não foi medido. Ele entra na seção 4.6 com o roteiro de aceite do lote (`docs/aceite/VEL-a.md`): o proprietário repete as medidas no navegador e o log de tempos mostra as idas de cada tela.

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

### As idas ao banco de cada tela (log de tempos)

O log fica desligado no dia a dia. Ele só é lido na publicação, então ligar e desligar exigem publicar de novo.

1. Ligar: num terminal do servidor, rodar o comando abaixo e digitar `1`. O Claude Code também pode editar a linha `ORA_MEDIR_TEMPOS=` em `~/homologacao/plataforma.env`.

```bash
bash deploy/homologacao/definir-chave.sh ORA_MEDIR_TEMPOS
```

2. Publicar de novo:

```bash
bash deploy/homologacao/publicar.sh
```

3. Usar as telas e ler as linhas:

```bash
grep '^\[tempos\]' ~/homologacao/logs/plataforma.log | tail -n 60
```

4. Desligar: esvaziar a linha `ORA_MEDIR_TEMPOS=` em `~/homologacao/plataforma.env` (o `definir-chave.sh` recusa valor vazio) e publicar de novo.

Como ler:

```text
[tempos] p41 pedido GET /vender (página inteira)
[tempos] c12 #1 +2ms 171ms 200 POST /rest/v1/rpc/molde_da_sessao
[tempos] c12 #2 +175ms 168ms 200 POST /rest/v1/rpc/pdv_tela
```

- `p41` é um pedido que chegou ao servidor; `c12` é uma tela sendo montada (ou uma ação, ou uma rota). Os dois se ligam só pelo horário.
- `#2` é a ordem da ida dentro da tela, `+175ms` é quanto depois do começo ela saiu e `168ms` é quanto demorou até a resposta começar a chegar.
- Idas ao mesmo tempo saem com o `+` quase igual; idas em fila saem uma depois da outra.
- Uma linha `GET /auth/v1/user` em cada pedido quer dizer que o token ainda é assinado com o segredo compartilhado (ADR-010, decisão 1).
- A linha nunca traz o que vem depois do `?` no endereço, cabeçalhos, corpo, token, chave, o endereço do projeto nem o texto do erro.

### 4.7 O VEL-b (18/11): as telas com login, medidas no log

O log de tempos ficou ligado na homologação desde o VEL-a, e as telas foram usadas com login. Cada linha é uma ida ao banco. A tela é reconhecida pelo que ela leu: a ligação pelo número do pedido falha quando o menu pré-carrega várias telas ao mesmo tempo. O script `scripts/idas-por-tela.mjs` faz essa conta.

**Antes do VEL-b** (as versões até 17/11, lidas em 18/11, de 06:50 em diante). As medianas são de 1 a 7 aberturas de cada tela; as poucas aberturas de Clientes, Catálogo e do painel do Estoque não somam o bastante para concluir.

| Tela | Idas | Rodadas | Tempo no banco | O que tinha de pergunta de permissão |
|---|---:|---:|---:|---|
| Vendas | 8 a 9 | 4 a 5 | 0,9 a 1,2 s | uma rodada só para ela |
| Detalhe de uma venda | 21 a 22 | 8 | 1,8 s | 4 (3 ficam: são da loja da venda) |
| Caixa | 7 | 3 | 0,9 s | 1, junto com o caixa aberto |
| Transferências | 8 | 3 | 0,7 s | 2, junto com a lista |
| Ora Connect | 10 | 3 | 0,7 s | 4, junto com as listas |
| Painel do Estoque | 6 | 4 | 0,8 s | uma rodada com 3 |
| Catálogo | 12 | 3 | 1,5 s | 1, junto com a busca |
| PDV, sem busca | 3 | 2 | 0,5 s | nenhuma (VEL-a) |
| O sino de avisos e o Início | 17 a 28 | 2 | 0,7 a 1,5 s | nenhuma; o peso são os pedidos ao mesmo tempo |

**Depois do VEL-b** (no ar desde 18/11, 07:11; o log tinha 3.563 linhas na publicação): até as 10:15 de 18/11, 19 telas com login. A tela Vendas, aberta uma vez, fez **7 idas em 3 rodadas, 0,63 s no banco**, sem a pergunta de permissão (antes, 8 a 9 idas em 4 a 5 rodadas e 0,93 a 1,15 s). É uma abertura só, então não basta para concluir. O sino e o Início seguem com 17 a 28 pedidos ao mesmo tempo (0,72 a 0,93 s): é o VEL-c. Para medir de novo:

```bash
node scripts/idas-por-tela.mjs --desde 3563
```

A conta das rodadas, pelo código, está na ADR-010 ("O que veio no VEL-b").

### 4.8 O VEL-c (18/11): o sino de avisos e o Início numa ida só

**Antes** (o log de tempos da homologação, das linhas 3563 a 4329, em 18/11):

| Tela | Aberturas | Pedidos ao banco | Tempo no banco |
|---|---|---|---|
| O sino (`/api/pendencias`) | 5 | 17 | 0,72 s |
| O Início | 9 | de 18 a 29 | de 0,93 a 1,47 s |

**Depois** (a migration `20261118165816_pendencias_numa_ida`, publicada com o log na linha 4335): pela conta do código, o sino passa a 2 pedidos ao mesmo tempo (as contagens e as divergências das notas) e o Início faz 15 pedidos a menos. Para medir com login:

```bash
node scripts/idas-por-tela.mjs --desde 4335
```

A medida com login de 19/11 (seção 4.9) já roda numa versão com o VEL-c.

### 4.9 O VEL-d (19/11): o Catálogo e a lista do Estoque numa ida só, medidos com login

Desde 18/11 há contas de teste (J1), e a medida com login virou script: `scripts/medir-com-login.mjs` entra com a conta de teste num celular simulado (tela de 360 px, toque, sem limitar a rede), abre cada tela 3 vezes, só lendo, e anota a mediana de dois tempos: até o servidor começar a responder e até a tela terminar de carregar. As idas ao banco de cada abertura vêm do log de tempos (`scripts/idas-por-tela.mjs`). As senhas ficam só em `~/homologacao/contas-de-teste.txt` (permissão 600); o script não imprime e-mail nem senha.

**Antes** (19/11, a versão `4063f39`; o log de tempos a partir da linha 4734, com 59 telas montadas; as contas de teste do vendedor e do gerente, 3 aberturas de cada tela por conta):

| Tela | Idas ao banco | Rodadas | Tempo no banco | Até o servidor responder | Até a tela carregar |
|---|---:|---:|---:|---:|---:|
| Catálogo | 9 | 8 | 1,52 s | 0,38 a 0,39 s | 1,54 a 1,55 s |
| Lista do Estoque | 4 | 4 | 1,20 s | 0,38 a 0,42 s | 1,20 a 1,24 s |
| Vendas, para comparar | 7 | 3 | 0,73 s | 0,38 a 0,40 s | 0,73 a 0,75 s |
| Transferências, para comparar | 7 | 3 | 0,74 s | 0,36 a 0,38 s | 0,73 a 0,83 s |

O servidor começa a responder quase no mesmo tempo em todas as telas (de 0,36 a 0,42 s): a tela chega primeiro com o esqueleto, e o resto depois. O que separa uma tela da outra é o tempo até carregar, que acompanha o tempo no banco: no Catálogo, 8 rodadas, uma depois da outra.

**As outras telas, já com o VEL-b e o VEL-c** (a mesma medida): o Início do vendedor fez 6 idas em 2 rodadas (0,65 s no banco) e o do gerente, 10 idas em 2 rodadas (0,88 s); o sino de avisos, 2 idas em 2 rodadas (de 0,80 a 0,88 s). Antes do VEL-c, com a conta do dono, o Início fazia de 18 a 29 pedidos (de 0,93 a 1,47 s) e o sino, 17 (0,72 s). No sino, o ganho é na quantidade de pedidos, não no tempo: as 16 contagens já iam ao mesmo tempo. As contas e o número de aberturas são outros, então a comparação é só indicativa.

**O que mudou** (a migration `20261119131724_catalogo_e_estoque_numa_ida`, no `ora5g-dev` desde 19/11, 10:17): `public.catalogo_tela` e `public.estoque_lista`, só leituras, com o RLS de quem pede (SECURITY INVOKER). Pela conta do código, o Catálogo e a lista do Estoque passam a 2 idas em 2 rodadas cada: o molde da sessão e a leitura única. A busca do Catálogo com um termo continua com a sua leitura antes da leitura única.

**Depois** (19/11, a versão `5d3a8ce`, publicada às 10:38; o log a partir da linha 6362, com 58 telas montadas; as mesmas contas e as mesmas telas):

| Tela | Idas ao banco | Rodadas | Tempo no banco | Até o servidor responder | Até a tela carregar |
|---|---:|---:|---:|---:|---:|
| Catálogo | 2 (antes 9) | 2 (antes 8) | 0,56 s (antes 1,52 s) | 0,36 a 0,38 s | 0,56 a 0,59 s (antes 1,54 a 1,55 s) |
| Lista do Estoque | 2 (antes 4) | 2 (antes 4) | 0,55 s (antes 1,20 s) | 0,36 a 0,37 s | 0,54 a 0,58 s (antes 1,20 a 1,24 s) |
| Vendas, para comparar | 7 | 3 | 0,90 s | 0,39 a 0,40 s | 0,90 a 0,92 s |
| Transferências, para comparar | 7 | 3 | 0,78 s | 0,38 s | 0,77 a 0,82 s |

O Catálogo passou a abrir em pouco mais de um terço do tempo e a lista do Estoque, em menos da metade. A leitura única leva 0,19 s por ida (a mediana de 6 em cada tela, como uma leitura simples). O que sobra nas duas telas é o molde da sessão: 0,54 s de mediana nas 309 idas desta medida, porque o menu pré-carrega as telas dos links e cada uma abre o seu molde (seção 4.10). Vendas e Transferências não mudaram de código; a diferença para o antes (Vendas de 0,73 para 0,90 s no banco, com as mesmas idas) fica como variação entre medidas, a conferir na próxima.

Para medir de novo (no `--desde`, a linha do log antes da medida):

```bash
node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt \
  "Vendedor (teste)=/inicio,/vender,/vendas,/catalogo,/estoque,/clientes,/caixa,/transferencias,/connect,/metas" \
  "Gerente (teste)=/inicio,/vendas,/catalogo,/estoque,/transferencias,/financeiro,/relatorios,/operacao"
```

```bash
node scripts/idas-por-tela.mjs --desde <a linha do log antes da medida>
```

### 4.10 O VEL-e (19/11): as permissões da sessão numa conta só

**O que a medida mostrou:** toda tela com login começa pelo molde da sessão, e o menu pré-carrega as telas dos links, cada uma com o seu molde: nas medidas de 19/11, mais de 300 idas ao molde em cerca de 60 telas abertas (umas 5 por tela), com mediana de 0,53 a 0,54 s por ida, contra cerca de 0,17 s de uma leitura simples. No banco, com a sessão do vendedor de teste, o molde levava 0,19 s; 0,155 s disso eram as 42 perguntas de permissão da loja, uma a uma, cada uma conferindo a sessão inteira de novo.

**O que mudou** (a migration `20261119134800_permissoes_numa_conta`, no `ora5g-dev` desde 19/11, 10:48): `privado.permissoes_vigentes` aplica a regra de `tem_permissao` a um conjunto, com os vínculos vigentes e a loja do turno lidos uma vez; o molde e o sino passam a usá-la. A plataforma não mudou: a versão no ar (`5d3a8ce`) passou a usar a conta só no momento da aplicação.

**No banco** (a sessão do vendedor de teste; a mediana de 3 chamadas seguidas):

| Leitura | Antes | Depois |
|---|---:|---:|
| O molde da sessão | 0,19 s | 0,023 s |
| O sino | 0,052 s | 0,016 s |

**No site** (as mesmas contas e telas da seção 4.9; antes, o log das linhas 6362 a 7826; depois, a partir da linha 8000):

| Medida | Antes (só o VEL-d) | Depois (com o VEL-e) |
|---|---:|---:|
| Uma ida ao molde (mediana) | 0,54 s (309 idas) | 0,18 s (308 idas) |
| Uma ida ao sino (mediana) | 0,26 s | 0,21 s |
| Até o servidor responder, em todas as telas | de 0,36 a 0,40 s | de 0,18 a 0,23 s |

| Tela | Até carregar, antes | Até carregar, depois | Tempo no banco, antes → depois |
|---|---:|---:|---:|
| PDV (Vender) | 0,59 s | 0,37 s | 0,57 → 0,35 s |
| Início do vendedor | 0,68 s | 0,48 s | 0,65 → 0,46 s |
| Início do gerente | 0,79 s | 0,62 s | 0,84 → 0,65 s |
| Vendas | 0,90 a 0,92 s | 0,52 a 0,58 s | 0,90 → 0,54 s |
| Catálogo | 0,56 a 0,59 s | 0,39 a 0,45 s | 0,56 → 0,39 s |
| Lista do Estoque | 0,54 a 0,58 s | 0,39 a 0,44 s | 0,55 → 0,40 s |
| Caixa | 0,61 s | 0,38 s | 0,59 → 0,36 s |
| Transferências | 0,77 a 0,82 s | 0,56 a 0,66 s | 0,78 → 0,56 s |
| Relatórios (gerente) | 1,09 s | 0,81 s | 1,04 → 0,77 s |

O molde passou a custar o mesmo que uma leitura simples, e o servidor começa a responder na metade do tempo em todas as telas. As telas medidas ficaram entre 0,25 e 0,81 s até carregar (antes do VEL-d, o Catálogo levava 1,55 s). A Saúde da operação, com 17 idas ao mesmo tempo, variou entre as medidas (de 0,68 a 1,11 s no banco) e fica com os painéis. Desde a aplicação, as 699 idas ao banco do log responderam com sucesso.

### 4.11 O VEL-f (19/11): as conexões com o banco aquecidas

**O que a medida mostrou** (depois do VEL-e): os painéis levam de 25 a 50 ms no banco (com a conta de teste do gerente). O que pesava nas telas com várias idas ao mesmo tempo era a ida que não achava conexão aberta: ela abria outra no meio da tela, e a tela esperava por ela. O banco fica em São Paulo (`sa-east-1`), e o servidor da homologação está a 0,124 s de ida e volta dele (ping); abrir uma conexão custa mais duas idas e voltas (a conexão e o TLS), cerca de 0,26 s. Num teste do servidor, com pedidos sem chave, 10 pedidos ao mesmo tempo levaram 0,39 s de mediana (até 0,79 s) quando faltavam conexões, e 0,14 s com as 10 já abertas. Com pouco movimento, a conexão parada se fecha aos 180 s (VEL-a), e toda tela com várias idas paga isso.

**Antes** (a versão `92fe105`, com o VEL-e; `scripts/medir-com-login.mjs`, 3 aberturas de cada tela):

| Medida | Em uso contínuo (as duas contas de teste; log das linhas 8000 a 9935) | Com 200 s parado entre as aberturas (o gerente; `PAUSA_MS=200000`; log das linhas 9935 a 10362) |
|---|---:|---:|
| Idas feitas ao mesmo tempo acima de 0,4 s | 17% (50 de 300) | 74% (87 de 117) |
| A ida mais lenta de cada rajada (mediana) | 0,29 s | 0,75 s |
| A leitura da sessão (mediana) | 0,18 s | 0,41 s |
| Início do gerente, até a tela carregar | 0,62 s | 1,29 s |
| Relatórios | 0,81 s | 1,61 s |
| Saúde da operação | 0,80 s | 1,42 s |
| Até o servidor começar a responder | 0,19 a 0,20 s | 0,56 a 0,61 s |

Depois de parado, só 1 a 3 idas de cada tela achavam conexão aberta (cerca de 0,2 s); as outras abriam a sua (de 0,5 a 0,9 s).

**O que mudou** (sem migration; `apps/plataforma/src/lib/supabase/conexao-mantida.ts`): o servidor abre 20 conexões ao subir e as usa de novo a cada 120 s, com um pedido à saúde do serviço de login (107 bytes, com a chave pública, sem dado de ninguém). O HTTP/2, que faria todos os pedidos passarem por uma conexão só, ficou de fora: no Node 22 ele ainda é experimental, e no teste a primeira rajada não aproveitou a conexão aberta. As pré-cargas do menu ficaram como estão: de 12 a 18 por tela, de 21 a 30 KB, e desde o VEL-e cada uma custa pouco.

**Depois** (a versão `ce8b5db`, publicada às 12:15 de 19/11; na subida, o log mostrou "20 de 20 conexões aquecidas, usadas de novo a cada 120 s"; em uso contínuo, 5 aberturas de cada tela, log das linhas 11028 a 11631; com 200 s parado, 3 aberturas, log das linhas 11631 a 12204):

| Medida | Em uso contínuo, antes → depois | Com 200 s parado, antes → depois |
|---|---:|---:|
| Idas feitas ao mesmo tempo acima de 0,4 s | — | 74% → 38% (52 de 138) |
| A ida mais lenta de cada rajada (mediana) | — | 0,75 → 0,54 s |
| A leitura da sessão (mediana) | 0,18 → 0,19 s | 0,41 → 0,28 s |
| Início do gerente, até a tela carregar | 0,62 → 0,60 s | 1,29 → 0,86 s |
| Relatórios | 0,81 → 0,95 s | 1,61 → 1,47 s |
| Saúde da operação | 0,80 → 0,53 s | 1,42 → 0,93 s |
| Tempo no banco pelo log: Início, Relatórios e Saúde | 0,62, 0,92 e 0,53 s → 0,59, 0,90 e 0,51 s | — |
| Até o servidor começar a responder | 0,19 a 0,20 → 0,19 a 0,23 s | 0,56 a 0,61 → 0,33 a 0,50 s |

Em uso contínuo, nada muda, como esperado: com movimento, as conexões já ficam abertas (o tempo no banco pelo log, com mais aberturas, é o número mais firme; a diferença nos Relatórios até a tela carregar fica como variação). Depois de parado, o ganho é de um terço no Início e na Saúde da operação; nos Relatórios, de 9%. O que sobra depois de parado (idas de 0,3 a 0,6 s, em vez de 0,2 s) não é mais a conexão do nosso servidor; a hipótese, não provada, é o lado do Supabase, que também fecha as próprias conexões com o banco quando fica parado e, na volta, prepara de novo as funções mais pesadas (as dos Relatórios são as maiores). A primeira abertura dos Relatórios logo depois de entrar, mesmo em uso contínuo, teve todas as idas entre 1,2 e 2,0 s, o que combina com essa hipótese. Isso não se controla do nosso servidor; fica para medir de novo com o servidor da produção perto do banco.

Para medir de novo:

```bash
node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)=/inicio,/relatorios,/operacao"
```

```bash
PAUSA_MS=200000 node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)=/inicio,/relatorios,/operacao"
```

### 4.12 O VEL-g (19/11): a tela de Transferências numa ida só

**Antes** (a versão `ee9604b`; os gerentes de teste, 5 aberturas em uso contínuo; o log de tempos a partir da linha 20305):

| Quem | Idas ao banco | Rodadas | Tempo no banco | Até o servidor responder | Até a tela carregar |
|---|---:|---:|---:|---:|---:|
| Gerente (teste), na Santa Cândida (teste), com remessa na lista | 7 | 3 | 0,66 s | 0,20 s | 0,69 s |
| Gerente 2 (teste), na Loja de teste 2 | 6 | 3 | 0,57 s | 0,19 s | 0,60 s |

A tela está no nível das outras (Vendas, na mesma medida: 0,78 s). A abertura de 1,1 s vista antes era a primeira depois de o servidor reiniciar. Com aparelho a separar, há uma quarta rodada (os aparelhos livres).

**O que mudou** (a migration `20261119184550_transferencias_numa_ida`, no `ora5g-dev` desde 19/11, 15:45): `public.transferencias_tela`, só leitura, com o RLS de quem pede (SECURITY INVOKER), traz a lista e tudo o que a tela mostra dela. Pela conta do código, a tela passa a 2 idas em 2 rodadas: a sessão e a leitura única.

**Depois** (a versão `5711cab`, publicada às 16:04 de 19/11; os mesmos gerentes de teste, 5 aberturas em uso contínuo; o log de tempos das linhas 21048 a 21493, com 1,5 s entre as aberturas, como no antes; e das linhas 21772 a 22063, com 6 s):

| Quem | Idas ao banco | Rodadas | Tempo no banco | Até o servidor responder | Até a tela carregar |
|---|---:|---:|---:|---:|---:|
| Gerente (teste), com 1,5 s entre as aberturas (como no antes) | 2 | 2 | 0,61 s | 0,19 s | 0,63 s |
| Gerente 2 (teste), com 1,5 s entre as aberturas (como no antes) | 2 | 2 | 0,42 s | 0,20 s | 0,44 s |
| Gerente (teste), com 6 s entre as aberturas | 2 | 2 | 0,41 s | 0,20 s | 0,43 s |
| Gerente 2 (teste), com 6 s entre as aberturas | 2 | 2 | 0,39 s | 0,20 s | 0,41 s |

Pela conta do código, 2 idas em 2 rodadas: confirmado nas 20 aberturas. Na mesma medida do antes, o ganho foi de 8% para o Gerente (teste) e de 26% para o Gerente 2 (teste); a tela de Vendas, que não mudou, ficou igual (0,78 → 0,77 s). O ganho menor do Gerente (teste) não vem da função: pelo registro do Supabase (`edge_logs`), a ida e volta entre o nosso servidor e ele ficou em 0,14 s em todas as leituras, e o tempo lá dentro foi de 0,07 a 0,14 s em metade delas e de 0,26 a 0,47 s na outra metade (3 das 5 do Gerente (teste) e 2 das 5 do Gerente 2 (teste)), sem outro pedido nosso no Supabase ao mesmo tempo (a pré-carga do menu da abertura anterior já tinha terminado mais de 1 s antes). Medida no banco com a sessão de teste do Gerente (teste), a função leva 0,045 s (0,09 s na primeira vez de cada conexão), mesmo preparada de novo a cada chamada; as leituras de antes somavam 0,04 s. Na segunda medida (16:14, 6 s entre as aberturas), o tempo lá dentro foi de 0,06 a 0,13 s nas 10 leituras. Entre as duas, às 16:11, um pico do lado do Supabase (até 1,8 s lá dentro para a mesma leitura, e o molde da sessão em 3,4 s) atingiu todas as telas, como o visto no J1-d; no mesmo minuto, o registro do banco só mostra uma gravação de rotina (99 páginas em 10 s), e as rotinas agendadas levaram menos de 0,06 s. A causa da variação não está provada: as conexões do Supabase com o banco que atendem o site são renovadas a cada um ou dois minutos (9 de 10 tinham menos de 2 minutos), e a primeira chamada da função numa conexão nova leva o dobro, o que não basta para explicar a diferença.

Para medir de novo:

```bash
VEZES=5 node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)=/transferencias,/vendas" "Gerente 2 (teste)=/transferencias"
VEZES=5 PAUSA_MS=6000 node scripts/medir-com-login.mjs https://ora5g.com.br ~/homologacao/contas-de-teste.txt "Gerente (teste)=/transferencias" "Gerente 2 (teste)=/transferencias"
```

### 4.13 O J2-b (19/11): a pré-carga do menu pesa no banco de teste

Na primeira rodada das provas de acesso (J2-b), com quatro pessoas abrindo umas 20 telas em um minuto, o site fez 702 pedidos ao Supabase de teste num só minuto (17:09). O banco de teste está no plano Micro (1 GB de memória e processador compartilhado; `max_connections` 60 e `shared_buffers` 224 MB) e parou por dois minutos: às 17:11, o tempo lá dentro chegou a 17 s, e 6 leituras dos painéis deram erro 500 (pelo registro `edge_logs`); até a rotina das identidades e a saída das contas levaram de 5 a 9 s. No registro do banco, as 6 leituras foram canceladas pelo limite de 8 s de cada consulta, e até uma consulta de monitoramento do próprio Supabase levou 15 s: o banco estava sem fôlego, não travado por uma consulta nossa.

A maior parte dos pedidos é da pré-carga do menu: cada tela aberta pré-carrega as telas do menu (até 17), e cada pré-carga monta o molde e lê a sessão no banco. Com o navegador das provas recusando só os pedidos de pré-carga (`Next-Router-Prefetch`), as mesmas provas ficaram entre 290 e 460 pedidos por minuto, sem erro, com o tempo lá dentro de 0,06 a 0,13 s na mediana. Nem todo pico se explica assim: o de 16:11 (VEL-g, seção 4.12) aconteceu com pouca carga nossa (104 pedidos no minuto).

O que isso pede (decisões do proprietário): o banco da produção num plano com processador próprio; e uma pré-carga do menu mais leve (por exemplo, só os atalhos da barra de baixo), medida antes e depois, como as outras.

## O que falta

- O proprietário aprovar (ou mudar) as metas, inclusive as das telas com login.
- Medir o "depois" das telas com login: seção 4.6, com o roteiro de aceite do VEL-a.
- ~~Medir as telas com login pelo script~~ **Feito em 19/11** com as contas de teste (seção 4.9, `scripts/medir-com-login.mjs`).
- Confirmar com um login qual chave assina os tokens de hoje (o log de tempos mostra).
- ~~O teste de ponta a ponta no celular que adiciona, tira e conclui uma venda~~ **Feito em 19/11 (J1-b):** `e2e/venda-real.spec.ts`, contra o site no ar, na loja de teste (cerca de 18 s; roteiro `docs/aceite/J1-b.md`).
- O teste no celular e na internet da loja piloto, com o vendedor.
- A ação do carrinho, o que sobra do VEL-c (ADR-010, "O que fica para depois"): espera a revisão do Codex e o sim do proprietário. A medida com login das versões com o VEL-b e o VEL-c está na seção 4.9.
- ~~Ver no banco por que o sino não ficou mais rápido~~ **Feito em 19/11 (VEL-e, seção 4.10):** as perguntas de permissão uma a uma. Seguem: os painéis do Início e dos Relatórios (de 0,3 a 0,4 s por ida) e a pré-carga do menu, que abre o molde de cada link. **VEL-f (seção 4.11):** os painéis levam de 25 a 50 ms no banco; o que pesava era a ida que abria conexão nova (0,26 s a mais). A pré-carga fica: de 12 a 18 por tela, de 21 a 30 KB.
- O servidor da produção perto do banco (D-027 e D-044): o da homologação está a 0,124 s de ida e volta do banco (`sa-east-1`), e cada rodada de idas paga isso.
- Depois de parado, as idas ainda levam de 0,3 a 0,6 s (VEL-f, seção 4.11): conferir a hipótese do lado do Supabase.
- A variação do lado do Supabase em uso contínuo (VEL-g, seção 4.12): a mesma leitura levou de 0,07 a 0,14 s lá dentro em metade das vezes e de 0,26 a 0,47 s na outra metade, e os picos de até 3 s atingem todas as telas (J1-d e VEL-g); a causa não está provada.
- A pré-carga do menu e o banco da produção (J2-b, seção 4.13): no plano Micro, umas 20 telas por minuto com quatro pessoas pararam o banco de teste por dois minutos; falta escolher o plano da produção e medir uma pré-carga mais leve.

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
- **Log de tempos, desligado no dia a dia.** Com `ORA_MEDIR_TEMPOS=1`, o servidor escreve uma linha por ida ao Supabase, só com o caminho e o tempo (veja "Como medir de novo").

### 4.6 Depois

**No servidor, sem login (16/11):** a tabela da seção 4.4.

**Com login, na homologação:** a preencher depois da publicação. O proprietário repete no navegador as medidas da seção 4.1 (roteiro de aceite, `docs/aceite/VEL-a.md`), e o log de tempos mostra as idas de cada tela.

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

## O que falta

- O proprietário aprovar (ou mudar) as metas.
- Medir as telas com login (PDV, caixa, início) pelo script: depende do usuário de teste (J1). Até lá, a medida com login é a do proprietário no navegador (seção 4.6).
- Confirmar com um login qual chave assina os tokens de hoje (o log de tempos mostra).
- O teste de ponta a ponta no celular que adiciona, tira e conclui uma venda: depende do usuário de teste (J1).
- O teste no celular e na internet da loja piloto, com o vendedor.

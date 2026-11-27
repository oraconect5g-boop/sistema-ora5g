# Roteiro de aceite: lote AUD-f (as correções da auditoria de e7f55b2 no Ora Connect e na Asaas)

- **Quem faz:** primeiro a revisão técnica (o Codex ou quem o proprietário indicar), no PR, **sem merge**; depois do merge e da publicação na homologação (só com o sim do proprietário), o proprietário, com a sua conta.
- **O que o lote entrega** (a autorização do proprietário de 26/11: "um único lote consolidado de correções no Ora Connect e Asaas depois da auditoria de e7f55b2"):
  1. **Ativar chip, passo do cliente:** o CPF ou CNPJ vem primeiro, com o botão **Buscar o cadastro na Nogle**. A Nogle devolve o cadastro e o sistema preenche **só os campos vazios** que você não mexeu (o nome, o nascimento, o e-mail, o telefone e o endereço); a cidade aparece só como referência (você escolhe na lista). Nada é inventado: o que a Nogle não manda fica em branco, e o cadastro de outro documento não preenche nada. A mesma busca está em **Ações na Nogle** (atualizar o cliente e comprar chip com entrega); no **cadastro novo**, ela só avisa se o cliente já existe. Até 10 buscas por pessoa e 40 por loja por hora; a resposta some em 15 minutos e só quem pediu, na mesma loja e na mesma sessão, a vê. O **Enter** num campo passa para o próximo passo: a ativação só é registrada pelo botão, depois da conferência.
  2. **Pagamento e ativação:** o serviço pago no caixa só aparece para o **mesmo plano**; o pagamento confirmado na Nogle **não** é a linha ativa (a linha só conta com o chip ativo, a prova oficial); o eSIM sem ICCID vai para a gerência decidir; o **link de pagamento** (uma página), o **Pix copia e cola** (o código do Pix) e o **QR de instalação do eSIM** aparecem separados; o que a Nogle já deu como pago sai da lista "a loja paga"; sem link nem Pix, um aviso para conferir na Nogle (nada é reenviado, nenhum prazo inventado). A fila do Pix que a loja paga mostra **todas**, de 20 em 20, das mais antigas.
  3. **Listas:** os totais do **relatório**, da **carteira** e da **Operações do dia** são somados no banco (o período inteiro, não só o que cabia numa leitura); o relatório pagina a lista e diz quando a planilha é um recorte; as listas da Nogle (planos, cidades, DDD) vêm inteiras; a **conciliação** pagina o que não fecha e as conciliações antigas.
  4. **Asaas no site:** o **estorno parcial**, o estorno em andamento, a **contestação (chargeback)** e o recebido em dinheiro aparecem cada um com o seu motivo em **Reservas do site** ("confira antes de entregar ou cancelar"), com a conciliação do pagamento (o bruto, o líquido, a taxa da Asaas e o estornado).
  5. **Ativação paga pela Asaas:** só as regras e os estados, prontos e **desligados** (sem contrato do código Pix da Nogle para pagar com a conta da Ora). Nada muda nas telas.
- **Resposta:** "aceito" ou "não aceito" (e o que mudar).

## O aceite isolado (agora, sem provedor nem cliente real)

Antes da publicação, cada cenário é provado só com testes locais e respostas de mentira no formato oficial, com **duas identidades sintéticas** (os CPFs de exemplo, com o dígito verificador: A = 123.456.789-09 e B = 529.982.247-25). Um comando roda tudo, da raiz do repositório, depois do `npm ci`: `bash scripts/aceite-aud-f.sh`. Ele não chama a Nogle, a Asaas nem o site no ar.

| Cenário | O que prova | Onde |
|---|---|---|
| 1. A busca do cadastro e a troca do documento | o preenchimento só do campo vazio e não mexido; de A para B, sai o que veio de A e ninguém mexeu, o editado fica, a revisão não leva A e a nova busca de B preenche o resto; a formatação do mesmo documento não apaga nada; a busca em trânsito é descartada; o worker pede só a `/cliente/buscar`; o banco prende a leitura a quem pediu, à loja, à sessão e ao documento | `busca-do-cadastro.test.ts`, `ponta-a-ponta.test.ts`, `auditoria-connect.test.ts` (parte B), `nogle.test.ts` |
| 2. O assistente até Conferir, sem registrar | o documento primeiro, o botão da busca comum (não envia), nenhum envio fora do último passo | `ativar/assistente.test.ts` |
| 3. A portabilidade, com o SMS e o estado simulados | o reenvio do SMS só pela gerência; o cancelamento só antes do envio; sem resposta, nunca reenvia; o "Sucesso" da Nogle fica com a gerência | `connect-acoes.test.ts`, `connect.test.ts`, `ponta-a-ponta.test.ts` |
| 4. O pago na Nogle não é a linha ativa | o pagamento guardado sem contar a ativação; a linha só com o ICCID ativo e o número; o eSIM sem ICCID para a gerência; o pago sai da fila do Pix; o link, o Pix copia e cola e o material do eSIM separados | `auditoria-connect.test.ts` (parte A), `ponta-a-ponta.test.ts`, `regras.test.ts`, `abas.test.ts` |
| 5. A Asaas, sem provedor | as compras, a reserva de 24 horas, o pedido pago guardado 7 dias, a retirada sem cobrar de novo, os estornos (parcial, em andamento, concluído), a contestação, o recebido em dinheiro e a conciliação nas Reservas | `pagamento-pelo-site.test.ts`, `pedido-pago-no-balcao.test.ts`, `pagamentos/asaas.test.ts`, `reservas.test.ts` |
| 6. A ativação paga pela Asaas | os estados, a saída desligada | `quitacao-da-ativacao.test.ts` |

**No celular, depois da publicação:** `e2e/connect-assistente-real.spec.ts` (o projeto `celular-360`, com `ORA_E2E_URL` e `ORA_E2E_CONTAS`) confere primeiro que o plano 10 GB e o DDD 41 estão na lista da Nogle desta rede (sem eles, para com o motivo), percorre os 5 passos com um eSIM e a identidade B (passa do passo do cliente pelo Enter) e **para em Conferir, sem registrar**. Ele **não prova o preenchimento pelo CPF** (os campos são digitados à mão): o preenchimento e a troca do documento ficam provados no cenário 1.

## O diagnóstico da Asaas (27/11, sem ler nem mostrar chave, sem chamar a produção)

- **O banco:** a conta da Supabase tem um projeto só, o `ora5g-dev`, que é o banco da homologação e o que o site da homologação usa; não há banco de produção para separar. No banco, o pagamento pelo site está **desligado** (sem ambiente, sem webhook registrado), com 0 pagamentos e 0 avisos.
- **As chaves:** o worker e o site da homologação **não têm nenhuma chave da Asaas** (o teste temporário de 26/11 foi desfeito, e as chaves que passaram pela conversa têm de ser revogadas).
- **O worker dos pagamentos:** **fora do cron** (o cron roda o dos avisos, o da Ora Connect e o das identidades).
- **A rota do aviso no site:** existe e só aceita POST (respondeu 405 a um GET sem corpo).
- **O que falta, nesta ordem:** (1) uma chave **nova** do sandbox, gerada pelo proprietário, digitada pela entrada segura no servidor (`ASAAS_API_KEY` e `ASAAS_AMBIENTE=sandbox` no worker; o e-mail dos avisos, se ele quiser); (2) o sim dele para ligar: o worker registra o webhook do sandbox apontando para a rota da homologação e grava o ambiente e a impressão do token; (3) o sim para pôr o worker dos pagamentos no cron; (4) um pedido de teste numa loja de teste que a loja online ofereça (a vitrine só oferece loja física com CNPJ: sem isso, não há como pedir pelo site); (5) para pagar o QR da Nogle, além do contrato do código EMV, duas contas do sandbox (uma pagadora com saldo, outra com a chave Pix).
- **A prova, quando estiver pronto:** o **"Pago pelo site"** aparecendo para o **comprador** (a página do pedido na loja online) e para a **loja** (em Reservas do site, com a conciliação), com a reconsulta confirmada no banco; a rota de retorno sozinha não prova o pagamento.

## Para a publicação: a validação das 4 migrations no alvo e a recuperação

O merge na `main` aplica as 4 migrations no ora5g-dev pela integração GitHub × Supabase, na ordem (como no PR #110). Por isso:

1. **Antes do merge (só leitura no alvo):**
   - a lista das migrations do alvo termina nas da `main` (hoje, `20261126224500`) e não tem nenhuma das 4;
   - o md5 do corpo das funções em vigor que elas refazem é o que elas copiaram: `connect_worker_registrar_envio` c5c54ea908b60dd83d907bca4b4d308c, `connect_worker_operacoes_a_consultar` 4002d4555c74d029b46fdf5cfdf63238, `connect_worker_registrar_consulta` b10b463bfc8d0aa5278b08b87e22868c, `connect_consultar` f3d649125dd84da0c4bd35dcee91bb0b, `connect_worker_limpar_consultas` 2b01c9ebcf6d11dc8ced011042470f93 e `pagamento_consulta_aplicar` c75a078d17ee8470b03f80997aff7aca. Se algum mudou, outra branch mexeu nele: o AUD-f precisa de uma migration nova a partir do texto em vigor antes do merge;
   - as funções que um usuário logado pode chamar são 240 (as da `main`).
   - **Conferido em 27/11, só leitura:** a lista termina em `20261126224500`, as 6 funções estão com o md5 de antes e são 240 as expostas.
2. **O merge:** só depois da revisão e do sim do proprietário para publicar; as migrations antes da interface (a Operações do dia lê as colunas novas).
3. **Depois do merge (só leitura no alvo):**
   - as 4 migrations aparecem na lista, com os mesmos nomes, e o md5 do arquivo de cada uma é o do registro (`c02c6bef29f0dc3c5ef2a62d4889a6fc`, `efc63378d004a1b378413e65b9f6175d`, `b724a8be12c86cdb58f29b87f5c8c711` e `94fcf1e9b07c28c8abbb5a3f2fd09103`);
   - o md5 do corpo das funções é o novo: `connect_worker_registrar_envio` 0a0d9ba2ca41329a83e0498c87dcd49c, `connect_worker_operacoes_a_consultar` 866d8b7e1fd9e594061975268f6fdd4a, `connect_worker_registrar_consulta` 6bb7fdff088d4e22a4582b9824423aae, `connect_worker_registrar_material_esim` c2e0b2732277df7ab34070d33c15953e, `privado.connect_pix_copia_cola_valido` 3ab864fbbd22c18262789b79c833efc7, `connect_consultar` 4356ed931ba547c3f092a5700f9f23ff, `connect_worker_limpar_consultas` 664292279b7b6a8e04ba05b962152dad, `connect_cadastro_da_nogle` 69bda6b5c2753ed390d9e2c38a4fb53f, `connect_cadastro_da_nogle_descartar` 4ae03aa4ff17dcfcbd055205598dba26, `connect_somas_por` ced6b6c9965e25efa1a64eb271586f34 e `pagamento_consulta_aplicar` dff95ce22864149f53a64b825603754d;
   - as funções que um usuário logado pode chamar passam a 242 (as 2 do cadastro pelo documento; `connect_somas_por` é security invoker), o visitante sem login continua só com as de sempre, e as funções `connect_worker_*` novas são só do servidor;
   - o registro `aplicadas-dev.json` ganha as 4, com o md5 dos arquivos (num commit depois do merge);
   - depois de publicar: o SHA em `https://ora5g.com.br/saude/versao` e as telas (Operações do dia, Ativar chip, relatório, carteira, conciliação e Reservas do site) sem erro 500 nos logs do Supabase.
4. **A recuperação:**
   - uma migration que falha no meio não fica pela metade (cada uma é uma transação): o merge fica, o site segue no SHA anterior, e o conserto é uma migration nova;
   - um problema depois de aplicar: primeiro a interface volta ao SHA anterior (o registro das publicações tem o SHA), depois as reversões na ordem inversa (`20261126230400`, `230300`, `230200` e `230100`, em `packages/banco/supabase/reversao/`), cada uma devolvendo o texto anterior das funções (o md5 de antes, acima);
   - a reversão da `230100` se recusa se o lote já gravou um pagamento confirmado, um Pix copia e cola ou um material do eSIM (a trilha da auditoria): aí a decisão é do proprietário (manter a parte A e corrigir com uma migration nova).

## Antes do aceite do proprietário (depois da publicação)

1. O merge e a validação acima, com o sim do proprietário para publicar.
2. Publicar pelo procedimento normal e conferir o SHA em `https://ora5g.com.br/saude/versao`.

## Os passos (só leitura, menos o passo 2, que só consulta a Nogle)

1. Entre com a sua conta e abra **Ora Connect → Ativar chip**. No passo **Cliente**, confira que o CPF/CNPJ vem primeiro e que, sem documento válido, a busca avisa e não consulta.
2. Só com o seu sim para consultar a Nogle (uma consulta que só lê): digite o seu CPF (ou o de um cadastro de teste que exista na Nogle; nunca o de um cliente) e toque em **Buscar o cadastro na Nogle**: em alguns segundos, os campos vazios se preenchem e o aviso diz o que veio, o que foi mantido e a cidade da Nogle. Mude um dígito do documento no meio da busca: a busca é descartada. Depois de uma busca concluída, mude o documento: o que veio da Nogle sai dos campos (o que você digitou ou editou fica; só reescrever com pontos e traço não apaga nada), e a revisão não mostra os dados do documento anterior. **Não registre a ativação** (feche a tela ou volte).
3. Em **Operações do dia**, confira os cartões, a **Produção por vendedor** e, se houver, a lista **Pix da Nogle para a loja pagar** (com o total e as páginas).
4. Em **Carteira e relatórios → relatório completo**, troque o período para 30 dias e confira que os totais batem com a lista (e, com muitas operações, o aviso do recorte da planilha).
5. Em **Conciliação**, abra a mais recente e, se houver mais de 200 linhas que não fecham, as páginas seguintes.
6. Em **Reservas do site**, um pedido pago pelo site mostra a linha da conciliação; com divergência, o aviso com o motivo.
7. Responda **"aceito"** ou **"não aceito"**.

## O que depende de contrato ou de homologação (não provado neste lote)

- **A consulta do pagamento pelo uuid** (`GET /consultaPagamento`, desligada: `NOGLE_CONSULTA_PAGAMENTO`): os campos vieram da resposta da Nogle de 10/11, não da coleção oficial; o material do eSIM por ela só vale depois da primeira resposta real.
- **A resposta real da `/cliente/buscar`** com um cadastro de verdade (o formato provado é o exemplo oficial da coleção).
- **A Asaas de verdade:** a autenticação com a chave da conta e o worker dos pagamentos agendado seguem não comprovados nesta entrega; os campos `netValue`, `refunds` e `chargeback` foram lidos da documentação (26/11) e provados com dados de mentira.
- **Pagar o Pix da Nogle pela conta da Ora:** sem o contrato do código EMV para a solicitação exata e a permissão de pagamento da conta, fica desligado; o ensaio no sandbox pede duas contas de teste (uma pagadora com saldo, outra com a chave Pix), que não existem hoje.

## O que você não vê (feito pelo Claude Code)

- As provas: no banco, `packages/banco/src/auditoria-connect.test.ts` (o pago que não é a linha, o eSIM, o material e o Pix copia e cola, a busca do cadastro com as travas e as somas por papel) e `packages/banco/src/pagamento-pelo-site.test.ts` (a compra com 24 horas e 7 dias, os estornos, a contestação e o recebido em dinheiro); no worker, `apps/worker/src/connect/ponta-a-ponta.test.ts` (a Nogle simulada com os exemplos oficiais) e `apps/worker/src/pagamentos/asaas.test.ts`; no site, `apps/plataforma/src/lib/connect/busca-do-cadastro.test.ts`, `apps/plataforma/src/app/connect/abas.test.ts`, `apps/plataforma/src/app/connect/relatorio/relatorio.test.ts`, `apps/plataforma/src/app/connect/conciliacao/conciliacao.test.ts` e `apps/plataforma/src/app/reservas-do-site/reservas.test.ts`; no domínio, `packages/dominio/src/quitacao-da-ativacao.test.ts` e `packages/dominio/src/nogle.test.ts`.
- Nenhuma cobrança, transferência, ativação ou consulta real foi feita para este lote; nenhuma migration foi aplicada.

# Roteiro de aceite: lote AUD-f (as correções da auditoria de e7f55b2 no Ora Connect e na Asaas)

- **Quem faz:** primeiro a revisão técnica (o Codex ou quem o proprietário indicar), no PR, **sem merge**; depois do merge e da publicação na homologação (só com o sim do proprietário), o proprietário, com a sua conta.
- **O que o lote entrega** (a autorização do proprietário de 26/11: "um único lote consolidado de correções no Ora Connect e Asaas depois da auditoria de e7f55b2"):
  1. **Ativar chip, passo do cliente:** o CPF ou CNPJ vem primeiro, com o botão **Buscar o cadastro na Nogle**. A Nogle devolve o cadastro e o sistema preenche **só os campos vazios** que você não mexeu (o nome, o nascimento, o e-mail, o telefone e o endereço); a cidade aparece só como referência (você escolhe na lista). Nada é inventado: o que a Nogle não manda fica em branco, e o cadastro de outro documento não preenche nada. A mesma busca está em **Ações na Nogle** (atualizar o cliente e comprar chip com entrega); no **cadastro novo**, ela só avisa se o cliente já existe. Até 10 buscas por pessoa e 40 por loja por hora; a resposta some em 15 minutos e só quem pediu, na mesma loja e na mesma sessão, a vê. O **Enter** num campo passa para o próximo passo: a ativação só é registrada pelo botão, depois da conferência.
  2. **Pagamento e ativação:** o serviço pago no caixa só aparece para o **mesmo plano**; o pagamento confirmado na Nogle **não** é a linha ativa (a linha só conta com o chip ativo, a prova oficial); o eSIM sem ICCID vai para a gerência decidir; o **link de pagamento** (uma página), o **Pix copia e cola** (o código do Pix) e o **QR de instalação do eSIM** aparecem separados; o que a Nogle já deu como pago sai da lista "a loja paga"; sem link nem Pix, um aviso para conferir na Nogle (nada é reenviado, nenhum prazo inventado). A fila do Pix que a loja paga mostra **todas**, de 20 em 20, das mais antigas.
  3. **Listas:** os totais do **relatório**, da **carteira** e da **Operações do dia** são somados no banco (o período inteiro, não só o que cabia numa leitura); o relatório pagina a lista e diz quando a planilha é um recorte; as listas da Nogle (planos, cidades, DDD) vêm inteiras; a **conciliação** pagina o que não fecha e as conciliações antigas.
  4. **Asaas no site:** o **estorno parcial**, o estorno em andamento, a **contestação (chargeback)** e o recebido em dinheiro aparecem cada um com o seu motivo em **Reservas do site** ("confira antes de entregar ou cancelar"), com a conciliação do pagamento (o bruto, o líquido, a taxa da Asaas e o estornado).
  5. **Ativação paga pela Asaas:** só as regras e os estados, prontos e **desligados** (sem contrato do código Pix da Nogle para pagar com a conta da Ora). Nada muda nas telas.
- **Resposta:** "aceito" ou "não aceito" (e o que mudar).

## Antes (feito pelo Claude Code depois do merge, com o sim do proprietário para publicar)

1. Aplicar no banco da homologação, nesta ordem e só depois do merge: `20261126230100_ativacao_paga_e_linha_ativa`, `20261126230200_cadastro_da_nogle_pelo_documento`, `20261126230300_somas_da_producao_no_banco` e `20261126230400_estornos_e_contestacoes_da_asaas` (cada uma tem a reversão em `packages/banco/supabase/reversao/`).
2. Publicar pelo procedimento normal e conferir o SHA em `https://ora5g.com.br/saude/versao`.

## Os passos (só leitura, menos o passo 2, que só consulta a Nogle)

1. Entre com a sua conta e abra **Ora Connect → Ativar chip**. No passo **Cliente**, confira que o CPF/CNPJ vem primeiro e que, sem documento válido, a busca avisa e não consulta.
2. Digite um CPF de teste que já tenha cadastro na Nogle (ou o seu, se quiser) e toque em **Buscar o cadastro na Nogle**: em alguns segundos, os campos vazios se preenchem e o aviso diz o que veio, o que foi mantido e a cidade da Nogle. Mude um dígito do documento no meio da busca: a busca é descartada. Depois de uma busca concluída, mude o documento: o que veio da Nogle sai dos campos (o que você digitou ou editou fica; só reescrever com pontos e traço não apaga nada), e a revisão não mostra os dados do documento anterior. **Não registre a ativação** (feche a tela ou volte).
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

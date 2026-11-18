# Roteiro de aceite: lote DEMO-b (os fluxos novos na demonstração)

- **Quem faz:** o proprietário.
- **Quando:** depois da publicação. Tudo se testa na demonstração (`ora5g.com.br/demo`), sem conta de teste.
- **Quanto tempo leva:** uns 10 minutos.
- **O que o lote entrega:** a parte da demonstração da orientação de 18/11 ("atualizar a demo dos fluxos novos com dados fictícios isolados"; "extratos, origem das reservas, carga de estoque e novas jornadas não podem ser omitidos").
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar.

## O que mudou

1. **Extratos da maquininha e do banco** (Caixa e financeiro → botão **Extratos**):
   - cada linha do extrato vem com a venda que o sistema sugere;
   - a gerência concilia, ou tira a linha da conta com o motivo (o estorno e a tarifa, por exemplo);
   - a linha sem venda que bata nunca se concilia sozinha.
2. **Carga do estoque pelo relatório da Rein** (Estoque e IMEI → **Carga do estoque pelo relatório da Rein**, só para o dono e o administrador):
   - mostra a prévia de uma loja;
   - a linha em que o físico passa do disponível espera a sua decisão, com o motivo: lançar só o disponível, lançar o físico conferido na loja ou deixar de fora;
   - **Aplicar** fica travado até decidir todas;
   - o celular entra pelo IMEI, nunca pela quantidade;
   - a linha do total do arquivo sai sozinha.
3. **De onde vêm as reservas do site** (Canais online): as reservas por origem e campanha (Instagram, Google, WhatsApp ou direto), com as atendidas e as vendas.
4. **Conciliação com os relatórios da Nogle** (Ora Connect → **Carteira e relatórios**, só o dono):
   - mostra as conferidas, as com valor diferente, as que só a Nogle tem e as que só a Ora tem;
   - mostra só o final da linha e do ICCID.

**Todos os números são fictícios.** Nada é gravado, e nada daqui chega a uma tela real.

## Os passos

1. Abra **ora5g.com.br/demo** e escolha o perfil **Gerente**.
2. Teste os extratos:
   - vá em **Caixa e financeiro → Extratos** e toque em **Conciliar as certas**;
   - no **Estorno de venda**, toque em **Tirar da conta**, escreva um motivo e confirme.
3. Escolha o perfil **Dono** e teste a carga:
   - vá em **Estoque e IMEI → Carga do estoque pelo relatório da Rein**;
   - decida as duas linhas marcadas;
   - veja **Aplicar a carga** liberar e aplique.
4. Ainda como dono, abra:
   - **Canais online**, para ver de onde vêm as reservas do site;
   - **Ora Connect → Carteira e relatórios**, para ver a conciliação com a Nogle.
5. Responda **"aceito"** ou **"não aceito"**.

## O que fica de fora

- **A paridade visual não é a homologação do fluxo real.** Na aplicação real:
  - os extratos esperam um arquivo real da maquininha (E3);
  - a carga espera a planilha da Rein no servidor e as contas de teste (J1);
  - a conciliação da Nogle espera a Nogle ligada.
- **A remessa de vários produtos na transferência** segue parcial na demonstração (`/demo/estoque` mostra um item).

## O que você não vê (provado pelo Claude Code)

- **Os dados fictícios fecham as contas** (`apps/plataforma/src/demo/dados/fluxos-novos.test.ts`):
  - o líquido é o bruto menos a taxa;
  - a carga lança só o que foi decidido;
  - as reservas e a conciliação somam certo.
- **Os fluxos na tela, no celular e no computador** (`apps/plataforma/e2e/demonstracao-fluxos-novos.spec.ts`):
  - a conciliação e o motivo do estorno;
  - aplicar travado até decidir;
  - o vendedor sem a carga;
  - a origem das reservas;
  - a conciliação da Nogle.
- **A demonstração isolada** (`apps/plataforma/src/demo/isolamento.test.ts`).

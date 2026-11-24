# Roteiro de aceite: lote POS-015a (a internet cai no meio do trabalho: nada é presumido nem gravado)

- **Quem faz:** o proprietário, ou alguém da loja piloto.
- **Quando:** quando quiser, em `ora5g.com.br`, de preferência **no celular** que a loja vai usar.
- **Quanto tempo leva:** uns 5 minutos.
- **O que o lote entrega:** a prova, com a sessão aberta e no site de verdade, do item ORA-POS-015 ("sem venda presumida como concluída sem confirmação"), que passa de parcial a **testado**. Nenhuma tela mudou: o comportamento já existia e faltava essa prova.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o passo e o que aconteceu.

## O que o sistema faz quando a internet cai

1. **Avisa na hora.** Uma faixa vermelha no topo diz: "Sem internet: nada é gravado até a conexão voltar."
2. **Segura o que você tentar enviar.** O toque em "Nova venda", "Adicionar" ou "Concluir venda" não sai do aparelho. A faixa passa a dizer: "Sem internet: o envio não saiu do aparelho e nada foi gravado. Tente de novo quando a conexão voltar." Nenhuma venda aparece como aberta ou concluída.
3. **Não mostra o erro do navegador.** Ao trocar de tela sem rede, aparece a página "Sem internet agora", com o botão "Tentar de novo".
4. **Na volta, nada mudou.** Com a conexão de volta, o "Tentar de novo" abre a tela pedida. O que já estava gravado continua lá, e nada novo foi criado.
5. **O sistema não vende sem internet.** Essa é a decisão do projeto: vender, consultar o estoque e aprovar precisam da conexão. O que fazer na loja quando a internet cai (esperar, usar a rede do celular ou anotar e lançar depois) é a decisão D-041, que segue em aberto.

## Os passos (este teste não grava nada)

1. No celular, entre na **Santa Cândida (teste)** e abra **Operação → Vender**.
2. Ligue o **modo avião** (ou desligue o Wi-Fi e os dados móveis). A faixa vermelha aparece no topo.
3. Toque em **Nova venda**. A faixa muda para "o envio não saiu do aparelho e nada foi gravado", e nenhuma venda se abre.
4. Toque em **Vendas**, no menu de baixo. Aparece a página "Sem internet agora".
5. Desligue o modo avião e toque em **Tentar de novo**. A lista de vendas abre, igual à de antes.
6. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (provado pelo Claude Code)

- **No site, com login** (`apps/plataforma/e2e/sem-rede-com-login-real.spec.ts`): o Vendedor (teste), no PDV, fica sem rede; a faixa aparece; o toque em "Nova venda" é segurado, e nenhum pedido de gravação chega a ser feito pelo navegador; a lista de Vendas mostra "Sem internet agora"; com a rede de volta, a venda mais recente é a mesma de antes e o PDV está como estava. Conferido no banco do site depois da prova: nenhuma venda criada e nenhum movimento de caixa.
- **Sem login** (`apps/plataforma/e2e/site-instalavel.spec.ts`, que roda a cada mudança): a página "Sem internet agora" no lugar do erro do navegador.
- **A regra da venda** (`packages/banco/src/vendas.test.ts` e as provas que gravam J1-b e J3-b): a venda só aparece concluída depois de o banco gravar, e repetir o envio com a mesma chave devolve o mesmo resultado, sem duplicar.
- **O que esta prova não faz:** a rede cair bem no meio do "Concluir venda" de uma venda com pagamento. Isso pede uma venda em andamento, que grava: eu só faço com o seu sim.
- **Migration:** nenhuma.

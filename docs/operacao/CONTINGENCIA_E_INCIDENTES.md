# Contingência e incidentes na loja piloto (proposta)

**Data:** 14/11/2026 · **Autor:** Claude Code · **Revisor:** Codex · **Decide:** proprietário (com o contador no que é fiscal)
**Requisitos:** ORA-QUAL-008 (plano de contingência para internet, pagamentos e fiscal) e ORA-QUAL-013 (resposta a incidentes e suporte às lojas). **Liga com:** critérios 12 e 13 do [go/no-go da piloto](GO_NO_GO_PILOTO_E_SAIDA_DA_REIN.md) e as decisões D-029, D-041 e D-042 ([10_DECISOES_PENDENTES.md](../10_DECISOES_PENDENTES.md)).

> **Situação:** proposta escrita para o proprietário validar e para treinar a equipe da piloto. Nada aqui muda o sistema. O que está marcado como **decisão pendente** não vale até o proprietário decidir.

## 1. Regras que não mudam

1. **O sistema não vende sem internet.** Sem conexão, aparece a faixa vermelha "Sem internet: nada é gravado" e qualquer envio fica parado no aparelho. Nada sai pela metade (D-029: sem venda "offline" no sistema).
2. **Reenviar é seguro.** Quando a conexão volta, a pessoa toca de novo em concluir: o sistema reconhece a mesma venda, o mesmo pagamento ou o mesmo pedido e não duplica.
3. **Pagamento só com comprovante.** Cartão e Pix entram só depois de aprovados na maquininha ou no banco. Sem comprovante, a venda não é concluída.
4. **Operação do Ora Connect com "resultado desconhecido" não se refaz.** A gerência confere a evidência e registra o desfecho. Refazer pode ativar ou cobrar duas vezes.
5. **A nota segue a lei, não a fila.** A aprovação interna nunca segura a emissão. Sem o emissor ou o portal, o pedido espera na fila de notas e é emitido assim que voltar, no prazo que o contador orientar.
6. **Dado de cliente não vai por mensagem pessoal.** CPF, foto de documento, senha e número de cartão nunca vão por WhatsApp pessoal, e-mail ou foto de tela.
7. **Ninguém corrige o banco "na mão".** Tudo que está errado se corrige pelas telas (cancelar, devolver, corrigir a chave da nota, conferir), com motivo e auditoria.

## 2. O que fazer em cada situação

Na **Fase 1** do piloto (Rein oficial, Ora em teste), a regra é simples: **se a Ora não estiver disponível, a venda segue na Rein**, e o gerente anota no relatório do dia o que deixou de ser lançado na Ora. As linhas abaixo valem para a **Fase 2** (Ora oficial), quando forem aprovadas.

| Situação | O que o sistema faz | O que a loja faz | Quem decide |
|---|---|---|---|
| **Internet da loja caiu** | Faixa "Sem internet"; segura qualquer envio no aparelho | Tentar a rede móvel do celular da loja. Se não houver rede: **decisão pendente D-041** (esperar a volta, ou anotar a venda em papel e o gerente lançar depois, conferindo IMEI e pagamento) | Proprietário (D-041) |
| **Celular do vendedor sem rede, sem bateria ou travado** | A venda em aberto fica no sistema, sem concluir | Entrar com o próprio usuário em outro aparelho da loja e continuar a venda pelo número dela | Gerente da loja |
| **Maquininha não responde ou pagamento sem comprovante** | Não conclui sem a confirmação | Não marcar como pago. Tentar de novo ou trocar de meio de pagamento com o cliente. Se o cliente foi cobrado e o comprovante não saiu, a gerência confere com a adquirente antes de qualquer coisa | Gerente |
| **Pix sem confirmação** | Não conclui sem a confirmação | Conferir no aplicativo do banco ou da PicPay antes de concluir. Sem confirmação, a venda espera | Gerente |
| **Financeira (PayJoy, Aiva) fora do ar** | A venda financiada não fecha sem a aprovação | Oferecer outro meio ou remarcar com o cliente. Nunca registrar aprovação que não existe | Gerente |
| **Portal do fisco ou emissor fora do ar** | O pedido de nota fica na fila; o alerta de nota parada aparece no Início e no sino | Emitir quando voltar e registrar a chave. Emissão em contingência (modo offline da NFC-e) só como o contador orientar | Contador e proprietário |
| **Nogle (Ora Connect) fora do ar** | A operação fica "registrada" ou "aguardando"; o servidor tenta de novo sozinho | Não refazer. Resultado desconhecido: a gerência confere e registra o desfecho na tela do Ora Connect | Gerente |
| **WhatsApp oficial fora do ar (quando estiver ligado)** | O envio da nota fica na fila | Nada a fazer na loja; se o cliente precisar da nota na hora, imprimir ou mostrar o PDF guardado na venda | — |
| **O sistema (ora5g.com.br) fora do ar** | — | Avisar o gerente, que avisa pelo canal de incidentes (D-042). Na Fase 1, seguir na Rein. Na Fase 2, o mesmo da internet caída (D-041) | Proprietário |
| **Mensagem "Não foi possível concluir agora"** | Nada foi gravado pela metade | Tentar de novo em instantes (é seguro). Se repetir três vezes, abrir um incidente com a foto da tela | Gerente |

## 3. Incidentes: como avisar e o que acontece depois

### Níveis

| Nível | Exemplos | Resposta esperada (proposta, D-042) |
|---|---|---|
| **1 — Crítico** | Dinheiro, venda ou estoque gravados errado; dado de cliente exposto; nenhuma loja consegue vender | Aviso imediato ao proprietário e ao desenvolvimento; começar a tratar em até 30 minutos |
| **2 — Alto** | Uma loja inteira sem vender; caixa que não fecha | Começar a tratar em até 2 horas no horário da loja |
| **3 — Médio** | Uma função com erro que tem outro caminho (por exemplo, a busca não acha, mas o código acha) | No mesmo dia útil |
| **4 — Baixo** | Texto errado, tela desalinhada | Na próxima versão |

### Quem avisa quem

Vendedor → gerente da loja → proprietário → desenvolvimento (Claude Code; o Codex revisa a correção). O canal, os horários e quem atende fora do horário são a **decisão pendente D-042**.

### O que mandar no aviso

- Loja, dia e hora, e quem estava usando.
- O endereço da tela (o que aparece na barra do navegador) e o que a pessoa tocou.
- A mensagem que apareceu, com uma foto da tela **sem dado de cliente** (cobrir CPF, telefone e endereço).
- O número da venda, da OS, da nota ou da operação, se houver.
- A versão do sistema: o código de sete letras e números e a data do build, no rodapé de toda tela.

### O que não fazer

- Não mandar senha, CPF, foto de documento ou número de cartão.
- Não refazer a operação "para ver se vai" (cobrança, ativação, nota).
- Não apagar nem mudar nada fora das telas do sistema.

### Depois do incidente

1. O desenvolvimento registra a causa e corrige com um teste que prova a correção.
2. A correção passa pelo CI e pela revisão e é publicada como as outras.
3. O proprietário recebe o resumo (o que aconteceu, o que foi corrigido e o que muda para a loja), e as lojas são avisadas quando algo muda para elas.

## 4. Onde acompanhar

- **Saúde da operação** (`/operacao`, dono e gerência): as filas paradas na rede, com quantos e há quanto tempo está o mais antigo.
- **Sino** no topo de todas as telas: o que espera a pessoa na loja do turno.
- **Rodapé** de todas as telas: a versão no ar.
- **Alerta no celular do erro do servidor** (desde 24/11, lote QUAL-006a): o dono e o administrador recebem "Erro no servidor do site" quando uma tela mostra a página de erro (no máximo um alerta por hora), e "O site não responde" quando o site fica 5 minutos sem responder (e "O site voltou" na volta). A Saúde da operação mostra se esse aviso está ligado.
- **Ainda não existe:** o aviso quando o servidor inteiro cai e o tempo de resposta do site. Isso depende de um monitoramento de fora, que ainda falta escolher e ligar (critério 13 do go/no-go).

## 5. Treino da equipe da piloto (lista para conferir)

- [ ] Fazer uma venda completa no celular, com pagamento misto.
- [ ] Ver a faixa "Sem internet" (modo avião) e saber que nada foi gravado.
- [ ] Reenviar uma venda depois de a conexão voltar, sem duplicar.
- [ ] Cancelar uma venda e devolver um item, com motivo.
- [ ] Abrir e fechar o caixa e entender a conferência por outra pessoa.
- [ ] Pedir a nota e saber onde a gerência registra a chave.
- [ ] Saber a quem avisar e o que mandar num incidente.

## 6. Decisões pendentes do proprietário

- **D-041 — Venda sem internet na Fase 2:** esperar a volta da conexão, usar a rede móvel do celular da loja, ou anotar em papel e o gerente lançar depois (conferindo IMEI e pagamento antes)?
- **D-042 — Atendimento de incidentes no piloto:** canal (grupo, telefone ou planilha), horários, quem atende fora do horário e os prazos de resposta por nível.

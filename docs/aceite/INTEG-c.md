# Roteiro de aceite: lote INTEG-c (as duas correções da revisão do Codex de 16/11)

- **Quem faz:** o proprietário, lendo este roteiro. Não há passo no celular.
- **Quanto tempo leva:** uns dois minutos.
- **O que o lote entrega:** as correções dos defeitos **#101** e **#102**, que o Codex reproduziu na revisão de 16/11 (PR #100). Os requisitos ligados são o ORA-FISC-001, o ORA-POS-008 e o ORA-ONLINE-006, e eles continuam com o estado que tinham.
- **Resposta:** "aceito" ou "não aceito". Com o "aceito", as issues #101 e #102 são fechadas no GitHub, citando o commit e os testes.
- **No ar:** desde 17/11, às 11:15, no commit `9012f7f`. O rodapé pode mostrar um commit mais novo, de um lote seguinte.

## O que mudou

### 1. A nota de um cliente não vai pelo WhatsApp para outro (#101, o mais grave)

- **O defeito:** uma nota antiga, emitida antes da correção de 16/11, podia ficar ligada ao cliente que está hoje na venda, e não a quem ela foi emitida. Se a venda tivesse trocado de cliente, a nota de Alfa iria pelo WhatsApp para Beta.
- **Agora:**
  - cada nota guarda de onde vem a identidade do cliente;
  - a nota sem essa prova não vai pelo WhatsApp, nem a que já estava na fila;
  - a gerência abre o PDF da nota, confere o destinatário e confirma o cliente da venda;
  - a confirmação fica na auditoria, com quem fez e como conferiu.

### 2. O limite de reservas do site por loja não passa mais de 20 (#102)

- **O defeito:** o site aceita até 20 reservas por loja por hora. Com 19 reservas, duas pessoas reservando no mesmo instante conseguiam chegar a 21.
- **Agora:** as reservas da mesma loja contam uma depois da outra. A segunda espera a primeira e recebe "Muitas reservas nesta loja agora".

## Por que não há passo no celular

As duas situações ainda não existem na base de testes:

- **#101:** não há nenhuma nota emitida;
- **#102:** não há nenhum produto marcado para o site.

A prova são os testes automáticos, feitos a partir das provas do próprio Codex:

| Defeito | Prova | Antes da correção | Depois |
|---|---|---|---|
| #101 | A nota de Alfa, com a venda trocada para Beta (banco montado como era antes de 16/11) | o envio ia para Beta | o envio é recusado; a fila antiga não envia; a gerência confere e confirma |
| #102 | 19 reservas e mais duas ao mesmo tempo (PostgreSQL de verdade, duas conexões) | 21 reservas | 20 reservas; a segunda é recusada |

O teste do #102 foi rodado também sem a correção e falhou, como devia: a segunda reserva passava.

## O que você confere

1. Leia "O que mudou", acima.
2. Se a regra da nota faz sentido para a loja (nota sem prova de identidade não vai pelo WhatsApp até a gerência conferir), responda **"aceito"**.
3. Se quiser outra regra (por exemplo, quem mais pode conferir), responda **"não aceito"** e diga qual.

## O que este roteiro não cobre

- **A tela da conferência no celular.** Ela só aparece numa nota antiga sem prova, e não há nenhuma. Os testes automáticos da tela cobrem os textos, o botão e quem pode confirmar.
- **Os outros pedidos da mesma revisão do Codex:** a loja online com compra completa, os marketplaces, a Meta e a importação da planilha inteira. Eles seguem nos próximos lotes.

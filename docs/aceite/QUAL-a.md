# Roteiro de aceite: lote QUAL-a (o alerta no celular quando algo espera demais)

- **Quem faz:** o proprietário, lendo. Não há passo no celular.
- **Quanto tempo leva:** uns dois minutos.
- **O que o lote entrega:** a parte do ORA-QUAL-006 que é o aviso fora da tela quando uma fila passa do limite ou uma rotina do banco falha ou atrasa (plano de 16/11, Onda 2). O estado do requisito não muda: ainda falta o monitoramento dos erros e do tempo de resposta do servidor.
- **Resposta:** "aceito" ou "não aceito". No "não aceito", diga o que mudar, por exemplo outro limite.

## O que mudou

1. **O pedido que espera demais vira um alerta no celular.** O alerta chega para quem decide aquele pedido na loja, e para você, que decide pela rede.

   | O que espera | Alerta depois de |
   |---|---|
   | Desconto para aprovar | 30 minutos |
   | Nota para aprovar | 4 horas |
   | Saída de caixa para autorizar | 30 minutos |

   - **O que o alerta diz:** por exemplo, "Loja Santa Cândida: 2 pedidos de desconto esperando há mais de 30 min".
   - **O toque:** abre a tela onde se decide.
2. **No máximo um alerta por dia** de cada fila em cada loja, para não encher o celular.
3. **A rotina do banco com problema também vira alerta.** É o caso, por exemplo, do vencimento das reservas que parou de rodar.
   - **Quem recebe:** você e o administrador.
   - **O toque:** abre a Saúde da operação.
4. **Os limites podem mudar.** Se preferir outros tempos, é só pedir. A mudança não precisa de atualização do sistema.

## O que você confere

1. Leia "O que mudou", acima, e veja se os limites servem.
2. Responda **"aceito"** ou **"não aceito"**. No "não aceito", diga os limites que prefere.

## O que este roteiro não cobre

- **Ver um alerta de verdade.** Ele precisa de um pedido esperando além do limite. Hoje não há outra pessoa para fazer o pedido (as contas de teste dependem da chave secreta do Supabase).
- **Os erros e o tempo de resposta do servidor.** Ficam para um lote seguinte.

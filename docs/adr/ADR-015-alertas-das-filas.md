# ADR-015 — O alerta no celular quando uma fila passa do limite ou uma rotina do banco tem problema

**Situação:** proposta (17/11/2026), reversível; aplicada no lote QUAL-a. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 2, ORA-QUAL-006: "aviso fora da tela quando uma fila passa do limite ou uma rotina do banco falha ou atrasa"). Usa o canal do aviso no celular do lote PWA-b (ADR-014), aceito pelo proprietário em 17/11.

## Contexto

1. **O aviso do PWA-b sai uma vez, quando o pedido é feito.** Se ninguém decide, o pedido fica esperando, e só o sino e a Saúde da operação mostram.
2. **As rotinas do banco** (ROT-a, ADR-011) registram cada rodada. A Saúde da operação mostra quando uma delas falha ou atrasa, mas só para quem abre a tela.

## Decisões

1. **O alerta é um lembrete do que espera demais.**
   - **Uma vez por dia:** cada fila de cada loja gera no máximo um alerta por dia, com quantos pedidos esperam além do limite.
   - **As filas:**
     - o desconto pendente;
     - a nota aguardando aprovação;
     - a saída de caixa pendente.
   - **Quem recebe:** quem decide aquela fila na loja, pela mesma permissão do aviso do pedido (`desconto.aprovar`, `nota.aprovar` e `caixa.conferir`). Quem decide pela rede inteira, como o dono, também recebe.
2. **Os limites ficam numa tabela, com um padrão reversível.** Mudar um limite é um `update` em `privado.limites_dos_alertas`, sem migration. O proprietário pode pedir outros valores.

   | Fila | Limite padrão |
   |---|---|
   | Desconto pendente | 30 minutos |
   | Nota aguardando aprovação | 4 horas |
   | Saída de caixa pendente | 30 minutos |
3. **A rotina do banco com problema vira alerta para quem vê a auditoria da rede inteira.**
   - **Quem recebe:** o dono e o administrador, pela permissão `auditoria.ver` com o vínculo da rede.
   - **Por que não `integracoes.gerir`:** o dono não tem essa permissão, de propósito (as credenciais ficam com o administrador), e hoje só existe a conta do dono.
   - **Quando há problema:** a última rodada falhou, ou nenhuma rodada certa aconteceu no prazo da rotina.
   - **Quantos alertas:** um por rotina, rede e dia. O toque abre a Saúde da operação.
4. **Quem confere é uma rotina do próprio banco** (`alertas_das_filas`), a cada 10 minutos, pelo agendador (pg_cron).
   - **O que ela faz:** só escreve na fila dos avisos. É uma rotina que só mexe no banco, autorizada no plano de 16/11 (§3, item 4).
   - **Quem envia:** o worker dos avisos, já autorizado e agendado no PWA-b.
5. **O alerta não tem quem pediu.** A fila dos avisos passa a ter uma regra por tipo:
   - **o pedido:** tem loja, permissão e quem pediu;
   - **o teste:** tem quem pediu, sem loja;
   - **o alerta:** tem permissão, sem quem pediu, com loja ou da rede.

## O que fica de fora

1. **Os erros e o tempo de resposta do servidor.** Pedem um serviço de monitoramento ou a leitura dos registros do servidor: fica para um lote seguinte.
2. **Uma tela para mudar os limites.** Por enquanto, o proprietário pede, e o limite muda por `update`.

## Consequências

1. **O pedido parado há mais tempo que o limite vira um alerta** em até 10 minutos, e o envio leva até mais um minuto.
2. **Não há repetição no mesmo dia,** mesmo que o pedido continue esperando.
3. **Reverter:** a reversão da migration tira a rotina, os limites e os alertas, e volta a fila e o envio às versões do PWA-b.

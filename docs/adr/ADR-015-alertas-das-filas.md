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

1. **Os erros e o tempo de resposta do servidor.** Os erros: feitos em 24/11, no lote QUAL-006a (ver o adendo de 24/11, abaixo). O tempo de resposta e o servidor inteiro fora do ar pedem um monitoramento de fora, a escolher.
2. **Uma tela para mudar os limites.** Por enquanto, o proprietário pede, e o limite muda por `update`.

## Adendo de 24/11/2026: o erro do servidor (lote QUAL-006a, ORA-QUAL-006 e ORA-QUAL-013)

- **De onde vem:** o site já conta os erros do servidor desde o OBS-a (a lista do processo, sem o texto do erro). A cada minuto, o worker dos avisos, que roda no mesmo servidor e já tem o segredo dos avisos, lê a conta no próprio site, em `/saude/erros`, e a relata ao banco (`public.erros_do_servidor_relatar`). Nenhum segredo novo, e o web continua sem segredo nenhum (REV-052).
- **Só dentro do servidor:** o Next preenche os `x-forwarded-*` que faltam com os do próprio pedido; o Apache põe os dele (o IP de quem pediu, depois do que a pessoa mandou, o domínio, o https e o nome do servidor). O endereço só responde ao pedido com o IP de dentro, o host local, http e nenhum desses do Apache; pelo domínio, 404.
- **O pedido estranho** (para `/_not-found/page`, ou com o cabeçalho de navegação malformado, que o próprio site nunca manda) sai da conta e não avisa: são robôs (11 dos 13 erros de 18 a 24/11). O texto do erro do Next só decide isso; se ele mudar, o erro volta a avisar.
- **Quem decide é o banco:** os erros novos viram o alerta da rede, no máximo um a cada hora (os desse meio vão no seguinte, mesmo depois de uma publicação); o site sem responder por 5 minutos vira "O site não responde" (de novo a cada hora enquanto durar) e, na volta, "O site voltou". As duas regras ficam na linha do relato e mudam com um `update`, como os limites das filas.
- **Quem recebe:** quem gere as lojas pela rede inteira (`unidades.gerir`: o dono e o administrador), que é quem vê os erros na Saúde da operação; para cada rede ativa, como o alerta da rotina do banco (o site é um só).
- **A Saúde da operação** mostra se o aviso está ligado (a última conferência do worker e o último alerta) ou parado (o worker sem conferir há mais de 5 minutos).
- **Fica de fora:** o servidor inteiro fora do ar (o worker que avisa roda nele) e o tempo de resposta: pedem um monitoramento de fora.
- **Reverter:** a reversão da migration `20261124121856_aviso_do_erro_do_servidor` tira as duas funções, a tabela e os alertas do servidor da fila, e volta a permissão do alerta à de antes; o worker de uma versão anterior não relata, e o site de uma versão anterior não tem o endereço (o worker diz "nada relatado").

## Consequências

1. **O pedido parado há mais tempo que o limite vira um alerta** em até 10 minutos, e o envio leva até mais um minuto.
2. **Não há repetição no mesmo dia,** mesmo que o pedido continue esperando.
3. **Reverter:** a reversão da migration tira a rotina, os limites e os alertas, e volta a fila e o envio às versões do PWA-b.

# ADR-014 — O aviso no celular: quem envia, com que chave e o que o aviso leva

**Situação:** proposta (17/11/2026), reversível; aplicada no lote PWA-b. **Por:** Claude Code. **Revisor:** Codex. **Aceite:** proprietário. Pedida pelo plano do proprietário de 16/11/2026 (Onda 1, item 7: "Web Push para desconto, nota e saída de caixa a aprovar"; objetivo do projeto: "o dono aprova em um toque"). As chaves foram autorizadas pelo proprietário em 17/11/2026 ("Autorizo").

## Contexto

1. **O site já é instalável** (lote PWA-a): manifesto, ícones e service worker, sem venda offline.
2. **Hoje o pedido de aprovação só aparece dentro do sistema:** no sino e nas telas Aprovações, Notas e Caixa. Quem decide precisa estar com o sistema aberto.
3. **O padrão Web Push** manda o aviso pelo serviço de envio do navegador (Google, Apple, Mozilla, Microsoft), com:
   - a mensagem cifrada para o celular (RFC 8291);
   - o remetente identificado por um par de chaves (VAPID, RFC 8292).
4. **O contrato da publicação** (REV-052, #55): o aplicativo web recebe só uma lista fechada de variáveis; segredos ficam só com o worker. A chave secreta do Supabase ainda não está no servidor e, quando estiver, também não vai ao aplicativo web (ADR-002, §2.5).

## Decisões

1. **Quem envia é o worker, não o aplicativo web.** O worker dos avisos (`apps/worker/src/executar-avisos.ts`) roda como os outros, a cada minuto, pelo crontab do usuário `dev`. Ele fica com a chave privada e com o segredo da fila. Agendar é com a autorização do proprietário, porque a rotina fala com serviços de fora (os de envio dos navegadores).
2. **O worker lê a fila com a chave pública e um segredo só dos avisos, não com a chave secreta do Supabase.**
   - **As funções da fila:** `public.avisos_a_enviar` e `public.avisos_resultado`. Sem o segredo, elas recusam com 42501; o inventário de autorização prova isso para todos, até o visitante sem login.
   - **O que o segredo abre:** só a fila dos avisos. Por isso o worker dos avisos funciona já, sem a chave secreta do Supabase.
   - **O segredo:** 32 bytes aleatórios, gerados no servidor.
   - **O banco guarda só a impressão digital SHA-256 dele** (`privado.segredos_de_rotina`), gravada fora das migrations.
3. **A fila fica no banco, e o pedido entra nela na mesma transação.** Os gatilhos de `aprovacoes_desconto`, `notas_pedidos` e `caixa_saidas` põem um aviso por pedido. A nota que volta a esperar aprovação, depois da correção, arma o aviso de novo.
   - **Quem recebe é calculado na hora do envio, não na do pedido.** É a pessoa ativa, com vínculo vigente que dá a permissão na loja do pedido, menos quem pediu:
     - o desconto vai para quem tem `desconto.aprovar`;
     - a nota, para quem tem `nota.aprovar`;
     - a saída de caixa, para quem tem `caixa.conferir`.
   - **O pedido decidido antes do envio não vira aviso** (fica "dispensado"). O aviso sem celular de quem decide fica "sem destino".
   - **As tentativas:** cada aviso fica reservado por 2 minutos, com até 5 tentativas, e só vale no mesmo dia.
4. **O aviso leva o mínimo.**
   - **O que vai:** o título ("Desconto para aprovar"), um texto curto com a loja e o número da venda ou o valor da saída, e a tela que o toque abre.
   - **O que não vai:** nome de cliente, nada.
   - **No caminho:** a mensagem vai cifrada, e o serviço de envio não lê.
   - **No celular:** o service worker só abre uma tela do próprio sistema. Endereço de fora vira o Início.
5. **A cifra e a assinatura foram escritas com o próprio Node, sem biblioteca de fora.**
   - **A prova:** o teste confere a cifra com o exemplo oficial da RFC 8291, byte a byte, e decifra como o celular faz.
   - **Por que não a biblioteca:** a versão nova da `web-push` (4.0.0) saiu dias antes deste lote, e a estável (3.6.7) traz cinco dependências.
6. **Só os serviços de envio dos navegadores.** Valem `fcm.googleapis.com`, `push.services.mozilla.com`, `push.apple.com` e `notify.windows.com`, por https, na porta padrão.
   - O site recusa inscrição com outro endereço.
   - O worker não posta em outro endereço e tira da lista o celular com endereço desconhecido. Assim, ninguém usa o worker para chamar outro endereço.
7. **A pessoa liga e desliga na tela "Avisos no celular"** (`/conta/avisos`, a partir de Minha conta).
   - **Por pessoa:** até 10 celulares.
   - **Celular de duas pessoas:** o mesmo celular ligado por outra pessoa passa a ser dela.
   - **A cada visita,** a tela confere a inscrição deste navegador.
   - **O aviso de teste** vai só para os celulares de quem pediu, no máximo um por minuto.
   - **No iPhone,** o aviso só chega pelo Ora 5G instalado na tela inicial, no iOS 16.4 ou mais novo.

## Consequências

1. **O sino e as telas continuam sendo onde a decisão acontece.** O aviso é um atalho: se o worker estiver parado, nada se perde, e o pedido continua no sino.
2. **O aviso chega em até um minuto** depois do pedido, com o worker agendado.
3. **Trocar o par de chaves invalida as inscrições.** Cada pessoa liga os avisos de novo; o worker tira as inscrições recusadas.
4. **Reverter:**
   - **o banco:** a reversão da migration tira a fila, as inscrições, os gatilhos e as funções; os pedidos continuam;
   - **o resto:** tirar o worker do crontab e a tela `/conta/avisos`.

# Roteiro de aceite: lote CONNECT-m (as telas da Ora Connect no formato da demonstração)

- **Quem faz:** o proprietário, com a sua conta; se quiser, também um vendedor.
- **Quando:** depois da publicação, uns 10 minutos. **Só leitura:** nada é gravado nem enviado à Nogle. Não toque em **Registrar ativação**, **Solicitar recarga** nem **Solicitar portabilidade**, a não ser que queira fazer a operação de verdade.
- **O que o lote entrega** (o seu pedido de 25/11: "só as telas do ora connect da demo, que estavam muito boas"): a Ora Connect com o formato da demonstração e os dados de verdade:
  - as **9 abas no topo** de todas as telas da Ora Connect: Operações do dia, Ativar chip, Consultar linha, Recarga, Portabilidade, Bloqueio e atendimento, Chips e entrega, Carteira e relatórios e Integração Nogle. Cada pessoa vê só as abas do seu papel: o vendedor vê 7; o dono e o gerente, as 9;
  - **Operações do dia:** os 4 cartões do período (chips vendidos, ativações confirmadas, portabilidades e recargas, com o valor de face); a lista das operações do período com os filtros **Todas**, **Aguardando**, **Confirmadas** e **Falharam** (e as que ainda esperam a Nogle ou a decisão da gerência, mesmo de dias antes); as operações por tipo; a produção por vendedor; para o dono e o gerente, o Pix da Nogle que a loja ainda paga; o **Exportar CSV** e o **Vender chip**;
  - **Ativar chip:** o formulário em passos (1. o chip, 2. o plano e o DDD, 3. o cliente, 4. o pagamento à Nogle), com os **planos em cartões** (o nome e o valor da lista oficial da Nogle);
  - **Recarga** e **Portabilidade:** cada uma na sua aba; a recarga com os planos em cartões; a portabilidade com a lista das portabilidades da loja e os filtros;
  - **Integração Nogle:** a liberação de cada operação, as listas oficiais carregadas e as 62 funções da Nogle, cada uma com a aba da Ora em que aparece;
  - as telas que já existiam (Consultar linha, Bloqueio e atendimento, Chips e entrega, Carteira e relatórios e a conciliação) ganharam o mesmo topo. Em **Carteira e relatórios**, o relatório do vendedor e da loja leva ao saldo da carteira da Ora na Nogle, aos relatórios da rede e à conciliação.
- **Resposta:** "aceito" ou "não aceito" (e o que mudar).

## Os passos

1. Entre com a sua conta e abra **Ora Connect** no menu. Confira as 9 abas no topo e os 4 cartões.
2. Troque o período (**Hoje**, **7 dias**, **30 dias**) e os filtros da lista (**Todas**, **Aguardando**, **Confirmadas**, **Falharam**). Toque numa operação para ver os detalhes.
3. Abra **Ativar chip**: confira os passos e os planos em cartões (o valor é o da Nogle). Não registre nada.
4. Abra **Recarga**, **Portabilidade** e **Integração Nogle** e veja cada uma.
5. Abra **Consultar linha**, **Bloqueio e atendimento**, **Chips e entrega** e **Carteira e relatórios**: o mesmo topo, com a aba aberta marcada.
6. No celular, deslize as abas para o lado: a aba aberta fica à vista.
7. Se puder, entre como vendedor: ele vê as 7 abas dele (sem Bloqueio e atendimento e sem Integração Nogle) e, em Operações do dia, só as próprias operações.
8. Responda **"aceito"** ou **"não aceito"**.

## O que você não vê (feito pelo Claude Code)

- Sem mudança no banco: as telas leem o que já liam, com as mesmas regras (o vendedor vê as próprias operações; quem gere a Ora Connect, as da loja). Os números dos cartões são os mesmos do Início e dos Relatórios.
- Cada formulário volta para a própria aba quando há erro, com a mensagem; a operação registrada aparece em Operações do dia.
- As provas: `apps/plataforma/src/app/connect/abas.test.ts` (quem vê cada aba, os filtros, para onde cada formulário volta e cada tela com dados de mentira), `apps/plataforma/src/componentes/paineis-do-connect.test.ts` (os cartões e as operações por tipo) e as provas só de leitura no site no ar (`apps/plataforma/e2e/connect-*-real.spec.ts`).
- Fica para o lote seguinte (CONNECT-n): o assistente de ativação da demonstração, um passo por vez e com a conferência antes de enviar.

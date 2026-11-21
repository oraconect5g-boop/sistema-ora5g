// Lote J3-e (21/11/2026; ORA-CRM-001, ORA-CRM-003, ORA-CRM-004, ORA-CRM-005, ORA-OS-001 a ORA-OS-004 e ORA-OS-006; o sim do
// proprietário de 21/11 às provas "Cliente e oportunidade" e "Ordem de serviço"): o cliente, o funil e a assistência de
// ponta a ponta, no site no ar, num celular de 360 px, com duas pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste):
// - o "Cliente (teste)", cadastrado uma vez só, com um CPF de teste (000.000.001-91, válido pelos dígitos verificadores) e
//   um WhatsApp de teste, sem pessoa de verdade; nas vezes seguintes, a prova o acha pelo CPF;
// - uma oportunidade no funil para ele, com uma tarefa (ligação) agendada e encerrada na agenda; a oportunidade fica em
//   "Em contato"; a da vez anterior é marcada como perdida ("Desistiu") antes;
// - uma ordem de serviço de um aparelho fictício (IMEI de teste): o Vendedor (teste) abre e envia à "Assistência (teste)";
//   o Gerente (teste) registra, em nome do técnico, o recebimento, o orçamento (R$ 120,00 de mão de obra), o conserto e a
//   volta; o vendedor registra a aprovação do cliente, a chegada, a cobrança no PDV (R$ 120,00 em dinheiro) e a entrega.
// Nenhuma mensagem sai pelo WhatsApp (a prova não toca nos botões de aviso). O caixa do vendedor fica aberto.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { cancelarVendaAberta, cartao, concluir, horaDeBrasilia, imeiDeTeste, pagar, pdvComCaixaAberto } from "./pdv-real";
import { comPessoas, GERENTE_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático do cliente";
const CLIENTE = { nome: "Cliente (teste)", cpf: "000.000.001-91", whatsapp: "(41) 9 0000-0191" };

/** A busca de cliente (exata, pelo CPF), na ficha ou na escolha do cliente de um formulário. */
async function buscarPeloCpf(onde: Locator) {
  await onde.getByLabel("Buscar por").selectOption("documento");
  await onde.getByLabel("CPF ou CNPJ", { exact: true }).fill(CLIENTE.cpf);
  await onde.getByRole("button", { name: "Buscar" }).click();
  const resultado = onde.getByRole("listitem").filter({ hasText: CLIENTE.nome });
  await expect(resultado.or(onde.getByText(/^Nenhum cliente com esse/))).toBeVisible();
  return resultado;
}

/** Abre a ficha do cliente de teste; cadastra antes, se ainda não existe. Devolve o endereço da ficha. */
async function fichaDoCliente(p: Page): Promise<string> {
  await p.goto("/clientes");
  const achado = await buscarPeloCpf(p.locator("main"));
  if (await achado.count()) {
    await achado.getByRole("link", { name: "Abrir ficha" }).click();
  } else {
    await p.goto("/clientes/novo");
    await p.getByLabel("Nome completo").fill(CLIENTE.nome);
    await p.getByLabel("CPF", { exact: true }).fill(CLIENTE.cpf);
    await p.getByLabel(/^WhatsApp com DDD/).fill(CLIENTE.whatsapp);
    await p.getByRole("button", { name: "Cadastrar cliente" }).click();
    await expect(p.getByText("Cliente cadastrado.")).toBeVisible();
  }
  await expect(p).toHaveURL(/\/clientes\/[0-9a-f-]{36}/);
  await expect(p.getByRole("heading", { level: 1, name: CLIENTE.nome })).toBeVisible();
  return new URL(p.url()).pathname;
}

/** Um passo da OS: o formulário do botão dado, com a observação (quando o passo pede) e o aviso de que ficou registrado. */
async function passo(p: Page, botao: string, aviso: string, observacao?: string) {
  const formulario = p.locator("form").filter({ has: p.getByRole("button", { name: botao, exact: true }) });
  if (observacao) await formulario.getByRole("textbox").first().fill(observacao);
  await formulario.getByRole("button", { name: botao, exact: true }).click();
  await expect(p.getByText(aviso)).toBeVisible();
}

/** Amanhã às 10:00, em Brasília, como o campo de data e hora pede ("2026-11-22T10:00"). */
function amanhaAsDez(): string {
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 10);
  return `${amanha}T10:00`;
}

test.describe("o cliente, o funil e a ordem de serviço na loja de teste (J3-e)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("cliente de teste, oportunidade com tarefa e uma OS do começo à entrega com a cobrança no PDV", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(360_000);
    const vez = horaDeBrasilia();
    const imei = imeiDeTeste();
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;

      const ficha = await test.step(`o ${CLIENTE.nome}: achado pelo CPF de teste ou cadastrado`, () => fichaDoCliente(v));

      await test.step("a oportunidade da vez anterior é marcada como perdida", async () => {
        // O funil chega em partes: espera o formulário de nova oportunidade antes de contar os cartões (a contagem não espera).
        const abrirFunil = async () => {
          await v.goto("/crm");
          await expect(v.locator("summary", { hasText: "Nova oportunidade" })).toBeVisible();
        };
        await abrirFunil();
        const anteriores = v.getByRole("link").filter({ hasText: CLIENTE.nome }).filter({ hasText: MARCA });
        for (let i = 0; i < 5 && (await anteriores.count()) > 0; i += 1) {
          await anteriores.first().click();
          const perdeu = v.locator("details").filter({ has: v.locator("summary", { hasText: /^Perdeu$/ }) });
          await perdeu.locator("summary").click();
          await perdeu.getByLabel("Motivo").selectOption("desistiu");
          await perdeu.getByLabel("Observação").fill(`${MARCA}: fecha a da vez anterior`);
          await perdeu.getByRole("button", { name: "Marcar como perdida" }).click();
          await expect(v.getByText("Oportunidade atualizada.")).toBeVisible();
          await abrirFunil();
        }
        await expect(anteriores, "nenhuma oportunidade de teste de uma vez anterior fica aberta").toHaveCount(0);
      });

      const oportunidade = await test.step("o vendedor registra a oportunidade no funil, escolhendo o cliente pelo CPF", async () => {
        const nova = v.locator("details").filter({ has: v.locator("summary", { hasText: "Nova oportunidade" }) });
        await nova.locator("summary").click();
        const escolhido = await buscarPeloCpf(nova);
        await escolhido.getByRole("button", { name: "Usar este cliente" }).click();
        await nova.getByLabel("De onde veio").selectOption("loja");
        await nova.getByLabel("Interesse").fill(`${MARCA}: Galaxy A15 e chip (${vez})`);
        await nova.getByLabel(/^Valor estimado/).fill("1.299,90");
        await nova.getByRole("button", { name: "Registrar oportunidade" }).click();
        await expect(v.getByText("Oportunidade registrada.")).toBeVisible();
        await expect(v.getByText(CLIENTE.nome).first()).toBeVisible();
        return new URL(v.url()).pathname;
      });

      const tarefa = `${MARCA}: ligar para mostrar o aparelho (${vez})`;
      await test.step("agenda uma ligação para amanhã e encerra na agenda, como feita", async () => {
        const agendar = v.locator("details").filter({ has: v.locator("summary", { hasText: "Agendar atividade" }) });
        await agendar.locator("summary").click();
        await agendar.getByLabel("Tipo").selectOption("ligacao");
        await agendar.getByLabel("Vence em").fill(amanhaAsDez());
        await agendar.getByLabel("Descrição").fill(tarefa);
        await agendar.getByRole("button", { name: "Agendar" }).click();
        await expect(v.getByText("Atividade agendada.")).toBeVisible();
        await v.goto("/crm/agenda");
        const item = cartao(v, "Em aberto").getByRole("listitem").filter({ hasText: tarefa });
        await expect(item).toContainText(CLIENTE.nome);
        await item.getByLabel("Resultado").fill(`${MARCA}: liguei; ele passa na loja amanhã`);
        await item.getByLabel("Como terminou").selectOption("feita");
        await item.getByRole("button", { name: "Encerrar" }).click();
        await expect(v.getByText("Atividade concluída.")).toBeVisible();
        await expect(cartao(v, "Em aberto").getByRole("listitem").filter({ hasText: tarefa })).toHaveCount(0);
      });

      await test.step("a oportunidade passa para \"Em contato\"", async () => {
        await v.goto(oportunidade);
        const mudar = v.locator("details").filter({ has: v.locator("summary", { hasText: "Mudar etapa ou próximo passo" }) });
        await mudar.getByLabel("Etapa").selectOption("contato");
        await mudar.getByRole("button", { name: "Gravar" }).click();
        await expect(v.getByText("Oportunidade atualizada.")).toBeVisible();
        await expect(v.getByText("Em contato").first()).toBeVisible();
      });

      const os = await test.step("o vendedor abre a OS de um aparelho fictício, pela ficha do cliente", async () => {
        await v.goto(ficha);
        await v.getByRole("link", { name: "Abrir ordem de serviço" }).first().click();
        const aparelho = cartao(v, "Aparelho");
        await aparelho.getByLabel("Aparelho (marca e modelo)").fill("Samsung Galaxy A15 (teste)");
        await aparelho.getByLabel("IMEI", { exact: true }).fill(imei);
        await aparelho.getByLabel("Defeito relatado pelo cliente").fill(`${MARCA}: a tela não liga (${vez})`);
        await aparelho.getByLabel(/^Estado em que chegou/).fill(`${MARCA}: sem riscos, com capinha`);
        await aparelho.getByRole("button", { name: "Abrir a ordem de serviço" }).click();
        await expect(v.getByText(/^Ordem de serviço aberta\./)).toBeVisible();
        return new URL(v.url()).pathname;
      });

      await test.step("o vendedor envia à assistência; o gerente registra o recebimento e o orçamento em nome do técnico", async () => {
        await passo(v, "Enviar ao técnico", "Saída para o técnico registrada.");
        await g.goto(os);
        await passo(g, "O técnico recebeu (em nome dele)", "Recebimento pelo técnico registrado.", `${MARCA}: o técnico confirmou por telefone`);
        const orcamento = g.locator("form").filter({ has: g.getByRole("button", { name: "Registrar o orçamento (em nome do técnico)" }) });
        await orcamento.getByLabel("Diagnóstico").fill(`${MARCA}: conector de carga com defeito`);
        await orcamento.getByLabel("Mão de obra (R$)").fill("120,00");
        await orcamento.getByLabel("Como o técnico passou o orçamento").fill(`${MARCA}: por telefone`);
        await orcamento.getByRole("button", { name: "Registrar o orçamento (em nome do técnico)" }).click();
        await expect(g.getByText("Orçamento registrado. A loja manda ao cliente e registra a resposta.")).toBeVisible();
      });

      await test.step("o vendedor registra a aprovação do cliente; o gerente registra o conserto e a volta", async () => {
        await v.goto(os);
        const resposta = v.locator("form").filter({ has: v.getByRole("button", { name: "Registrar a resposta" }) });
        await resposta.getByLabel("Resposta").selectOption("aprovado");
        await resposta.getByLabel("Por onde").selectOption("loja");
        await resposta.getByRole("button", { name: "Registrar a resposta" }).click();
        await expect(v.getByText("Aprovação do cliente registrada: o técnico pode consertar.")).toBeVisible();
        await g.goto(os);
        await passo(g, "Conserto concluído (em nome do técnico)", "Conserto concluído registrado.", `${MARCA}: o técnico confirmou o conserto`);
        await passo(g, "O técnico devolveu (em nome dele)", "Devolução pelo técnico registrada.", `${MARCA}: o técnico mandou de volta`);
      });

      await test.step("o aparelho chega na loja; o vendedor cobra R$ 120,00 no PDV e registra a entrega", async () => {
        await v.goto(os);
        await passo(v, "Chegou na loja", "Chegada na loja registrada. Avise o cliente pelo WhatsApp.");
        await pdvComCaixaAberto(v);
        await cancelarVendaAberta(v, "teste automático: a venda anterior ficou incompleta");
        await v.goto(os);
        await expect(cartao(v, "Cobrança e entrega")).toContainText("R$ 120,00");
        await cartao(v, "Cobrança e entrega").getByRole("button", { name: "Cobrar no PDV" }).click();
        await expect(v).toHaveURL(/\/vender\?os=no_carrinho/);
        await expect(cartao(v, "Carrinho")).toContainText("R$ 120,00");
        await pagar(v, [{ nome: "Dinheiro", valor: "120,00" }]);
        const venda = await concluir(v);
        await v.goto(os);
        await expect(cartao(v, "Cobrança e entrega")).toContainText("Cobrado na");
        await cartao(v, "Cobrança e entrega").getByRole("button", { name: "Registrar a entrega ao cliente" }).click();
        await expect(v.getByText(/^Entrega registrada: a OS foi encerrada\./)).toBeVisible();
        await expect(cartao(v, "Cobrança e entrega")).toContainText("Entregue ao cliente");
        await v.goto(venda);
        await expect(v.getByText("R$ 120,00").first()).toBeVisible();
      });
    });
  });
});

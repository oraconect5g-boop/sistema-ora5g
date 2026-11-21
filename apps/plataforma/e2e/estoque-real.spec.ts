// Lote J3-d (21/11/2026; ORA-INV-003, ORA-INV-004, ORA-INV-008 e ORA-INV-009; o sim do proprietário de 21/11 às provas
// "Entrada de mercadoria", "Conferência dos aparelhos", "Contagem de estoque" e "Pedido de ajuste"): o estoque de ponta a
// ponta, no site no ar, num celular de 360 px, com três pessoas da loja de teste.
//
// GRAVA de verdade, só na Santa Cândida (teste):
// - a entrada: o Gerente (teste) registra a compra fictícia de 3 capas de proteção e de um Galaxy A15 com um IMEI de teste
//   (válido, novo a cada vez), do "Fornecedor (teste)" (cadastrado uma vez só, sem CNPJ), e depois estorna a entrada: as
//   capas e o aparelho saem do estoque pelo livro, com o motivo;
// - a conferência: o Vendedor (teste) confere hoje os aparelhos e os chips da loja: os aparelhos pelo IMEI digitado, os
//   chips pelo botão da lista (o ICCID aparece só no fim), até não sobrar nenhum;
// - a contagem e o pedido de ajuste: o vendedor abre um inventário da capa, conta uma a mais do que há (a capa "achada") e
//   envia para aprovação; o gerente não decide (pede ajuste, mas não ajusta); o Dono (teste) aprova, e o estoque da capa
//   sobe uma. Assim, a prova repõe a capa que as provas de venda gastam.
//
// Rode sozinho, sem as outras provas que gravam. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts);
// no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { CAPA, cartao, horaDeBrasilia, imeiDeTeste } from "./pdv-real";
import { comPessoas, disponivelNaLista, DONO, GERENTE_A, LOJA_A, VENDEDOR } from "./telas-reais";

const MARCA = "teste automático do estoque";
const FORNECEDOR = "Fornecedor (teste)";
const APARELHO = { sku: "APA-0001", nome: "Galaxy A15 128 GB Azul" };

/** O físico da capa na loja: o disponível da lista do Estoque mais o que está "em venda" (reservado). */
async function fisicoNaLoja(p: Page, sku: string): Promise<number> {
  const disponivel = await disponivelNaLista(p, sku);
  const linha = p.getByRole("listitem").filter({ hasText: sku }).filter({ hasText: "na rede" }).first();
  const reservado = /(\d+) em venda/.exec(await linha.innerText());
  return disponivel + (reservado ? Number(reservado[1]) : 0);
}

/** A última linha do formulário da nova entrada. */
const ultimaLinha = (p: Page) => cartao(p, "Nova entrada").locator("form ol > li").last();

/** Na tela da entrada, acha o item pela busca e escolhe o resultado com o SKU dado, na última linha da entrada. */
async function escolherItem(p: Page, sku: string) {
  const linha = ultimaLinha(p);
  await linha.getByLabel("Item (nome, marca, SKU ou código de barras)").fill(sku);
  await linha.getByRole("button", { name: "Buscar" }).click();
  await linha.getByRole("button").filter({ hasText: sku }).click();
  await expect(linha.getByRole("button", { name: "Trocar o item" })).toBeVisible();
}

/** Os aparelhos e chips que faltam conferir hoje, como a barra mostra (conferidos de total). */
async function conferidosHoje(p: Page) {
  const barra = p.getByRole("progressbar", { name: "Conferidos hoje" });
  await expect(barra).toBeVisible();
  return { conferidos: Number(await barra.getAttribute("aria-valuenow")), total: Number(await barra.getAttribute("aria-valuemax")) };
}

test("o IMEI de teste tem 15 dígitos e o dígito verificador certo (J3-d)", () => {
  expect(imeiDeTeste(0)).toBe("352099700000009");
  expect(imeiDeTeste(1_763_700_000_000)).toBe("352099737000006");
  expect(imeiDeTeste(Date.now())).toMatch(/^3520997\d{8}$/);
});

test.describe("o estoque de ponta a ponta na loja de teste (J3-d)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");

  test("entrada com estorno, conferência dos aparelhos, contagem e o ajuste aprovado por outra pessoa", async ({ browser }) => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(300_000);
    const vez = horaDeBrasilia();
    const imei = imeiDeTeste();
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A], [DONO, LOJA_A]], async (pessoas) => {
      const v = pessoas[VENDEDOR] as Page;
      const g = pessoas[GERENTE_A] as Page;
      const d = pessoas[DONO] as Page;

      const capas = await test.step(`quantas ${CAPA.nome} há na loja`, () => fisicoNaLoja(v, CAPA.sku));

      await test.step(`o "${FORNECEDOR}" existe (cadastrado uma vez só, sem CNPJ)`, async () => {
        await g.goto("/estoque/entrada");
        // Sem nenhum fornecedor cadastrado, a tela começa na carga inicial: a escolha do fornecedor só aparece na compra.
        await cartao(g, "Nova entrada").getByLabel("Compra de fornecedor").check();
        const fornecedor = cartao(g, "Nova entrada").getByLabel(/^Fornecedor/);
        await expect(fornecedor).toBeVisible();
        if ((await fornecedor.locator("option", { hasText: FORNECEDOR }).count()) === 0) {
          const cadastro = g.locator("details").filter({ hasText: "Cadastrar fornecedor" });
          if ((await cadastro.getAttribute("open")) === null) await cadastro.locator("summary").click();
          await cadastro.getByLabel("Nome").fill(FORNECEDOR);
          await cadastro.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: o fornecedor fictício das provas`);
          await cadastro.getByRole("button", { name: "Cadastrar fornecedor" }).click();
          await expect(g.getByText("Fornecedor cadastrado.")).toBeVisible();
        }
      });

      const entrada = await test.step("o gerente registra a compra de 3 capas e de um Galaxy A15 com um IMEI de teste", async () => {
        const nova = cartao(g, "Nova entrada");
        await nova.getByLabel("Compra de fornecedor").check();
        await nova.getByLabel(/^Fornecedor/).selectOption({ label: FORNECEDOR });
        await nova.getByLabel("Documento (nota, pedido)").fill(`NF-TESTE-${imei.slice(-6)}`);
        await escolherItem(g, CAPA.sku);
        await ultimaLinha(g).getByLabel("Quantidade").fill("3");
        await nova.getByRole("button", { name: "Mais um item" }).click();
        await escolherItem(g, APARELHO.sku);
        await ultimaLinha(g).getByLabel(/^IMEI de cada unidade/).fill(imei);
        await nova.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: compra fictícia (${vez})`);
        await nova.getByRole("button", { name: "Registrar entrada (2 linhas)" }).click();
        await expect(g.getByText("Entrada registrada: o estoque e o custo já estão atualizados.")).toBeVisible();
        const bloco = cartao(g, /^Entrada nº \d+$/);
        await expect(bloco).toContainText("registrada");
        await expect(bloco).toContainText(imei);
        const titulo = (await bloco.getByRole("heading", { level: 2 }).innerText()).trim();
        expect(await fisicoNaLoja(v, CAPA.sku)).toBe(capas + 3);
        return titulo;
      });

      await test.step(`o gerente estorna a ${entrada}: as capas e o aparelho saem do estoque, com o motivo`, async () => {
        const bloco = cartao(g, entrada);
        await bloco.getByLabel("Motivo do estorno").fill(`${MARCA}: a compra era fictícia (${vez})`);
        await bloco.getByRole("button", { name: "Estornar" }).click();
        await expect(g.getByText("Entrada estornada: os itens saíram do estoque pelo livro, com o motivo.")).toBeVisible();
        await expect(cartao(g, entrada)).toContainText(`Motivo: ${MARCA}: a compra era fictícia (${vez})`);
        expect(await fisicoNaLoja(v, CAPA.sku)).toBe(capas);
        await v.goto("/estoque?aba=conferencia");
        await v.getByLabel("IMEI ou ICCID do item na mão").fill(imei);
        await v.getByRole("button", { name: "Conferir", exact: true }).click();
        await expect(v.getByText(/IMEI\/ICCID não encontrado nesta loja/)).toBeVisible();
      });

      await test.step("o vendedor confere hoje os aparelhos pelo IMEI e os chips pela lista, até não sobrar nenhum", async () => {
        await v.goto("/estoque?aba=conferencia");
        const { total } = await conferidosHoje(v);
        expect(total, "a loja de teste tem aparelhos e chips").toBeGreaterThan(0);
        const pendentes = () => cartao(v, "Ainda não conferidos hoje").getByRole("listitem");
        for (let volta = 0; volta < total + 2; volta += 1) {
          if ((await pendentes().count()) === 0) break;
          const primeiro = pendentes().first();
          const texto = await primeiro.innerText();
          const imeiDaLista = /IMEI (\d{15})/.exec(texto);
          const chave = imeiDaLista?.[0] ?? /ICCID \S+/.exec(texto)?.[0];
          if (!chave) throw new Error(`o item pendente não mostrou o IMEI nem o ICCID: "${texto}"`);
          if (imeiDaLista) {
            await v.getByLabel("IMEI ou ICCID do item na mão").fill(imeiDaLista[1] as string);
            await v.getByRole("button", { name: "Conferir", exact: true }).click();
          } else {
            await primeiro.getByRole("button", { name: "Conferido" }).click();
          }
          // Espera a lista nova (sem o item conferido), não o aviso da volta anterior.
          await expect(pendentes().filter({ hasText: chave })).toHaveCount(0);
          await expect(v.getByText("Item conferido (gravado na auditoria).")).toBeVisible();
        }
        await expect(cartao(v, "Ainda não conferidos hoje")).toContainText("Nenhum pendente.");
        expect(await conferidosHoje(v)).toEqual({ conferidos: total, total });
      });

      const inventario = await test.step("o vendedor abre um inventário da capa, conta uma a mais e envia para aprovação", async () => {
        await v.goto("/estoque/inventario");
        const novo = cartao(v, "Novo inventário");
        await novo.getByLabel("Descrição").fill(`${MARCA}: as capas do balcão (${vez})`);
        await novo.getByLabel("Itens a contar (nome ou SKU)").fill(CAPA.sku);
        await novo.getByRole("button", { name: "Buscar" }).click();
        await novo.getByRole("button").filter({ hasText: CAPA.sku }).filter({ hasText: "incluir" }).click();
        await expect(novo).toContainText("1 item(ns) escolhido(s)");
        await novo.getByRole("button", { name: "Abrir inventário" }).click();
        await expect(v.getByText("Inventário aberto: conte cada item e envie para aprovação.")).toBeVisible();
        const endereco = new URL(v.url()).pathname;
        const item = cartao(v, /^Contagem \(/).getByRole("listitem").filter({ hasText: CAPA.sku });
        await expect(item, "a contagem é às cegas: o sistema não mostra o saldo antes do envio").not.toContainText("Sistema:");
        await item.getByLabel("Quantidade contada").fill(String(capas + 1));
        await item.getByRole("button", { name: "Gravar contagem" }).click();
        await expect(v.getByText("Contagem gravada.")).toBeVisible();
        const enviar = v.locator("details").filter({ hasText: "Enviar para aprovação" });
        if ((await enviar.getAttribute("open")) === null) await enviar.locator("summary").click();
        await enviar.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: achou uma capa a mais no fundo da gaveta`);
        await enviar.getByRole("button", { name: "Enviar", exact: true }).click();
        await expect(v.getByText("Inventário enviado: agora outra pessoa com permissão de ajuste aprova ou recusa.")).toBeVisible();
        await expect(v.getByText(`Sistema: ${capas} · Contado: ${capas + 1}`)).toBeVisible();
        return endereco;
      });

      await test.step("o gerente vê o inventário, mas não decide: ele pede ajuste, não ajusta", async () => {
        await g.goto(inventario);
        await expect(g.getByText(`Sistema: ${capas} · Contado: ${capas + 1}`)).toBeVisible();
        await expect(g.getByText("Decidir", { exact: true })).toHaveCount(0);
      });

      await test.step("o dono aprova, e o estoque da capa sobe uma", async () => {
        await d.goto(inventario);
        const decidir = d.locator("details").filter({ hasText: "Decidir" });
        await decidir.getByLabel("Aprovar e ajustar o estoque").check();
        await decidir.getByLabel("Motivo (fica na auditoria)").fill(`${MARCA}: conferido com o gerente`);
        await decidir.getByRole("button", { name: "Registrar decisão" }).click();
        await expect(d.getByText("Inventário aprovado: os ajustes entraram no livro do estoque.")).toBeVisible();
        await expect(d.getByText(/ajuste aplicado 1/)).toBeVisible();
        expect(await fisicoNaLoja(v, CAPA.sku)).toBe(capas + 1);
      });
    });
  });
});

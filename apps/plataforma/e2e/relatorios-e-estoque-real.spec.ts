// Lote J2-a (19/11/2026; ORA-REPORT-001, ORA-REPORT-002, ORA-REPORT-005 e ORA-INV-001; o sim do proprietário de 19/11 às
// provas da Onda 2 com as contas de teste, começando pelos relatórios e pelo estoque): o Início, os Relatórios, o
// Financeiro e o Estoque no site no ar, num celular de 360 px, com as contas de teste. SÓ LÊ: nenhuma venda, transferência,
// ajuste ou conferência. Cada prova cruza as mesmas contas em telas e visões diferentes (a rede do Administrador (teste), a
// loja de cada gerente e o vendedor): o que uma mostra, a outra tem de mostrar igual, e cada pessoa só vê o que pode.
//
// Rode sozinho, sem as provas que gravam (J1-b, J1-c e J1-d) ao mesmo tempo: elas mudam as vendas e o estoque no meio da
// conferência. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import {
  abrirInicio, ADMINISTRADOR, CAPA, comPessoas, disponivelNaLista, escolher, GERENTE_A, GERENTE_B, indicador, inteiro, LOJA_A, LOJA_B,
  resumoDasVendas, tabelaDoCartao, VENDEDOR,
} from "./telas-reais";

// Um Galaxy A15 da semente de desenvolvimento (packages/banco/supabase/semente/desenvolvimento.sql) que fica na Santa
// Cândida (teste): nenhuma outra prova o vende nem o transfere.
const GALAXY = { imei: "352099001800032", sku: "APA-0001", nome: "Galaxy A15 128 GB Azul" };

/** O "Onde tem" do produto (aberto pelo "na rede" da lista): o disponível de cada local, como a pessoa vê. */
async function ondeTem(pagina: Page, sku: string, nome: string): Promise<Map<string, number>> {
  await disponivelNaLista(pagina, sku);
  await pagina.getByRole("listitem").filter({ hasText: sku }).getByRole("link", { name: "na rede" }).first().click();
  const cartao = pagina.getByRole("heading", { level: 2, name: `Onde tem: ${nome}`, exact: true }).locator("xpath=ancestor::section[1]");
  await expect(cartao.locator("ul > li").first()).toBeVisible();
  const locais = new Map<string, number>();
  for (const li of await cartao.locator("ul > li").all()) {
    const local = (await li.locator("span.font-medium").first().innerText()).replace("local de exceção, não vende", "").replace("(esta loja)", "").trim();
    locais.set(local, inteiro(await li.locator("strong").first().innerText()));
  }
  return locais;
}

test.describe("as provas com login dos relatórios e do estoque, só lendo (J2-a)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("o estoque da capa é o mesmo na lista, no onde tem, no painel e para as outras contas (INV-001)", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [GERENTE_B], [VENDEDOR]], async (p) => {
      const a = p[GERENTE_A] as Page;
      const b = p[GERENTE_B] as Page;
      const v = p[VENDEDOR] as Page;
      const naListaA = await test.step(`o gerente vê a capa na lista da ${LOJA_A}`, () => disponivelNaLista(a, CAPA.sku));

      await test.step("o onde tem mostra o mesmo número para esta loja e o da outra", async () => {
        const locais = await ondeTem(a, CAPA.sku, CAPA.nome);
        expect(locais.get(LOJA_A), `${LOJA_A} no onde tem`).toBe(naListaA);
        expect(locais.has(LOJA_B), `${LOJA_B} no onde tem`).toBe(true);
        const naListaB = await disponivelNaLista(b, CAPA.sku);
        expect(naListaB, `o que o ${GERENTE_B} vê na lista da ${LOJA_B}`).toBe(locais.get(LOJA_B));
      });

      await test.step("o vendedor da mesma loja vê o mesmo número", async () => {
        expect(await disponivelNaLista(v, CAPA.sku)).toBe(naListaA);
      });

      await test.step("o painel do estoque bate com a lista, e o total com a soma dos modelos", async () => {
        await a.goto("/estoque?aba=painel");
        const total = inteiro((await indicador(a, "Disponível para vender")).valor);
        const modelos = await tabelaDoCartao(a, "Disponível por modelo", /Ver os \d+ modelos/);
        // Colunas depois do modelo: Categoria, Físico, Reservado, Disponível, Mínimo, Abaixo do mínimo, Parado, Chegando.
        expect(inteiro(modelos.get(CAPA.nome)?.[3] ?? ""), `a ${CAPA.nome} no painel`).toBe(naListaA);
        const soma = [...modelos.values()].reduce((s, colunas) => s + inteiro(colunas[3] ?? ""), 0);
        expect(soma, "a soma do disponível dos modelos").toBe(total);
      });
    });
  });

  test("o IMEI mostra o aparelho e o histórico a quem consulta a loja dele, e a outra loja não vê (INV-001)", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [GERENTE_B]], async (p) => {
      for (const nome of [GERENTE_A, VENDEDOR]) {
        await test.step(`${nome} acha o aparelho pelo IMEI, com o histórico`, async () => {
          const pagina = p[nome] as Page;
          await pagina.goto(`/estoque?q=${GALAXY.imei}`);
          const cartao = pagina.getByRole("heading", { level: 2, name: GALAXY.nome, exact: true }).locator("xpath=ancestor::section[1]");
          await expect(cartao).toContainText(`${GALAXY.sku} · ${LOJA_A}`);
          await expect(cartao).toContainText(`IMEI ${GALAXY.imei}`);
          await expect(cartao).toContainText("Disponível");
          await expect(cartao).toContainText("no estoque");
          await expect(cartao.getByRole("heading", { name: "Histórico (livro do estoque)" })).toBeVisible();
          await expect(cartao.locator("ul > li").first()).toBeVisible();
        });
      }
      await test.step(`o ${GERENTE_B}, de outra loja, não vê o aparelho`, async () => {
        const b = p[GERENTE_B] as Page;
        await b.goto(`/estoque?q=${GALAXY.imei}`);
        await expect(b.getByText("Nenhum IMEI/ICCID com esse número nas lojas que você consulta.")).toBeVisible();
        await expect(b.getByText(`IMEI ${GALAXY.imei}`)).toHaveCount(0);
      });
    });
  });

  test("o Início e os Relatórios somam o mesmo na rede, na loja e no vendedor (REPORT-001 e REPORT-002)", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [ADMINISTRADOR, LOJA_A], [VENDEDOR], [GERENTE_B]], async (p) => {
      const a = p[GERENTE_A] as Page;
      const r = p[ADMINISTRADOR] as Page;
      const v = p[VENDEDOR] as Page;
      const b = p[GERENTE_B] as Page;

      const daLojaA = await test.step(`o Início do gerente, na ${LOJA_A}, em 30 dias`, async () => {
        await abrirInicio(a, "30 dias");
        await expect(a.getByText(`${LOJA_A} · 30 dias`, { exact: true })).toBeVisible();
        // Gerente não escolhe loja: só a do turno.
        await expect(a.getByRole("navigation", { name: "Loja", exact: true })).toHaveCount(0);
        return resumoDasVendas(a);
      });

      await test.step("hoje, 7 dias e 30 dias crescem nessa ordem", async () => {
        await escolher(a, "Período", "Hoje");
        const hoje = (await resumoDasVendas(a)).vendas;
        await escolher(a, "Período", "7 dias");
        const sete = (await resumoDasVendas(a)).vendas;
        expect(hoje).toBeLessThanOrEqual(sete);
        expect(sete).toBeLessThanOrEqual(daLojaA.vendas);
        await escolher(a, "Período", "30 dias");
      });

      const equipe = await test.step("a equipe do gerente traz o vendedor de teste", async () => {
        if (daLojaA.vendas === 0) return null;
        return tabelaDoCartao(a, "Equipe");
      });

      await test.step(`a rede do administrador, filtrada na ${LOJA_A}, soma o mesmo que o gerente`, async () => {
        await abrirInicio(r, "30 dias", LOJA_A);
        await expect(r.getByText(`${LOJA_A} · 30 dias`, { exact: true })).toBeVisible();
        expect(await resumoDasVendas(r)).toEqual(daLojaA);
      });

      await test.step("na rede inteira, as lojas somam o total, e a loja de teste é a mesma", async () => {
        await escolher(r, "Loja", "Rede inteira");
        const rede = await resumoDasVendas(r);
        if (rede.vendas === 0) return;
        const lojas = await tabelaDoCartao(r, "Desempenho das lojas");
        // Colunas depois da loja: Vendas, Vendido, Devolvido e cancelado, Líquido, Ticket médio.
        const soma = [...lojas.values()].reduce((s, colunas) => s + inteiro(colunas[0] ?? ""), 0);
        expect(soma, "a soma das vendas das lojas").toBe(rede.vendas);
        expect(inteiro(lojas.get(LOJA_A)?.[0] ?? "0"), LOJA_A).toBe(daLojaA.vendas);
        if (equipe?.has(VENDEDOR)) {
          const melhores = await tabelaDoCartao(r, "Melhores vendedores");
          expect(melhores.get(VENDEDOR)?.slice(0, 2), `${VENDEDOR} na rede`).toEqual(equipe.get(VENDEDOR)?.slice(0, 2));
        }
      });

      await test.step(`o ${GERENTE_B} vê a ${LOJA_B} como o administrador a vê`, async () => {
        await abrirInicio(b, "30 dias");
        await expect(b.getByText(`${LOJA_B} · 30 dias`, { exact: true })).toBeVisible();
        const daLojaB = await resumoDasVendas(b);
        await escolher(r, "Loja", LOJA_B);
        await expect(r.getByText(`${LOJA_B} · 30 dias`, { exact: true })).toBeVisible();
        expect(await resumoDasVendas(r)).toEqual(daLojaB);
      });

      await test.step("o vendedor vê só as próprias vendas, as mesmas da equipe, e não o ranking", async () => {
        await abrirInicio(v, "30 dias");
        await expect(v.getByRole("heading", { level: 2, name: "Meus resultados" })).toBeVisible();
        const minhas = await resumoDasVendas(v, "Minhas vendas");
        expect(minhas.vendas).toBe(equipe?.has(VENDEDOR) ? inteiro(equipe.get(VENDEDOR)?.[0] ?? "") : 0);
        await expect(v.getByText(/O resumo da loja e o ranking com os colegas ainda não estão liberados para vendedores/)).toBeVisible();
      });

      await test.step("os Relatórios somam o mesmo que o Início, para o gerente e para a rede", async () => {
        await a.goto("/relatorios");
        await escolher(a, "Período", "30 dias");
        expect(await resumoDasVendas(a)).toEqual(daLojaA);
        await r.goto("/relatorios");
        await escolher(r, "Período", "30 dias");
        await escolher(r, "Loja", LOJA_A);
        expect(await resumoDasVendas(r)).toEqual(daLojaA);
      });

      await test.step("o vendedor não abre os Relatórios", async () => {
        await v.goto("/relatorios");
        await expect(v.getByText(/Os relatórios são da gerência e da diretoria/)).toBeVisible();
        await expect(v.getByRole("region", { name: "Resumo do período" })).toHaveCount(0);
      });
    });
  });

  test("o Financeiro confere com o Início, na loja e na rede filtrada (REPORT-005)", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [ADMINISTRADOR, LOJA_A]], async (p) => {
      const a = p[GERENTE_A] as Page;
      const r = p[ADMINISTRADOR] as Page;

      const doInicio = await test.step(`o Início do gerente, na ${LOJA_A}, em 30 dias`, async () => {
        await abrirInicio(a, "30 dias");
        return { vendas: (await resumoDasVendas(a)).vendas, recebido: (await indicador(a, "Recebido na loja (registro)")).valor };
      });

      const doFinanceiro = await test.step("o Financeiro do gerente mostra as mesmas vendas e o mesmo recebido", async () => {
        await a.goto("/financeiro");
        await escolher(a, "Período", "30 dias");
        const vendas = inteiro((await indicador(a, "Vendas concluídas")).detalhe);
        const recebido = (await indicador(a, "Recebido na loja (registro)")).valor;
        expect({ vendas, recebido }).toEqual(doInicio);
        const meios = doInicio.vendas > 0 ? await tabelaDoCartao(a, "Pagamentos registrados por meio") : new Map<string, string[]>();
        if (doInicio.vendas > 0) expect(meios.size, "os meios de pagamento do período").toBeGreaterThan(0);
        return { vendas, recebido, meios };
      });

      await test.step(`o Financeiro do administrador, filtrado na ${LOJA_A}, mostra o mesmo`, async () => {
        await r.goto("/financeiro");
        await escolher(r, "Período", "30 dias");
        await escolher(r, "Loja", LOJA_A);
        expect(inteiro((await indicador(r, "Vendas concluídas")).detalhe)).toBe(doFinanceiro.vendas);
        expect((await indicador(r, "Recebido na loja (registro)")).valor).toBe(doFinanceiro.recebido);
        if (doFinanceiro.meios.size > 0) expect(await tabelaDoCartao(r, "Pagamentos registrados por meio")).toEqual(doFinanceiro.meios);
      });
    });
  });
});

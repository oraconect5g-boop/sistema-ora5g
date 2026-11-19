// Lote J2-b (19/11/2026; ORA-ORG-004 e ORA-QUAL-002; o sim do proprietário de 19/11 às provas de acesso por papel e por
// loja, só lendo): o que cada papel vê e o que cada pessoa consegue abrir pelo endereço, no site no ar, num celular de
// 360 px, com as contas de teste. SÓ LÊ: só abre telas (nenhum formulário é enviado).
//
// - O menu de cada papel é o esperado: nem uma tela a mais, nem uma a menos.
// - A tela de outro papel, aberta pelo endereço, mostra o aviso, sem os dados.
// - A venda de outra pessoa (ao vendedor) ou de outra loja (ao gerente dela) não abre pelo endereço: o banco não a entrega
//   (RLS), e a tela diz "Página não encontrada".
// - A loja de outra pessoa posta no endereço não muda o que o gerente vê: ele continua na loja dele.
//
// Rode sozinho, sem as provas que gravam (J1-b, J1-c e J1-d) ao mesmo tempo. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS
// (e2e/contas-de-teste.ts); no CI, fica pulado.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import {
  abrirInicio, ADMINISTRADOR, CAPA, comPessoas, disponivelNaLista, GERENTE_A, GERENTE_B, indicador, inteiro, LOJA_A, LOJA_B,
  resumoDasVendas, tabelaDoCartao, VENDEDOR,
} from "./telas-reais";

// As telas do menu de cada papel, sem o Início (lib/acesso/menu.ts, com as permissões de cada papel no banco em 19/11/2026).
const MENU_DO_VENDEDOR = [
  "Vender", "Vendas", "Reservas do site", "Clientes", "Funil de oportunidades", "Agenda", "Caixa", "Ora Connect", "Assistência",
  "Estoque e conferência", "Transferências entre lojas", "Catálogo e fotos", "Metas e desempenho",
];
const MENU_DO_GERENTE = [
  ...MENU_DO_VENDEDOR, "Financeiro", "Relatórios", "Contas a pagar", "Conciliação de pagamentos", "Recebíveis", "A receber das financeiras",
  "Maquininhas", "Aprovações de desconto", "Notas fiscais", "Saúde da operação", "Auditoria",
];
const MENU_DO_ADMINISTRADOR = [
  "Vendas", "Estoque e conferência", "Transferências entre lojas", "Catálogo e fotos", "Cadastro de produtos", "Financeiro", "Relatórios",
  "Saúde da operação", "Entregas do projeto", "Auditoria", "Equipe e acessos", "Lojas da rede",
];

// O aviso de cada tela a quem não tem a permissão (o texto da própria tela) e o título dela no menu.
const AVISOS: Record<string, { aviso: string; titulo: string }> = {
  "/financeiro": { aviso: "O financeiro é da gerência e da diretoria.", titulo: "Financeiro" },
  "/relatorios": { aviso: "Os relatórios são da gerência e da diretoria.", titulo: "Relatórios" },
  "/equipe": { aviso: "Só o dono e o administrador cuidam da equipe e dos acessos.", titulo: "Equipe e acessos" },
  "/lojas": { aviso: "Só o dono e o administrador cuidam do cadastro das lojas.", titulo: "Lojas da rede" },
  "/auditoria": { aviso: "A auditoria é do dono, do gerente e do administrador.", titulo: "Auditoria" },
  "/produtos": { aviso: "Só o dono e o administrador cadastram produtos.", titulo: "Cadastro de produtos" },
  "/entregas": { aviso: "As entregas do projeto são do dono.", titulo: "Entregas do projeto" },
  "/contas-a-pagar": { aviso: "As contas a pagar são do dono e da gerência da loja.", titulo: "Contas a pagar" },
  "/pagamentos/conciliacao": { aviso: "Conciliar pagamentos é da gerência da loja.", titulo: "Conciliação de pagamentos" },
  "/pagamentos/maquininhas": { aviso: "Cadastrar maquininhas é da gerência da loja.", titulo: "Maquininhas" },
  "/operacao": { aviso: "A saúde da operação é do dono e da gerência.", titulo: "Saúde da operação" },
  "/vender": { aviso: "Seu papel não registra vendas nesta loja.", titulo: "Vender" },
  "/reservas-do-site": { aviso: "Só quem vende nesta loja atende as reservas do site.", titulo: "Reservas do site" },
  "/metas": { aviso: "As metas são do dono, da gerência e de cada vendedor (as próprias).", titulo: "Metas e desempenho" },
};
const PROIBIDAS: Record<string, readonly string[]> = {
  [VENDEDOR]: ["/financeiro", "/relatorios", "/equipe", "/lojas", "/auditoria", "/produtos", "/entregas", "/contas-a-pagar", "/pagamentos/conciliacao",
    "/pagamentos/maquininhas", "/operacao"],
  [GERENTE_A]: ["/equipe", "/lojas", "/produtos", "/entregas"],
  [ADMINISTRADOR]: ["/vender", "/reservas-do-site", "/contas-a-pagar", "/pagamentos/conciliacao", "/pagamentos/maquininhas", "/metas"],
};

/** As telas dos atalhos do Início (o mesmo menu da pessoa, sem o Início), em ordem alfabética. */
async function menuDoInicio(pagina: Page): Promise<string[]> {
  await pagina.goto("/inicio");
  const atalhos = pagina.getByRole("heading", { level: 2, name: "Atalhos", exact: true }).locator("xpath=ancestor::section[1]").getByRole("link");
  await expect(atalhos.first()).toBeVisible();
  return (await atalhos.allInnerTexts()).map((t) => t.trim()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
const ordenadas = (telas: readonly string[]) => [...telas].sort((a, b) => a.localeCompare(b, "pt-BR"));

/**
 * Os endereços das vendas de 30 dias na lista de Vendas de quem pede (a lista abre em "Hoje"): a gerência e a rede veem as
 * da loja; o vendedor, só as dele. A prova separa as vendas pela lista do próprio vendedor (o nome de quem vendeu só aparece
 * a quem tem ranking.ver ou cuida da equipe, e só de quem tem venda concluída).
 */
async function vendasDaLista(pagina: Page): Promise<string[]> {
  await pagina.goto("/vendas?periodo=30");
  const linhas = pagina.locator('a[href^="/vendas/"]');
  await expect(linhas.first()).toBeVisible();
  const vendas: string[] = [];
  for (const linha of await linhas.all()) {
    const endereco = (await linha.getAttribute("href")) ?? "";
    // Só as vendas (/vendas/<id>); outros atalhos da tela ficam de fora.
    if (/^\/vendas\/[0-9a-f-]{36}$/.test(endereco)) vendas.push(endereco);
  }
  return vendas;
}

/** O comprovante abriu (a venda chegou do banco) ou a tela disse que ela não existe para quem pede. */
async function comprovanteAbre(pagina: Page, endereco: string): Promise<boolean> {
  await pagina.goto(endereco);
  const venda = pagina.getByRole("heading", { level: 2, name: /^Venda nº \d+$/ });
  const naoEncontrada = pagina.getByRole("heading", { level: 1, name: "Página não encontrada" });
  await expect(venda.or(naoEncontrada).first()).toBeVisible();
  return venda.isVisible();
}

/** O id da loja no filtro da rede (o endereço de cada opção leva o id). */
async function idDaLoja(pagina: Page, loja: string): Promise<string> {
  const href = await pagina.getByRole("navigation", { name: "Loja", exact: true }).getByRole("link", { name: loja, exact: true }).getAttribute("href");
  const id = /[?&]loja=([0-9a-f-]{36})/.exec(href ?? "")?.[1];
  if (!id) throw new Error(`o filtro da rede não trouxe o id da ${loja}`);
  return id;
}

test.describe("as provas de acesso por papel e por loja, só lendo (J2-b)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("cada papel vê no menu só as telas do papel dele (ORG-004 e QUAL-002)", async ({ browser }) => {
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A], [GERENTE_B], [ADMINISTRADOR, LOJA_A]], async (p) => {
      const esperado: [string, readonly string[]][] = [
        [VENDEDOR, MENU_DO_VENDEDOR], [GERENTE_A, MENU_DO_GERENTE], [GERENTE_B, MENU_DO_GERENTE], [ADMINISTRADOR, MENU_DO_ADMINISTRADOR],
      ];
      for (const [nome, menu] of esperado) {
        await test.step(`o menu do ${nome}`, async () => {
          expect(await menuDoInicio(p[nome] as Page), nome).toEqual(ordenadas(menu));
        });
      }
    });
  });

  test("a tela de outro papel, aberta pelo endereço, mostra o aviso e nenhum dado (ORG-004)", async ({ browser }) => {
    await comPessoas(browser, [[VENDEDOR], [GERENTE_A], [ADMINISTRADOR, LOJA_A]], async (p) => {
      const menus: Record<string, readonly string[]> = { [VENDEDOR]: MENU_DO_VENDEDOR, [GERENTE_A]: MENU_DO_GERENTE, [ADMINISTRADOR]: MENU_DO_ADMINISTRADOR };
      for (const [nome, enderecos] of Object.entries(PROIBIDAS)) {
        const pagina = p[nome] as Page;
        for (const endereco of enderecos) {
          await test.step(`${nome} abre ${endereco} pelo endereço`, async () => {
            const { aviso, titulo } = AVISOS[endereco] as { aviso: string; titulo: string };
            // A tela proibida não está no menu do papel; aberta pelo endereço, diz por quê, sem números nem listas.
            expect(menus[nome], `${titulo} no menu do ${nome}`).not.toContain(titulo);
            await pagina.goto(endereco);
            await expect(pagina.getByText(aviso)).toBeVisible();
            await expect(pagina.getByRole("region", { name: "Resumo do período" })).toHaveCount(0);
            await expect(pagina.locator("table")).toHaveCount(0);
          });
        }
      }
    });
  });

  test("a venda de outra pessoa ou de outra loja não abre pelo endereço (ORG-004 e QUAL-002)", async ({ browser }) => {
    await comPessoas(browser, [[GERENTE_A], [VENDEDOR], [GERENTE_B], [ADMINISTRADOR, LOJA_A]], async (p) => {
      const a = p[GERENTE_A] as Page;
      const v = p[VENDEDOR] as Page;
      const b = p[GERENTE_B] as Page;
      const r = p[ADMINISTRADOR] as Page;
      const daLoja = await test.step(`a gerência vê as vendas de 30 dias da ${LOJA_A}`, () => vendasDaLista(a));
      const minhas = await test.step("o vendedor vê na lista só as dele, todas também na lista da gerência", async () => {
        const lista = await vendasDaLista(v);
        expect(lista.filter((x) => !daLoja.includes(x)), "vendas do vendedor fora da lista da gerência").toEqual([]);
        return lista;
      });
      const doVendedor = minhas[0];
      const deOutro = daLoja.find((x) => !minhas.includes(x));
      if (!doVendedor || !deOutro) throw new Error(`a prova precisa, na ${LOJA_A}, de uma venda do ${VENDEDOR} e de uma de outra pessoa`);

      await test.step("o vendedor abre a venda dele e não abre a de outra pessoa", async () => {
        expect(await comprovanteAbre(v, doVendedor), "a venda do próprio vendedor").toBe(true);
        expect(await comprovanteAbre(v, deOutro), "a venda de outra pessoa").toBe(false);
      });

      await test.step(`o ${GERENTE_B}, de outra loja, não abre nenhuma das duas`, async () => {
        expect(await comprovanteAbre(b, doVendedor)).toBe(false);
        expect(await comprovanteAbre(b, deOutro)).toBe(false);
      });

      await test.step("o administrador, que vê a rede, abre as duas", async () => {
        expect(await comprovanteAbre(r, doVendedor)).toBe(true);
        expect(await comprovanteAbre(r, deOutro)).toBe(true);
      });

      await test.step("a lista da gerência e a da rede mostram as vendas da loja, com o nome de quem vendeu (VND-a)", async () => {
        await a.goto("/vendas?periodo=30");
        await expect(a.locator(`a[href="${doVendedor}"]`)).toContainText(`· ${VENDEDOR}`);
        await r.goto("/vendas?periodo=30");
        await expect(r.getByRole("heading", { level: 1, name: "Vendas da loja" })).toBeVisible();
        await expect(r.locator(`a[href="${doVendedor}"]`)).toContainText(`· ${VENDEDOR}`);
        await expect(r.locator(`a[href="${deOutro}"]`)).toBeVisible();
        // A rede não vende: sem o botão de nova venda.
        await expect(r.getByRole("link", { name: "Nova venda" })).toHaveCount(0);
      });
    });
  });

  test("a loja de outra pessoa posta no endereço não muda o que o gerente vê (ORG-004)", async ({ browser }) => {
    await comPessoas(browser, [[ADMINISTRADOR, LOJA_A], [GERENTE_B]], async (p) => {
      const r = p[ADMINISTRADOR] as Page;
      const b = p[GERENTE_B] as Page;

      const lojaA = await test.step(`a rede mostra a ${LOJA_A} com o id dela no endereço`, async () => {
        await abrirInicio(r, "30 dias", LOJA_A);
        return { id: await idDaLoja(r, LOJA_A), vendas: await resumoDasVendas(r), capa: await disponivelNaLista(r, CAPA.sku) };
      });

      const lojaB = await test.step(`o ${GERENTE_B} na loja dele, sem nada no endereço`, async () => {
        await abrirInicio(b, "30 dias");
        const vendas = await resumoDasVendas(b);
        await b.goto("/relatorios?periodo=30");
        const relatorios = await resumoDasVendas(b);
        await b.goto("/financeiro?periodo=30");
        const financeiro = (await indicador(b, "Vendas concluídas")).detalhe;
        return { vendas, relatorios, financeiro, capa: await disponivelNaLista(b, CAPA.sku) };
      });
      // Sem diferença entre as duas lojas, a prova não distinguiria uma da outra.
      expect(lojaB.vendas, `as vendas da ${LOJA_A} e da ${LOJA_B} precisam ser diferentes para a prova valer`).not.toEqual(lojaA.vendas);
      expect(lojaB.capa, `a capa na ${LOJA_A} e na ${LOJA_B}`).not.toBe(lojaA.capa);

      await test.step(`com a ${LOJA_A} no endereço, o Início, os Relatórios e o Financeiro continuam na ${LOJA_B}`, async () => {
        await b.goto(`/inicio?periodo=30&loja=${lojaA.id}`);
        await expect(b.getByText(`${LOJA_B} · 30 dias`, { exact: true })).toBeVisible();
        expect(await resumoDasVendas(b)).toEqual(lojaB.vendas);
        await b.goto(`/relatorios?periodo=30&loja=${lojaA.id}`);
        expect(await resumoDasVendas(b)).toEqual(lojaB.relatorios);
        await b.goto(`/financeiro?periodo=30&loja=${lojaA.id}`);
        expect((await indicador(b, "Vendas concluídas")).detalhe).toBe(lojaB.financeiro);
      });

      await test.step(`com a ${LOJA_A} no endereço, o painel do estoque continua na ${LOJA_B}`, async () => {
        await b.goto(`/estoque?aba=painel&loja=${lojaA.id}`);
        const modelos = await tabelaDoCartao(b, "Disponível por modelo", /Ver os \d+ modelos/);
        // Colunas depois do modelo: Categoria, Físico, Reservado, Disponível...
        expect(inteiro(modelos.get(CAPA.nome)?.[3] ?? ""), `a ${CAPA.nome} no painel`).toBe(lojaB.capa);
      });
    });
  });
});

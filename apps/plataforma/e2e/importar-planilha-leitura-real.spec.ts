// Lote REIN-d (23/11/2026; ORA-CAT-002 e ORA-INV-004): a tela de importação do catálogo e a da carga do estoque, no site no
// ar, num celular de 360 px, com o Administrador (teste) e o relatório ORIGINAL da Rein (o arquivo privado, que não está no
// repositório). SÓ LÊ: a prova escolhe o arquivo nas duas telas e NÃO ENVIA nenhum formulário. A leitura das colunas e das
// famílias acontece no navegador da prova, neste servidor; nada do arquivo vai para o site nem para o banco, e a prova
// confere isso (nenhum pedido de gravação sai para as rotas de envio).
//
// - A importação do catálogo lê as 83 colunas e sugere o código, o nome, a família (como categoria), a marca, o código de
//   barras e o custo; o preço fica para a pessoa escolher (o relatório traz três tabelas); a lista "O tipo de cada
//   categoria" traz as famílias do arquivo, com "CELULARES" já marcada como aparelho.
// - A carga do estoque sugere, para cada loja do relatório, a coluna do físico e a do disponível.
//
// O que esta prova NÃO faz: gerar a prévia, aplicar a importação ou carregar o estoque. Isso grava e é do proprietário
// (ou pede o sim dele). O caminho inteiro com o arquivo original foi ensaiado num banco em memória (ver docs/aceite/REIN-d.md).
//
// Só no servidor: ORA_E2E_URL, ORA_E2E_CONTAS (e2e/contas-de-teste.ts) e ORA_E2E_PLANILHA_REIN (o caminho do arquivo
// privado, por exemplo ~/entrada/rein/relatorioProdutos131258.xlsx); no CI, fica pulada.
import { expect, test, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { ADMINISTRADOR, comPessoas, LOJA_A } from "./telas-reais";

const planilha = process.env.ORA_E2E_PLANILHA_REIN?.trim();
const LOCAIS = ["Santa Felicidade", "Água Verde", "Colônia", "Almirante Tamandaré", "DEFEITOS", "Dubai", "Colombo", "Muffato Santa", "Butiatuvinha", "Ventania", "Balneário", "Santa Cândida"];

/** O texto da opção escolhida num campo de escolha (pelo atributo name, que é o que o formulário manda). */
const escolhida = (pagina: Page, nome: string) =>
  pagina.locator(`select[name="${nome}"]`).evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent ?? "");

test.describe("o relatório original da Rein nas telas de importação do site no ar, só lendo (REIN-d)", () => {
  test.skip(!arquivoDasContas || !noAr || !planilha, "só no servidor, contra o site no ar e com o arquivo privado (ORA_E2E_URL, ORA_E2E_CONTAS e ORA_E2E_PLANILHA_REIN)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(240_000);
  });

  test("a tela lê as 83 colunas, sugere as do relatório, lista as famílias com CELULARES como aparelho e sugere as colunas de cada loja; nada é enviado", async ({ browser }) => {
    await comPessoas(browser, [[ADMINISTRADOR, LOJA_A]], async (p) => {
      const admin = p[ADMINISTRADOR] as Page;
      const gravacoes: string[] = [];
      admin.on("request", (pedido) => {
        if (pedido.method() !== "GET" && /\/(produtos\/importar|estoque\/carga)/.test(new URL(pedido.url()).pathname)) gravacoes.push(`${pedido.method()} ${new URL(pedido.url()).pathname}`);
      });

      await test.step("a importação do catálogo: as colunas sugeridas e o tipo de cada família", async () => {
        await admin.goto("/produtos/importar");
        await expect(admin.getByRole("heading", { level: 1, name: "Importar planilha", exact: true })).toBeVisible();
        await admin.locator('input[type="file"][name="arquivo"]').setInputFiles(planilha as string);
        await expect(admin.getByText(/Qual coluna é cada campo \(83 colunas no arquivo/)).toBeVisible();
        expect(await escolhida(admin, "coluna_sku")).toBe("Codigo (coluna A)");
        expect(await escolhida(admin, "coluna_nome")).toBe("Produto (coluna D)");
        expect(await escolhida(admin, "coluna_categoria")).toBe("Familia (coluna I)");
        expect(await escolhida(admin, "coluna_marca")).toBe("Marca (coluna J)");
        expect(await escolhida(admin, "coluna_codigo_barras")).toBe("Codigo Barras (coluna C)");
        expect(await escolhida(admin, "coluna_custo")).toBe("Custo Unit. (R$) (coluna Y)");
        // O preço não é sugerido (são três tabelas no relatório), e o relatório não tem coluna de tipo.
        expect(await escolhida(admin, "coluna_preco")).toBe("não tem no arquivo");
        expect(await escolhida(admin, "coluna_tipo")).toBe("não tem no arquivo");
        const tipos = admin.locator("fieldset").filter({ has: admin.locator("legend", { hasText: "O tipo de cada categoria" }) }).last();
        await expect(tipos.locator("legend")).toHaveText("O tipo de cada categoria (28 no arquivo)");
        await expect(tipos.getByRole("listitem")).toHaveCount(28);
        const celulares = tipos.getByRole("listitem").filter({ hasText: /^CELULARES \(\d+ itens\)/ });
        await expect(celulares).toHaveCount(1);
        expect(await celulares.locator("select").evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex]?.textContent)).toBe("Aparelho");
        // Só a família dos celulares vem com tipo sugerido; as outras ficam com o tipo padrão, até a pessoa dizer.
        await expect(admin.locator('input[name="tipos_por_categoria"]')).toHaveValue('{"CELULARES":"aparelho"}');
      });

      await test.step("a carga do estoque: o físico e o disponível de cada loja do relatório", async () => {
        await admin.goto("/estoque/carga");
        await expect(admin.getByRole("heading", { level: 1, name: "Carga do estoque por loja", exact: true })).toBeVisible();
        await admin.locator('input[type="file"][name="arquivo"]').setInputFiles(planilha as string);
        await expect(admin.getByText(/O produto \(83 colunas no arquivo/)).toBeVisible();
        expect(await escolhida(admin, "coluna_sku")).toMatch(/^Codigo \(coluna A\)/);
        const fisicos = admin.locator('select[name^="fisico_"]');
        const disponiveis = admin.locator('select[name^="disponivel_"]');
        const escolhas = async (campos: typeof fisicos) => (await campos.evaluateAll((lista) => lista.map((s) => (s as HTMLSelectElement).options[(s as HTMLSelectElement).selectedIndex]?.textContent ?? ""))).filter((t) => /^Qtd\. /.test(t));
        const doFisico = await escolhas(fisicos);
        const doDisponivel = await escolhas(disponiveis);
        // Os 12 locais do relatório: cada um com a "Qtd." dele no físico e a "Qtd. Disponivel" no disponível.
        expect(doFisico).toHaveLength(LOCAIS.length);
        expect(doDisponivel).toHaveLength(LOCAIS.length);
        expect(doFisico.filter((t) => /disponivel/i.test(t))).toEqual([]);
        expect(doDisponivel.filter((t) => !/^Qtd\. Disponivel /.test(t))).toEqual([]);
      });

      expect(gravacoes, "a prova não envia nada: só escolhe o arquivo").toEqual([]);
    });
  });
});

// Lote TRF-e (23/11/2026; ORA-INV-007 e ORA-QUAL-006; o sim do proprietário de 23/11 à prova no site, entre as duas lojas
// de teste, dos destinos "chegou depois" e "baixa"): a transferência recebida com falta, de ponta a ponta, com três
// pessoas, cada uma num celular de 360 px, no site no ar.
//
// - O Gerente 2 (teste) pede 3 capas à Santa Cândida (teste); o Gerente (teste) separa e envia; o Gerente 2 (teste) recebe
//   contando 1: faltaram 2.
// - Enquanto o que faltou não tem destino, a transferência conta nas pendências das duas lojas (o cartão "Transferências"
//   do Início) e aparece na Saúde da operação, na fila "Transferências com falta" (TRF-e).
// - O Gerente 2 (teste) confirma que 1 chegou depois (entra na Loja de teste 2). O Gerente (teste), na origem, vê "Voltou
//   para esta loja", mas não a baixa: só quem ajusta estoque dá baixa. O Dono (teste) dá baixa na que sobrou, com o motivo.
// - No fim: "Faltaram 2: 1 chegou depois e 1 com baixa", nenhum botão, as pendências de volta ao que eram, e o disponível
//   das duas lojas confere: a origem com 3 a menos, o destino com 2 a mais.
//
// GRAVA de verdade, só nas duas lojas de teste: uma transferência de 3 capas, com 1 capa baixada como perda na Santa
// Cândida (teste). Nada é chamado fora. Cada passo olha o estado antes de agir: se a prova parar no meio (num pico do
// banco, por exemplo), rode de novo com ORA_E2E_RETOMAR="<o motivo da transferência>" e ela continua de onde parou.
// Com ORA_E2E_SO_LER=1 a prova só lê o começo (o estoque e as pendências) e para, sem gravar.
// Rode sozinha. Só no servidor: ORA_E2E_URL e ORA_E2E_CONTAS (e2e/contas-de-teste.ts); no CI, fica pulada.
import { expect, test, type Locator, type Page } from "@playwright/test";

import { arquivoDasContas, noAr } from "./contas-de-teste";
import { horaDeBrasilia } from "./pdv-real";
import { CAPA, comPessoas, DONO, GERENTE_A, GERENTE_B, LOJA_A, LOJA_B } from "./telas-reais";

const MARCA = "teste automático da transferência com falta";
const QUANTIDADE = 3;
const FRASE_DA_PENDENCIA = "dar destino ao que faltou";

/** A lista das transferências chega em partes (primeiro o esqueleto): espera o texto que só a tela pronta tem. */
async function abrirTransferencias(pagina: Page) {
  await pagina.goto("/transferencias");
  await expect(pagina.getByText("Para pedir, abra o produto no estoque")).toBeVisible();
}
const cartao = (pagina: Page, motivo: string): Locator => pagina.locator("section").filter({ hasText: `Motivo: ${motivo}` });
const ondeTem = (pagina: Page) => pagina.locator("section").filter({ has: pagina.getByRole("heading", { name: `Onde tem: ${CAPA.nome}` }) });
/** A linha de uma loja no "Onde tem", pelo nome exato (a linha da própria loja tem "Mandar para" com o nome das outras). */
const linhaDaLoja = (pagina: Page, loja: string) => {
  const nome = new RegExp(`^${loja.replace(/[()]/g, "\\$&")}( \\(esta loja\\))?$`);
  return ondeTem(pagina).getByRole("listitem").filter({ has: pagina.locator("span.font-medium").filter({ hasText: nome }) });
};
async function abrirNaRede(pagina: Page) {
  await pagina.goto(`/estoque?q=${CAPA.sku}`);
  await pagina.getByRole("listitem").filter({ hasText: CAPA.sku }).getByRole("link", { name: "na rede" }).first().click();
  await expect(ondeTem(pagina)).toBeVisible();
}
/** O disponível da capa nas duas lojas de teste, pelo "Onde tem". */
async function disponiveis(pagina: Page): Promise<{ a: number; b: number }> {
  await abrirNaRede(pagina);
  const de = async (loja: string) => {
    const linha = linhaDaLoja(pagina, loja);
    await expect(linha).toHaveCount(1);
    const numero = /(\d+)\s*disponível/.exec(await linha.innerText());
    if (!numero) throw new Error(`o "Onde tem" não mostrou o disponível da ${loja}`);
    return Number(numero[1]);
  };
  return { a: await de(LOJA_A), b: await de(LOJA_B) };
}
/** Quantas transferências esperam a loja, pelo cartão do Início (TRF-e: conta a recebida com falta sem destino). */
async function pendenciaNoInicio(pagina: Page): Promise<number> {
  await pagina.goto("/inicio");
  const c = pagina.getByRole("region", { name: "O que espera você" }).getByRole("link").filter({ hasText: FRASE_DA_PENDENCIA });
  await expect(c).toHaveCount(1);
  const numero = Number((await c.locator("span.numeros").innerText()).trim());
  if (!Number.isInteger(numero)) throw new Error("o cartão das transferências do Início não mostrou a contagem");
  return numero;
}
/** Quantas transferências com falta a Saúde da operação mostra (zero quando a fila está entre as "sem nada esperando"). */
async function filaDasFaltas(pagina: Page): Promise<number> {
  await pagina.goto("/operacao");
  await expect(pagina.getByRole("heading", { level: 1, name: "Saúde da operação", exact: true })).toBeVisible();
  const linha = pagina.getByRole("listitem").filter({ has: pagina.getByRole("link", { name: "Transferências com falta", exact: true }) });
  if (await linha.count() === 0) {
    await expect(pagina.getByText(/Sem nada esperando: .*Transferências com falta/)).toBeVisible();
    return 0;
  }
  return Number((await linha.locator("span.numeros").first().innerText()).trim());
}
/** A frase do que faltou no cartão ("Faltaram 2: ..."), ou nulo se a transferência ainda não foi recebida com falta. */
async function fraseDaFalta(c: Locator): Promise<string | null> {
  const frase = c.getByText(/^Falt(ou 1|aram \d+): /);
  return (await frase.count()) > 0 ? (await frase.first().innerText()).trim() : null;
}

test.describe("a transferência recebida com falta, de ponta a ponta, no site no ar (TRF-e)", () => {
  test.skip(!arquivoDasContas || !noAr, "só no servidor, contra o site no ar (ORA_E2E_URL e ORA_E2E_CONTAS)");
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "celular-360", "basta uma vez, no celular");
    test.setTimeout(360_000);
  });

  test("3 capas pedidas, 1 recebida: 1 chegou depois e 1 teve baixa; a falta conta nas pendências até ter destino", async ({ browser }) => {
    const retomar = process.env.ORA_E2E_RETOMAR?.trim();
    const motivo = retomar || `${MARCA}, ${horaDeBrasilia()}`;
    test.info().annotations.push({ type: "motivo da transferência", description: motivo });

    await comPessoas(browser, [[GERENTE_B], [GERENTE_A], [DONO, LOJA_A]], async (p) => {
      const destino = p[GERENTE_B] as Page;
      const origem = p[GERENTE_A] as Page;
      const dono = p[DONO] as Page;
      let antes = { a: 0, b: 0 };
      let pendenciasAntes = { destino: 0, origem: 0, fila: 0 };

      if (!retomar) {
        await test.step("antes: o disponível das duas lojas e as pendências de cada uma", async () => {
          antes = await disponiveis(destino);
          expect(antes.a, "a Santa Cândida (teste) precisa de 3 capas livres").toBeGreaterThanOrEqual(QUANTIDADE);
          pendenciasAntes = { destino: await pendenciaNoInicio(destino), origem: await pendenciaNoInicio(origem), fila: await filaDasFaltas(origem) };
        });
        // ORA_E2E_SO_LER=1: só a leitura do começo (o estoque e as pendências), sem pedir nada. Serve para conferir a tela
        // antes da prova de verdade.
        if (process.env.ORA_E2E_SO_LER === "1") return;

        await test.step(`o Gerente 2 (teste) pede ${QUANTIDADE} capas à ${LOJA_A}`, async () => {
          await abrirNaRede(destino);
          const linha = linhaDaLoja(destino, LOJA_A);
          await expect(linha).toHaveCount(1);
          await linha.getByLabel("Quantidade").fill(String(QUANTIDADE));
          await linha.getByLabel("Motivo").fill(motivo);
          await linha.getByRole("button", { name: "Pedir desta loja" }).click();
          await expect(destino).toHaveURL(/\/transferencias\?ok=pedida/);
          await expect(cartao(destino, motivo)).toContainText("Pedida");
        });
      }

      await test.step("o Gerente (teste) separa e envia", async () => {
        await abrirTransferencias(origem);
        let c = cartao(origem, motivo);
        await expect(c).toHaveCount(1);
        if (await c.getByRole("button", { name: "Separar" }).count()) {
          await c.getByRole("button", { name: "Separar" }).click();
          await expect(origem).toHaveURL(/\/transferencias\?ok=separada/);
          c = cartao(origem, motivo);
        }
        if (await c.getByRole("button", { name: "Enviar (sai do estoque desta loja)" }).count()) {
          await c.getByRole("button", { name: "Enviar (sai do estoque desta loja)" }).click();
          await expect(origem).toHaveURL(/\/transferencias\?ok=enviada/);
        }
        await expect(cartao(origem, motivo).getByText(/^(Em trânsito|Recebida com divergência)$/)).toBeVisible();
      });

      await test.step("o Gerente 2 (teste) recebe contando 1: faltaram 2", async () => {
        await abrirTransferencias(destino);
        let c = cartao(destino, motivo);
        await expect(c).toHaveCount(1);
        if (await c.getByRole("button", { name: "Receber e conferir" }).count()) {
          await expect(c.getByLabel("Quantidade contada")).toHaveValue(String(QUANTIDADE));
          await c.getByLabel("Quantidade contada").fill("1");
          await c.getByLabel(/^Observação/).fill(`${MARCA}: a caixa chegou com duas capas a menos`);
          await c.getByRole("button", { name: "Receber e conferir" }).click();
          await expect(destino).toHaveURL(/\/transferencias\?ok=recebida/);
          c = cartao(destino, motivo);
        }
        await expect(c.getByText("Recebida com divergência", { exact: true })).toBeVisible();
        expect(await fraseDaFalta(c)).toMatch(/^Faltaram 2: /);
      });

      const fraseAgora = await (async () => { await abrirTransferencias(destino); return fraseDaFalta(cartao(destino, motivo)); })();
      if (fraseAgora === "Faltaram 2: 2 ainda sem destino.") {
        await test.step("sem destino, a falta conta nas pendências das duas lojas e na Saúde da operação (TRF-e)", async () => {
          if (!retomar) {
            expect(await pendenciaNoInicio(destino)).toBe(pendenciasAntes.destino + 1);
            expect(await pendenciaNoInicio(origem)).toBe(pendenciasAntes.origem + 1);
            expect(await filaDasFaltas(origem)).toBe(pendenciasAntes.fila + 1);
          } else {
            expect(await pendenciaNoInicio(destino)).toBeGreaterThanOrEqual(1);
            expect(await filaDasFaltas(origem)).toBeGreaterThanOrEqual(1);
          }
        });

        await test.step("o Gerente 2 (teste) confirma que 1 chegou depois: entra na Loja de teste 2", async () => {
          await abrirTransferencias(destino);
          const c = cartao(destino, motivo);
          // O destino não diz que voltou para a origem nem dá baixa.
          await expect(c.getByText("Voltou para esta loja", { exact: true })).toHaveCount(0);
          await expect(c.getByText("Dar baixa no que não apareceu", { exact: true })).toHaveCount(0);
          await c.getByText("Chegou depois nesta loja", { exact: true }).click();
          await expect(c.getByLabel(/^Quantas chegaram \(até 2\)/)).toHaveValue("2");
          await c.getByLabel(/^Quantas chegaram/).fill("1");
          await c.getByLabel("O que houve").fill(`${MARCA}: uma capa estava no fundo da caixa`);
          await c.getByRole("button", { name: "Dar a entrada do que chegou" }).click();
          await expect(destino).toHaveURL(/\/transferencias\?ok=divergencia/);
          await expect(destino.getByText("Registrado: o que faltou teve destino")).toBeVisible();
        });
      }

      await test.step("na origem, o gerente pode dizer que voltou, mas a baixa é só de quem ajusta estoque", async () => {
        await abrirTransferencias(origem);
        const c = cartao(origem, motivo);
        const frase = await fraseDaFalta(c);
        expect(frase).toMatch(/^Faltaram 2: 1 chegou depois e 1 (ainda sem destino|com baixa)\.$/);
        if (frase === "Faltaram 2: 1 chegou depois e 1 ainda sem destino.") {
          await expect(c.getByText("Voltou para esta loja", { exact: true })).toBeVisible();
          await expect(c.getByText("Dar baixa no que não apareceu", { exact: true })).toHaveCount(0);
          await expect(c.getByText("Chegou depois nesta loja", { exact: true })).toHaveCount(0);
        }
      });

      await test.step("o Dono (teste) dá baixa na que não apareceu, com o motivo", async () => {
        await abrirTransferencias(dono);
        let c = cartao(dono, motivo);
        await expect(c).toHaveCount(1);
        if (await fraseDaFalta(c) === "Faltaram 2: 1 chegou depois e 1 ainda sem destino.") {
          await c.getByText("Dar baixa no que não apareceu", { exact: true }).click();
          await expect(c.getByText("A baixa vale para tudo o que ainda falta (1).", { exact: false })).toBeVisible();
          await c.getByLabel("Motivo da baixa").fill(`${MARCA}: a última capa não apareceu em nenhuma das lojas`);
          await c.getByRole("button", { name: "Confirmar a baixa" }).click();
          await expect(dono).toHaveURL(/\/transferencias\?ok=divergencia/);
          c = cartao(dono, motivo);
        }
        await expect(c.getByText("Faltaram 2: 1 chegou depois e 1 com baixa.")).toBeVisible();
        await expect(c.getByText("1 · Chegou depois no destino:", { exact: false })).toBeVisible();
        await expect(c.getByText("1 · Baixa (não apareceu):", { exact: false })).toBeVisible();
        for (const botao of ["Chegou depois nesta loja", "Voltou para esta loja", "Dar baixa no que não apareceu"]) {
          await expect(c.getByText(botao, { exact: true })).toHaveCount(0);
        }
      });

      await test.step("resolvida: sai das pendências, e o disponível das duas lojas confere", async () => {
        if (!retomar) {
          expect(await pendenciaNoInicio(destino)).toBe(pendenciasAntes.destino);
          expect(await pendenciaNoInicio(origem)).toBe(pendenciasAntes.origem);
          expect(await filaDasFaltas(origem)).toBe(pendenciasAntes.fila);
          // A origem mandou 3 e não recebeu nenhuma de volta (a baixa não devolve estoque); o destino ficou com 1 + 1.
          expect(await disponiveis(destino)).toEqual({ a: antes.a - QUANTIDADE, b: antes.b + 2 });
        }
      });
    });
  });
});

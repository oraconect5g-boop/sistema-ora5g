// O sino do topo (G6, REPORT-007): a leitura estrita da resposta, o emblema e a lembrança de um minuto. Dados FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { acessoNegado, emblemaDoSino, lembrancaComHora, lembrancaDoSino, lembrar, lerItensDoSino, lerRespostaDoSino, manterDepoisDaFalha, VALIDADE_DO_SINO_MS, type ItemDoSino } from "./sino";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const OUTRA = "00000000-0000-4000-8000-0000000000dd";
const item = (extra: Partial<ItemDoSino> = {}): ItemDoSino => ({
  rotulo: "Notas na fila", detalhe: "aprovar ou registrar a chave", href: "/notas", icone: "nota", quantidade: 3, alerta: false, ...extra,
});

describe("leitura estrita do sino", () => {
  it("só os itens com algo a fazer, na ordem em que vieram", () => {
    const lidos = lerItensDoSino([item(), item({ rotulo: "Descontos para aprovar", icone: "desconto", quantidade: 0 }), item({ rotulo: "Notas paradas", icone: "nota_parada", quantidade: 1, alerta: true })]);
    expect(lidos?.map((i) => [i.rotulo, i.quantidade])).toEqual([["Notas na fila", 3], ["Notas paradas", 1]]);
    expect(lerItensDoSino([])).toEqual([]);
  });

  it("forma inesperada é falha de leitura, nunca zero: endereço de fora, ícone desconhecido, número quebrado ou campo faltando", () => {
    for (const estragado of [
      item({ href: "https://outro.site/x" }), item({ href: "//outro.site" }), item({ icone: "foguete" as never }), item({ quantidade: 1.5 }),
      item({ quantidade: -1 }), item({ rotulo: "" }), { ...item(), alerta: "sim" }, { rotulo: "Notas na fila" }, null,
    ]) {
      expect(lerItensDoSino([estragado]), JSON.stringify(estragado)).toBeNull();
    }
    expect(lerItensDoSino({ pendencias: [] })).toBeNull();
  });

  it("a resposta tem de ser da loja do turno da tela (o turno pode ter mudado no meio)", () => {
    expect(lerRespostaDoSino({ unidade: LOJA, pendencias: [item()] }, LOJA)).toHaveLength(1);
    expect(lerRespostaDoSino({ unidade: OUTRA, pendencias: [item()] }, LOJA)).toBeNull();
    expect(lerRespostaDoSino({ erro: "falha" }, LOJA)).toBeNull();
    expect(lerRespostaDoSino(null, LOJA)).toBeNull();
  });
});

describe("emblema e lembrança", () => {
  it("o emblema soma o que espera; nada quando não há nada; 99+ acima de 99", () => {
    expect(emblemaDoSino([])).toBeNull();
    expect(emblemaDoSino([item({ quantidade: 3 }), item({ quantidade: 2 })])).toBe("5");
    expect(emblemaDoSino([item({ quantidade: 80 }), item({ quantidade: 40 })])).toBe("99+");
  });

  it("a lembrança vale um minuto, só para a mesma loja, e passa pela mesma leitura", () => {
    const agora = 1_800_000_000_000;
    const eu = { usuario: "u-ana", unidade: LOJA };
    const guardada = lembrar(eu, [item()], agora);
    expect(lembrancaDoSino(guardada, eu, agora + 30_000)).toHaveLength(1);
    expect(lembrancaDoSino(guardada, eu, agora + VALIDADE_DO_SINO_MS + 1)).toBeNull();
    expect(lembrancaDoSino(guardada, { ...eu, unidade: OUTRA }, agora + 1)).toBeNull();
    expect(lembrancaDoSino(guardada, eu, agora - 1)).toBeNull();
    expect(lembrancaDoSino(lembrar(eu, [item({ href: "https://x" })], agora), eu, agora)).toBeNull();
    expect(lembrancaDoSino("{quebrado", eu, agora)).toBeNull();
    expect(lembrancaDoSino(null, eu, agora)).toBeNull();
    // A lembrança no formato de antes (só a loja) não vale mais.
    expect(lembrancaDoSino(JSON.stringify({ unidade: LOJA, em: agora, itens: [item()] }), eu, agora)).toBeNull();
  });

  it("#96 (REV-PROMPT-003): a lembrança do dono não é lida pela vendedora que entra depois na mesma aba e na mesma loja", () => {
    const agora = 1_000_000;
    const itensDoDono = [item({ rotulo: "Bônus para aprovar", href: "/metas/fechamento", quantidade: 7 })];
    const armazenamentoDaAba = lembrar({ usuario: "u-dono", unidade: LOJA }, itensDoDono, agora);
    // A prova do Codex devolvia os itens do dono para a vendedora; agora não devolve nada (ela lê de novo do servidor).
    expect(lembrancaDoSino(armazenamentoDaAba, { usuario: "u-vendedora", unidade: LOJA }, agora + 15_000)).toBeNull();
    expect(lembrancaDoSino(armazenamentoDaAba, { usuario: "u-dono", unidade: LOJA }, agora + 15_000)).toEqual(itensDoDono);
    expect(lembrancaDoSino(armazenamentoDaAba, { usuario: "", unidade: LOJA }, agora + 15_000)).toBeNull();
  });

  it("#96: a falha não mantém a lista do acesso anterior: acesso negado apaga na hora; outra falha só dentro do minuto", () => {
    const agora = 2_000_000;
    expect([acessoNegado({ status: 200, redirected: true }), acessoNegado({ status: 401, redirected: false }), acessoNegado({ status: 403, redirected: false }),
      acessoNegado({ status: 503, redirected: false }), acessoNegado({ status: 200, redirected: false })]).toEqual([true, true, true, false, false]);
    expect(manterDepoisDaFalha(true, agora - 1_000, agora)).toBe(false);
    expect(manterDepoisDaFalha(false, agora - 1_000, agora)).toBe(true);
    expect(manterDepoisDaFalha(false, agora - VALIDADE_DO_SINO_MS - 1, agora)).toBe(false);
    expect(manterDepoisDaFalha(false, null, agora)).toBe(false);
    expect(manterDepoisDaFalha(false, agora + 5, agora)).toBe(false);
    const eu = { usuario: "u-ana", unidade: "loja" };
    const guardada = lembrar(eu, [item()], agora - 10_000);
    expect(lembrancaComHora(guardada, eu, agora)).toEqual({ itens: [item()], em: agora - 10_000 });
    expect(lembrancaComHora(guardada, { ...eu, usuario: "outra" }, agora)).toBeNull();
  });
});

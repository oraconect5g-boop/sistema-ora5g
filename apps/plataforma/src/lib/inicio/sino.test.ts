// O sino do topo (G6, REPORT-007): a leitura estrita da resposta, o emblema e a lembrança de um minuto. Dados FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { emblemaDoSino, lembrancaDoSino, lembrar, lerItensDoSino, lerRespostaDoSino, VALIDADE_DO_SINO_MS, type ItemDoSino } from "./sino";

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
    const guardada = lembrar(LOJA, [item()], agora);
    expect(lembrancaDoSino(guardada, LOJA, agora + 30_000)).toHaveLength(1);
    expect(lembrancaDoSino(guardada, LOJA, agora + VALIDADE_DO_SINO_MS + 1)).toBeNull();
    expect(lembrancaDoSino(guardada, OUTRA, agora + 1)).toBeNull();
    expect(lembrancaDoSino(guardada, LOJA, agora - 1)).toBeNull();
    expect(lembrancaDoSino(lembrar(LOJA, [item({ href: "https://x" })], agora), LOJA, agora)).toBeNull();
    expect(lembrancaDoSino("{quebrado", LOJA, agora)).toBeNull();
    expect(lembrancaDoSino(null, LOJA, agora)).toBeNull();
  });
});

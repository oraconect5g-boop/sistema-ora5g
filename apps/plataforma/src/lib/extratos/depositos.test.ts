// O depósito agrupado da maquininha (lote FIN-006a: ORA-FIN-006): a leitura estrita do painel, as mensagens e os formulários.
import { describe, expect, it } from "vitest";

import {
  diferencaDoDeposito, erroDosDepositos, lerPainelDosDepositos, mudouDepoisDeCasar, validarCasarDeposito, validarDesfazerDeposito,
} from "./depositos";

const LINHA = "00000000-0000-4000-9000-0000000000e1";
const deposito = (extra: Record<string, unknown> = {}) => ({
  provedor: "picpay", data_liquidacao: "2026-11-21", pagamentos: 2, esperado: 23_384, bruto: 23_700, casado: null,
  sugestoes: [{ linha: LINHA, extrato: 5, data: "2026-11-21", valor: 23_384, descricao: null }], ...extra,
});
const painel = (depositos: unknown[]) => ({ depositos, sem_conciliacao: { pagamentos: 1, valor: 7_900 } });
const campos = (c: Record<string, string>) => ({ get: (k: string) => c[k] ?? null });

describe("a leitura do painel dos depósitos (FIN-006a)", () => {
  it("lê o depósito solto e o casado, com a diferença e a mudança depois de casar", () => {
    const casado = { linha: LINHA, extrato: 4, data: "2026-11-22", recebido: 23_300, esperado_ao_casar: 23_384, pagamentos_ao_casar: 2, motivo: "Tarifa" };
    const lido = lerPainelDosDepositos(painel([deposito(), deposito({ provedor: "pagbank", casado, sugestoes: [] })]));
    expect(lido.semConciliacao).toEqual({ pagamentos: 1, valor: 7_900 });
    expect(lido.depositos.map((d) => [d.maquininha, d.dataLiquidacao, d.pagamentos, d.esperado, d.bruto])).toEqual([
      ["picpay", "2026-11-21", 2, 23_384, 23_700], ["pagbank", "2026-11-21", 2, 23_384, 23_700],
    ]);
    const [solto, comLinha] = lido.depositos as [typeof lido.depositos[number], typeof lido.depositos[number]];
    expect([diferencaDoDeposito(solto), diferencaDoDeposito(comLinha)]).toEqual([null, -84]);
    expect(mudouDepoisDeCasar(comLinha)).toBe(false);
    const mudou = lerPainelDosDepositos(painel([deposito({ casado: { ...casado, pagamentos_ao_casar: 1 } })])).depositos[0];
    expect(mudou && mudouDepoisDeCasar(mudou)).toBe(true);
  });

  it("forma inesperada é falha, nunca zero", () => {
    for (const ruim of [
      null, [], {}, { depositos: [] }, painel([deposito({ provedor: "cielo" })]), painel([deposito({ data_liquidacao: "21/11/2026" })]),
      painel([deposito({ pagamentos: 0 })]), painel([deposito({ esperado: 30_000 })]), painel([deposito({ casado: "sim" })]),
      painel([deposito({ sugestoes: [{ linha: "x", extrato: 5, data: "2026-11-21", valor: 1, descricao: null }] })]),
      painel([deposito({ sugestoes: [{ linha: LINHA, extrato: 5, data: "2026-11-21", valor: -1, descricao: null }] })]),
      { depositos: [], sem_conciliacao: { pagamentos: -1, valor: 0 } },
    ]) expect(() => lerPainelDosDepositos(ruim), JSON.stringify(ruim)).toThrow();
  });
});

describe("as mensagens e os formulários dos depósitos (FIN-006a)", () => {
  it("cada recusa do banco vira a mensagem dela", () => {
    expect(erroDosDepositos({ code: "42501" })).toBe("permissao");
    expect(erroDosDepositos({ code: "OR045" })).toBe("ocupado");
    expect(erroDosDepositos({ code: "OR046" })).toBe("linha_em_uso");
    expect(erroDosDepositos({ code: "P0002", message: "Linha do extrato não encontrada" })).toBe("linha");
    expect(erroDosDepositos({ code: "P0002", message: "Nenhum pagamento desta maquininha com o dinheiro para este dia" })).toBe("sem_pagamentos");
    expect(erroDosDepositos({ code: "22023", message: "O valor da linha não é o esperado do depósito: diga o motivo da diferença" })).toBe("diferenca");
    expect(erroDosDepositos({ code: "22023", message: "O motivo tem de 3 a 200 letras" })).toBe("motivo");
    expect(erroDosDepositos({ code: "22023", message: "A linha tem de ser do extrato do banco da rede" })).toBe("linha");
    expect(erroDosDepositos({ code: "22023", message: "Escolha a maquininha e o dia do dinheiro" })).toBe("dados");
    expect(erroDosDepositos({ code: "57014" })).toBe("falha");
    expect(erroDosDepositos(null)).toBe("falha");
  });

  it("casar e desfazer conferem a maquininha, o dia, a linha e o motivo antes de ir ao banco", () => {
    const base = { maquininha: "pagbank", data_liquidacao: "2026-11-20" };
    expect(validarCasarDeposito(campos({ ...base, linha: LINHA }))).toEqual({ ok: true, dados: { maquininha: "pagbank", data: "2026-11-20", linha: LINHA, motivo: null } });
    expect(validarCasarDeposito(campos({ ...base, linha: LINHA, motivo: "  Tarifa   do saque " }))).toMatchObject({ ok: true, dados: { motivo: "Tarifa do saque" } });
    expect(validarCasarDeposito(campos({ ...base, maquininha: "toString", linha: LINHA }))).toEqual({ ok: false, erro: "dados" });
    expect(validarCasarDeposito(campos({ ...base, data_liquidacao: "2026-11", linha: LINHA }))).toEqual({ ok: false, erro: "dados" });
    expect(validarCasarDeposito(campos({ ...base, linha: "1 or 1=1" }))).toEqual({ ok: false, erro: "linha" });
    expect(validarCasarDeposito(campos({ ...base, linha: LINHA, motivo: "ab" }))).toEqual({ ok: false, erro: "motivo" });
    expect(validarDesfazerDeposito(campos({ ...base, motivo: "Era outra linha" }))).toEqual({ ok: true, dados: { maquininha: "pagbank", data: "2026-11-20", motivo: "Era outra linha" } });
    expect(validarDesfazerDeposito(campos({ ...base }))).toEqual({ ok: false, erro: "motivo" });
  });
});

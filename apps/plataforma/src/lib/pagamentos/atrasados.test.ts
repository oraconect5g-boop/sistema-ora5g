// Os repasses atrasados (lote FIN-007a): a leitura estrita de public.repasses_atrasados, o selo de cada conta, a leitura dos
// dois formulários e o que a tela faz com cada resposta do banco. Dados FICTÍCIOS. A regra de verdade está em
// packages/banco/src/repasses-atrasados.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { consultarRepassesAtrasados, erroDaCobranca, erroDoPrazo, faixasDoAtraso, lerCobranca, lerPrazo, lerRepassesAtrasados, situacaoDoRepasse } from "./atrasados";

const CONTA = "00000000-0000-4000-9000-0000000000a1";
const VENDA = "00000000-0000-4000-9000-0000000000b1";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const conta = (extra: Record<string, unknown> = {}) => ({
  id: CONTA, venda_id: VENDA, venda_numero: 42, unidade_id: LOJA, unidade_nome: "Loja fictícia", devedor: "payjoy", valor: 129_900, concluida_em: "2026-10-04T15:00:00Z",
  dias: 40, prazo: 30, vencimento: "2026-11-03", atraso: 10, estado: "atrasada", cobrancas: 0, historico: [], ...extra,
});
const RESPOSTA = {
  hoje: "2026-11-13", pode_definir_prazo: true,
  prazos: [{ devedor: "aiva", dias: null, definido_em: null }, { devedor: "payjoy", dias: 30, definido_em: "2026-11-01T12:00:00Z" }],
  totais: { atrasadas: 1, valor_atrasado: 129_900, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 0, valor_sem_prazo: 0, maior_atraso: 10 },
  por_loja: [{ unidade_id: LOJA, nome: "Loja fictícia", abertas: 1, atrasadas: 1, valor_atrasado: 129_900 }],
  contas: [conta()],
};

describe("a leitura da resposta", () => {
  it("lê os prazos, os totais, as lojas e cada conta com o vencimento, o atraso e as cobranças", () => {
    const cobranca = { id: "c1", quando: "2026-11-10T14:30:00Z", canal: "portal", resumo: "Chamado aberto", protocolo: null, retornar_em: "2026-11-14", por: null };
    const d = lerRepassesAtrasados({ ...RESPOSTA, contas: [conta({ cobrancas: 1, historico: [cobranca] })] });
    expect(d.hoje).toBe("2026-11-13");
    expect(d.podeDefinirPrazo).toBe(true);
    expect(d.prazos).toEqual([{ devedor: "aiva", dias: null, definidoEm: null }, { devedor: "payjoy", dias: 30, definidoEm: "2026-11-01T12:00:00Z" }]);
    expect(d.totais).toEqual({ atrasadas: 1, valorAtrasado: 129_900, noPrazo: 0, valorNoPrazo: 0, semPrazo: 0, valorSemPrazo: 0, maiorAtraso: 10 });
    expect(d.porLoja).toEqual([{ unidadeId: LOJA, nome: "Loja fictícia", abertas: 1, atrasadas: 1, valorAtrasado: 129_900 }]);
    expect(d.contas[0]).toMatchObject({ id: CONTA, vendaNumero: 42, devedor: "payjoy", valor: 129_900, dias: 40, prazo: 30, vencimento: "2026-11-03", atraso: 10, estado: "atrasada", cobrancas: 1 });
    expect(d.contas[0]?.historico).toEqual([{ id: "c1", quando: "2026-11-10T14:30:00Z", canal: "portal", resumo: "Chamado aberto", protocolo: null, retornarEm: "2026-11-14", por: null }]);
  });

  it("o que não fecha é erro, nunca \"nada atrasado\"", () => {
    const semPrazo = { prazo: null, vencimento: null, atraso: null, estado: "sem_prazo" };
    const totalSemPrazo = { atrasadas: 0, valor_atrasado: 0, no_prazo: 0, valor_no_prazo: 0, sem_prazo: 1, valor_sem_prazo: 129_900, maior_atraso: 0 };
    expect(() => lerRepassesAtrasados({ ...RESPOSTA, totais: totalSemPrazo, contas: [conta(semPrazo)] })).not.toThrow();
    for (const ruim of [
      null, [], {}, { ...RESPOSTA, hoje: "13/11/2026" }, { ...RESPOSTA, pode_definir_prazo: "sim" }, { ...RESPOSTA, totais: undefined },
      // o estado sem o que ele pede: atrasada sem atraso, no prazo com o vencimento passado, sem prazo com vencimento
      { ...RESPOSTA, contas: [conta({ atraso: 0 })] }, { ...RESPOSTA, contas: [conta({ estado: "no_prazo" })] }, { ...RESPOSTA, contas: [conta({ estado: "sem_prazo" })] },
      { ...RESPOSTA, contas: [conta({ vencimento: null })] }, { ...RESPOSTA, contas: [conta({ estado: "vencida" })] }, { ...RESPOSTA, contas: [conta({ vencimento: "03/11/2026" })] },
      // os totais que não são a soma das contas
      { ...RESPOSTA, totais: { ...RESPOSTA.totais, atrasadas: 2 } }, { ...RESPOSTA, totais: { ...RESPOSTA.totais, valor_atrasado: 1 } }, { ...RESPOSTA, totais: totalSemPrazo },
      // financeira, canal, identificador, valor e contagem das cobranças
      { ...RESPOSTA, contas: [conta({ devedor: "picpay" })] }, { ...RESPOSTA, contas: [conta({ id: "x" })] }, { ...RESPOSTA, contas: [conta({ valor: 0 })] },
      { ...RESPOSTA, contas: [conta({ cobrancas: 1 })] },
      { ...RESPOSTA, contas: [conta({ cobrancas: 1, historico: [{ id: "c", quando: "2026-11-10T14:30:00Z", canal: "pombo", resumo: "x", protocolo: null, retornar_em: null, por: null }] })] },
      { ...RESPOSTA, prazos: [{ devedor: "payjoy", dias: 30, definido_em: null }] }, { ...RESPOSTA, prazos: [{ devedor: "payjoy", dias: 0, definido_em: "2026-11-01T12:00:00Z" }] },
      { ...RESPOSTA, prazos: [{ devedor: "outra", dias: null, definido_em: null }] },
    ]) {
      expect(() => lerRepassesAtrasados(ruim), JSON.stringify(ruim)?.slice(0, 90)).toThrow();
    }
  });

  it("o selo de cada conta: atrasada há N dias, vence hoje, vence em uma data ou sem prazo", () => {
    expect(situacaoDoRepasse({ estado: "atrasada", atraso: 1, vencimento: "2026-11-12" }, "2026-11-13")).toEqual({ rotulo: "atrasada há 1 dia", tom: "perigo" });
    expect(situacaoDoRepasse({ estado: "atrasada", atraso: 10, vencimento: "2026-11-03" }, "2026-11-13")).toEqual({ rotulo: "atrasada há 10 dias", tom: "perigo" });
    expect(situacaoDoRepasse({ estado: "no_prazo", atraso: 0, vencimento: "2026-11-13" }, "2026-11-13")).toEqual({ rotulo: "vence hoje", tom: "aviso" });
    expect(situacaoDoRepasse({ estado: "no_prazo", atraso: 0, vencimento: "2026-12-08" }, "2026-11-13")).toEqual({ rotulo: "vence em 08/12/2026", tom: "info" });
    expect(situacaoDoRepasse({ estado: "sem_prazo", atraso: null, vencimento: null }, "2026-11-13")).toEqual({ rotulo: "sem prazo definido", tom: "neutro" });
  });

  it("as atrasadas por idade do atraso: até 7 dias, de 8 a 30 e mais de 30; no prazo e sem prazo não entram", () => {
    const atrasada = (atraso: number, valor: number) => ({ estado: "atrasada" as const, atraso, valor });
    expect(faixasDoAtraso([
      atrasada(1, 100), atrasada(7, 200), atrasada(8, 400), atrasada(30, 800), atrasada(31, 1_600), atrasada(400, 3_200),
      { estado: "no_prazo", atraso: 0, valor: 9_999 }, { estado: "sem_prazo", atraso: null, valor: 9_999 },
    ])).toEqual([
      { rotulo: "até 7 dias", contas: 2, valor: 300 }, { rotulo: "de 8 a 30 dias", contas: 2, valor: 1_200 }, { rotulo: "mais de 30 dias", contas: 2, valor: 4_800 },
    ]);
    // As faixas somam as atrasadas da resposta: nada fica de fora.
    const d = lerRepassesAtrasados(RESPOSTA);
    const faixas = faixasDoAtraso(d.contas);
    expect(faixas.reduce((s, f) => s + f.contas, 0)).toBe(d.totais.atrasadas);
    expect(faixas.reduce((s, f) => s + f.valor, 0)).toBe(d.totais.valorAtrasado);
    expect(faixasDoAtraso([]).every((f) => f.contas === 0 && f.valor === 0)).toBe(true);
  });
});

describe("os formulários", () => {
  const f = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] });

  it("o prazo: a financeira, os dias (em branco retira) e o motivo", () => {
    expect(lerPrazo(f({ devedor: "payjoy", dias: " 30 ", motivo: "  Contrato:   30 dias " }))).toEqual({ ok: true, devedor: "payjoy", dias: 30, motivo: "Contrato: 30 dias" });
    expect(lerPrazo(f({ devedor: "aiva", dias: "", motivo: "O contrato mudou" }))).toEqual({ ok: true, devedor: "aiva", dias: null, motivo: "O contrato mudou" });
    for (const campos of [{ devedor: "outra", dias: "30", motivo: "Motivo" }, { devedor: "payjoy", dias: "0", motivo: "Motivo" }, { devedor: "payjoy", dias: "181", motivo: "Motivo" },
      { devedor: "payjoy", dias: "-3", motivo: "Motivo" }, { devedor: "payjoy", dias: "3,5", motivo: "Motivo" }, { devedor: "constructor", dias: "30", motivo: "Motivo" }]) {
      expect(lerPrazo(f(campos)), JSON.stringify(campos)).toEqual({ ok: false, erro: "prazo_dados" });
    }
    expect(lerPrazo(f({ devedor: "payjoy", dias: "30", motivo: "ab" }))).toEqual({ ok: false, erro: "prazo_motivo" });
    expect(lerPrazo(f({ devedor: "payjoy", dias: "30", motivo: "x".repeat(201) }))).toEqual({ ok: false, erro: "prazo_motivo" });
  });

  it("a cobrança: o canal, o resumo, o protocolo e a data (os dois últimos opcionais), com a chave", () => {
    const campos = { conta: CONTA, chave: "form:1", canal: "whatsapp", resumo: "  Falei   com o gerente ", protocolo: "", retornar_em: "" };
    expect(lerCobranca(f(campos), "2026-11-13")).toEqual({ ok: true, conta: CONTA, canal: "whatsapp", resumo: "Falei com o gerente", protocolo: null, retornarEm: null, chave: "form:1" });
    expect(lerCobranca(f({ ...campos, protocolo: " P-9 ", retornar_em: "2026-11-13" }), "2026-11-13")).toMatchObject({ ok: true, protocolo: "P-9", retornarEm: "2026-11-13" });
    expect(lerCobranca(f({ ...campos, retornar_em: "2027-11-13" }), "2026-11-13")).toMatchObject({ ok: true, retornarEm: "2027-11-13" });
    for (const [mudanca, erro] of [
      [{ conta: "x" }, "cobranca_dados"], [{ canal: "toString" }, "cobranca_dados"], [{ chave: "" }, "cobranca_dados"], [{ chave: "c".repeat(201) }, "cobranca_dados"],
      [{ resumo: "ab" }, "cobranca_dados"], [{ resumo: "x".repeat(501) }, "cobranca_dados"], [{ protocolo: "p".repeat(81) }, "cobranca_protocolo"],
      [{ retornar_em: "2026-11-12" }, "cobranca_data"], [{ retornar_em: "2027-11-14" }, "cobranca_data"], [{ retornar_em: "2026-02-31x" }, "cobranca_data"],
    ] as const) {
      expect(lerCobranca(f({ ...campos, ...mudanca }), "2026-11-13"), JSON.stringify(mudanca).slice(0, 50)).toEqual({ ok: false, erro });
    }
  });

  it("o erro do banco vira a mensagem certa, sem repetir o texto dele", () => {
    expect([erroDoPrazo({ code: "42501" }), erroDoPrazo({ code: "22023" }), erroDoPrazo({ code: "57014" }), erroDoPrazo(null)]).toEqual(["prazo_permissao", "prazo_dados", "atrasados_falha", "atrasados_falha"]);
    expect(erroDaCobranca({ code: "P0002" })).toBe("cobranca_conta");
    expect(erroDaCobranca({ code: "OR004" })).toBe("cobranca_repetida");
    expect(erroDaCobranca({ code: "22023", message: "Só se cobra conta em aberto" })).toBe("cobranca_fechada");
    expect(erroDaCobranca({ code: "22023", message: "O protocolo tem até 80 letras" })).toBe("cobranca_protocolo");
    expect(erroDaCobranca({ code: "22023", message: "A data para voltar ao assunto vai de hoje a um ano" })).toBe("cobranca_data");
    expect(erroDaCobranca({ code: "22023", message: "Diga por onde a cobrança foi feita" })).toBe("cobranca_dados");
    expect(erroDaCobranca({ code: "40001" })).toBe("atrasados_falha");
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }) => {
    const chamadas: [string, unknown][] = [];
    const supabase = { rpc: async (nome: string, args: unknown) => { chamadas.push([nome, args]); return resposta; } };
    return { supabase: supabase as never, chamadas };
  };

  it("pede a loja, ou a rede sem a loja; sem a função, nulo; outra falha ou resposta fora da forma, falha", async () => {
    const daLoja = banco({ data: RESPOSTA, error: null });
    expect(await consultarRepassesAtrasados(daLoja.supabase, LOJA)).toMatchObject({ estado: "ok", dados: { hoje: "2026-11-13" } });
    expect(daLoja.chamadas).toEqual([["repasses_atrasados", { p_unidade: LOJA }]]);
    const daRede = banco({ data: RESPOSTA, error: null });
    await consultarRepassesAtrasados(daRede.supabase, null);
    expect(daRede.chamadas).toEqual([["repasses_atrasados", {}]]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const code of ["PGRST202", "42883"]) expect(await consultarRepassesAtrasados(banco({ data: null, error: { code } }).supabase, LOJA)).toBeNull();
    for (const code of ["42501", "57014"]) expect(await consultarRepassesAtrasados(banco({ data: null, error: { code } }).supabase, LOJA)).toEqual({ estado: "falha" });
    expect(await consultarRepassesAtrasados(banco({ data: { hoje: "2026-11-13" }, error: null }).supabase, LOJA)).toEqual({ estado: "falha" });
  });
});

// Fechamento do bônus (lote L9b): a leitura estrita de public.bonus_fechamento_do_mes (a apuração gravada
// é conferida conta a conta; o que não fecha vira falha), a validação dos formulários da gerência e do
// dono, as mensagens e a planilha. O banco está provado em packages/banco/src/bonus-fechamento.test.ts.
// Dados fictícios.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import {
  erroDoFechamento, lerFechamentoDoMes, lerFechamentosDoMes, linhaDoVendedor, mesesParaFechar, planilhaDoFechamento, totaisNoCampo, validarAprovacao, validarConferencia,
} from "./fechamento";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const ANA = "00000000-0000-4000-8000-00000000a001";
const BETO = "00000000-0000-4000-8000-00000000a002";
const GERENTE = "00000000-0000-4000-8000-00000000a003";
const DONO = "00000000-0000-4000-8000-00000000a004";
const FECHAMENTO = "00000000-0000-4000-8000-0000000000f1";
const ENVIADO_EM = "2026-11-02T13:00:00+00:00";
const APROVADO_EM = "2026-11-03T12:00:00+00:00";

const APURACAO = {
  mes: "2026-10-01", regra_contagem: 1,
  regras: { connect: { vigente_desde: "2026-10-01", versao: 3, faixas: [{ a_partir_de: 100, valor: 30_000 }, { a_partir_de: 150, valor: 50_000 }] } },
  vendedores: [
    { vendedor_id: ANA, total: 30_000, medidas: { connect: { meta: 2, realizado: 2, faixa: 1, bonus: 30_000, proxima: { faixa: 2, a_partir_de: 150, valor: 50_000, falta: 1 } } } },
    { vendedor_id: BETO, total: 0, medidas: { connect: { meta: 4, realizado: 1, faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 30_000, falta: 3 } } } },
  ],
};
const CONTESTACAO = { motivo: "A ativação de 31/10 só confirmou no dia 1º", contestada_em: ENVIADO_EM, decisao: null, resposta: null, decidida_em: null };
const linha = (vendedor: string, total: number, extra: Record<string, unknown> = {}) =>
  ({ vendedor_id: vendedor, total_calculado: total, total_aprovado: null, ajuste_motivo: null, aprovado_em: null, contestacao: null, ...extra });
const ENVIADO = {
  mes: "2026-10-01", unidade_id: LOJA,
  fechamento: {
    id: FECHAMENTO, situacao: "enviado", apuracao: APURACAO, total_calculado: 30_000, total_aprovado: null,
    enviado_por: GERENTE, enviado_em: ENVIADO_EM, aprovado_por: null, aprovado_em: null,
  },
  linhas: [linha(ANA, 30_000), linha(BETO, 0, { contestacao: CONTESTACAO })],
};
const AJUSTE = "A ativação de 31/10 conta em outubro";
const APROVADO = {
  ...ENVIADO,
  fechamento: { ...ENVIADO.fechamento, situacao: "aprovado", total_aprovado: 60_000, aprovado_por: DONO, aprovado_em: APROVADO_EM },
  linhas: [
    linha(ANA, 30_000, { total_aprovado: 30_000, aprovado_em: APROVADO_EM }),
    linha(BETO, 0, { total_aprovado: 30_000, ajuste_motivo: AJUSTE, aprovado_em: APROVADO_EM, contestacao: { ...CONTESTACAO, decisao: "ajustado", resposta: AJUSTE, decidida_em: APROVADO_EM } }),
  ],
};
const PEDIDO = { mes: "2026-10-01", unidade: LOJA };
const ler = (dado: unknown, pedido: { mes: string; unidade: string; eu?: string } = PEDIDO) => lerFechamentoDoMes(dado, pedido);
const recusa = (dado: unknown, pedido?: { mes: string; unidade: string; eu?: string }) => expect(() => ler(dado, pedido)).toThrow(RespostaInesperada);
const comLinhas = (base: typeof ENVIADO | typeof APROVADO, ...linhas: Record<string, unknown>[]) => ({ ...base, linhas });

describe("leitura do fechamento (L9b)", () => {
  it("ainda não enviado: sem fechamento e sem linhas", () => {
    expect(ler({ mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [] })).toEqual({ mes: "2026-10-01", unidadeId: LOJA, fechamento: null, linhas: [] });
  });

  it("enviado: a apuração conferida conta a conta, as linhas e a contestação", () => {
    const f = ler(ENVIADO);
    expect(f.fechamento).toMatchObject({ id: FECHAMENTO, situacao: "enviado", totalCalculado: 30_000, totalAprovado: null, enviadoPor: GERENTE, enviadoEm: ENVIADO_EM, aprovadoEm: null });
    expect(f.fechamento?.apuracao.vendedores.map((v) => [v.vendedorId, v.total])).toEqual([[ANA, 30_000], [BETO, 0]]);
    expect(f.linhas[1]).toEqual({
      vendedorId: BETO, totalCalculado: 0, totalAprovado: null, ajusteMotivo: null, aprovadoEm: null,
      contestacao: { motivo: CONTESTACAO.motivo, contestadaEm: ENVIADO_EM, decisao: null, resposta: null, decididaEm: null },
    });
    expect(linhaDoVendedor(f, BETO)?.contestacao?.motivo).toBe(CONTESTACAO.motivo);
    expect(linhaDoVendedor(f, DONO)).toBeNull();
    expect(linhaDoVendedor(null, ANA)).toBeNull();
  });

  it("aprovado: o valor de cada um, o motivo do ajuste e a decisão do dono", () => {
    const f = ler(APROVADO);
    expect(f.fechamento).toMatchObject({ situacao: "aprovado", totalAprovado: 60_000, aprovadoPor: DONO, aprovadoEm: APROVADO_EM });
    expect(f.linhas.map((l) => [l.vendedorId, l.totalCalculado, l.totalAprovado, l.ajusteMotivo, l.contestacao?.decisao ?? null])).toEqual([
      [ANA, 30_000, 30_000, null, null], [BETO, 0, 30_000, AJUSTE, "ajustado"],
    ]);
  });

  it("o vendedor: nunca o fechamento, só a própria linha e sem contestação", () => {
    const propria = { mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [linha(ANA, 30_000, { total_aprovado: 30_000, aprovado_em: APROVADO_EM })] };
    expect(ler(propria, { ...PEDIDO, eu: ANA }).linhas).toEqual([{ vendedorId: ANA, totalCalculado: 30_000, totalAprovado: 30_000, ajusteMotivo: null, aprovadoEm: APROVADO_EM, contestacao: null }]);
    expect(ler({ ...propria, linhas: [] }, { ...PEDIDO, eu: ANA }).linhas).toEqual([]);
    recusa(propria, { ...PEDIDO, eu: BETO });
    recusa(ENVIADO, { ...PEDIDO, eu: ANA });
    recusa({ ...propria, linhas: [linha(ANA, 30_000, { contestacao: CONTESTACAO })] }, { ...PEDIDO, eu: ANA });
    recusa({ ...propria, linhas: [linha(ANA, 30_000), linha(BETO, 0)] }, { ...PEDIDO, eu: ANA });
  });

  it("o que não fecha é falha, nunca bônus", () => {
    recusa({ ...ENVIADO, mes: "2026-09-01" });
    recusa({ ...ENVIADO, unidade_id: GERENTE });
    recusa({ mes: "2026-10-01", unidade_id: LOJA, fechamento: null, linhas: [linha(ANA, 30_000)] });
    // Linhas e apuração não batem.
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000)));
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000), linha(BETO, 1)));
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000), linha(ANA, 30_000)));
    // A conta da apuração não confere com as faixas.
    recusa({ ...ENVIADO, fechamento: { ...ENVIADO.fechamento, apuracao: { ...APURACAO, vendedores: [{ ...APURACAO.vendedores[0], total: 50_000, medidas: { connect: { ...APURACAO.vendedores[0]?.medidas.connect, bonus: 50_000, faixa: 2 } } }, APURACAO.vendedores[1]] } } });
    recusa({ ...ENVIADO, fechamento: { ...ENVIADO.fechamento, total_calculado: 1 } });
    // Situação e linhas desencontradas.
    recusa({ ...ENVIADO, fechamento: { ...ENVIADO.fechamento, situacao: "aprovado" } });
    recusa({ ...ENVIADO, fechamento: { ...ENVIADO.fechamento, situacao: "cancelado" } });
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000, { total_aprovado: 30_000, aprovado_em: APROVADO_EM }), linha(BETO, 0)));
    recusa(comLinhas(APROVADO, APROVADO.linhas[0] as Record<string, unknown>, linha(BETO, 0)));
    recusa({ ...APROVADO, fechamento: { ...APROVADO.fechamento, total_aprovado: 59_999 } });
    // Ajuste sem motivo, motivo sem ajuste, decisão que não bate com o valor, contestação decidida antes da aprovação.
    recusa(comLinhas(APROVADO, APROVADO.linhas[0] as Record<string, unknown>, { ...APROVADO.linhas[1], ajuste_motivo: null }));
    recusa(comLinhas(APROVADO, { ...APROVADO.linhas[0], ajuste_motivo: "Sem ajuste" }, APROVADO.linhas[1] as Record<string, unknown>));
    recusa(comLinhas(APROVADO, APROVADO.linhas[0] as Record<string, unknown>, { ...APROVADO.linhas[1], contestacao: { ...CONTESTACAO, decisao: "mantido", decidida_em: APROVADO_EM } }));
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000), linha(BETO, 0, { contestacao: { ...CONTESTACAO, decisao: "mantido", decidida_em: APROVADO_EM } })));
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000), linha(BETO, 0, { contestacao: { ...CONTESTACAO, resposta: "Antes da hora" } })));
    recusa(comLinhas(ENVIADO, linha(ANA, 30_000), linha(BETO, 0, { contestacao: { ...CONTESTACAO, contestada_em: "ontem" } })));
    recusa(comLinhas(ENVIADO, linha("Ana", 30_000), linha(BETO, 0)));
  });

  it("os fechamentos do mês por loja (o quadro do dono)", () => {
    const lojas = lerFechamentosDoMes([
      { unidade_id: LOJA, situacao: "aprovado", total_calculado: 30_000, total_aprovado: 60_000, enviado_em: ENVIADO_EM, aprovado_em: APROVADO_EM },
      { unidade_id: GERENTE, situacao: "enviado", total_calculado: 10_000, total_aprovado: null, enviado_em: ENVIADO_EM, aprovado_em: null },
    ]);
    expect(lojas.map((l) => [l.situacao, l.totalAprovado])).toEqual([["aprovado", 60_000], ["enviado", null]]);
    expect(() => lerFechamentosDoMes([{ unidade_id: LOJA, situacao: "enviado", total_calculado: 1, total_aprovado: 1, enviado_em: ENVIADO_EM, aprovado_em: null }])).toThrow(RespostaInesperada);
    expect(() => lerFechamentosDoMes({})).toThrow(RespostaInesperada);
  });
});

/** Um formulário de mentira com get e getAll, como o FormData. */
function campos(valores: Record<string, string | string[]>) {
  return {
    get: (nome: string) => { const v = valores[nome]; return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); },
    getAll: (nome: string) => { const v = valores[nome]; return v === undefined ? [] : Array.isArray(v) ? v : [v]; },
  };
}

describe("formulários do fechamento", () => {
  const TOTAIS = totaisNoCampo([{ vendedorId: ANA, total: 30_000 }, { vendedorId: BETO, total: 0 }]);
  it("a conferência da gerência: os totais da tela e as contestações com motivo", () => {
    expect(TOTAIS).toBe(JSON.stringify({ [ANA]: 30_000, [BETO]: 0 }));
    expect(validarConferencia(campos({ mes: "2026-10-01", loja: LOJA, totais: TOTAIS, contestar: BETO, [`motivo_${BETO}`]: "  Faltou a   ativação de 31/10 " }))).toEqual({
      ok: true, dados: { mes: "2026-10-01", unidade: LOJA, totais: { [ANA]: 30_000, [BETO]: 0 }, contestacoes: { [BETO]: "Faltou a ativação de 31/10" } },
    });
    expect(validarConferencia(campos({ mes: "2026-10-01", loja: LOJA, totais: TOTAIS }))).toMatchObject({ ok: true, dados: { contestacoes: {} } });
    const erro = (valores: Record<string, string | string[]>) => {
      const r = validarConferencia(campos({ mes: "2026-10-01", loja: LOJA, totais: TOTAIS, ...valores }));
      return r.ok ? null : r.erro;
    };
    expect(erro({ contestar: BETO, [`motivo_${BETO}`]: "  a " })).toBe("motivo");
    expect(erro({ contestar: BETO })).toBe("motivo");
    expect(erro({ contestar: BETO, [`motivo_${BETO}`]: "x".repeat(301) })).toBe("motivo");
    expect(erro({ contestar: DONO, [`motivo_${DONO}`]: "Não está no mês" })).toBe("dados");
    expect(erro({ contestar: [BETO, BETO], [`motivo_${BETO}`]: "Duas vezes" })).toBe("dados");
    expect(erro({ totais: "{" })).toBe("dados");
    expect(erro({ totais: "{}" })).toBe("dados");
    expect(erro({ totais: JSON.stringify({ [ANA]: -1 }) })).toBe("dados");
    expect(erro({ totais: JSON.stringify({ Ana: 1 }) })).toBe("dados");
    expect(erro({ mes: "2026-10" })).toBe("dados");
    expect(erro({ loja: "loja" })).toBe("dados");
  });

  it("a aprovação do dono: cada contestação decidida; pagar outro valor em reais, com motivo", () => {
    const base = { fechamento: FECHAMENTO, mes: "2026-10-01", loja: LOJA, linhas: [ANA, BETO], contestadas: BETO };
    expect(validarAprovacao(campos({ ...base, [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "300,00", [`motivo_${BETO}`]: AJUSTE }))).toEqual({
      ok: true, dados: { fechamento: FECHAMENTO, mes: "2026-10-01", unidade: LOJA, decisoes: { [BETO]: { decisao: "ajustar", valor: 30_000, motivo: AJUSTE } } },
    });
    // Manter a contestada leva a resposta (se houver); a linha sem contestação mantida não vai ao banco.
    expect(validarAprovacao(campos({ ...base, [`decisao_${BETO}`]: "manter", [`motivo_${BETO}`]: "A meta era 4", [`decisao_${ANA}`]: "manter" }))).toMatchObject({
      ok: true, dados: { decisoes: { [BETO]: { decisao: "manter", motivo: "A meta era 4" } } },
    });
    expect(validarAprovacao(campos({ ...base, [`decisao_${BETO}`]: "manter" }))).toMatchObject({ ok: true, dados: { decisoes: { [BETO]: { decisao: "manter" } } } });
    // A linha sem contestação também pode ter outro valor, com motivo.
    expect(validarAprovacao(campos({ ...base, [`decisao_${BETO}`]: "manter", [`decisao_${ANA}`]: "ajustar", [`valor_${ANA}`]: "0", [`motivo_${ANA}`]: "Saiu antes do fim do mês" }))).toMatchObject({
      ok: true, dados: { decisoes: { [ANA]: { decisao: "ajustar", valor: 0, motivo: "Saiu antes do fim do mês" }, [BETO]: { decisao: "manter" } } },
    });
    const erro = (valores: Record<string, string | string[]>) => {
      const r = validarAprovacao(campos({ ...base, ...valores }));
      return r.ok ? null : r.erro;
    };
    expect(erro({})).toBe("decidir");
    expect(erro({ [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "abc", [`motivo_${BETO}`]: AJUSTE })).toBe("valor");
    expect(erro({ [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "", [`motivo_${BETO}`]: AJUSTE })).toBe("valor");
    expect(erro({ [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "400.000,01", [`motivo_${BETO}`]: AJUSTE })).toBe("valor");
    expect(erro({ [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "-1,00", [`motivo_${BETO}`]: AJUSTE })).toBe("valor");
    expect(erro({ [`decisao_${BETO}`]: "ajustar", [`valor_${BETO}`]: "300,00" })).toBe("motivo");
    expect(erro({ [`decisao_${BETO}`]: "manter", [`motivo_${BETO}`]: "x" })).toBe("motivo");
    expect(erro({ [`decisao_${BETO}`]: "aceitar" })).toBe("dados");
    expect(erro({ contestadas: DONO })).toBe("dados");
    expect(erro({ linhas: [ANA, ANA] })).toBe("dados");
    expect(erro({ fechamento: "x" })).toBe("dados");
  });

  it("a recusa do banco vira a mensagem da tela", () => {
    const de = (message: string, code = "22023") => erroDoFechamento({ code, message });
    expect(de("Os números do mês mudaram desde que a tela abriu: confira de novo")).toBe("mudou");
    expect(de("O fechamento deste mês já foi enviado")).toBe("ja_enviado");
    expect(de("Este fechamento já foi aprovado")).toBe("ja_aprovado");
    expect(de("O mês ainda não terminou: o fechamento abre no dia 1º do mês seguinte")).toBe("mes_aberto");
    expect(de("Nenhuma regra de bônus valia neste mês: não há o que fechar")).toBe("nada");
    expect(de("Ninguém teve meta ou venda neste mês: não há o que fechar")).toBe("nada");
    expect(de("Decida cada contestação: manter o valor ou pagar outro")).toBe("decidir");
    expect(de("Para pagar o valor calculado, escolha manter")).toBe("igual");
    expect(de("O valor a pagar vai de R$ 0,00 a R$ 400.000,00")).toBe("valor");
    expect(de("Diga o motivo de pagar outro valor: o vendedor vê")).toBe("motivo");
    expect(de("Cada contestação tem um motivo de 3 a 300 letras")).toBe("motivo");
    expect(de("Contestação de quem não está no fechamento")).toBe("dados");
    expect(de("Só o dono aprova o pagamento do bônus", "42501")).toBe("permissao");
    expect(de("timeout", "57014")).toBe("falha");
    expect(erroDoFechamento(null)).toBe("falha");
  });
});

describe("planilha e meses do fechamento", () => {
  it("só o fechamento aprovado vira planilha: um vendedor por linha, em ordem de nome, e o total", () => {
    const nomes = new Map([[ANA, "Ana (teste)"], [BETO, "Beto (teste)"]]);
    expect(planilhaDoFechamento(ler(ENVIADO), nomes)).toBeNull();
    expect(planilhaDoFechamento(ler(APROVADO), nomes)).toEqual({
      colunas: ["Vendedor", "Bônus calculado (R$)", "Bônus aprovado (R$)", "Motivo do ajuste", "Contestação da gerência", "Decisão do dono"],
      linhas: [
        ["Ana (teste)", "300,00", "300,00", "", "", ""],
        ["Beto (teste)", "0,00", "300,00", AJUSTE, CONTESTACAO.motivo, "Pagou outro valor"],
        ["Total", "300,00", "600,00", "", "", ""],
      ],
    });
  });

  it("os seis meses que já terminaram, do mais antigo ao mais recente", () => {
    expect(mesesParaFechar("2026-11-01")).toEqual(["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);
    expect(mesesParaFechar("2027-02-01")).toEqual(["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01", "2027-01-01"]);
  });
});

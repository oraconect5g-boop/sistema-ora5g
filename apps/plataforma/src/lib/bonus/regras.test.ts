// Regras puras do bônus por meta (lote L9a): a conta de cada medida refeita aqui, a leitura estrita
// das respostas do banco (o que não fecha vira falha, nunca bônus), as versões, o formulário do dono
// e as frases. A soma no banco está provada em packages/banco/src/bonus.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import {
  contaDaMedida, erroDoBonus, faixasParaOBanco, faixasValidas, fraseDaConta, lerBonusDoMes, lerExtrato, lerVersoes, regraNoMes, resumoDasFaixas,
  validarRegras, valorDaFaixaNoCampo,
} from "./regras";

const ANA = "00000000-0000-4000-8000-00000000a001";
const BETO = "00000000-0000-4000-8000-00000000a002";
const LOJA = "00000000-0000-4000-8000-0000000000cc";
const f = (aPartirDe: number, valor: number) => ({ aPartirDe, valor });
const fb = (a_partir_de: number, valor: number) => ({ a_partir_de, valor });

describe("a conta de uma medida", () => {
  const faixas = [f(100, 30_000), f(120, 50_000)];
  it("a maior faixa alcançada vale; a próxima diz quanto falta, em inteiros, sem arredondar", () => {
    expect(contaDaMedida(150_000, 157_800, faixas)).toEqual({ meta: 150_000, realizado: 157_800, faixa: 1, bonus: 30_000, proxima: { faixa: 2, aPartirDe: 120, valor: 50_000, falta: 22_200 } });
    expect(contaDaMedida(150_000, 180_000, faixas)).toMatchObject({ faixa: 2, bonus: 50_000, proxima: null });
    expect(contaDaMedida(157_800, 157_800, faixas)).toMatchObject({ faixa: 1, bonus: 30_000 });
    expect(contaDaMedida(157_801, 157_800, faixas)).toMatchObject({ faixa: null, bonus: 0, proxima: { faixa: 1, falta: 1 } });
    // ⌈meta × X ÷ 100⌉: meta 3 a 50% pede 2 (1,5 arredonda para cima).
    expect(contaDaMedida(3, 0, [f(50, 1_000)])).toMatchObject({ proxima: { falta: 2 } });
    // Devolução de outro mês deixa o realizado negativo: nenhuma faixa, falta mais.
    expect(contaDaMedida(100, -20, [f(100, 1_000)])).toMatchObject({ faixa: null, proxima: { falta: 120 } });
  });
  it("sem meta, sem faixa e sem bônus", () => {
    expect(contaDaMedida(null, 900_000, faixas)).toEqual({ meta: null, realizado: 900_000, faixa: null, bonus: 0, proxima: null });
  });
  it("faixas válidas: de 1 a 5, crescentes, nos limites", () => {
    expect(faixasValidas(faixas)).toBe(true);
    expect(faixasValidas([])).toBe(false);
    expect(faixasValidas([f(100, 1), f(100, 2)])).toBe(false);
    expect(faixasValidas([f(100, 2), f(120, 2)])).toBe(false);
    expect(faixasValidas([f(0, 1)])).toBe(false);
    expect(faixasValidas([f(501, 1)])).toBe(false);
    expect(faixasValidas([f(100, 10_000_001)])).toBe(false);
    expect(faixasValidas([f(10, 1), f(20, 2), f(30, 3), f(40, 4), f(50, 5), f(60, 6)])).toBe(false);
  });
});

describe("leitura do bônus do mês", () => {
  const RESPOSTA = {
    mes: "2026-11-01", regra_contagem: 1,
    regras: {
      vendido_liquido: { vigente_desde: "2026-10-01", versao: 3, faixas: [fb(100, 30_000), fb(120, 50_000)] },
      connect: { vigente_desde: "2026-11-01", versao: "5", faixas: [fb(50, 5_000)] },
    },
    vendedores: [
      { vendedor_id: ANA, total: 5_000, medidas: {
        vendido_liquido: { meta: 2_000_000, realizado: "1200000", faixa: null, bonus: 0, proxima: { faixa: 1, a_partir_de: 100, valor: 30_000, falta: 800_000 } },
        connect: { meta: 10, realizado: 6, faixa: 1, bonus: 5_000, proxima: null },
      } },
      { vendedor_id: BETO, total: 0, medidas: {
        vendido_liquido: { meta: null, realizado: 1_400_000, faixa: null, bonus: 0, proxima: null },
        connect: { meta: null, realizado: 3, faixa: null, bonus: 0, proxima: null },
      } },
    ],
  };
  const copia = () => JSON.parse(JSON.stringify(RESPOSTA)) as typeof RESPOSTA;
  it("converte as regras e cada conta, conferindo a conta e o total", () => {
    const b = lerBonusDoMes(RESPOSTA, { mes: "2026-11-01" });
    expect(b.regras).toEqual({
      vendido_liquido: { vigenteDesde: "2026-10-01", versao: 3, faixas: [f(100, 30_000), f(120, 50_000)] },
      connect: { vigenteDesde: "2026-11-01", versao: 5, faixas: [f(50, 5_000)] },
    });
    expect(b.vendedores.map((v) => [v.vendedorId, v.total, v.medidas.connect?.faixa])).toEqual([[ANA, 5_000, 1], [BETO, 0, null]]);
  });
  it("o que não fecha vira falha: conta diferente da refeita, total errado, medida faltando ou sobrando, regra estranha", () => {
    const casos: [string, (r: ReturnType<typeof copia>) => void][] = [
      ["bônus de faixa não alcançada", (r) => { r.vendedores[0]!.medidas.vendido_liquido.bonus = 30_000; r.vendedores[0]!.total = 35_000; }],
      ["faixa errada", (r) => { (r.vendedores[0]!.medidas.connect as { faixa: number | null }).faixa = null; }],
      ["falta errada", (r) => { r.vendedores[0]!.medidas.vendido_liquido.proxima!.falta = 1; }],
      ["total diferente da soma", (r) => { r.vendedores[0]!.total = 1; }],
      ["medida sem regra", (r) => { (r.vendedores[1]!.medidas as Record<string, unknown>).aparelhos = { meta: null, realizado: 0, faixa: null, bonus: 0, proxima: null }; }],
      ["medida faltando", (r) => { delete (r.vendedores[1]!.medidas as Record<string, unknown>).connect; }],
      ["regra de outro mês à frente", (r) => { r.regras.connect.vigente_desde = "2026-12-01"; }],
      ["faixas fora de ordem", (r) => { r.regras.vendido_liquido.faixas = [fb(120, 50_000), fb(100, 30_000)]; }],
      ["medida desconhecida", (r) => { (r.regras as Record<string, unknown>).lucro = r.regras.connect; }],
      ["outra regra de contagem", (r) => { r.regra_contagem = 2; }],
      ["outro mês", (r) => { r.mes = "2026-10-01"; }],
      ["vendedor repetido", (r) => { r.vendedores[1]!.vendedor_id = ANA; }],
    ];
    for (const [nome, estragar] of casos) {
      const r = copia();
      estragar(r);
      expect(() => lerBonusDoMes(r, { mes: "2026-11-01" }), nome).toThrow(RespostaInesperada);
    }
  });
  it("sem regra: nenhuma medida em ninguém", () => {
    expect(lerBonusDoMes({ mes: "2026-11-01", regra_contagem: 1, regras: {}, vendedores: [{ vendedor_id: ANA, total: 0, medidas: {} }] }, { mes: "2026-11-01" }).vendedores).toEqual([{ vendedorId: ANA, total: 0, medidas: {} }]);
  });
});

describe("leitura do extrato", () => {
  const linha = (tipo: string, quando: string, extra: Record<string, unknown>) => ({ tipo, quando, venda: null, devolucao: null, operacao: null, servico: null, vendido_liquido: 0, aparelhos: 0, acessorios: 0, connect: 0, ...extra });
  const RESPOSTA = {
    mes: "2026-11-01", regra_contagem: 1, unidade_id: LOJA, vendedor_id: ANA, quantidade: 4,
    totais: { vendido_liquido: 157_800, aparelhos: 1, acessorios: 7_900, connect: 1 },
    linhas: [
      linha("connect", "2026-11-13T18:00:00+00:00", { operacao: 45, servico: "ativacao", connect: 1 }),
      linha("devolucao", "2026-11-12T18:00:00+00:00", { venda: 10, devolucao: 2, vendido_liquido: -7_900, acessorios: -7_900 }),
      linha("venda", "2026-11-10T18:00:00+00:00", { venda: 10, vendido_liquido: 165_700, aparelhos: 1, acessorios: 15_800 }),
      // 1/11 às 00:30 em São Paulo (03:30 UTC): ainda é novembro.
      linha("venda", "2026-11-01T03:30:00+00:00", { venda: 9, vendido_liquido: 0 }),
    ],
  };
  const pedido = { mes: "2026-11-01", unidade: LOJA, vendedor: ANA };
  const copia = () => JSON.parse(JSON.stringify(RESPOSTA)) as typeof RESPOSTA;
  it("converte as linhas e confere que somam o total", () => {
    const e = lerExtrato(RESPOSTA, pedido);
    expect(e.linhas.map((l) => [l.tipo, l.venda, l.efeito.vendido_liquido])).toEqual([["connect", null, 0], ["devolucao", 10, -7_900], ["venda", 10, 165_700], ["venda", 9, 0]]);
    expect(e.totais).toEqual(RESPOSTA.totais);
  });
  it("forma inesperada vira falha", () => {
    const casos: [string, (r: ReturnType<typeof copia>) => void][] = [
      ["soma diferente do total", (r) => { r.totais.vendido_liquido = 1; }],
      ["venda negativa", (r) => { r.linhas[2]!.vendido_liquido = -1; r.totais.vendido_liquido -= 165_701; }],
      ["devolução sem número", (r) => { r.linhas[1]!.devolucao = null; }],
      ["connect sem serviço", (r) => { r.linhas[0]!.servico = null; }],
      ["serviço desconhecido", (r) => { (r.linhas[0] as Record<string, unknown>).servico = "plano"; }],
      ["fato de outro mês (31/10 às 23:59 em São Paulo)", (r) => { r.linhas[3]!.quando = "2026-11-01T02:59:00+00:00"; }],
      ["fora de ordem", (r) => { r.linhas[3]!.quando = "2026-11-20T10:00:00+00:00"; }],
      ["tipo desconhecido", (r) => { r.linhas[3]!.tipo = "troca"; }],
      ["menos linhas que a quantidade, sem estar no limite", (r) => { r.quantidade = 5; }],
      ["outro vendedor", (r) => { r.vendedor_id = BETO; }],
      ["outra regra de contagem", (r) => { r.regra_contagem = 2; }],
    ];
    for (const [nome, estragar] of casos) {
      const r = copia();
      estragar(r);
      expect(() => lerExtrato(r, pedido), nome).toThrow(RespostaInesperada);
    }
  });
});

describe("as versões das regras", () => {
  const V = [
    { versao: 7, medida: "aparelhos", vigente_desde: "2026-12-01", faixas: [fb(100, 99_900)], motivo: "Bônus maior", definida_em: "2026-11-13T10:00:00Z" },
    { versao: 6, medida: "aparelhos", vigente_desde: "2026-11-01", faixas: null, motivo: "Pausa", definida_em: "2026-11-12T10:00:00Z" },
    { versao: 5, medida: "aparelhos", vigente_desde: "2026-10-01", faixas: [fb(100, 10_000)], motivo: null, definida_em: "2026-10-02T10:00:00Z" },
  ];
  it("lê da mais nova para a mais antiga e acha a regra que vale em cada mês", () => {
    const versoes = lerVersoes(V);
    expect(regraNoMes(versoes, "aparelhos", "2026-10-01")).toEqual([f(100, 10_000)]);
    expect(regraNoMes(versoes, "aparelhos", "2026-11-01")).toBeNull();
    expect(regraNoMes(versoes, "aparelhos", "2027-03-01")).toEqual([f(100, 99_900)]);
    expect(regraNoMes(versoes, "aparelhos", "2026-09-01")).toBeNull();
    expect(regraNoMes(versoes, "connect", "2026-11-01")).toBeNull();
  });
  it("forma inesperada vira falha", () => {
    expect(() => lerVersoes([V[2], V[0]])).toThrow(RespostaInesperada);
    expect(() => lerVersoes([{ ...V[0], medida: "lucro" }])).toThrow(RespostaInesperada);
    expect(() => lerVersoes([{ ...V[0], vigente_desde: "2026-12-05" }])).toThrow(RespostaInesperada);
  });
});

describe("o formulário do dono", () => {
  const campos = (valores: Record<string, string>) => (nome: string) => valores[nome] ?? null;
  it("lê as faixas de cada medida, põe em ordem de porcentagem e manda as quatro medidas", () => {
    const r = validarRegras(campos({
      desde: "2026-11-01",
      pct_vendido_liquido_1: "120", valor_vendido_liquido_1: "500,00", pct_vendido_liquido_2: "100%", valor_vendido_liquido_2: "R$ 300",
      pct_connect_3: "50", valor_connect_3: "1.000,50", motivo: "  Campanha   de Natal ",
    }));
    expect(r).toEqual({ ok: true, dados: {
      vigenteDesde: "2026-11-01", motivo: "Campanha de Natal",
      faixas: { vendido_liquido: [f(100, 30_000), f(120, 50_000)], aparelhos: null, acessorios: null, connect: [f(50, 100_050)] },
    } });
    if (r.ok) expect(faixasParaOBanco(r.dados.faixas)).toEqual({ vendido_liquido: [fb(100, 30_000), fb(120, 50_000)], aparelhos: null, acessorios: null, connect: [fb(50, 100_050)] });
  });
  it("cada erro com a sua mensagem", () => {
    const base = { desde: "2026-11-01" };
    expect(validarRegras(campos({ desde: "2026-11-05" }))).toEqual({ ok: false, erro: "dados" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100" }))).toEqual({ ok: false, erro: "incompleta" });
    expect(validarRegras(campos({ ...base, valor_aparelhos_1: "100,00" }))).toEqual({ ok: false, erro: "incompleta" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "0", valor_aparelhos_1: "100,00" }))).toEqual({ ok: false, erro: "porcentagem" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100,5", valor_aparelhos_1: "100,00" }))).toEqual({ ok: false, erro: "porcentagem" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100", valor_aparelhos_1: "cem" }))).toEqual({ ok: false, erro: "valor" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100", valor_aparelhos_1: "100.000,01" }))).toEqual({ ok: false, erro: "valor" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100", valor_aparelhos_1: "300,00", pct_aparelhos_2: "120", valor_aparelhos_2: "200,00" }))).toEqual({ ok: false, erro: "ordem" });
    expect(validarRegras(campos({ ...base, pct_aparelhos_1: "100", valor_aparelhos_1: "300,00", pct_aparelhos_2: "100", valor_aparelhos_2: "400,00" }))).toEqual({ ok: false, erro: "ordem" });
    expect(validarRegras(campos({ ...base, motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
  });
  it("traduz a recusa do banco", () => {
    expect(erroDoBonus({ code: "42501" })).toBe("permissao");
    expect(erroDoBonus({ code: "22023", message: "Diga o motivo de mudar ou retirar a regra" })).toBe("motivo");
    expect(erroDoBonus({ code: "22023", message: "A regra vale a partir deste mês ou de um dos próximos 12: o mês que já terminou não muda" })).toBe("mes");
    expect(erroDoBonus({ code: "22023", message: "As faixas vão da menor para a maior: porcentagem e bônus crescentes" })).toBe("ordem");
    expect(erroDoBonus({ code: "22023", message: "Medida do bônus desconhecida" })).toBe("dados");
    expect(erroDoBonus({ code: "08006" })).toBe("falha");
  });
});

describe("frases", () => {
  const faixas = [f(100, 30_000), f(120, 50_000)];
  it("onde a pessoa está e quanto falta, no mês que corre e no que terminou", () => {
    expect(fraseDaConta("vendido_liquido", contaDaMedida(150_000, 157_800, faixas), faixas, false)).toBe("Faixa 1 de 2: R$ 300,00. Faltam R$ 222,00 para 120% da meta (R$ 500,00).");
    expect(fraseDaConta("aparelhos", contaDaMedida(2, 1, faixas), faixas, false)).toBe("Falta 1 aparelho para 100% da meta (R$ 300,00).");
    expect(fraseDaConta("aparelhos", contaDaMedida(2, 1, faixas), faixas, true)).toBe("Nenhuma faixa alcançada. Faltou 1 aparelho para 100% da meta (R$ 300,00).");
    expect(fraseDaConta("connect", contaDaMedida(10, 13, faixas), faixas, false)).toBe("Faixa 2 de 2: R$ 500,00. Maior faixa alcançada.");
    expect(fraseDaConta("acessorios", contaDaMedida(null, 900, faixas), faixas, false)).toBe("Sem meta de acessórios no mês: esta medida não paga bônus.");
    expect(fraseDaConta("aparelhos", contaDaMedida(4, 1, faixas), faixas, true)).toBe("Nenhuma faixa alcançada. Faltaram 3 aparelhos para 100% da meta (R$ 300,00).");
    expect(fraseDaConta("acessorios", contaDaMedida(10_000, 9_850, faixas), faixas, false)).toBe("Falta R$ 1,50 para 100% da meta (R$ 300,00).");
    expect(resumoDasFaixas(faixas)).toBe("100%: R$ 300,00 · 120%: R$ 500,00");
    expect(valorDaFaixaNoCampo(100_050)).toBe("1.000,50");
  });
});

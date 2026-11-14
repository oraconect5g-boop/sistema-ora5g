// Contas a pagar (lote L8a): regras da tela e leitura estrita do resumo. Dados fictícios. As regras do banco
// estão em packages/banco/src/contas-a-pagar.test.ts.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { lerResumoDasContas } from "./consulta";
import {
  ehDia, erroDasContas, filtroDasContas, filtroNoEndereco, hojeEmSaoPaulo, lerCategoria, lerCorrecao, lerLancamento, lerMotivo, lerPagamento,
  parcelaDaConta, prazoDaConta, visaoDasContas,
} from "./regras";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const CATEGORIA = "00000000-0000-4000-9000-0000000000a1";
const CONTA = "00000000-0000-4000-9000-0000000000b1";
const form = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

describe("prazos, parcelas, datas e filtros", () => {
  it("o selo do prazo: vencida, ontem, hoje, amanhã, na semana e depois", () => {
    expect(prazoDaConta("2026-11-01", "2026-11-13")).toEqual({ rotulo: "vencida há 12 dias", tom: "perigo" });
    expect(prazoDaConta("2026-11-12", "2026-11-13")).toEqual({ rotulo: "venceu ontem", tom: "perigo" });
    expect(prazoDaConta("2026-11-13", "2026-11-13")).toEqual({ rotulo: "vence hoje", tom: "aviso" });
    expect(prazoDaConta("2026-11-14", "2026-11-13")).toEqual({ rotulo: "vence amanhã", tom: "info" });
    expect(prazoDaConta("2026-11-20", "2026-11-13")).toEqual({ rotulo: "vence em 7 dias", tom: "info" });
    expect(prazoDaConta("2026-12-13", "2026-11-13")).toEqual({ rotulo: "vence em 30 dias", tom: "neutro" });
  });

  it("parcela e mês só nas contas que se repetem; o dia é conferido de verdade; hoje é o de São Paulo", () => {
    expect(parcelaDaConta("unica", 1, 1)).toBeNull();
    expect(parcelaDaConta("parcelada", 2, 3)).toBe("parcela 2 de 3");
    expect(parcelaDaConta("mensal", 5, 12)).toBe("mês 5 de 12");
    expect([ehDia("2026-02-28"), ehDia("2026-02-30"), ehDia("2026-13-01"), ehDia("13/11/2026")]).toEqual([true, false, false, false]);
    // 01:30 em UTC ainda é o dia anterior em São Paulo.
    expect(hojeEmSaoPaulo(new Date("2026-11-14T01:30:00Z"))).toBe("2026-11-13");
    expect([visaoDasContas("pagas"), visaoDasContas("canceladas"), visaoDasContas("x"), visaoDasContas(["pagas"])]).toEqual(["pagas", "canceladas", "abertas", "abertas"]);
    expect(filtroDasContas("rede")).toEqual({ tipo: "rede" });
    expect(filtroDasContas(LOJA)).toEqual({ tipo: "loja", id: LOJA });
    expect(filtroDasContas("__proto__")).toEqual({ tipo: "todas" });
    expect([filtroNoEndereco({ tipo: "todas" }), filtroNoEndereco({ tipo: "rede" }), filtroNoEndereco({ tipo: "loja", id: LOJA })]).toEqual([null, "rede", LOJA]);
  });
});

describe("formulários", () => {
  const base = { unidade: LOJA, categoria: CATEGORIA, descricao: "  Aluguel   de novembro ", valor: "6.500,00", vencimento: "2026-11-10" };

  it("lançar: uma vez, parcelada (o total) e repetida (cada mês); a rede vira loja nula", () => {
    expect(lerLancamento(form(base))).toEqual({
      ok: true, lancamento: { unidade: LOJA, categoria: CATEGORIA, fornecedor: null, descricao: "Aluguel de novembro", documento: null, valor: 650_000, vencimento: "2026-11-10", forma: "unica", vezes: 1 },
    });
    expect(lerLancamento(form({ ...base, unidade: "rede", forma: "parcelada", vezes: "3", documento: "NF 123", fornecedor: CATEGORIA, vezesIgnorada: "x" }))).toMatchObject({
      ok: true, lancamento: { unidade: null, forma: "parcelada", vezes: 3, documento: "NF 123", fornecedor: CATEGORIA },
    });
    expect(lerLancamento(form({ ...base, forma: "mensal", vezes: "12" }))).toMatchObject({ ok: true, lancamento: { forma: "mensal", vezes: 12, valor: 650_000 } });
    // Uma vez ignora o campo de parcelas.
    expect(lerLancamento(form({ ...base, forma: "unica", vezes: "7" }))).toMatchObject({ ok: true, lancamento: { vezes: 1 } });
  });

  it("lançar: cada campo errado tem a sua mensagem, antes de ir ao banco", () => {
    const casos: [Record<string, string>, string][] = [
      [{ unidade: "loja-x" }, "loja"], [{ categoria: "" }, "categoria"], [{ fornecedor: "abc" }, "fornecedor"], [{ descricao: "ab" }, "descricao"],
      [{ documento: "x".repeat(61) }, "documento"], [{ valor: "0" }, "valor"], [{ valor: "dez" }, "valor"], [{ vencimento: "2026-02-30" }, "vencimento"],
      [{ forma: "semanal" }, "dados"], [{ forma: "parcelada", vezes: "1" }, "vezes"], [{ forma: "mensal", vezes: "37" }, "vezes"],
      [{ forma: "mensal", vezes: "2.5" }, "vezes"], [{ forma: "parcelada", vezes: "3", valor: "0,02" }, "parcelas_pequenas"],
    ];
    for (const [extra, erro] of casos) expect(lerLancamento(form({ ...base, ...extra })), JSON.stringify(extra)).toEqual({ ok: false, erro });
  });

  it("pagar, desfazer, cancelar, corrigir e categoria", () => {
    expect(lerPagamento(form({ conta: CONTA, pago_em: "2026-11-12", valor_pago: "65,40", referencia: " PIX  123 " }))).toEqual({ ok: true, conta: CONTA, pagoEm: "2026-11-12", valorPago: 6_540, referencia: "PIX 123" });
    expect(lerPagamento(form({ conta: CONTA, pago_em: "12/11/2026", valor_pago: "65,40", referencia: "PIX" }))).toEqual({ ok: false, erro: "data_pagamento" });
    expect(lerPagamento(form({ conta: CONTA, pago_em: "2026-11-12", valor_pago: "0", referencia: "PIX" }))).toEqual({ ok: false, erro: "valor_pago" });
    expect(lerPagamento(form({ conta: CONTA, pago_em: "2026-11-12", valor_pago: "1", referencia: "PX" }))).toEqual({ ok: false, erro: "referencia" });
    expect(lerPagamento(form({ conta: "x", pago_em: "2026-11-12", valor_pago: "1", referencia: "PIX" }))).toEqual({ ok: false, erro: "dados" });
    expect(lerMotivo(form({ conta: CONTA, motivo: "Contrato encerrado", seguintes: "sim" }))).toEqual({ ok: true, conta: CONTA, motivo: "Contrato encerrado", seguintes: true });
    expect(lerMotivo(form({ conta: CONTA, motivo: "Lançada em dobro" }))).toMatchObject({ ok: true, seguintes: false });
    expect(lerMotivo(form({ conta: CONTA, motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
    expect(lerCorrecao(form({ conta: CONTA, valor: "7.000,00", vencimento: "2026-11-15", motivo: "Reajuste" }))).toEqual({ ok: true, conta: CONTA, valor: 700_000, vencimento: "2026-11-15", motivo: "Reajuste" });
    expect(lerCorrecao(form({ conta: CONTA, valor: "7.000,00", vencimento: "2026-11-15", motivo: "" }))).toEqual({ ok: false, erro: "motivo" });
    expect(lerCategoria(form({ nome: " Frete " }))).toEqual({ ok: true, categoria: null, nome: "Frete", ativa: null, entra: null });
    expect(lerCategoria(form({ categoria: CATEGORIA, nome: "Frete", ativa: "nao" }))).toEqual({ ok: true, categoria: CATEGORIA, nome: "Frete", ativa: false, entra: null });
    expect(lerCategoria(form({ categoria: CATEGORIA, nome: "Frete", entra: "nao" }))).toEqual({ ok: true, categoria: CATEGORIA, nome: "Frete", ativa: null, entra: false });
    expect(lerCategoria(form({ nome: "Frete", entra: "sim" }))).toEqual({ ok: true, categoria: null, nome: "Frete", ativa: null, entra: true });
    expect(lerCategoria(form({ nome: "Frete", entra: "talvez" }))).toEqual({ ok: true, categoria: null, nome: "Frete", ativa: null, entra: null });
    expect(lerCategoria(form({ nome: "x" }))).toEqual({ ok: false, erro: "categoria_nome" });
  });

  it("o erro do banco vira a mensagem certa; o que não se reconhece é falha", () => {
    const casos: [{ code: string; message?: string }, string][] = [
      [{ code: "42501", message: "Sem permissão para lançar contas a pagar aqui" }, "permissao"],
      [{ code: "42501", message: "Só o dono ajusta as categorias das contas a pagar" }, "so_dono"],
      [{ code: "P0002", message: "Conta a pagar não encontrada para você" }, "nao_encontrada"],
      [{ code: "P0002", message: "Categoria não encontrada para você" }, "so_dono"],
      [{ code: "OR030", message: "Pagamento já registrado: desfaça antes de mudar" }, "ja_paga"],
      [{ code: "OR004" }, "dados"], [{ code: "PGRST202" }, "indisponivel"], [{ code: "57014" }, "falha"],
      [{ code: "22023", message: "O vencimento vai de um ano atrás até cinco anos à frente" }, "vencimento"],
      [{ code: "22023", message: "Parcelas ou meses: de 2 a 36" }, "vezes"],
      [{ code: "22023", message: "Valor pequeno demais para tantas parcelas" }, "parcelas_pequenas"],
      [{ code: "22023", message: "Escolha uma categoria ativa" }, "categoria"],
      [{ code: "22023", message: "Fornecedor inválido ou inativo" }, "fornecedor"],
      [{ code: "22023", message: "O valor pago vai de R$ 0,01 até o dobro do valor da conta" }, "valor_pago"],
      [{ code: "22023", message: "A data do pagamento vai de um ano atrás até hoje" }, "data_pagamento"],
      [{ code: "22023", message: "Conta paga: desfaça o pagamento antes de cancelar" }, "paga"],
      [{ code: "22023", message: "Conta cancelada: não há o que pagar" }, "cancelada"],
      [{ code: "22023", message: "Só a conta em aberto pode ser corrigida" }, "so_aberta"],
      [{ code: "22023", message: "Informe o motivo" }, "motivo"],
      [{ code: "22023", message: "Já existe uma categoria com esse nome" }, "categoria_repetida"],
      [{ code: "22023", message: "Valor inválido" }, "valor"],
      [{ code: "22023", message: "Outra coisa" }, "dados"],
    ];
    for (const [erro, chave] of casos) expect(erroDasContas(erro), JSON.stringify(erro)).toBe(chave);
  });
});

describe("leitura estrita do resumo", () => {
  const RESUMO = {
    hoje: "2026-11-13",
    abertas: { quantidade: 4, valor: 190_000 },
    vencidas: { quantidade: 1, valor: 100_000, mais_antiga_dias: 3 },
    hoje_vencem: { quantidade: 1, valor: 20_000 },
    proximos_7: { quantidade: 1, valor: 30_000 },
    proximos_30: { quantidade: 2, valor: 70_000 },
    pagas_no_mes: { quantidade: 1, valor_pago: 10_500, valor: 10_000 },
    por_categoria: [{ categoria: CATEGORIA, aberto: 140_000, pago_no_mes: 0 }, { categoria: CONTA, aberto: 50_000, pago_no_mes: 10_500 }],
    por_loja: [{ unidade: null, aberto: 100_000, vencido: 100_000 }, { unidade: LOJA, aberto: 90_000, vencido: 0 }],
    por_semana: [50_000, 0, 40_000, 0, 0, 0, 0, 0].map((valor, i) => ({ inicio: somarDias("2026-11-13", 7 * i), valor })),
    escopo: { rede: true, lojas: [{ id: LOJA, nome: "Loja A (teste)" }] },
  };

  it("converte a resposta do banco", () => {
    const r = lerResumoDasContas(RESUMO);
    expect(r.vencidas).toEqual({ quantidade: 1, valor: 100_000, maisAntigaDias: 3 });
    expect(r.porLoja[0]).toEqual({ unidade: null, aberto: 100_000, vencido: 100_000 });
    expect(r.porSemana).toHaveLength(8);
    expect(r.escopo).toEqual({ rede: true, lojas: [{ id: LOJA, nome: "Loja A (teste)" }] });
  });

  it("conta que não fecha é falha, não número: total por loja, por categoria, semanas, vencidas sem idade, forma", () => {
    const quebrados: unknown[] = [
      null, { ...RESUMO, abertas: { quantidade: 4, valor: 190_001 } },
      { ...RESUMO, por_loja: [{ unidade: null, aberto: 100_000, vencido: 100_000 }] },
      { ...RESUMO, por_categoria: [{ categoria: CATEGORIA, aberto: 190_000, pago_no_mes: 0 }] },
      { ...RESUMO, por_semana: RESUMO.por_semana.slice(0, 7) },
      { ...RESUMO, vencidas: { quantidade: 1, valor: 100_000, mais_antiga_dias: 0 } },
      { ...RESUMO, hoje: "13/11/2026" },
      { ...RESUMO, por_loja: [{ unidade: "loja-x", aberto: 100_000, vencido: 100_000 }, { unidade: LOJA, aberto: 90_000, vencido: 0 }] },
      { ...RESUMO, escopo: { rede: "sim", lojas: [] } },
      { ...RESUMO, pagas_no_mes: { quantidade: 1, valor_pago: 9_999, valor: 10_000 } },
    ];
    for (const dado of quebrados) expect(() => lerResumoDasContas(dado), JSON.stringify(dado)?.slice(0, 80)).toThrow(RespostaInesperada);
  });
});

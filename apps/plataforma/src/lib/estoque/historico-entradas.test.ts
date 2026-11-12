import { completarComDigitoVerificador } from "@ora5g/dominio";
import { describe, expect, it } from "vitest";

import { impedimentosDoEstorno, lerEntradaAberta, lerHistoricoDeEntradas, posicaoDoItem, resumoDasPosicoes, type EntradaLida } from "./historico-entradas";

// Formato das respostas de estoque_entradas e estoque_entrada (migration 20261112033713), que o banco prova
// em packages/banco/src/entrada-estoque.test.ts. IMEIs FICTÍCIOS com dígito verificador válido.
const IMEI_1 = completarComDigitoVerificador("35209900180001");
const IMEI_2 = completarComDigitoVerificador("35209900180002");
const ENTRADA = "00000000-0000-4000-9000-000000000070";

const linha = (extra: Record<string, unknown> = {}) => ({
  linha: 1, sku: "APA-0001", nome: "Galaxy A15", quantidade: 1, condicao: "seminovo", custo_unitario: 105000, reentradas: 0, saldo_livre: null, identificadores: null, ...extra,
});
const capa = (extra: Record<string, unknown> = {}) => linha({ linha: 2, sku: "ACE-0001", nome: "Capa", quantidade: 20, condicao: "novo", custo_unitario: 1700, ...extra });
const entrada = (extra: Record<string, unknown> = {}) => ({
  id: ENTRADA, numero: 12, tipo: "compra", documento: "NF 1234", situacao: "registrada", total_unidades: 21, total_custo: "139000",
  criado_em: "2026-11-11T13:00:00+00:00", criado_por: "Gerente Teste", estornado_em: null, estornado_por: null, motivo_estorno: null, fornecedor: "Distribuidora Teste",
  itens: [linha(), capa()], ...extra,
});
const pagina = (entradas: unknown[], extra: Record<string, unknown> = {}) => ({ ve_custo: true, total: entradas.length, entradas, proxima: null, ...extra });
const lida = (extra: Record<string, unknown> = {}) => lerEntradaAberta(entrada({ ve_custo: true, ...extra })) as EntradaLida;

describe("histórico de entradas: leitura do JSON do banco", () => {
  it("lê a página: custo em centavos (número ou texto de dígitos), o total da loja e de onde a página seguinte continua", () => {
    const h = lerHistoricoDeEntradas(pagina([entrada()], { total: 37, proxima: 12 }));
    expect(h).toMatchObject({ veCusto: true, total: 37, proxima: 12 });
    expect(h?.entradas).toEqual([{
      id: ENTRADA, numero: 12, tipo: "compra", documento: "NF 1234", situacao: "registrada", totalUnidades: 21, totalCusto: 139_000,
      criadoEm: "2026-11-11T13:00:00+00:00", criadoPor: "Gerente Teste", estornadoEm: null, estornadoPor: null, motivoEstorno: null, fornecedor: "Distribuidora Teste",
      itens: [
        { linha: 1, sku: "APA-0001", nome: "Galaxy A15", quantidade: 1, condicao: "seminovo", custoUnitario: 105_000, reentradas: 0, saldoLivre: null, identificadores: null },
        { linha: 2, sku: "ACE-0001", nome: "Capa", quantidade: 20, condicao: "novo", custoUnitario: 1_700, reentradas: 0, saldoLivre: null, identificadores: null },
      ],
    }]);
  });

  it("custo escondido (sem custo.ver) ou não informado continua nulo: nunca vira zero", () => {
    const h = lerHistoricoDeEntradas(pagina([entrada({ total_custo: null, itens: [linha({ custo_unitario: null })] })], { ve_custo: false }));
    expect(h?.veCusto).toBe(false);
    expect(h?.entradas[0]?.totalCusto).toBeNull();
    expect(h?.entradas[0]?.itens[0]?.custoUnitario).toBeNull();
    expect(h?.proxima).toBeNull();
  });

  it("loja sem entradas é resposta válida (lista vazia), diferente de formato inesperado", () => {
    expect(lerHistoricoDeEntradas(pagina([]))).toEqual({ veCusto: true, total: 0, entradas: [], proxima: null });
  });

  it("formato inesperado é falha (nulo), nunca lista vazia nem zero", () => {
    const ruins: unknown[] = [
      null, undefined, "texto", 7, [], {},
      { ve_custo: true, total: 1, proxima: null },
      pagina([], { entradas: {} }),
      pagina([], { ve_custo: "sim" }),
      pagina([], { total: "muitas" }),
      pagina([], { total: null }),
      pagina([], { proxima: "depois" }),
      pagina([null]),
      pagina([entrada({ id: 70 })]),
      pagina([entrada({ numero: null })]),
      pagina([entrada({ criado_em: "ontem" })]),
      pagina([entrada({ criado_em: null })]),
      pagina([entrada({ estornado_em: "depois" })]),
      pagina([entrada({ total_custo: 1390.5 })]),
      pagina([entrada({ total_unidades: "9007199254740993" })]),
      pagina([entrada({ itens: null })]),
      pagina([entrada({ itens: [linha({ sku: 7 })] })]),
      pagina([entrada({ itens: [linha({ reentradas: null })] })]),
      pagina([entrada({ itens: [linha({ identificadores: "nenhum" })] })]),
      pagina([entrada({ itens: [linha({ identificadores: [{ identificador: IMEI_1, situacao: "vendido", livre: "não", reentrada: false }] })] })]),
      pagina([entrada({ itens: [linha({ identificadores: [{ identificador: IMEI_1, situacao: "vendido", livre: false }] })] })]),
    ];
    for (const ruim of ruins) expect(lerHistoricoDeEntradas(ruim), JSON.stringify(ruim)).toBeNull();
  });

  it("lê a entrada aberta: cada IMEI/ICCID com a posição de hoje e a reentrada; linha por quantidade com o saldo livre", () => {
    const e = lerEntradaAberta(entrada({
      ve_custo: true, situacao: "estornada", estornado_em: "2026-11-11T15:30:00+00:00", estornado_por: "Dono Teste", motivo_estorno: "Lançada na loja errada",
      itens: [
        linha({ quantidade: 2, reentradas: 1, identificadores: [
          { identificador: IMEI_1, situacao: "vendido", livre: false, reentrada: false },
          { identificador: IMEI_2, situacao: "disponivel", livre: true, reentrada: true },
        ] }),
        capa({ saldo_livre: 15, identificadores: [] }),
      ],
    }));
    expect(e).toMatchObject({ veCusto: true, numero: 12, situacao: "estornada", estornadoEm: "2026-11-11T15:30:00+00:00", estornadoPor: "Dono Teste", motivoEstorno: "Lançada na loja errada" });
    expect(e?.itens[0]).toMatchObject({ quantidade: 2, reentradas: 1, saldoLivre: null });
    expect(e?.itens[0]?.identificadores).toEqual([
      { identificador: IMEI_1, situacao: "vendido", livre: false, reentrada: false },
      { identificador: IMEI_2, situacao: "disponivel", livre: true, reentrada: true },
    ]);
    expect(e?.itens[1]).toMatchObject({ saldoLivre: 15, identificadores: [] });
  });

  it("entrada aberta sem dizer se o perfil vê custo, ou vazia, é formato inesperado", () => {
    expect(lerEntradaAberta(entrada())).toBeNull();
    expect(lerEntradaAberta(null)).toBeNull();
    expect(lerEntradaAberta(entrada({ ve_custo: true, itens: [linha({ quantidade: "duas" })] }))).toBeNull();
  });
});

describe("histórico de entradas: posição de hoje e o que impediria o estorno", () => {
  it("posição legível; situação desconhecida aparece como veio; nome herdado de objeto não vira texto", () => {
    expect(posicaoDoItem("disponivel")).toBe("no estoque");
    expect(posicaoDoItem("outra_loja")).toBe("em outra loja");
    expect(posicaoDoItem("baixado")).toBe("fora do estoque (baixado)");
    expect(posicaoDoItem("situacao_nova")).toBe("situacao_nova");
    expect(posicaoDoItem("constructor")).toBe("constructor");
  });

  it("resumo das posições na ordem do catálogo, com a desconhecida por último", () => {
    const id = (situacao: string) => ({ identificador: IMEI_1, situacao, livre: situacao === "disponivel", reentrada: false });
    expect(resumoDasPosicoes([id("situacao_nova"), id("vendido"), id("disponivel"), id("em_transito"), id("disponivel")]))
      .toBe("2 no estoque, 1 vendido, 1 em transferência, 1 situacao_nova");
    expect(resumoDasPosicoes([])).toBe("");
  });

  it("aponta os IMEI/ICCID que não estão livres e a quantidade que o saldo livre não cobre", () => {
    const e = lida({
      itens: [
        linha({ quantidade: 2, identificadores: [
          { identificador: IMEI_1, situacao: "vendido", livre: false, reentrada: false },
          { identificador: IMEI_2, situacao: "disponivel", livre: true, reentrada: false },
        ] }),
        capa({ saldo_livre: 15, identificadores: [] }),
      ],
    });
    expect(impedimentosDoEstorno(e)).toEqual({
      identificadores: [{ identificador: IMEI_1, situacao: "vendido", livre: false, reentrada: false }],
      quantidades: [{ sku: "ACE-0001", entrou: 20, livre: 15 }],
    });
  });

  it("linhas da mesma variação disputam o mesmo saldo livre: somam antes de comparar", () => {
    const duas = lida({ itens: [capa({ linha: 1, quantidade: 10, saldo_livre: 15, identificadores: [] }), capa({ linha: 2, quantidade: 10, saldo_livre: 15, identificadores: [] })] });
    expect(impedimentosDoEstorno(duas).quantidades).toEqual([{ sku: "ACE-0001", entrou: 20, livre: 15 }]);
    const cabe = lida({ itens: [capa({ linha: 1, quantidade: 10, saldo_livre: 20, identificadores: [] }), capa({ linha: 2, quantidade: 10, saldo_livre: 20, identificadores: [] })] });
    expect(impedimentosDoEstorno(cabe)).toEqual({ identificadores: [], quantidades: [] });
  });

  it("no resumo do histórico (sem posição nem saldo) não há o que apontar", () => {
    expect(impedimentosDoEstorno(lida())).toEqual({ identificadores: [], quantidades: [] });
  });
});

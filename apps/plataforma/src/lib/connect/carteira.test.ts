// A aba Carteira e relatórios (lote CONNECT-o): o estado de cada consulta e a leitura das respostas que o worker grava. Dados
// FICTÍCIOS (linhas, valores e datas inventados; nenhum cliente).
import { describe, expect, it } from "vitest";

import { algumaEsperando, estadoDa, extratoUnico, lerExtrato, lerPortabilidades, lerProgramadas, lerSaldo, lerTamanhoDaLista, ultimaDe } from "./carteira";
import type { ConsultaDaTela } from "./consultas";

const consulta = (c: Partial<ConsultaDaTela>): ConsultaDaTela => ({
  id: "c1", tipo: "carteira_saldo", parametro: null, situacao: "respondida", resposta: { saldo_centavos: 185_000 }, mensagem: null,
  pedida_em: "2026-11-25T20:00:00Z", respondida_em: "2026-11-25T20:00:03Z", resposta_apagada_em: null, ...c,
});

describe("o estado de cada consulta", () => {
  it("a última de cada tipo, pela hora do pedido", () => {
    const lista = [consulta({ id: "a", pedida_em: "2026-11-25T19:00:00Z" }), consulta({ id: "b", pedida_em: "2026-11-25T21:00:00Z" }),
      consulta({ id: "c", tipo: "carteira_programadas", pedida_em: "2026-11-25T22:00:00Z" })];
    expect(ultimaDe(lista, "carteira_saldo")?.id).toBe("b");
    expect(ultimaDe(lista, "carteira_extrato_saidas")).toBeUndefined();
  });

  it("nenhuma, esperando, sem resposta, apagada (24 horas) ou respondida; resposta fora do formato não vira número", () => {
    expect(estadoDa(undefined, lerSaldo)).toEqual({ estado: "sem_consulta" });
    expect(estadoDa(consulta({ situacao: "na_fila", resposta: null }), lerSaldo)).toMatchObject({ estado: "esperando" });
    expect(estadoDa(consulta({ situacao: "consultando", resposta: null }), lerSaldo)).toMatchObject({ estado: "esperando" });
    expect(estadoDa(consulta({ situacao: "falhou", resposta: null, mensagem: "A Nogle não respondeu." }), lerSaldo)).toMatchObject({ estado: "falhou", mensagem: "A Nogle não respondeu." });
    expect(estadoDa(consulta({ resposta: null, resposta_apagada_em: "2026-11-26T20:00:00Z" }), lerSaldo)).toMatchObject({ estado: "apagada" });
    expect(estadoDa(consulta({}), lerSaldo)).toEqual({ estado: "ok", id: "c1", pedidaEm: "2026-11-25T20:00:00Z", dias: null, dados: { centavos: 185_000 } });
    expect(estadoDa(consulta({ resposta: { saldo_centavos: "1850" } }), lerSaldo)).toMatchObject({ estado: "falhou" });
    expect(estadoDa(consulta({ tipo: "carteira_programadas", parametro: "30", resposta: { recargas: [] } }), lerProgramadas)).toMatchObject({ estado: "ok", dias: 30 });
    expect(algumaEsperando({ estado: "sem_consulta" }, { estado: "esperando", pedidaEm: "x" })).toBe(true);
    expect(algumaEsperando({ estado: "sem_consulta" })).toBe(false);
  });
});

describe("as respostas", () => {
  it("o extrato: os movimentos sem o cliente, e as saídas e as entradas numa lista só, do mais novo ao mais velho", () => {
    const saidas = estadoDa(consulta({ tipo: "carteira_extrato_saidas", parametro: "30", resposta: {
      movimentos: [{ quando: "2026-11-20 10:00", tipo: "RECARGA", valor_centavos: 4_392, cliente: "Cliente Fictício", linha: "41999998888", plano: "10 GB" },
        { quando: "2026-11-24 09:30", tipo: "ATIVACAO", valor_centavos: 4_392, linha: null, iccid: "8955170110000000016", plano: "10 GB" }],
      total: 2, soma_centavos: 8_784, fora: 0 } }), lerExtrato(false));
    const entradas = estadoDa(consulta({ tipo: "carteira_extrato_entradas", parametro: "30", resposta: {
      movimentos: [{ quando: "2026-11-22 15:00", tipo: "CREDITO", valor_centavos: 150_000 }], total: 1, soma_centavos: 150_000, fora: 0 } }), lerExtrato(true));
    expect(saidas).toMatchObject({ estado: "ok", dias: 30, dados: { total: 2, somaCentavos: 8_784, fora: 0 } });
    expect(JSON.stringify(saidas)).not.toContain("Cliente Fictício");
    expect(extratoUnico(saidas, entradas, { estado: "sem_consulta" })).toEqual([
      { quando: "2026-11-24 09:30", entrada: false, tipo: "ATIVACAO", plano: "10 GB", linha: null, valorCentavos: 4_392 },
      { quando: "2026-11-22 15:00", entrada: true, tipo: "CREDITO", plano: null, linha: null, valorCentavos: 150_000 },
      { quando: "2026-11-20 10:00", entrada: false, tipo: "RECARGA", plano: "10 GB", linha: "41999998888", valorCentavos: 4_392 },
    ]);
    expect(lerExtrato(false)({ lista: [] })).toBeNull();
  });

  it("as recargas programadas, da renovação mais próxima, sem o cliente", () => {
    const r = lerProgramadas({ recargas: [
      { renovacao: "2026-12-10", linha: "41999998888", cliente: "Cliente Fictício", documento: "•••.•••.789-09", plano: "10 GB", valor_centavos: 5_490 },
      { renovacao: "2026-12-01", linha: "41988887777", plano: "20 GB", valor_centavos: 6_990 }, { linha: "x", valor_centavos: 1.5 }],
    total: 3, soma_centavos: 12_480, fora: 0 });
    expect(r?.recargas).toEqual([
      { renovacao: "2026-12-01", linha: "41988887777", plano: "20 GB", valorCentavos: 6_990 },
      { renovacao: "2026-12-10", linha: "41999998888", plano: "10 GB", valorCentavos: 5_490 },
      { renovacao: null, linha: null, plano: null, valorCentavos: null },
    ]);
    expect(JSON.stringify(r)).not.toContain("789-09");
    expect(r).toMatchObject({ total: 3, somaCentavos: 12_480 });
  });

  it("as portabilidades: o resumo por status e cada uma, sem o cliente; as listas, só o tamanho", () => {
    const r = lerPortabilidades({ portabilidades: [{ quando: "2026-11-21 11:00", linha: "41999997777", linha_doadora: "41988887777", operadora: "CLARO", status: "Sucesso",
      cliente: "Cliente Fictício" }], total: 3, por_status: { Sucesso: 2, "Portabilidade negada": 1, ruim: "x" }, fora: 2 });
    expect(r).toEqual({ total: 3, porStatus: [["Sucesso", 2], ["Portabilidade negada", 1]], fora: 2,
      itens: [{ quando: "2026-11-21 11:00", linha: "41999997777", doadora: "41988887777", operadora: "CLARO", status: "Sucesso" }] });
    expect(lerPortabilidades({})).toBeNull();
    expect(lerTamanhoDaLista("linhas")({ linhas: [{}, {}], total: 120 })).toEqual({ quantos: 120 });
    expect(lerTamanhoDaLista("clientes")({ clientes: [{}] })).toEqual({ quantos: 1 });
    expect(lerTamanhoDaLista("clientes")({ linhas: [] })).toBeNull();
  });
});

// Regras dos painéis do estoque (G3): leitura estrita de public.estoque_painel e o que a tela escolhe
// mostrar. A soma no banco está provada em packages/banco/src/estoque-painel.test.ts. Dados fictícios.
import { describe, expect, it } from "vitest";

import { RespostaInesperada } from "../financeiro/painel";
import { categoriasDaBarra, escopoDoEstoque, lerEstoque, modelosDoGrafico, pendenciasDe, type ModeloDoEstoque } from "./painel";

const ZERO = { fisico: 0, reservado: 0, disponivel: 0, abaixo_do_minimo: 0, parado: 0, chegando: 0 };
const SEM_PENDENCIAS = { a_separar: 0, a_enviar: 0, a_receber: 0, inventarios_abertos: 0, retornos_a_conferir: 0, sem_conferencia_hoje: 0 };
const RESPOSTA = {
  totais: { fisico: 17, reservado: 2, disponivel: 15, abaixo_do_minimo: 3, parado: 4, chegando: 2, fora_da_venda: 5 },
  locais: [
    { unidade_id: "loja-a", nome: "Loja A", tipo: "loja_fisica", vende: true, fisico: 13, reservado: 2, disponivel: 11, abaixo_do_minimo: 0, parado: 1, chegando: 0, ...SEM_PENDENCIAS, a_separar: 1, sem_conferencia_hoje: 3 },
    { unidade_id: "loja-b", nome: "Loja B", tipo: "loja_fisica", vende: true, fisico: 4, reservado: 0, disponivel: 4, abaixo_do_minimo: 3, parado: 3, chegando: 2, ...SEM_PENDENCIAS, a_receber: 1 },
    { unidade_id: "defeitos", nome: "DEFEITOS", tipo: "excecao", vende: false, ...ZERO, fisico: 5, ...SEM_PENDENCIAS },
  ],
  modelos: [
    { produto_id: "p-capa", produto: "Capa de proteção", tipo: "acessorio", categoria_id: "c-ace", categoria: "Acessórios", fisico: 13, reservado: 2, disponivel: 11, minimo: 20, abaixo_do_minimo: 3, parado: 3, chegando: 2 },
    { produto_id: "p-a15", produto: "Galaxy A15", tipo: "aparelho", categoria_id: "c-cel", categoria: "Celulares", fisico: 3, reservado: 0, disponivel: 3, minimo: 0, abaixo_do_minimo: 0, parado: 1, chegando: 0 },
    { produto_id: "p-chip", produto: "Chip pré-pago", tipo: "chip", categoria_id: "c-chip", categoria: "Chips", fisico: 1, reservado: 0, disponivel: 1, minimo: 0, abaixo_do_minimo: 0, parado: 0, chegando: 0 },
  ],
  categorias: [
    { categoria_id: "c-ace", categoria: "Acessórios", fisico: 13, reservado: 2, disponivel: 11, abaixo_do_minimo: 3, parado: 3, chegando: 2 },
    { categoria_id: "c-cel", categoria: "Celulares", fisico: 3, reservado: 0, disponivel: 3, abaixo_do_minimo: 0, parado: 1, chegando: 0 },
    { categoria_id: "c-chip", categoria: "Chips", fisico: 1, reservado: 0, disponivel: 1, abaixo_do_minimo: 0, parado: 0, chegando: 0 },
  ],
};

describe("leitura de estoque_painel", () => {
  it("converte totais, locais (com as pendências), modelos e categorias", () => {
    const e = lerEstoque(RESPOSTA);
    expect(e.totais).toEqual({ fisico: 17, reservado: 2, disponivel: 15, abaixoDoMinimo: 3, parado: 4, chegando: 2, foraDaVenda: 5 });
    expect(e.locais[0]).toEqual({
      unidadeId: "loja-a", nome: "Loja A", tipo: "loja_fisica", vende: true, fisico: 13, reservado: 2, disponivel: 11, abaixoDoMinimo: 0, parado: 1, chegando: 0,
      pendencias: { ...SEM_PENDENCIAS, a_separar: 1, sem_conferencia_hoje: 3 },
    });
    expect(e.modelos[0]).toMatchObject({ produtoId: "p-capa", produto: "Capa de proteção", categoria: "Acessórios", minimo: 20, abaixoDoMinimo: 3 });
    expect(lerEstoque({ totais: { ...ZERO, fora_da_venda: 0 }, locais: [], modelos: [], categorias: [] }).modelos).toEqual([]);
  });

  it("forma inesperada ou conta que não fecha é falha, não zero", () => {
    expect(() => lerEstoque(null)).toThrow(RespostaInesperada);
    expect(() => lerEstoque({ ...RESPOSTA, modelos: "x" })).toThrow(RespostaInesperada);
    expect(() => lerEstoque({ ...RESPOSTA, totais: { ...RESPOSTA.totais, fora_da_venda: undefined } })).toThrow();
    expect(() => lerEstoque({ ...RESPOSTA, totais: { ...RESPOSTA.totais, disponivel: 16 } })).toThrow(RespostaInesperada);
    expect(() => lerEstoque({ ...RESPOSTA, locais: [{ ...RESPOSTA.locais[0], vende: "sim" }] })).toThrow(RespostaInesperada);
  });
});

describe("o que a tela mostra", () => {
  const m = (produto: string, disponivel: number, abaixoDoMinimo = 0): ModeloDoEstoque => ({
    produtoId: produto, produto, tipo: "acessorio", categoria: null, minimo: 0, fisico: disponivel, reservado: 0, disponivel, abaixoDoMinimo, parado: 0, chegando: 0,
  });

  it("gráfico: os de maior disponível, e o modelo abaixo do mínimo nunca fica de fora", () => {
    const modelos = [m("A", 50), m("B", 40), m("C", 30), m("D", 0, 2), m("E", 20)];
    expect(modelosDoGrafico(modelos, 3).map((x) => x.produto)).toEqual(["A", "B", "D"]);
    expect(modelosDoGrafico(modelos, 10).map((x) => x.produto)).toEqual(["A", "B", "C", "E", "D"]);
    expect(modelosDoGrafico([m("X", 1, 1), m("Y", 0, 1)], 1).map((x) => x.produto)).toEqual(["X"]);
  });

  it("categorias da barra: até cinco, o resto em 'Outras'; sem disponível, nada", () => {
    const c = (nome: string, disponivel: number) => ({ categoria: nome, fisico: disponivel, reservado: 0, disponivel, abaixoDoMinimo: 0, parado: 0, chegando: 0 });
    const lista = [c("A", 10), c("B", 9), c("C", 8), c("D", 7), c("E", 6), c("F", 5), c("G", 4), c("Zero", 0)];
    expect(categoriasDaBarra(lista)).toEqual([
      { nome: "A", valor: 10, serie: 1 }, { nome: "B", valor: 9, serie: 2 }, { nome: "C", valor: 8, serie: 3 }, { nome: "D", valor: 7, serie: 4 }, { nome: "E", valor: 6, serie: 5 },
      { nome: "Outras", valor: 9, serie: 6 },
    ]);
    expect(categoriasDaBarra([{ ...c("x", 0), categoria: null }])).toEqual([]);
    expect(categoriasDaBarra([{ ...c("x", 3), categoria: null }])).toEqual([{ nome: "Sem categoria", valor: 3, serie: 1 }]);
  });

  it("pendências somadas nos locais, na ordem fixa, só as que têm algo, cada uma com o lugar onde se resolve", () => {
    expect(pendenciasDe(lerEstoque(RESPOSTA).locais)).toEqual([
      { chave: "a_separar", rotulo: "Transferências a separar", href: "/transferencias", um: "transferência a separar", varios: "transferências a separar", quantidade: 1 },
      { chave: "a_receber", rotulo: "Transferências a receber", href: "/transferencias", um: "transferência a receber", varios: "transferências a receber", quantidade: 1 },
      { chave: "sem_conferencia_hoje", rotulo: "Aparelhos e chips sem a conferência de hoje", href: "/estoque?aba=conferencia", um: "item sem conferência hoje", varios: "itens sem conferência hoje", quantidade: 3 },
    ]);
  });

  it("recorte: um local só não escolhe; com mais de um, o padrão é a loja do turno; local que não consulta cai no padrão", () => {
    const { locais } = lerEstoque(RESPOSTA);
    expect(escopoDoEstoque(undefined, [locais[1]!], "loja-a")).toEqual({ unidade: "loja-b", chave: "loja-b" });
    expect(escopoDoEstoque(undefined, [], "loja-a")).toEqual({ unidade: "loja-a", chave: "loja-a" });
    expect(escopoDoEstoque(undefined, locais, "loja-a")).toEqual({ unidade: "loja-a", chave: "loja-a" });
    expect(escopoDoEstoque("rede", locais, "loja-a")).toEqual({ unidade: null, chave: "rede" });
    expect(escopoDoEstoque("loja-b", locais, "loja-a")).toEqual({ unidade: "loja-b", chave: "loja-b" });
    expect(escopoDoEstoque("loja-x", locais, "loja-a")).toEqual({ unidade: "loja-a", chave: "loja-a" });
    expect(escopoDoEstoque(undefined, locais, "loja-fora")).toEqual({ unidade: null, chave: "rede" });
  });
});

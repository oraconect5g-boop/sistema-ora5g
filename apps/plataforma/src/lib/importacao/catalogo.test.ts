import { describe, expect, it } from "vitest";

import { lerMapeamento, montarLinhas, sugerirMapeamento } from "./catalogo";
import { lerCsv } from "./csv";

// Planilha FICTÍCIA (o formato real da Rein chega com a pendência B1; nada aqui o supõe).
const planilha = lerCsv(new TextEncoder().encode(
  "Código;Descrição;Marca;EAN;Preço de venda;Custo;Tipo\n" +
  "APA-1;Galaxy A15 128 GB Azul;Samsung;7890000000011;1.299,90;1.000;aparelho\n" +
  "ACE-1;Capa de silicone;;;79,90;;Acessório\n" +
  "ACE-2;Película;;;R$ 2 9;;eletrodoméstico\n",
));

describe("mapeamento das colunas", () => {
  it("sugere pelo nome da coluna, sem acento nem maiúsculas, sem usar a mesma coluna duas vezes", () => {
    expect(sugerirMapeamento(planilha.cabecalho)).toEqual({ sku: 0, nome: 1, marca: 2, codigo_barras: 3, preco: 4, custo: 5, tipo: 6 });
    expect(sugerirMapeamento(["coluna estranha"])).toEqual({});
  });

  it("lê o formulário: SKU e nome obrigatórios; coluna inexistente ou repetida é recusada", () => {
    const campos = (c: Record<string, string>) => (n: string) => c[n] ?? null;
    expect(lerMapeamento(campos({ coluna_sku: "0", coluna_nome: "1", coluna_preco: "4" }), 7)).toEqual({ sku: 0, nome: 1, preco: 4 });
    expect(lerMapeamento(campos({ coluna_sku: "0" }), 7)).toBeNull();
    expect(lerMapeamento(campos({ coluna_sku: "0", coluna_nome: "9" }), 7)).toBeNull();
    expect(lerMapeamento(campos({ coluna_sku: "0", coluna_nome: "0" }), 7)).toBeNull();
    expect(lerMapeamento(campos({ coluna_sku: "0", coluna_nome: "x" }), 7)).toBeNull();
  });
});

describe("linhas no formato do banco", () => {
  it("dinheiro em centavos, tipo do arquivo ou o padrão, produto = nome quando não há modelo", () => {
    const linhas = montarLinhas(planilha, sugerirMapeamento(planilha.cabecalho), { tipo: "acessorio", categoria: "Importados" });
    expect(linhas[0]).toEqual({
      numero: 2, sku: "APA-1", nome: "Galaxy A15 128 GB Azul", produto: "Galaxy A15 128 GB Azul", tipo: "aparelho", categoria: "Importados",
      marca: "Samsung", codigo_barras: "7890000000011", cor: null, capacidade: null, preco: 129_990, custo: 100_000, erros: [],
    });
    expect(linhas[1]).toMatchObject({ numero: 3, tipo: "acessorio", marca: null, codigo_barras: null, preco: 7_990, custo: null, erros: [] });
  });

  it("preço ilegível e tipo desconhecido viram erros da linha (aparecem na prévia)", () => {
    const [, , terceira] = montarLinhas(planilha, sugerirMapeamento(planilha.cabecalho), { tipo: "acessorio", categoria: "Importados" });
    expect(terceira?.numero).toBe(4);
    expect(terceira?.preco).toBeNull();
    expect(terceira?.tipo).toBeNull();
    expect(terceira?.erros).toHaveLength(2);
    expect(terceira?.erros).toEqual(expect.arrayContaining(['Preço inválido: "R$ 2 9"', expect.stringContaining('Tipo desconhecido: "eletrodoméstico"')]));
  });

  it("sem coluna de tipo, vale o tipo padrão escolhido para o arquivo", () => {
    const linhas = montarLinhas(planilha, { sku: 0, nome: 1 }, { tipo: "chip", categoria: "Chips" });
    expect(linhas.every((l) => l.tipo === "chip" && l.categoria === "Chips" && l.preco === null)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { dividirEmPartes, lerMapeamento, linhaDeTotal, montarLinhas, sugerirMapeamento } from "./catalogo";
import { lerCsv, LIMITES_DA_PLANILHA } from "./csv";

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

// A planilha inteira da Rein (lote REIN-a; plano de 16/11, Onda 1, item 3): a observação longa numa coluna que não
// entra, o campo longo que entra, a linha de total no fim e as partes de até 2.000 linhas. Dados FICTÍCIOS.
describe("a planilha inteira (REIN-a)", () => {
  const PADROES = { tipo: "acessorio" as const, categoria: "Acessórios" };
  const MAPA = { sku: 0, nome: 1, preco: 2 };
  const observacao = "o".repeat(3_220);

  it("a observação de 3.220 caracteres numa coluna que não entra é lida, e a linha segue sem erro", () => {
    const planilha = lerCsv(new TextEncoder().encode(`SKU;Descrição;Preço;Observação\nACE-1;Capa;79,90;${observacao}\n`));
    expect(planilha.linhas[0]?.[3]).toHaveLength(3_220);
    expect(montarLinhas(planilha, MAPA, PADROES)[0]).toMatchObject({ sku: "ACE-1", nome: "Capa", erros: [] });
    // Acima do limite de leitura, a planilha continua recusada inteira.
    expect(() => lerCsv(new TextEncoder().encode(`SKU;Nome\nA;${"x".repeat(LIMITES_DA_PLANILHA.celula + 1)}\n`))).toThrow();
  });

  it("o campo que entra e passa de 500 caracteres vira erro da linha, sem ir ao banco", () => {
    const planilha = lerCsv(new TextEncoder().encode(`SKU;Descrição;Preço\nACE-1;${"n".repeat(501)};79,90\n`));
    const [linha] = montarLinhas(planilha, MAPA, PADROES);
    expect(linha?.nome).toBeNull();
    expect(linha?.erros).toEqual(["Nome completo do item: passa de 500 caracteres (tem 501)"]);
  });

  it("a linha de total no fim fica de fora; produto de verdade, mesmo com Total no nome, não", () => {
    const comTotal = lerCsv(new TextEncoder().encode("SKU;Descrição;Preço;Estoque\nACE-1;Capa;79,90;3\nACE-2;Cabo;29,90;5\n;TOTAL;;8\n"));
    expect(linhaDeTotal(comTotal, MAPA)).toBe(2);
    const totalNoutraColuna = lerCsv(new TextEncoder().encode("Código;SKU;Descrição;Preço\nX;ACE-1;Capa;79,90\nTotal geral;;;8\n"));
    expect(linhaDeTotal(totalNoutraColuna, { sku: 1, nome: 2, preco: 3 })).toBe(1);
    const produto = lerCsv(new TextEncoder().encode("SKU;Descrição;Preço\nACE-1;Capa;79,90\nTOT-1;Total Flex 128 GB;999,00\n"));
    expect(linhaDeTotal(produto, MAPA)).toBeNull();
    const semTotal = lerCsv(new TextEncoder().encode("SKU;Descrição;Preço\nACE-1;Capa;79,90\n;;\n"));
    expect(linhaDeTotal(semTotal, MAPA)).toBeNull();
  });

  it("2.271 linhas viram duas partes, na ordem do arquivo: 2.000 e 271", () => {
    const partes = dividirEmPartes(Array.from({ length: 2_271 }, (_, i) => i));
    expect(partes.map((p) => p.length)).toEqual([2_000, 271]);
    expect([partes[0]?.[0], partes[1]?.[0], partes[1]?.at(-1)]).toEqual([0, 2_000, 2_270]);
    expect(dividirEmPartes([1, 2, 3])).toEqual([[1, 2, 3]]);
  });
});

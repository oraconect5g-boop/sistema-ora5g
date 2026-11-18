import { describe, expect, it } from "vitest";

import { gerarXlsx } from "../xlsx-servidor";
import { descomprimirNoServidor } from "./descomprimir-servidor";
import { lerPlanilha } from "./planilha";
import { candidatoARodape, dividirEmPartes, lerMapeamento, linhaDeTotal, montarLinhas, numeroDaCelula, numeroDoRodape, rodapeDaPlanilha, sugerirMapeamento } from "./catalogo";
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

  // Achado F01 da auditoria do Codex de 17/11 (PR #104): o relatório de produtos da Rein termina com uma linha de totais
  // SEM a palavra "Total" (código e nome vazios, só números). Planilha FICTÍCIA no mesmo desenho: duas lojas com o físico
  // e o disponível, a quantidade e o custo total; o rodapé soma as colunas.
  const REIN = { sku: 0, nome: 1, marca: 2, preco: 3 } as const;
  const cabecalhoRein = "Código;Descrição;Marca;Preço;Loja A Qtd.;Loja A Qtd. Disponivel;Loja B Qtd.;Loja B Qtd. Disponivel;Quantidade;Custo total;Observação\n";

  it("F01: o rodapé de totais sem a palavra Total fica de fora, com o motivo e a conferência das somas", () => {
    const comRodape = lerCsv(new TextEncoder().encode(cabecalhoRein +
      "APA-1;Galaxy A15 128 GB;Samsung;1.299,90;2;1;-1;0;1;1.000,00;\n" +
      "ACE-1;Capa de silicone;;79,90;10;8;5;5;15;150,50;cliente pediu na cor azul\n" +
      ";;;;12;9;4;5;16;1.150,50;\n"));
    expect(linhaDeTotal(comRodape, REIN)).toBe(2);
    expect(rodapeDaPlanilha(comRodape, REIN)).toEqual({
      posicao: 2,
      motivo: "rodapé de totais no fim da planilha (sem código e sem nome, só números em 6 colunas; em 6 delas o número é a soma das linhas de cima)",
    });
    // A mesma linha como vem do Excel (número cru, com a notação do Excel) também é rodapé; o que não soma fica sem a conferência.
    const doExcel = lerCsv(new TextEncoder().encode(cabecalhoRein + "APA-1;Galaxy;Samsung;1299.9;2;1;1;1;3;1000\n;;;;2;1;1;1;3.0000000000000004;1.0E+3\n"));
    expect(rodapeDaPlanilha(doExcel, REIN)?.motivo).toBe("rodapé de totais no fim da planilha (sem código e sem nome, só números em 6 colunas; em 6 delas o número é a soma das linhas de cima)");
    // F18-02 (reanálise de 18/11): só números, mas nenhum é a soma das linhas de cima: não há prova de rodapé. A linha vai à
    // prévia, com o aviso, e só sai por decisão registrada de quem envia (antes, saía sozinha).
    const naoSoma = lerCsv(new TextEncoder().encode(cabecalhoRein + "APA-1;Galaxy;Samsung;1.299,90;2;1;1;1;3;1000\n;;;;7;7;7;7;7;7\n"));
    expect(rodapeDaPlanilha(naoSoma, REIN)).toBeNull();
    expect(linhaDeTotal(naoSoma, REIN)).toBeNull();
    expect(candidatoARodape(naoSoma, REIN)).toEqual({
      posicao: 1,
      motivo: "a última linha pode ser um rodapé ou um item sem cadastro (sem código e sem nome, só números em 6 colunas, e nenhum deles é a soma das linhas de cima)",
    });
    // O rodapé comprovado não é candidato.
    expect(candidatoARodape(comRodape, REIN)).toBeNull();
  });

  it("F18-02: a última linha com o EAN (ou outro campo do item) preenchido é candidata, mesmo que um número some", () => {
    const comEan = { ...REIN, codigo_barras: 10 } as const;
    const cabecalho = "Código;Descrição;Marca;Preço;Loja A Qtd.;Loja A Qtd. Disponivel;Loja B Qtd.;Loja B Qtd. Disponivel;Quantidade;Custo total;EAN\n";
    const planilha = lerCsv(new TextEncoder().encode(cabecalho +
      "ACE-1;Capa de silicone;;79,90;10;8;5;5;15;150,50;7890000000001\n" +
      ";;;;10;8;5;5;15;150,50;7890000000002\n"));
    expect(rodapeDaPlanilha(planilha, comEan)).toBeNull();
    expect(candidatoARodape(planilha, comEan)?.motivo).toBe(
      "a última linha pode ser um rodapé ou um item sem cadastro (sem código e sem nome, só números em 7 colunas, com código de barras preenchido)");
    // A mesma linha sem o EAN, com as somas conferindo, é rodapé comprovado.
    const semEan = lerCsv(new TextEncoder().encode(cabecalho + "ACE-1;Capa de silicone;;79,90;10;8;5;5;15;150,50;7890000000001\n;;;;10;8;5;5;15;150,50;\n"));
    expect(rodapeDaPlanilha(semEan, comEan)?.motivo).toBe("rodapé de totais no fim da planilha (sem código e sem nome, só números em 6 colunas; em 6 delas o número é a soma das linhas de cima)");
  });

  it("F18-01: o número pela origem da célula — o do Excel é o próprio número; o texto segue a planilha brasileira", async () => {
    const bytes = gerarXlsx([{ nome: "Produtos", secoes: [{
      colunas: ["SKU", "Nome", "Preço", "Custo"],
      linhas: [["ACE-1", "Capa", 79.9, 1.299], ["ACE-2", "Película", 1.5, "1.299"], ["ACE-3", "Cabo", "1.299,90", 12.345]],
    }] }]);
    const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
    expect(planilha.linhas.map((l) => l.slice(2))).toEqual([["79.9", "1.299"], ["1.5", "1.299"], ["1.299,90", "12.345"]]);
    expect(planilha.numericas).toEqual([[2, 3], [2], [3]]);
    // O mesmo "1.299": do Excel, um real e trinta (três casas: confira); como texto, mil duzentos e noventa e nove reais.
    expect([numeroDaCelula(planilha, 0, 3), numeroDaCelula(planilha, 1, 3), numeroDaCelula(planilha, 2, 3)]).toEqual([1.299, 1299, 12.345]);
    const linhas = montarLinhas(planilha, { sku: 0, nome: 1, preco: 2, custo: 3 }, PADROES);
    expect(linhas.map((l) => [l.preco, l.custo, l.erros])).toEqual([
      [7_990, null, ['Custo com mais de duas casas decimais: "1.299" (confira na planilha; nada é arredondado)']],
      [150, 129_900, []],
      [129_990, null, ['Custo com mais de duas casas decimais: "12.345" (confira na planilha; nada é arredondado)']],
    ]);
  });

  it("F01: nada some calado — a última linha com texto, com um número só ou com código continua indo à prévia", () => {
    const comTexto = lerCsv(new TextEncoder().encode(cabecalhoRein + "APA-1;Galaxy;Samsung;1.299,90;2;1;1;1;3;1000\n;;Samsung;;2;1;1;1;3;1000\n"));
    expect(linhaDeTotal(comTexto, REIN)).toBeNull();
    const umNumero = lerCsv(new TextEncoder().encode(cabecalhoRein + "APA-1;Galaxy;Samsung;1.299,90;2;1;1;1;3;1000\n;;;79,90;;;;;;\n"));
    expect(linhaDeTotal(umNumero, REIN)).toBeNull();
    const comCodigo = lerCsv(new TextEncoder().encode(cabecalhoRein + "APA-1;Galaxy;Samsung;1.299,90;2;1;1;1;3;1000\nAPA-2;;;;2;1;1;1;3;1000\n"));
    expect(linhaDeTotal(comCodigo, REIN)).toBeNull();
    // A linha do meio sem código e sem nome, só com números, não é rodapé: vai à prévia como está (o banco a marca como
    // erro, à vista, pela falta do SKU e do nome).
    const noMeio = lerCsv(new TextEncoder().encode(cabecalhoRein + ";;;;2;1;1;1;3;1000\nAPA-1;Galaxy;Samsung;1.299,90;2;1;1;1;3;1000\n"));
    expect(linhaDeTotal(noMeio, REIN)).toBeNull();
    expect(montarLinhas(noMeio, REIN, PADROES).map((l) => [l.numero, l.sku, l.nome])).toEqual([[2, null, null], [3, "APA-1", "Galaxy"]]);
  });

  it("F01: os números do rodapé (planilha brasileira, inglesa e o número cru do Excel)", () => {
    expect(["12", "-3", "1.234", "1.234,56", "1234,5", "R$ 1.299,90", "-R$ 10,00", "1,234.56", "12.5", "1.5E+20", "1 234", "0"].map(numeroDoRodape))
      .toEqual([12, -3, 1234, 1234.56, 1234.5, 1299.9, -10, 1234.56, 12.5, 1.5e20, 1234, 0]);
    expect(["", "abc", "12/11/2026", "1.2.3,4,5", "Total", "--3"].map(numeroDoRodape)).toEqual([null, null, null, null, null, null]);
  });

  it("2.271 linhas viram duas partes, na ordem do arquivo: 2.000 e 271", () => {
    const partes = dividirEmPartes(Array.from({ length: 2_271 }, (_, i) => i));
    expect(partes.map((p) => p.length)).toEqual([2_000, 271]);
    expect([partes[0]?.[0], partes[1]?.[0], partes[1]?.at(-1)]).toEqual([0, 2_000, 2_270]);
    expect(dividirEmPartes([1, 2, 3])).toEqual([[1, 2, 3]]);
  });
});

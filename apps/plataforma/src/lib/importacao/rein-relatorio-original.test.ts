// Lote REIN-d (23/11/2026; ORA-CAT-002 e ORA-INV-004): o relatório de produtos da Rein COMO ELE É. O arquivo original
// chegou ao servidor em 23/11, e a prova com ele (auditoria-planilha-real.test.ts) reprovou: 2.272 linhas em vez de 2.271
// produtos. A correção do AUD-c tinha sido provada com uma planilha sintética em que cada total do rodapé ficava na
// própria coluna; no arquivo de verdade, os totais estão DESLOCADOS.
//
// O arquivo é privado e não entra no repositório. Aqui, uma planilha SINTÉTICA com o mesmo desenho e valores fictícios:
//  - os 83 nomes de coluna e os 12 locais;
//  - o rodapé (a linha 2.273): debaixo de cada "Qtd. Disponivel <loja>" está o total do "Custo do Estoque <loja>" (12
//    colunas à direita); debaixo de três colunas de "Custo do Estoque", o total do "Valor de Mercado" de cada tabela de
//    preço; e, debaixo de outras três, um número que não é a soma de coluna nenhuma. Os 18 escritos com vírgula em
//    células de número. Nenhum total está na própria coluna;
//  - as colunas que o sistema sugere, no catálogo e na carga do estoque, com os nomes de verdade;
//  - "SEM GTIN" (o que a nota fiscal usa para o produto sem código de barras) não é um código de barras inválido, e o
//    código que não tem de 8 a 14 dígitos (no relatório, 15: o tamanho de um IMEI) fica em branco, com a nota;
//  - o custo médio e o preço calculado com mais de duas casas ("31.1823", "368.9999") são arredondados ao centavo, com a
//    nota para a prévia; o valor com cara de milhar ("1.299") numa coluna que não prova o ponto decimal segue como erro;
//  - o relatório não tem coluna de tipo: quem importa diz o tipo de cada família ("CELULARES" é aparelho, com IMEI).
import { describe, expect, it } from "vitest";

import { linhasDaCarga, sugerirMapaDaCarga, type LojaDaCarga } from "../estoque/carga";
import { xlsxMontadoAMao, type CelulaDeTeste } from "../xlsx-de-teste";
import {
  candidatoARodape, categoriasDoArquivo, codigosDeBarrasEmBranco, dividirEmPartes, linhaDeTotal, montarLinhas, rodapeDaPlanilha, sugerirMapeamento, tipoSugeridoDaCategoria,
  valoresArredondados,
} from "./catalogo";
import { descomprimirNoServidor } from "./descomprimir-servidor";
import { lerXlsx } from "./xlsx";

type Celula = CelulaDeTeste;
const ler = (linhas: readonly (readonly Celula[])[]) => lerXlsx(xlsxMontadoAMao(linhas), descomprimirNoServidor);
/** Um número como o rodapé da exportação o escreve: milhar com ponto e a vírgula decimal ("1.234,56"). */
const comVirgula = (centavos: number) => `${Math.trunc(centavos / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(centavos % 100).padStart(2, "0")}`;

// Os nomes das colunas do relatório (não são dado comercial: são os rótulos do sistema e os nomes das lojas).
const LOCAIS = ["SANTA FELICIDADE", "ÁGUA VERDE", "COLÔNIA", "ALMIRANTE TAMANDARÉ", "DEFEITOS", "DUBAI", "COLOMBO", "MUFFATO SANTA", "BUTIATUVINHA", "VENTANIA", "BALNEARIO", "SANTA CANDIDA"];
const FIXAS = ["Codigo", "SKU", "Codigo Barras", "Produto", "NCM", "Tipo Item Industrial", "Origem da Mercadoria", "CEST", "Familia", "Marca", "Observação", "Ult. Compra",
  "Qtd. Comprada", "Ult. Venda", "Qtd. Vendida", "Est. Minimo", "Data Cadastro", "Peso", "Peso Liquido", "Altura", "Largura", "Comprimento", "Cubagem", "Unid. Medida",
  "Custo Unit. (R$)", "Custo Unit. ($)"];
const TABELAS = ["TABELA NORMAL", "MERCADO LIVRE", "NOVA TABELA"];
const CABECALHO = [
  ...FIXAS, ...LOCAIS.map((l) => `Qtd. ${l}`), ...LOCAIS.map((l) => `Qtd. Disponivel ${l}`), ...LOCAIS.map((l) => `Custo do Estoque ${l}`),
  ...LOCAIS.map((l) => `Localizacao do Estoque ${l}`), ...TABELAS.flatMap((t) => [`Preco Original (R$) ${t}`, `Margem (%) ${t}`, `Valor de Mercado ${t} TODOS os Estoques`]),
];
const FISICO = 26;      // 26 a 37: "Qtd. <loja>"
const DISPONIVEL = 38;  // 38 a 49: "Qtd. Disponivel <loja>"
const CUSTO = 50;       // 50 a 61: "Custo do Estoque <loja>"
const TABELA = 74;      // 74, 77 e 80: o preço; 75, 78 e 81: a margem; 76, 79 e 82: o valor de mercado
// No rodapé, debaixo do "Custo do Estoque": o valor de mercado de cada tabela (52, 55 e 58) e um número que não é soma (51, 54 e 57).
const VALOR_DE_MERCADO_NO_RODAPE = [52, 55, 58];
const SEM_SOMA_NO_RODAPE = [51, 54, 57];

/** A planilha sintética no desenho do relatório: os produtos (valores fictícios) e o rodapé com os totais deslocados. */
function relatorioDaRein(produtos: number): Celula[][] {
  const custoDoEstoque = new Array<number>(12).fill(0);
  const valorDeMercado = new Array<number>(3).fill(0);
  const linhas: Celula[][] = [CABECALHO];
  for (let p = 1; p <= produtos; p += 1) {
    const linha: Celula[] = new Array<Celula>(83).fill(null);
    linha[0] = { n: String(1000 + p) };
    linha[1] = String(1000 + p);
    linha[3] = `Produto fictício ${p}`;
    linha[8] = p % 11 === 0 ? "CELULARES" : "ACESSÓRIOS";
    const custoUnitario = ((p * 37) % 5000) + 125; // centavos
    linha[24] = { n: String(custoUnitario / 100) };
    let noEstoque = 0;
    for (let l = 0; l < 12; l += 1) {
      const fisico = (p * (l + 3) + l + 1) % 7; // de 0 a 6; nenhum local fica zerado em todos os produtos
      noEstoque += fisico;
      custoDoEstoque[l] = (custoDoEstoque[l] as number) + fisico * custoUnitario;
      linha[FISICO + l] = { n: String(fisico) };
      linha[DISPONIVEL + l] = { n: String(Math.max(fisico - (p % 5 === 0 ? 1 : 0), 0)) };
      linha[CUSTO + l] = { n: String((fisico * custoUnitario) / 100) };
    }
    TABELAS.forEach((_, t) => {
      const preco = custoUnitario * 2 + t * 100;
      valorDeMercado[t] = (valorDeMercado[t] as number) + preco * noEstoque;
      linha[TABELA + t * 3] = { n: String(preco / 100) };
      linha[TABELA + t * 3 + 1] = { n: String(50 + t) };
      linha[TABELA + t * 3 + 2] = { n: String((preco * noEstoque) / 100) };
    });
    linhas.push(linha);
  }
  const rodape: Celula[] = new Array<Celula>(83).fill(null);
  for (let l = 0; l < 12; l += 1) rodape[DISPONIVEL + l] = { n: comVirgula(custoDoEstoque[l] as number) };
  VALOR_DE_MERCADO_NO_RODAPE.forEach((coluna, t) => { rodape[coluna] = { n: comVirgula(valorDeMercado[t] as number) }; });
  SEM_SOMA_NO_RODAPE.forEach((coluna, i) => { rodape[coluna] = { n: `${290 + i},85072760` }; });
  linhas.push(rodape);
  return linhas;
}

// As lojas como estão cadastradas no sistema (com acento e maiúsculas diferentes das do relatório), e as duas de teste.
const LOJAS: LojaDaCarga[] = ["Santa Felicidade", "Água Verde", "Colônia", "Almirante Tamandaré", "DEFEITOS", "Dubai", "Colombo", "Muffato Santa", "Butiatuvinha", "Ventania",
  "Balneário", "Santa Cândida", "Santa Cândida (teste)", "Loja de teste 2"].map((nome, i) => ({ id: `loja-${i}`, nome }));

describe("o relatório de produtos da Rein como ele é (REIN-d)", () => {
  it("o rodapé com os totais deslocados fica de fora: 83 colunas, 2.271 produtos e as partes de 2.000 e 271", async () => {
    const p = await ler(relatorioDaRein(2271));
    const mapa = sugerirMapeamento(p.cabecalho);
    // As colunas sugeridas pelos nomes de verdade. O preço não é sugerido: são três tabelas, e quem importa escolhe.
    expect(mapa).toEqual({ sku: 0, nome: 3, categoria: 8, marca: 9, codigo_barras: 2, custo: 24 });
    const total = linhaDeTotal(p, mapa);
    const produtos = p.linhas.filter((_, i) => i !== total);
    // As mesmas expectativas da prova com o arquivo original (auditoria-planilha-real.test.ts).
    expect(p.cabecalho).toHaveLength(83);
    expect(produtos).toHaveLength(2271);
    expect(total).toBe(2271);
    expect(p.numeros[total as number]).toBe(2273);
    expect(dividirEmPartes(produtos).map((x) => x.length)).toEqual([2000, 271]);
    // Comprovado pelas somas de OUTRAS colunas (15 dos 18 números), com a leitura dita no motivo.
    expect(rodapeDaPlanilha(p, mapa)?.motivo).toBe(
      "rodapé de totais no fim da planilha (sem código e sem nome, só números em 18 colunas, 18 delas escritas com vírgula numa célula de número e lidas como estão; "
      + "em 15 delas o número é a soma de outra coluna (o relatório escreve os totais deslocados))");
    expect(candidatoARodape(p, mapa)).toBeNull();
    expect(p.foraDoPadrao?.[2271]).toEqual([...Array.from({ length: 12 }, (_, i) => DISPONIVEL + i), 51, 52, 54, 55, 57, 58]);
    expect(produtos.at(-1)?.[0]).toBe("3271");
  }, 30_000);

  it("a carga do estoque sugere o físico e o disponível de cada local e não leva o rodapé", async () => {
    const p = await ler(relatorioDaRein(60));
    const sugestao = sugerirMapaDaCarga(p.cabecalho, LOJAS);
    expect(sugestao.sku).toBe(0);
    expect(sugestao.nome).toBe(3);
    // Cada local com a "Qtd." e a "Qtd. Disponivel" dele; o "Custo do Estoque" e a "Localizacao do Estoque" não são quantidade.
    // As lojas de teste não casam com a coluna da loja de verdade.
    expect(sugestao.lojas).toEqual(Object.fromEntries(LOCAIS.map((_, i) => [`loja-${i}`, { fisico: FISICO + i, disponivel: DISPONIVEL + i }])));
    const carga = linhasDaCarga(p, { sku: 0, nome: 3, lojas: sugestao.lojas as Record<string, { fisico: number; disponivel: number }> });
    expect(carga.deFora?.posicao).toBe(60);
    expect(carga.candidato).toBeNull();
    expect(carga.foraDoPadrao).toEqual({});
    for (const linhas of Object.values(carga.porLoja)) {
      expect(linhas.length).toBeGreaterThan(0);
      // Nenhuma linha do rodapé (a 62 da folha), nenhuma sem código e nenhuma com problema de leitura.
      expect(linhas.filter((l) => l.numero === 62 || l.sku === "" || l.problema !== undefined)).toEqual([]);
    }
  });

  it("uma coincidência só não prova: o número que é a soma de outra coluna precisa de companhia, não vale o zero e não vale a coluna de uma célula só", async () => {
    // Um só número que é a soma de outra coluna (30 = 10 + 20, a coluna A): candidato, à vista na prévia.
    const um = await ler([
      ["Código", "Descrição", "A", "B", "C"],
      ["P1", "Produto 1", { n: "10" }, { n: "1" }, { n: "7" }],
      ["P2", "Produto 2", { n: "20" }, { n: "2" }, { n: "9" }],
      [null, null, null, { n: "30,00" }, { n: "99,00" }],
    ]);
    expect(rodapeDaPlanilha(um, { sku: 0, nome: 1 })).toBeNull();
    expect(candidatoARodape(um, { sku: 0, nome: 1 })?.motivo).toContain("e só um deles é a soma de uma coluna, e de outra coluna: é pouco para provar");
    // Dois números, cada um a soma de outra coluna (30 da A e 16 da C): comprovado.
    const dois = await ler([
      ["Código", "Descrição", "A", "B", "C"],
      ["P1", "Produto 1", { n: "10" }, { n: "1" }, { n: "7" }],
      ["P2", "Produto 2", { n: "20" }, { n: "2" }, { n: "9" }],
      [null, null, { n: "16,00" }, { n: "30,00" }, null],
    ]);
    expect(rodapeDaPlanilha(dois, { sku: 0, nome: 1 })).toEqual({ posicao: 2, motivo:
      "rodapé de totais no fim da planilha (sem código e sem nome, só números em 2 colunas, 2 delas escritas com vírgula numa célula de número e lidas como estão; "
      + "em 2 delas o número é a soma de outra coluna (o relatório escreve os totais deslocados))" });
    // O zero não prova nada (as colunas B e C somam zero): os dois zeros debaixo de A e de D não são rodapé comprovado.
    const zeros = await ler([
      ["Código", "Descrição", "A", "B", "C", "D"],
      ["P1", "Produto 1", { n: "10" }, { n: "0" }, { n: "0" }, { n: "4" }],
      ["P2", "Produto 2", { n: "20" }, { n: "0" }, { n: "0" }, { n: "5" }],
      [null, null, { n: "0" }, null, null, { n: "0" }],
    ]);
    expect(rodapeDaPlanilha(zeros, { sku: 0, nome: 1 })).toBeNull();
    expect(candidatoARodape(zeros, { sku: 0, nome: 1 })?.motivo).toContain("e nenhum deles é a soma das linhas de cima");
    // A coluna de uma célula só não é soma: com um produto, a linha seguinte que repete os números dele em outra ordem não some.
    const umaCelula = await ler([
      ["Código", "Descrição", "A", "B"],
      ["P1", "Produto 1", { n: "5" }, { n: "10" }],
      [null, null, { n: "10" }, { n: "5" }],
    ]);
    expect(rodapeDaPlanilha(umaCelula, { sku: 0, nome: 1 })).toBeNull();
    expect(candidatoARodape(umaCelula, { sku: 0, nome: 1 })).not.toBeNull();
  });

  it("com o código de barras preenchido, a última linha nunca sai sozinha, mesmo com as somas de outras colunas (F18-02)", async () => {
    const p = await ler([
      ["Código", "Descrição", "EAN", "A", "B", "C"],
      ["P1", "Produto 1", "7890000000011", { n: "10" }, { n: "1" }, { n: "7" }],
      ["P2", "Produto 2", "7890000000028", { n: "20" }, { n: "2" }, { n: "9" }],
      [null, null, { n: "7890000000035" }, { n: "16,00" }, { n: "30,00" }, null],
    ]);
    const mapa = { sku: 0, nome: 1, codigo_barras: 2 };
    expect(rodapeDaPlanilha(p, mapa)).toBeNull();
    expect(candidatoARodape(p, mapa)?.motivo).toContain("com código de barras preenchido");
  });

  it("\"SEM GTIN\" é o produto sem código de barras; o código fora do padrão fica em branco, com a nota; o de verdade perde só os espaços", async () => {
    const p = await ler([
      ["Codigo", "Produto", "Codigo Barras", "Familia"],
      ["1001", "Capa fictícia", "SEM GTIN", "CAPINHAS"],
      ["1002", "Película fictícia", "sem gtin", "PELÍCULAS"],
      ["1003", "Cabo fictício", "789 0000 000011", "CABOS"],
      ["1004", "Fone fictício", "ABC", "FONES"],
      // Quinze dígitos (o tamanho de um IMEI) no campo do código de barras de um celular, como no relatório.
      ["1005", "Celular fictício", { n: "350000000000019" }, "CELULARES"],
      ["1006", "Pilha fictícia", null, "PILHAS"],
    ]);
    const mapa = sugerirMapeamento(p.cabecalho);
    expect(mapa).toEqual({ sku: 0, nome: 1, categoria: 3, codigo_barras: 2 });
    const linhas = montarLinhas(p, mapa, { tipo: "acessorio", categoria: "Acessórios" });
    expect(linhas.map((l) => [l.sku, l.codigo_barras, l.categoria, l.erros])).toEqual([
      ["1001", null, "CAPINHAS", []],
      ["1002", null, "PELÍCULAS", []],
      ["1003", "7890000000011", "CABOS", []],
      ["1004", null, "FONES", []],
      ["1005", null, "CELULARES", []],
      ["1006", null, "PILHAS", []],
    ]);
    // A prévia sabe quais ficaram em branco: o "ABC" e o de 15 dígitos. "SEM GTIN" e o vazio não contam.
    expect(codigosDeBarrasEmBranco(p, mapa)).toEqual({ celulas: 2, linhas: [5, 6] });
    expect(codigosDeBarrasEmBranco(p, mapa, 3)).toEqual({ celulas: 1, linhas: [6] });
    expect(codigosDeBarrasEmBranco(p, { sku: 0, nome: 1 })).toBeNull();
  });

  it("o custo médio e o preço calculado com mais de duas casas são arredondados ao centavo, e a prévia sabe quantos; a cara de milhar sem prova segue o erro", async () => {
    // Como no relatório: o custo tem "12.5" e "31.1823", e o preço, "49.9" e "368.9999", que provam o ponto decimal na
    // coluna; aí "321.937" é 321,94.
    const rein = await ler([
      ["Codigo", "Produto", "Custo Unit. (R$)", "Preco Original (R$) TABELA NORMAL"],
      [{ n: "1001" }, "Capa fictícia", { n: "12.5" }, { n: "49.9" }],
      [{ n: "1002" }, "Película fictícia", { n: "31.1823" }, { n: "368.9999" }],
      [{ n: "1003" }, "Pilha fictícia", { n: "0.578" }, { n: "299.0001" }],
      [{ n: "1004" }, "Celular fictício", { n: "321.937" }, { n: "899" }],
    ]);
    const mapa = { sku: 0, nome: 1, custo: 2, preco: 3 };
    expect(montarLinhas(rein, mapa, { tipo: "acessorio", categoria: "Acessórios" }).map((l) => [l.custo, l.preco, l.erros])).toEqual([
      [1_250, 4_990, []],
      [3_118, 36_900, []],
      [58, 29_900, []],
      [32_194, 89_900, []],
    ]);
    expect(valoresArredondados(rein, mapa, "custo")).toEqual({ celulas: 3, linhas: [3, 4, 5] });
    expect(valoresArredondados(rein, mapa, "custo", 3)).toEqual({ celulas: 2, linhas: [3, 4] });
    expect(valoresArredondados(rein, mapa, "preco")).toEqual({ celulas: 2, linhas: [3, 4] });
    expect(valoresArredondados(rein, { sku: 0, nome: 1 }, "custo")).toBeNull();
    // Sem a prova (só valores com cara de milhar na coluna), nada muda: "1.299" numa célula de número é um real e trinta
    // com três casas, e a pessoa confere (F18-01). Vale para o custo e para o preço.
    const duvidoso = await ler([
      ["Codigo", "Produto", "Custo", "Preço"],
      [{ n: "2001" }, "Celular fictício", { n: "1.299" }, { n: "1.899" }],
      [{ n: "2002" }, "Tablet fictício", { n: "12.345" }, { n: "15" }],
      [{ n: "2003" }, "Capa fictícia", { n: "25" }, { n: "79" }],
    ]);
    expect(montarLinhas(duvidoso, { sku: 0, nome: 1, custo: 2, preco: 3 }, { tipo: "acessorio", categoria: "Acessórios" }).map((l) => [l.custo, l.preco, l.erros])).toEqual([
      [null, null, ['Preço com mais de duas casas decimais: "1.899" (confira na planilha; nada é arredondado)', 'Custo com mais de duas casas decimais: "1.299" (confira na planilha; nada é arredondado)']],
      [null, 1_500, ['Custo com mais de duas casas decimais: "12.345" (confira na planilha; nada é arredondado)']],
      [2_500, 7_900, []],
    ]);
    expect(valoresArredondados(duvidoso, { sku: 0, nome: 1, custo: 2, preco: 3 }, "custo")).toBeNull();
    expect(valoresArredondados(duvidoso, { sku: 0, nome: 1, custo: 2, preco: 3 }, "preco")).toBeNull();
  });

  it("o tipo de cada categoria: as famílias do arquivo, a sugestão pelo nome e o tipo de cada linha", async () => {
    const p = await ler(relatorioDaRein(2271));
    const mapa = sugerirMapeamento(p.cabecalho);
    const rodape = rodapeDaPlanilha(p, mapa)?.posicao ?? null;
    // As famílias, da mais frequente para a menos, sem o rodapé.
    expect(categoriasDoArquivo(p, mapa.categoria as number, rodape)).toEqual([{ nome: "ACESSÓRIOS", linhas: 2065 }, { nome: "CELULARES", linhas: 206 }]);
    // A sugestão pelo nome: celulares são aparelho e chips são chip; o resto fica com o tipo padrão (ninguém adivinha).
    expect(["CELULARES", "Celular", "smartphones", "CHIPS", "SMARTWATCH", "CAPINHAS", "C/MEMORIA", "ASSISTÊNCIA"].map(tipoSugeridoDaCategoria))
      .toEqual(["aparelho", "aparelho", "aparelho", "chip", null, null, null, null]);
    const linhas = montarLinhas(p, mapa, { tipo: "acessorio", categoria: "Acessórios", tiposPorCategoria: { CELULARES: "aparelho" } }).filter((_, i) => i !== rodape);
    expect(linhas.filter((l) => l.tipo === "aparelho")).toHaveLength(206);
    expect(linhas.filter((l) => l.tipo === "acessorio")).toHaveLength(2065);
    expect(linhas.filter((l) => (l.categoria === "CELULARES") !== (l.tipo === "aparelho"))).toEqual([]);
    expect(linhas.filter((l) => l.erros.length > 0)).toEqual([]);
  }, 30_000);

  it("o tipo da categoria não liga para acento nem maiúsculas; a coluna do tipo, quando o arquivo tem, vale mais", async () => {
    const p = await ler([
      ["Codigo", "Produto", "Familia", "Tipo"],
      ["1001", "Celular fictício", "Celulares", null],
      ["1002", "Chip fictício", "CHIPS", null],
      ["1003", "Capa fictícia", "CAPINHAS", null],
      ["1004", "Película fictícia", "  películas ", null],
      ["1005", "Conserto fictício", "CELULARES", "Serviço"],
      ["1006", "Sem família fictício", null, null],
    ]);
    const mapa = { sku: 0, nome: 1, categoria: 2, tipo: 3 };
    expect(categoriasDoArquivo(p, 2)).toEqual([
      { nome: "Celulares", linhas: 2 }, { nome: "CAPINHAS", linhas: 1 }, { nome: "CHIPS", linhas: 1 }, { nome: "películas", linhas: 1 }]);
    const linhas = montarLinhas(p, mapa, { tipo: "acessorio", categoria: "Acessórios", tiposPorCategoria: { CELULARES: "aparelho", Chips: "chip", "PELÍCULAS": "acessorio" } });
    expect(linhas.map((l) => [l.sku, l.tipo, l.categoria])).toEqual([
      ["1001", "aparelho", "Celulares"], ["1002", "chip", "CHIPS"], ["1003", "acessorio", "CAPINHAS"], ["1004", "acessorio", "películas"],
      // A coluna do tipo vale mais que a categoria; a linha sem família fica com o tipo e a categoria padrão.
      ["1005", "servico", "CELULARES"], ["1006", "acessorio", "Acessórios"],
    ]);
  });
});

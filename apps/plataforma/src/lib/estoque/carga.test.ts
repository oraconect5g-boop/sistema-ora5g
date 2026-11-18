// A leitura da carga do estoque inicial por loja (lote REIN-b; ADR-021). Planilha FICTÍCIA no desenho do relatório de
// produtos da Rein descrito pela auditoria do Codex de 17/11 (o código, o nome e, de cada local, a quantidade física e a
// disponível em colunas separadas; o rodapé de totais sem a palavra "Total"). Nada aqui é o arquivo real.
import { describe, expect, it } from "vitest";

import { lerCsv } from "../importacao/csv";
import { descomprimirNoServidor } from "../importacao/descomprimir-servidor";
import { lerPlanilha } from "../importacao/planilha";
import { gerarXlsx } from "../xlsx-servidor";
import { lerMapaDaCarga, linhasDaCarga, mapaDaCargaParaGravar, quantidadeDaCelula, sugerirMapaDaCarga, type LojaDaCarga } from "./carga";

const LOJAS: LojaDaCarga[] = [
  { id: "00000000-0000-4000-8000-0000000000a1", nome: "Santa Cândida" },
  { id: "00000000-0000-4000-8000-0000000000a2", nome: "Muffato Santa" },
  { id: "00000000-0000-4000-8000-0000000000a3", nome: "DEFEITOS" },
  { id: "00000000-0000-4000-8000-0000000000a4", nome: "Santa Cândida (teste)" },
];
const [SC, MS, DF] = LOJAS.map((l) => l.id) as [string, string, string];
const utf8 = (t: string) => new TextEncoder().encode(t);
const CABECALHO = "Código;Referência;Marca;Descrição;Santa Cândida Qtd.;Santa Cândida Qtd. Disponível;MUFFATO SANTA Qtd.;MUFFATO SANTA Qtd. Disponível;Defeitos Qtd.;Observação\n";
const planilha = () => lerCsv(utf8(CABECALHO +
  "ACE-1;R1;Genérica;Capa de silicone;10;8;5;5;;\n" +
  "APA-1;R2;Samsung;Galaxy A15 128 GB;2;2;0;0;1;tela trincada\n" +
  "ACE-2;R3;Genérica;Película;0;0;;;;\n" +
  "ACE-3;R4;Genérica;Cabo USB-C;-2;0;3;3;;\n" +
  "ACE-4;R5;Genérica;Fone;1,5;1;;;;\n" +
  ";;;;10;8;8;8;1;\n"));

describe("as colunas da carga", () => {
  it("sugere o código, o nome e as colunas de cada loja pelo nome dela (sem acento, sem diferença de maiúsculas)", () => {
    const p = planilha();
    expect(sugerirMapaDaCarga(p.cabecalho, LOJAS)).toEqual({
      sku: 0, nome: 3,
      lojas: { [SC]: { fisico: 4, disponivel: 5 }, [MS]: { fisico: 6, disponivel: 7 }, [DF]: { fisico: 8 } },
    });
    // A loja de teste não casa com a coluna da loja de verdade (o nome inteiro tem de estar no cabeçalho).
    expect(sugerirMapaDaCarga(["Código", "Santa Cândida (teste) Qtd."], LOJAS).lojas).toEqual({ [LOJAS[3]?.id as string]: { fisico: 1 } });
    // Duas colunas candidatas ao mesmo papel: não sugere, a pessoa escolhe.
    expect(sugerirMapaDaCarga(["Código", "Dubai Qtd.", "Dubai Estoque"], [{ id: "x", nome: "Dubai" }]).lojas).toEqual({});
  });

  it("lê o formulário: o código obrigatório; coluna inexistente, repetida ou disponível sem físico recusados; ao menos uma loja", () => {
    const f = (campos: Record<string, string>) => (n: string) => campos[n];
    expect(lerMapaDaCarga(f({ coluna_sku: "0", coluna_nome: "3", [`fisico_${SC}`]: "4", [`disponivel_${SC}`]: "5", [`fisico_${DF}`]: "8" }), 10, LOJAS))
      .toEqual({ sku: 0, nome: 3, lojas: { [SC]: { fisico: 4, disponivel: 5 }, [DF]: { fisico: 8 } } });
    expect(lerMapaDaCarga(f({ [`fisico_${SC}`]: "4" }), 10, LOJAS)).toBeNull();
    expect(lerMapaDaCarga(f({ coluna_sku: "0" }), 10, LOJAS)).toBeNull();
    expect(lerMapaDaCarga(f({ coluna_sku: "0", [`fisico_${SC}`]: "0" }), 10, LOJAS)).toBeNull();
    expect(lerMapaDaCarga(f({ coluna_sku: "0", [`fisico_${SC}`]: "10" }), 10, LOJAS)).toBeNull();
    expect(lerMapaDaCarga(f({ coluna_sku: "0", [`disponivel_${SC}`]: "5" }), 10, LOJAS)).toBeNull();
    expect(lerMapaDaCarga(f({ coluna_sku: "0", [`fisico_${SC}`]: "4 or 1=1" }), 10, LOJAS)).toBeNull();
  });
});

describe("as linhas de cada loja", () => {
  it("o rodapé fica de fora; a loja sem quantidade não leva a linha; o negativo e o número quebrado vão com o problema", () => {
    const p = planilha();
    const mapa = { sku: 0, nome: 3, lojas: { [SC]: { fisico: 4, disponivel: 5 }, [MS]: { fisico: 6, disponivel: 7 }, [DF]: { fisico: 8 } } };
    const { porLoja, deFora } = linhasDaCarga(p, mapa);
    expect(deFora?.posicao).toBe(5);
    expect(deFora?.motivo).toContain("rodapé de totais");
    expect(porLoja[SC]).toEqual([
      { numero: 2, sku: "ACE-1", fisico: 10, disponivel: 8 },
      { numero: 3, sku: "APA-1", fisico: 2, disponivel: 2 },
      { numero: 5, sku: "ACE-3", fisico: -2, disponivel: 0 },
      { numero: 6, sku: "ACE-4", fisico: null, disponivel: 1, problema: 'Quantidade que não é número inteiro: "1,5"' },
    ]);
    expect(porLoja[MS]).toEqual([{ numero: 2, sku: "ACE-1", fisico: 5, disponivel: 5 }, { numero: 5, sku: "ACE-3", fisico: 3, disponivel: 3 }]);
    expect(porLoja[DF]).toEqual([{ numero: 3, sku: "APA-1", fisico: 1, disponivel: null }]);
    expect(mapaDaCargaParaGravar(p.cabecalho, mapa, SC)).toEqual({ sku: "Código", nome: "Descrição", fisico: "Santa Cândida Qtd.", disponivel: "Santa Cândida Qtd. Disponível" });
  });

  it("a quantidade: inteiro com separador de milhar ou o 12.0 do Excel; vazio é nulo; o resto, problema", () => {
    expect(["12", "-3", "1.234", "12.0", "", " 0 "].map((t) => quantidadeDaCelula(t))).toEqual([
      { valor: 12 }, { valor: -3 }, { valor: 1234 }, { valor: 12 }, { valor: null }, { valor: 0 },
    ]);
    expect(quantidadeDaCelula("2,5")).toEqual({ problema: 'Quantidade que não é número inteiro: "2,5"' });
    expect(quantidadeDaCelula("dez")).toEqual({ problema: 'Quantidade que não é número inteiro: "dez"' });
  });

  // Achado F18-01 da reanálise do Codex de 18/11: o número do Excel chegava como "0.625" e virava 625 (o ponto lido como
  // milhar). Cada origem tem o seu contrato; a fração e o que não é número vão à prévia para conferir, nunca arredondados.
  it("F18-01: a quantidade pela origem — o número do Excel é o próprio número; o texto, a planilha brasileira", () => {
    const n = (t: string) => quantidadeDaCelula(t, { numerica: true });
    expect(["0.625", "1.234", "1234", "-3", "0", "1.5E+21"].map(n)).toEqual([
      { problema: 'Quantidade que não é número inteiro: "0.625"' }, { problema: 'Quantidade que não é número inteiro: "1.234"' },
      { valor: 1234 }, { valor: -3 }, { valor: 0 }, { problema: 'Quantidade que não é número inteiro: "1.5E+21"' },
    ]);
    const t = (x: string) => quantidadeDaCelula(x);
    expect(["1.234", "12.345", "12,0", "1.234,00", "12.0", "00012", "1 234", "+5"].map(t)).toEqual([
      { valor: 1234 }, { valor: 12345 }, { valor: 12 }, { valor: 1234 }, { valor: 12 }, { valor: 12 }, { valor: 1234 }, { valor: 5 },
    ]);
    for (const fracao of ["0.625", "0,625", "12.5", "1,5", "1.234,5"]) expect(t(fracao), fracao).toEqual({ problema: `Quantidade que não é número inteiro: "${fracao}"` });
    for (const estranho of ["1e3", "R$ 10", "--3", "1.2.3"]) expect(t(estranho), estranho).toEqual({ problema: `Quantidade que não é número inteiro: "${estranho}"` });
  });

  it("F18-01: no Excel, a célula numérica 0,625 vai para conferir (antes entrava 625); o texto 1.234 segue mil e duzentos", async () => {
    const bytes = gerarXlsx([{ nome: "Produtos", secoes: [{
      colunas: ["Código", "Descrição", "Santa Cândida Qtd.", "Santa Cândida Qtd. Disponível"],
      linhas: [["ACE-1", "Cabo", 0.625, 0.625], ["ACE-2", "Capa", "1.234", 1234], ["ACE-3", "Película", 1.234, 1]],
    }] }]);
    const planilha = await lerPlanilha(bytes, descomprimirNoServidor);
    const { porLoja } = linhasDaCarga(planilha, { sku: 0, nome: 1, lojas: { [SC]: { fisico: 2, disponivel: 3 } } });
    expect(porLoja[SC]).toEqual([
      { numero: 2, sku: "ACE-1", fisico: null, disponivel: null, problema: 'Quantidade que não é número inteiro: "0.625"' },
      { numero: 3, sku: "ACE-2", fisico: 1234, disponivel: 1234 },
      { numero: 4, sku: "ACE-3", fisico: null, disponivel: 1, problema: 'Quantidade que não é número inteiro: "1.234"' },
    ]);
  });

  it("F18-02: a última linha só com números que não somam vai à prévia (sem o código, para conferir), com o aviso", () => {
    const p = lerCsv(new TextEncoder().encode("Código;Descrição;Santa Cândida Qtd.;Santa Cândida Qtd. Disponível\nACE-1;Capa;10;8\n;;7;3\n"));
    const { porLoja, deFora, candidato } = linhasDaCarga(p, { sku: 0, nome: 1, lojas: { [SC]: { fisico: 2, disponivel: 3 } } });
    expect(deFora).toBeNull();
    expect(candidato?.posicao).toBe(1);
    expect(porLoja[SC]).toEqual([{ numero: 2, sku: "ACE-1", fisico: 10, disponivel: 8 }, { numero: 3, sku: "", fisico: 7, disponivel: 3 }]);
    // O rodapé que soma continua de fora, sem candidato.
    const comTotal = lerCsv(new TextEncoder().encode("Código;Descrição;Santa Cândida Qtd.;Santa Cândida Qtd. Disponível\nACE-1;Capa;10;8\nACE-2;Cabo;2;2\n;;12;10\n"));
    const lida = linhasDaCarga(comTotal, { sku: 0, nome: 1, lojas: { [SC]: { fisico: 2, disponivel: 3 } } });
    expect([lida.deFora?.posicao, lida.candidato, lida.porLoja[SC]?.length]).toEqual([2, null, 2]);
  });
});

// A leitura do relatório de vendas dos marketplaces (lote MKTPL-a: ORA-MKTPL-003 e ORA-MKTPL-005 por arquivo; ADR-018).
// Arquivos FICTÍCIOS montados no teste: nenhum é o layout de um canal, porque nada é suposto do formato deles; a pessoa
// confirma a coluna de cada campo.
import { describe, expect, it } from "vitest";

import { lerCsv } from "../importacao/csv";
import { lerMapaDoMarketplace, mapaDoMarketplaceParaGravar, montarPedidosDoMarketplace, sugerirMapaDoMarketplace } from "./leitura";
import { ERROS_DOS_MARKETPLACES, erroDosMarketplaces, lerPainelDosMarketplaces, margemSobreOBruto, periodoDosMarketplaces, textoDoProblemaDoMarketplace } from "./regras";

const utf8 = (t: string) => new TextEncoder().encode(t);

describe("as colunas do relatório de vendas", () => {
  it("sugere pelo nome, a mais específica primeiro, sem usar a mesma coluna duas vezes", () => {
    expect(sugerirMapaDoMarketplace(["N.º de venda", "Data da venda", "Estado", "Unidades", "Receita por produtos (BRL)", "Tarifa de venda e impostos (BRL)",
      "Tarifas de envio (BRL)", "Cancelamentos e reembolsos (BRL)", "Total (BRL)", "SKU", "Título do anúncio"]))
      .toEqual({ pedido: 0, data: 1, situacao: 2, quantidade: 3, valor: 4, tarifas: 5, frete: 6, reembolsos: 7, liquido: 8, codigo: 9, titulo: 10 });
    expect(sugerirMapaDoMarketplace(["Order ID", "Order creation time", "Seller SKU", "Quantity", "Unit Price"]))
      .toEqual({ pedido: 0, data: 1, codigo: 2, quantidade: 3, preco: 4 });
  });

  it("o formulário: o pedido, a data e o valor do item ou o preço obrigatórios", () => {
    const de = (campos: Record<string, string>) => (nome: string) => campos[nome] ?? null;
    expect(lerMapaDoMarketplace(de({ coluna_pedido: "0", coluna_data: "1", coluna_preco: "2" }), 3)).toEqual({ pedido: 0, data: 1, preco: 2 });
    expect(lerMapaDoMarketplace(de({ coluna_pedido: "0", coluna_data: "1" }), 3)).toBeNull();
    expect(lerMapaDoMarketplace(de({ coluna_pedido: "0", coluna_data: "0", coluna_valor: "2" }), 3)).toBeNull();
    expect(mapaDoMarketplaceParaGravar(["Pedido", "Data", "Valor"], { pedido: 0, data: 1, valor: 2 }, "repetidos"))
      .toEqual({ modo: "repetidos", colunas: { pedido: "Pedido", data: "Data", valor: "Valor" } });
  });
});

describe("os pedidos do arquivo", () => {
  const csv = [
    "Pedido;Data;Estado;SKU;Unidades;Valor;Tarifa;Frete;Total",
    "#2000001;17/11/2026;Entregue;MLB-1;1;79,00;-10,27;0,00;68,73",
    "2000002;17/11/2026;A caminho;GAL-A15;1;1.499,00;-150,00;-20,00;1.329,00",
    "2000002;17/11/2026;A caminho;PEL-1;2;100,00;-10,00;;90,00",
    "Total;;;;;1.678,00;;;",
  ].join("\n");

  it("cada linha é um item; as linhas do mesmo pedido somam no modo de cada linha; o sinal da tarifa não importa", () => {
    const planilha = lerCsv(utf8(csv));
    const mapa = { pedido: 0, data: 1, situacao: 2, codigo: 3, quantidade: 4, valor: 5, tarifas: 6, frete: 7, liquido: 8 };
    expect(montarPedidosDoMarketplace(planilha, mapa, "em_cada_linha")).toEqual({
      pedidos: [
        { id_externo: "2000001", data: "2026-11-17", situacao: "Entregue", bruto: 7_900, tarifas: 1_027, frete: 0, liquido: 6_873,
          itens: [{ numero: 2, codigo: "MLB-1", quantidade: 1, valor: 7_900 }] },
        { id_externo: "2000002", data: "2026-11-17", situacao: "A caminho", bruto: 159_900, tarifas: 16_000, frete: 2_000, liquido: 141_900,
          itens: [{ numero: 3, codigo: "GAL-A15", quantidade: 1, valor: 149_900 }, { numero: 4, codigo: "PEL-1", quantidade: 2, valor: 10_000 }] },
      ],
      linhas: 3, deFora: 1, problemas: [],
    });
  });

  it("no modo repetido, o valor do pedido conta uma vez; se as linhas discordam, é apontado", () => {
    const repetido = lerCsv(utf8("Pedido;Data;Preço;Qtd;Tarifa do pedido\nP1;2026-11-17;10,00;3;5,00\nP1;2026-11-17;20,00;1;5,00\nP2;2026-11-17;1,00;1;1,00\nP2;2026-11-17;1,00;1;2,00\n"));
    const r = montarPedidosDoMarketplace(repetido, { pedido: 0, data: 1, preco: 2, quantidade: 3, tarifas: 4 }, "repetidos");
    expect(r.pedidos[0]).toEqual({ id_externo: "P1", data: "2026-11-17", bruto: 5_000, tarifas: 500, itens: [{ numero: 2, quantidade: 3, valor: 3_000 }, { numero: 3, quantidade: 1, valor: 2_000 }] });
    expect(r.problemas).toEqual([{ numero: 5, campo: "tarifas", texto: "P2" }]);
  });

  it("a linha que não deu para ler volta apontada: a data, a quantidade, o pedido com espaço e o valor vazio", () => {
    const ruim = lerCsv(utf8("Pedido;Data;Qtd;Valor\nA1;32/11/2026;1;1,00\nA2;17/11/2026;meia;1,00\nA 3;17/11/2026;1;1,00\nA4;17/11/2026;1;\n"));
    expect(montarPedidosDoMarketplace(ruim, { pedido: 0, data: 1, quantidade: 2, valor: 3 }, "em_cada_linha").problemas).toEqual([
      { numero: 2, campo: "data", texto: "32/11/2026" }, { numero: 3, campo: "quantidade", texto: "meia" }, { numero: 4, campo: "pedido", texto: "A 3" },
      { numero: 5, campo: "valor", texto: "" },
    ]);
  });
});

describe("as regras da tela dos marketplaces", () => {
  it("mensagens, período e o texto do problema", () => {
    expect(erroDosMarketplaces({ code: "42501" })).toBe("permissao");
    expect(erroDosMarketplaces({ code: "22023", message: "O arquivo leva de 1 a 20.000 pedidos" })).toBe("linhas");
    expect(erroDosMarketplaces({ code: "22023", message: "Pedido do arquivo fora do formato" })).toBe("dados");
    expect(ERROS_DOS_MARKETPLACES.canal).toContain("Mercado Livre");
    expect(periodoDosMarketplaces("2026-11-01", "2026-11-17", "2026-11-17")).toEqual({ inicio: "2026-11-01", fim: "2026-11-17" });
    expect(periodoDosMarketplaces("x", "2026-11-17", "2026-11-17")).toEqual({ inicio: "2026-10-19", fim: "2026-11-17" });
    expect(textoDoProblemaDoMarketplace("5", "tarifas", "P2")).toContain("Linha 5 do arquivo: não deu para ler as tarifas (em reais) \"P2\"");
    expect(textoDoProblemaDoMarketplace("5", "__proto__", "P2")).toBeNull();
    expect(margemSobreOBruto(500, 10_000)).toBe(0.05);
    expect(margemSobreOBruto(null, 10_000)).toBeNull();
    expect(margemSobreOBruto(500, 0)).toBeNull();
  });

  it("o painel lido com rigor", () => {
    const pedido = { id: "x", canal: "shopee", id_externo: "A1", data: "2026-11-17", situacao: null, bruto: 100, tarifas: 10, frete: 0, reembolsos: 0, liquido: 90,
      liquido_estimado: true, data_repasse: null, unidades: 1, custo: null, lucro: null, itens_sem_custo: 1 };
    const resposta = { canais: [{ canal: "shopee", pedidos: 1, unidades: 1, bruto: 100, reembolsos: 0, tarifas: 10, frete: 0, liquido: 90, liquidos_estimados: 1, custo: 0, lucro: 0, pedidos_sem_custo: 1 }],
      anuncios: [{ canal: "shopee", codigo: "A", titulo: null, variante_id: null, produto: null, unidades: 1, bruto: 100, liquido: 90, custo: null, lucro: null }],
      pedidos: [pedido], pedidos_no_periodo: 1, itens_sem_produto: 1 };
    expect(lerPainelDosMarketplaces(resposta).pedidos[0]).toMatchObject({ idExterno: "A1", liquidoEstimado: true, custo: null });
    expect(() => lerPainelDosMarketplaces({ ...resposta, canais: [{ ...resposta.canais[0], canal: "amazon" }] })).toThrow();
    expect(() => lerPainelDosMarketplaces({ ...resposta, pedidos: [{ ...pedido, liquido_estimado: "sim" }] })).toThrow();
    expect(() => lerPainelDosMarketplaces({ ...resposta, canais: [{ ...resposta.canais[0], pedidos_sem_custo: 2 }] })).toThrow();
  });
});

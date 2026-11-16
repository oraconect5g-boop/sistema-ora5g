import { avaliarDesconto, conferirPagamentos, cpfValido, iccidValido, imeiValido, normalizarTelefone, totaisDaVenda, validarItem, type ItemVenda } from "@ora5g/dominio";
import { describe, expect, it } from "vitest";

import { APROVACOES, CHIPS_POR_LOJA, CLIENTES, POLITICAS, produto, TAXA_DO_MEIO, UNIDADES_ESTOQUE, VENDAS_HOJE } from ".";

// Os dados fictícios precisam obedecer às MESMAS regras do domínio: senão a demonstração ensina errado.

const comoItem = (i: (typeof VENDAS_HOJE)[number]["itens"][number]): ItemVenda => ({
  tipo: i.tipo, descricao: i.nome, quantidade: i.quantidade, precoUnitario: i.precoUnitario, desconto: i.desconto, iccid: i.iccid, situacaoTelecom: i.situacaoTelecom,
  imei: i.tipo === "aparelho" ? "352099001700018" : undefined,
});

describe("vendas fictícias seguem as regras do domínio", () => {
  it("números de venda são únicos", () => {
    expect(new Set(VENDAS_HOJE.map((v) => v.numero)).size).toBe(VENDAS_HOJE.length);
  });

  it("cada item é válido e o total bate com a soma dos itens", () => {
    for (const v of VENDAS_HOJE) {
      const itens = v.itens.map(comoItem);
      for (const item of itens) expect(validarItem(item), `${v.numero} ${item.descricao}`).toEqual([]);
      expect(totaisDaVenda(itens).total, v.numero).toBe(v.total);
    }
  });

  it("vendas concluídas estão pagas pelo valor exato (troco só em dinheiro)", () => {
    for (const v of VENDAS_HOJE.filter((x) => x.situacao === "concluida")) {
      const conferencia = conferirPagamentos(v.total, v.pagamentos);
      expect(conferencia.erros, v.numero).toEqual([]);
      expect(conferencia.valido, v.numero).toBe(true);
    }
  });

  it("todo desconto na fila de aprovação passa mesmo do limite do vendedor", () => {
    const descontos = APROVACOES.filter((a) => a.tipo === "desconto");
    expect(descontos.length).toBeGreaterThan(0);
    for (const a of descontos) {
      const item = a.venda.itens.find((i) => i.desconto > 0);
      const p = item && produto(item.sku);
      const meio = a.venda.pagamentos[0]?.meio;
      if (!item || !p || !meio) throw new Error(`pedido sem desconto: ${a.venda.numero}`);
      const avaliacao = avaliarDesconto({ preco: item.precoUnitario, custo: item.custoUnitario, taxaMeioPagamento: TAXA_DO_MEIO[meio], politica: POLITICAS[p.categoria] }, item.desconto);
      expect(["precisa_aprovacao", "abaixo_do_custo"], a.venda.numero).toContain(avaliacao.situacao);
    }
  });
});

describe("identificadores fictícios são válidos e não se repetem", () => {
  it("IMEIs do estoque", () => {
    expect(UNIDADES_ESTOQUE.every((u) => imeiValido(u.imei))).toBe(true);
    expect(new Set(UNIDADES_ESTOQUE.map((u) => u.imei)).size).toBe(UNIDADES_ESTOQUE.length);
  });

  it("ICCIDs dos chips por loja", () => {
    const todos = Object.values(CHIPS_POR_LOJA).flat();
    expect(todos.every((c) => iccidValido(c))).toBe(true);
    expect(new Set(todos).size).toBe(todos.length);
  });

  it("clientes com CPF e telefone válidos", () => {
    for (const c of CLIENTES) {
      expect(cpfValido(c.cpf), c.nome).toBe(true);
      expect(normalizarTelefone(c.telefone), c.nome).not.toBeNull();
    }
  });

  it("a loja piloto e a Loja 03 têm aparelho de todo modelo para vender", () => {
    for (const loja of ["santa-candida", "loja-03"]) {
      const skus = new Set(UNIDADES_ESTOQUE.filter((u) => u.loja === loja && (u.situacao === "Disponível" || u.situacao === "Conferido")).map((u) => u.sku));
      expect(skus.size, loja).toBeGreaterThanOrEqual(6);
    }
  });
});

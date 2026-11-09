// REV-030, REV-031 e REV-034 (#31, #32, #36): provas do Codex na PR #33
// (2026-11-08-web/indicadores.repro.ts e 2026-11-08-setores/aprovacoes-e-nogle.repro.ts), agora
// regressões permanentes da DEMONSTRAÇÃO, com controles positivos. A operação real já seguia as regras.
import { describe, expect, it } from "vitest";

import { aprovacoesVisiveis } from "./consultas";
import { APROVACOES } from "./dados";
import { resumoDeVendas, type VendaDemo } from "./dados/vendas";

const venda = (tipo: "recarga" | "ativacao" | "acessorio", situacaoTelecom: "confirmada" | "pendente" | undefined, preco: number): VendaDemo => ({
  numero: "TESTE", minutos: 600, hora: "10:00", loja: "teste", vendedor: "teste", cliente: null,
  itens: [{ sku: "TESTE", nome: "Teste sintético", tipo, quantidade: 1, precoUnitario: preco, custoUnitario: 0, desconto: 0, situacaoTelecom }],
  pagamentos: [], total: preco, custo: 0, descontos: 0, situacao: "concluida", nota: "nao_solicitada",
});

describe("indicadores da demonstração", () => {
  it("valor de face da recarga não é receita da Ora (#31); controle: acessório é", () => {
    expect(resumoDeVendas([venda("recarga", "confirmada", 3000)]).faturamento).toBe(0);
    expect(resumoDeVendas([venda("acessorio", undefined, 3000)]).faturamento).toBe(3000);
  });
  it("só conta ativação confirmada (#32); controle: confirmada conta", () => {
    expect(resumoDeVendas([venda("ativacao", "pendente", 0)]).telecom).toBe(0);
    expect(resumoDeVendas([venda("ativacao", "confirmada", 0)]).telecom).toBe(1);
  });
});

describe("fila de aprovação da demonstração (#36)", () => {
  it("quem pediu não vê o próprio pedido; controle: outro gerente da loja vê", () => {
    const pedido = APROVACOES.find((x) => x.tipo === "desconto");
    expect(pedido).toBeDefined();
    const fila = aprovacoesVisiveis({ perfil: "gerente", pessoaId: pedido!.venda.vendedor, loja: pedido!.venda.loja });
    expect(fila.some((x) => x.id === pedido!.id)).toBe(false);
    const outro = aprovacoesVisiveis({ perfil: "gerente", pessoaId: "gerente-de-teste", loja: pedido!.venda.loja });
    expect(outro.some((x) => x.id === pedido!.id)).toBe(true);
  });
});

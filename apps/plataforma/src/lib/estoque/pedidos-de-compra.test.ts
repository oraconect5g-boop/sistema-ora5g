// Regras da tela dos pedidos de compra (lote INV-009a): a leitura do formulário, as mensagens do banco, a conferência
// de cada linha e a leitura estrita da lista e do pedido. As regras que valem estão no banco
// (packages/banco/src/pedido-de-compra.test.ts).
import { describe, expect, it, vi } from "vitest";

import { conferenciaDaLinha, erroDoPedido, ERROS_DOS_PEDIDOS, lerFormularioDoPedido, lerPedido, lerPedidos } from "./pedidos-de-compra";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
const FORN = "00000000-0000-4000-9000-000000000060";
const CAPA = "00000000-0000-4000-9000-000000000031";
const APARELHO = "00000000-0000-4000-9000-000000000030";
const PEDIDO = "00000000-0000-4000-9000-0000000000a7";
const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });
const base = { unidade: LOJA, fornecedor: FORN, chave: "pedido:0001", itens: JSON.stringify([{ variante: CAPA, quantidade: "10", custo: "18,00" }]) };
const cliente = (resposta: { data: unknown; error: { code: string } | null }) => ({ rpc: vi.fn(async () => resposta) }) as never;
const doPedido = (extra: Record<string, unknown> = {}) => ({
  id: PEDIDO, numero: 7, unidade_id: LOJA, fornecedor_id: FORN, fornecedor: "Distribuidora", documento: null, previsto_para: "2026-11-20", situacao: "aberto",
  criado_em: "2026-11-15T12:00:00Z", encerrado_em: null, motivo_encerramento: null, ...extra,
});

describe("pedidos de compra (INV-009a)", () => {
  it("o formulário: os itens em JSON, cada variação uma vez, a quantidade e o custo em reais; o resto conferido", () => {
    expect(lerFormularioDoPedido(formulario({ ...base, documento: " COT  77 ", previsto: "2026-11-20", observacao: "  Pela  manhã " }))).toEqual({
      ok: true, dados: { unidade: LOJA, fornecedor: FORN, documento: "COT 77", previsto: "2026-11-20", observacao: "Pela manhã", chave: "pedido:0001", itens: [{ variante: CAPA, quantidade: 10, custo: 1_800 }] },
    });
    expect(lerFormularioDoPedido(formulario({ ...base, itens: JSON.stringify([{ variante: APARELHO, quantidade: 2, custo: "" }]) }))).toMatchObject({ ok: true, dados: { itens: [{ variante: APARELHO, quantidade: 2 }], documento: null } });
    for (const [campos, erro] of [
      [{ unidade: "x" }, "dados"], [{ chave: "curta" }, "dados"], [{ fornecedor: "" }, "fornecedor"], [{ documento: "x".repeat(61) }, "documento"],
      [{ previsto: "20/11/2026" }, "previsto"], [{ observacao: "ab" }, "observacao"], [{ itens: "não é json" }, "itens"], [{ itens: "[]" }, "itens"],
      [{ itens: JSON.stringify([{ variante: CAPA, quantidade: 1 }, { variante: CAPA, quantidade: 2 }]) }, "itens"],
      [{ itens: JSON.stringify([{ variante: CAPA, quantidade: "0" }]) }, "quantidade"], [{ itens: JSON.stringify([{ variante: CAPA, quantidade: "1,5" }]) }, "quantidade"],
      [{ itens: JSON.stringify([{ variante: CAPA, quantidade: 1, custo: "abc" }]) }, "custo"], [{ itens: JSON.stringify([{ variante: CAPA, quantidade: 1, custo: "1.000.000,01" }]) }, "custo"],
    ] as const) expect(lerFormularioDoPedido(formulario({ ...base, ...campos })), JSON.stringify(campos).slice(0, 50)).toEqual({ ok: false, erro });
  });

  it("cada recusa do banco tem a sua mensagem, e toda mensagem existe", () => {
    const casos = [
      [{ code: "42501", message: "Sem permissão" }, "permissao"], [{ code: "P0002" }, "nao_encontrado"], [{ code: "OR004" }, "repetida"], [{ code: "PGRST202" }, "indisponivel"],
      [{ code: "22023", message: "Escolha um fornecedor ativo desta rede" }, "fornecedor"], [{ code: "22023", message: "Referência do fornecedor longa demais (até 60)" }, "documento"],
      [{ code: "22023", message: "A previsão de entrega vai de hoje até um ano" }, "previsto"], [{ code: "22023", message: "Observação: de 3 a 300 letras" }, "observacao"],
      [{ code: "22023", message: "O pedido precisa ter de 1 a 200 linhas" }, "itens"], [{ code: "22023", message: "Linha 2 (ACE-0001): a variação já está em outra linha do pedido" }, "itens"],
      [{ code: "22023", message: "Linha 1 (ACE-0001): quantidade inválida (1 a 10.000)" }, "quantidade"], [{ code: "22023", message: "Linha 1: custo inválido" }, "custo"],
      [{ code: "22023", message: "Linha 1: variação inativa ou de outra rede" }, "item"], [{ code: "22023", message: "Linha 1 (REC-0001): este tipo de item não tem estoque" }, "item"],
      [{ code: "22023", message: "O motivo tem até 300 letras" }, "motivo"], [{ code: "57014" }, "falha"],
    ] as const;
    for (const [erro, esperado] of casos) {
      expect(erroDoPedido(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DOS_PEDIDOS, esperado)).toBe(true);
    }
  });

  it("a conferência de cada linha: a falta, o que veio a mais e o custo da nota diferente do combinado", () => {
    expect(conferenciaDaLinha({ quantidade: 10, recebida: 6, custoCombinado: 1_800, custoDaNota: 1_900 })).toEqual({ falta: 4, aMais: 0, custoDiferente: true });
    expect(conferenciaDaLinha({ quantidade: 10, recebida: 11, custoCombinado: 1_800, custoDaNota: 1_800 })).toEqual({ falta: 0, aMais: 1, custoDiferente: false });
    expect(conferenciaDaLinha({ quantidade: 2, recebida: 2, custoCombinado: null, custoDaNota: 1_000 })).toEqual({ falta: 0, aMais: 0, custoDiferente: false });
  });

  it("a leitura: a lista e o pedido convertidos; sem a função, nulo; não é seu, não encontrado; forma estranha ou falha, falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lista = await lerPedidos(cliente({ data: [{ ...doPedido(), unidades: 12, recebidas: 6, entradas: 1, total_previsto: "21600" }], error: null }), LOJA, "aberto");
    expect(lista).toEqual({ estado: "ok", dados: [expect.objectContaining({ id: PEDIDO, numero: 7, fornecedorId: FORN, previstoPara: "2026-11-20", recebidas: 6, totalPrevisto: 21_600 })] });
    const pedido = await lerPedido(cliente({ data: { ...doPedido(), observacao: null, ve_custo: false, itens: [{ linha: 1, variante_id: CAPA, sku: "ACE-0001", nome: "Capa", produto: "Capa", quantidade: 10, recebida: 6, custo_combinado: null, custo_da_nota: null }], fora_do_pedido: [], entradas: [{ id: PEDIDO, numero: 12, documento: "NF 1", situacao: "estornada", criado_em: "2026-11-15T13:00:00Z", unidades: 6 }] }, error: null }), PEDIDO);
    expect(pedido).toMatchObject({ estado: "ok", dados: { veCusto: false, itens: [{ sku: "ACE-0001", recebida: 6, custoCombinado: null }], entradasLigadas: [{ numero: 12, registrada: false }] } });
    for (const code of ["PGRST202", "42883"]) expect(await lerPedidos(cliente({ data: null, error: { code } }), LOJA, "todos"), code).toBeNull();
    expect(await lerPedido(cliente({ data: null, error: { code: "P0002" } }), PEDIDO)).toEqual({ estado: "nao_encontrado" });
    expect(await lerPedidos(cliente({ data: null, error: { code: "57014" } }), LOJA, "aberto")).toEqual({ estado: "falha" });
    expect(await lerPedidos(cliente({ data: [{ ...doPedido({ situacao: "pago" }), unidades: 1, recebidas: 0, entradas: 0, total_previsto: null }], error: null }), LOJA, "aberto")).toEqual({ estado: "falha" });
    expect(await lerPedido(cliente({ data: { ...doPedido(), itens: [] }, error: null }), PEDIDO)).toEqual({ estado: "falha" });
    // o filtro "todos" não manda a situação
    const espiao = cliente({ data: [], error: null }) as unknown as { rpc: ReturnType<typeof vi.fn> };
    await lerPedidos(espiao as never, LOJA, "todos");
    expect(espiao.rpc).toHaveBeenCalledWith("pedidos_compra", { p_unidade: LOJA });
  });
});

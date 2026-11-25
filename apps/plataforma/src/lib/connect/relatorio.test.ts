// O relatório do vendedor e da loja da Ora Connect (lote CONNECT-k): as somas, os grupos e a planilha. Operações FICTÍCIAS.
import { describe, expect, it } from "vitest";

import { linhasDoCsv, somasDoRelatorio, somasPor, totalConfirmadas, type OperacaoDoRelatorio } from "./relatorio";

const op = (o: Partial<OperacaoDoRelatorio>): OperacaoDoRelatorio => ({
  id: `o${Math.random()}`, numero: 1, tipo: "recarga", situacao: "confirmada", vendedor_id: "ana", unidade_id: "loja-a", plano_nome: "10 GB",
  valor_face_centavos: 5490, recebido_na_loja_centavos: 5490, linha: "41999998888", criado_em: "2026-11-25T13:00:00Z", ...o,
});
const OPERACOES = [
  op({ tipo: "ativacao", valor_face_centavos: 4990, recebido_na_loja_centavos: 4990 }),
  op({ tipo: "recarga" }),
  op({ tipo: "portabilidade", valor_face_centavos: null, recebido_na_loja_centavos: null, vendedor_id: "bia" }),
  op({ tipo: "recarga", situacao: "aguardando_operadora", vendedor_id: "bia", unidade_id: "loja-b" }),
  op({ tipo: "ativacao", situacao: "resultado_desconhecido", vendedor_id: "bia" }),
  op({ tipo: "recarga", situacao: "recusada", vendedor_id: "ana", unidade_id: "loja-b" }),
];

describe("o relatório do vendedor e da loja (CONNECT-k)", () => {
  it("soma só as confirmadas na produção e separa as pendentes e as não feitas", () => {
    const s = somasDoRelatorio(OPERACOES);
    expect(s).toEqual({
      operacoes: 6, confirmadas: { ativacao: 1, recarga: 1, portabilidade: 1 }, emAndamento: 1, semResultado: 1, naoFeitas: 1,
      valorDeFace: 4990 + 5490, recebido: 4990 + 5490,
    });
    expect(totalConfirmadas(s)).toBe(3);
  });

  it("agrupa por vendedor e por loja, da maior produção para a menor", () => {
    const nomes: Record<string, string> = { ana: "Ana", bia: "Bia", "loja-a": "Loja A", "loja-b": "Loja B" };
    const porVendedor = somasPor(OPERACOES, "vendedor_id", (id) => nomes[id] ?? id);
    expect(porVendedor.map((v) => [v.nome, totalConfirmadas(v), v.emAndamento + v.semResultado, v.naoFeitas])).toEqual([["Ana", 2, 0, 1], ["Bia", 1, 2, 0]]);
    const porLoja = somasPor(OPERACOES, "unidade_id", (id) => nomes[id] ?? id);
    expect(porLoja.map((l) => [l.nome, totalConfirmadas(l), l.recebido])).toEqual([["Loja A", 3, 4990 + 5490], ["Loja B", 0, 0]]);
  });

  it("a planilha leva cada operação com os nomes e os valores em reais", () => {
    const linhas = linhasDoCsv([OPERACOES[0] as OperacaoDoRelatorio, OPERACOES[2] as OperacaoDoRelatorio], (id) => (id === "ana" ? "Ana" : "Bia"), () => "Loja A", () => "25/11/2026 às 10:00");
    expect(linhas).toEqual([
      ["25/11/2026 às 10:00", "1", "Ativação de chip", "Confirmada", "Ana", "Loja A", "10 GB", "41999998888", "49,90", "49,90"],
      ["25/11/2026 às 10:00", "1", "Portabilidade", "Confirmada", "Bia", "Loja A", "10 GB", "41999998888", "", ""],
    ]);
  });
});

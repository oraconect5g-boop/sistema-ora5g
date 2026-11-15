// Regras da tela do custo da variação (lote CAT-008b): a referência gravada em português, a leitura do formulário da
// correção e as mensagens do banco. As regras que valem estão no banco (packages/banco/src/correcao-do-custo.test.ts).
import { describe, expect, it } from "vitest";

import { detalheDoCusto, erroDoCusto, ERROS_DO_CUSTO, lerCorrecaoDoCusto } from "./custos";

const VARIANTE = "00000000-0000-4000-9000-000000000030";
const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("o custo da variação (CAT-008b)", () => {
  it("a referência gravada vira texto: a entrada, o estorno, a importação, a importação desfeita e o motivo da correção", () => {
    expect(detalheDoCusto("entrada", "entrada:12:3")).toBe("entrada nº 12");
    expect(detalheDoCusto("estorno", "estorno:entrada:12")).toBe("entrada nº 12 estornada");
    expect(detalheDoCusto("importacao", "importacao:3:7")).toBe("importação nº 3");
    expect(detalheDoCusto("manual", "desfaz:importacao:3:7")).toBe("importação nº 3 desfeita");
    expect(detalheDoCusto("correcao", "Nota com desconto")).toBe("Nota com desconto");
    expect([detalheDoCusto("entrada", null), detalheDoCusto("manual", "outra coisa"), detalheDoCusto("estorno", "estorno:12")]).toEqual([null, null, null]);
  });

  it("a correção: a variação, o custo em reais (zero vale; até R$ 1.000.000,00) e o motivo de 3 a 300 letras", () => {
    expect(lerCorrecaoDoCusto(formulario({ variante: VARIANTE, valor: " 1.234,56 ", motivo: "  Nota  certa " }))).toEqual({ ok: true, variante: VARIANTE, valor: 123_456, motivo: "Nota certa" });
    expect(lerCorrecaoDoCusto(formulario({ variante: VARIANTE, valor: "0", motivo: "Brinde" }))).toMatchObject({ ok: true, valor: 0 });
    expect(lerCorrecaoDoCusto(formulario({ variante: VARIANTE, valor: "1.000.000,00", motivo: "Teto" }))).toMatchObject({ ok: true, valor: 100_000_000 });
    for (const [campos, erro] of [
      [{ variante: "x", valor: "1", motivo: "Motivo" }, "dados"], [{ variante: VARIANTE, valor: "1.000.000,01", motivo: "Motivo" }, "custo_valor"],
      [{ variante: VARIANTE, valor: "", motivo: "Motivo" }, "custo_valor"], [{ variante: VARIANTE, valor: "R$ abc", motivo: "Motivo" }, "custo_valor"],
      [{ variante: VARIANTE, valor: "1", motivo: "ab" }, "custo_motivo"], [{ variante: VARIANTE, valor: "1", motivo: "y".repeat(301) }, "custo_motivo"],
    ] as const) expect(lerCorrecaoDoCusto(formulario(campos)), JSON.stringify(campos).slice(0, 60)).toEqual({ ok: false, erro });
  });

  it("cada recusa do banco tem a sua mensagem, e toda mensagem existe na tela", () => {
    const casos = [
      [{ code: "P0002", message: "Variação não encontrada para você" }, "custo_permissao"], [{ code: "42501", message: "permission denied" }, "custo_permissao"],
      [{ code: "PGRST202" }, "custo_indisponivel"], [{ code: "42883" }, "custo_indisponivel"],
      [{ code: "22023", message: "Custo inválido: de R$ 0,00 a R$ 1.000.000,00" }, "custo_valor"], [{ code: "22023", message: "Informe o motivo" }, "custo_motivo"],
      [{ code: "22023", message: "outra" }, "custo_falha"], [{ code: "57014" }, "custo_falha"], [null, "custo_falha"],
    ] as const;
    for (const [erro, esperado] of casos) {
      expect(erroDoCusto(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DO_CUSTO, esperado)).toBe(true);
    }
  });
});

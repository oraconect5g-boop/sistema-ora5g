// Os repasses dos marketplaces (lote REPASSE-a): a leitura estrita do painel, os formulários e as mensagens. Dados FICTÍCIOS.
import { describe, expect, it } from "vitest";

import { diferencaDoRepasse, ERROS_DOS_REPASSES, erroDosRepasses, lerPainelDosRepasses, mudouDepoisDeCasar, validarCasar, validarDesfazer } from "./repasses";

const LINHA = "00000000-0000-4000-8000-0000000000f1";
const OUTRA = "00000000-0000-4000-8000-0000000000f2";
const repasse = (extra: Record<string, unknown> = {}) => ({
  canal: "mercado_livre", data_repasse: "2026-11-10", pedidos: 2, esperado: 26_100, estimados: 1, casado: null,
  sugestoes: [{ linha: LINHA, extrato: 3, data: "2026-11-12", valor: 26_100, descricao: "TED MERCADO PAGO" }], ...extra,
});
const casado = (extra: Record<string, unknown> = {}) => ({
  linha: OUTRA, extrato: 4, data: "2026-11-11", recebido: 26_000, esperado_ao_casar: 26_100, pedidos_ao_casar: 2, motivo: "Tarifa de saque", ...extra,
});
const campos = (valores: Record<string, string>) => ({ get: (nome: string) => valores[nome] ?? null });

describe("a leitura do painel dos repasses", () => {
  it("converte o repasse, o casado e as sugestões", () => {
    const p = lerPainelDosRepasses({ repasses: [repasse(), repasse({ canal: "shopee", casado: casado(), sugestoes: [] })], sem_data_de_repasse: 1 });
    expect(p.semDataDeRepasse).toBe(1);
    expect(p.repasses[0]).toEqual({
      canal: "mercado_livre", dataRepasse: "2026-11-10", pedidos: 2, esperado: 26_100, estimados: 1, casado: null,
      sugestoes: [{ linha: LINHA, extrato: 3, data: "2026-11-12", valor: 26_100, descricao: "TED MERCADO PAGO" }],
    });
    expect(p.repasses[1]?.casado).toEqual({ linha: OUTRA, extrato: 4, data: "2026-11-11", recebido: 26_000, esperadoAoCasar: 26_100, pedidosAoCasar: 2, motivo: "Tarifa de saque" });
  });

  it("forma inesperada é erro, nunca zero", () => {
    for (const ruim of [{ repasses: [repasse({ canal: "amazon" })], sem_data_de_repasse: 0 }, { repasses: [repasse({ esperado: 1.5 })], sem_data_de_repasse: 0 },
      { repasses: [repasse({ casado: "sim" })], sem_data_de_repasse: 0 }, { repasses: [], sem_data_de_repasse: -1 }, { repasses: {} , sem_data_de_repasse: 0 }, null]) {
      expect(() => lerPainelDosRepasses(ruim)).toThrow();
    }
  });

  it("a diferença é o recebido menos o esperado de agora; os pedidos que mudaram depois de casar aparecem", () => {
    const p = lerPainelDosRepasses({ repasses: [repasse({ casado: casado() }), repasse({ casado: casado({ recebido: 26_100 }), esperado: 30_000, pedidos: 3 }), repasse()], sem_data_de_repasse: 0 });
    expect(p.repasses.map(diferencaDoRepasse)).toEqual([-100, -3_900, null]);
    expect(p.repasses.map(mudouDepoisDeCasar)).toEqual([false, true, false]);
  });
});

describe("os formulários e as mensagens", () => {
  it("casar pede o canal, a data e a linha; o motivo é opcional aqui (o banco pede quando o valor difere)", () => {
    expect(validarCasar(campos({ canal: "shopee", data_repasse: "2026-11-08", linha: LINHA, motivo: "  Tarifa  de saque " })))
      .toEqual({ ok: true, dados: { canal: "shopee", data: "2026-11-08", linha: LINHA, motivo: "Tarifa de saque" } });
    expect(validarCasar(campos({ canal: "shopee", data_repasse: "2026-11-08", linha: LINHA }))).toMatchObject({ ok: true, dados: { motivo: null } });
    expect(validarCasar(campos({ canal: "amazon", data_repasse: "2026-11-08", linha: LINHA }))).toEqual({ ok: false, erro: "dados" });
    expect(validarCasar(campos({ canal: "shopee", data_repasse: "08/11/2026", linha: LINHA }))).toEqual({ ok: false, erro: "dados" });
    expect(validarCasar(campos({ canal: "shopee", data_repasse: "2026-11-08", linha: "x" }))).toEqual({ ok: false, erro: "linha" });
    expect(validarCasar(campos({ canal: "shopee", data_repasse: "2026-11-08", linha: LINHA, motivo: "ok" }))).toEqual({ ok: false, erro: "motivo" });
  });

  it("desfazer pede sempre o motivo", () => {
    expect(validarDesfazer(campos({ canal: "tiktok_shop", data_repasse: "2026-11-08", motivo: "Linha errada" })))
      .toEqual({ ok: true, dados: { canal: "tiktok_shop", data: "2026-11-08", motivo: "Linha errada" } });
    expect(validarDesfazer(campos({ canal: "tiktok_shop", data_repasse: "2026-11-08" }))).toEqual({ ok: false, erro: "motivo" });
  });

  it("cada recusa do banco vira uma mensagem que existe", () => {
    const casos: [{ code: string; message?: string }, string][] = [
      [{ code: "42501" }, "permissao"], [{ code: "OR045" }, "ocupado"], [{ code: "P0002", message: "Nenhum pedido deste canal com esta data de repasse" }, "sem_pedidos"],
      // AUD-c (F21-02): a linha conciliada com uma venda ou fora da conta não recebe repasse.
      [{ code: "OR046", message: "Esta linha já está conciliada com o pagamento de uma venda: desfaça a conciliação antes" }, "linha_em_uso"],
      [{ code: "OR046", message: "Esta linha está fora da conta: volte a linha para a conta antes" }, "linha_em_uso"],
      [{ code: "P0002", message: "Linha do extrato não encontrada" }, "linha"],
      [{ code: "22023", message: "O valor da linha não é o esperado do repasse: diga o motivo da diferença" }, "diferenca"],
      [{ code: "22023", message: "Informe o motivo de desfazer (de 3 a 200 letras)" }, "motivo"],
      [{ code: "22023", message: "A linha tem de ser do extrato do banco da rede" }, "linha"],
      [{ code: "22023", message: "Escolha o canal e a data do repasse" }, "dados"], [{ code: "57014" }, "falha"],
    ];
    for (const [erro, chave] of casos) {
      expect(erroDosRepasses(erro), erro.message ?? erro.code).toBe(chave);
      expect(ERROS_DOS_REPASSES[chave as keyof typeof ERROS_DOS_REPASSES]).toBeTruthy();
    }
  });
});

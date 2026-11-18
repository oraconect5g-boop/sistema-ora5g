// DEMO-b: os dados FICTÍCIOS dos fluxos novos na demonstração seguem as mesmas regras da aplicação real (as contas fecham).
import { describe, expect, it } from "vitest";

import { CARGA_DEMO, CONCILIACOES_NOGLE_DEMO, EXTRATOS_DEMO, ORIGENS_DAS_RESERVAS_DEMO, unidadesQueEntram } from "./fluxos-novos";

describe("DEMO-b — os fluxos novos na demonstração", () => {
  it("os extratos: o líquido é o bruto menos a taxa; a sugestão tem o valor da linha; a saída nunca tem sugestão; fora da conta tem motivo", () => {
    for (const e of EXTRATOS_DEMO) {
      for (const l of e.linhas) {
        expect(l.liquido, l.id).toBe(l.bruto - l.taxa);
        if (l.sugestao) expect(l.sugestao.valor, l.id).toBe(l.bruto);
        if (l.bruto < 0) expect(l.sugestao, l.id).toBeNull();
        if (l.situacao === "fora") expect((l.motivo ?? "").trim().length, l.id).toBeGreaterThanOrEqual(3);
      }
    }
    expect(EXTRATOS_DEMO.flatMap((e) => e.linhas).filter((l) => l.situacao === "a_conferir" && !l.sugestao).length).toBeGreaterThan(0);
  });

  it("a carga: sem decisão, só entram as linhas certas; a decisão lança o disponível, o físico conferido ou nada; o aparelho nunca entra pela quantidade", () => {
    expect(unidadesQueEntram(CARGA_DEMO, {})).toEqual({ unidades: 42, linhas: 2 });
    const aDecidir = CARGA_DEMO.linhas.filter((l) => l.acao === "conferir");
    expect(aDecidir.map((l) => l.ordem)).toEqual([3, 4]);
    for (const l of aDecidir) expect(l.fisico, l.nome).toBeGreaterThan(l.disponivel ?? 0);
    expect(unidadesQueEntram(CARGA_DEMO, { 3: { resolucao: "disponivel", motivo: "contar depois" }, 4: { resolucao: "fisico", motivo: "conferido na loja" } }))
      .toEqual({ unidades: 42 + 3 + 8, linhas: 4 });
    expect(unidadesQueEntram(CARGA_DEMO, { 3: { resolucao: "fora", motivo: "contar depois" }, 4: { resolucao: "fora", motivo: "contar depois" } }))
      .toEqual({ unidades: 42, linhas: 2 });
    expect(CARGA_DEMO.linhas.some((l) => l.acao === "serializado")).toBe(true);
  });

  it("a origem das reservas: atendidas, canceladas e vencidas somam as reservas; as vendas não passam das atendidas", () => {
    for (const o of ORIGENS_DAS_RESERVAS_DEMO) {
      expect(o.atendidas + o.canceladas + o.vencidas, o.origem).toBe(o.reservas);
      expect(o.vendas, o.origem).toBeLessThanOrEqual(o.atendidas);
    }
  });

  it("a conciliação da Nogle: as linhas do relatório fecham com os resultados; o que não fecha é listado, só com o final dos números", () => {
    for (const c of CONCILIACOES_NOGLE_DEMO) {
      expect(c.conferidas + c.valorDiferente + c.soNaNogle, c.relatorio).toBe(c.linhas);
      expect(c.naoFecham.length, c.relatorio).toBe(c.valorDiferente + c.soNaNogle + c.soNaOra);
      for (const l of c.naoFecham) {
        expect(l.linha, c.relatorio).toMatch(/^final \d{4}$/);
        expect(l.iccid, c.relatorio).toMatch(/^(final \d{4}|—)$/);
      }
    }
  });
});

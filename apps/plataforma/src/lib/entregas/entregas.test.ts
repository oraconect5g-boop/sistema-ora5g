// As entregas do projeto (lote ENTREGAS-a; aceite A18): a situação de cada lote e os dados gerados do checkpoint.
import { describe, expect, it } from "vitest";

import { dataDoDia, ENTREGAS, ESTADOS_DOS_REQUISITOS, linkDoRoteiro, situacaoDoLote, type Lote } from "./entregas";

const lote = (extra: Partial<Lote> = {}): Lote => ({
  lote: "X-a", roteiro: "docs/aceite/X-a.md", requisitos: ["ORA-QUAL-001"], entrega: "teste", commit: null,
  publicado_em: null, pedido_em: null, resposta: null, respondido_em: null, ...extra,
});

describe("situação de cada lote", () => {
  it("a resposta do proprietário manda; sem ela, o pedido do aceite; sem pedido, se está no ar", () => {
    expect(situacaoDoLote(lote())).toEqual({ chave: "em_preparo", rotulo: "Em preparo: ainda não está no ar", tom: "neutro" });
    expect(situacaoDoLote(lote({ commit: "abc1234", publicado_em: "2026-11-17" })).chave).toBe("no_ar");
    expect(situacaoDoLote(lote({ commit: "abc1234", publicado_em: "2026-11-17", pedido_em: "2026-11-17" })).rotulo).toBe("Esperando o seu aceite");
    expect(situacaoDoLote(lote({ pedido_em: "2026-11-17", resposta: "aceito", respondido_em: "2026-11-18" }))).toEqual({ chave: "aceito", rotulo: "Aceito em 18/11/2026", tom: "sucesso" });
    expect(situacaoDoLote(lote({ pedido_em: "2026-11-17", resposta: "não aceito" })).chave).toBe("nao_aceito");
  });

  it("a data do dia e o link do roteiro", () => {
    expect(dataDoDia("2026-11-17")).toBe("17/11/2026");
    expect(dataDoDia(null)).toBe("");
    expect(linkDoRoteiro("docs/aceite/ROT-a.md")).toBe("https://github.com/oraconect5g-boop/sistema-ora5g/blob/main/docs/aceite/ROT-a.md");
  });
});

describe("os dados gerados do checkpoint", () => {
  it("trazem os 179 requisitos, a contagem que soma o total e os lotes com roteiro em docs/aceite", () => {
    expect(ENTREGAS.total).toBe(179);
    expect(Object.values(ENTREGAS.contagem).reduce((s, n) => s + n, 0)).toBe(ENTREGAS.total);
    expect(ESTADOS_DOS_REQUISITOS.map((e) => e.chave).sort()).toEqual(Object.keys(ENTREGAS.contagem).sort());
    expect(ENTREGAS.lotes.length).toBeGreaterThan(0);
    for (const l of ENTREGAS.lotes) expect(l.roteiro).toMatch(/^docs\/aceite\/[A-Za-z0-9-]+\.md$/);
    expect(ENTREGAS.homologados).toBeLessThanOrEqual(ENTREGAS.total);
  });
});

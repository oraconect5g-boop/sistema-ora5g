import { describe, expect, it } from "vitest";

import { alertasDoEscopo, aprovacoesVisiveis, desempenhoDe, estoqueVisivel, vendasVisiveis, vendedoresVisiveis } from "./consultas";
import { LOJAS, pessoa, VENDAS_HOJE, VENDEDORES } from "./dados";
import { LOJAS_DO_PERFIL, REDE } from "./perfis";

// Regra do proprietário (07/11/2026) e ADR-002 §2.4: gerente, gestor e dono veem todos os vendedores do
// seu escopo; o vendedor vê só os próprios números e opera só a loja escolhida na sessão.

const vendedora = { perfil: "vendedor", pessoaId: "ana", loja: "santa-candida" } as const;
const gerente = { perfil: "gerente", pessoaId: "marcos", loja: "santa-candida" } as const;
const donoRede = { perfil: "dono", pessoaId: "ricardo", loja: REDE } as const;
const tecnico = { perfil: "tecnico", pessoaId: "teo", loja: "assistencia" } as const;

describe("o que cada perfil vê", () => {
  it("vendedor vê só as próprias vendas, e só na loja da sessão", () => {
    const vendas = vendasVisiveis(vendedora);
    expect(vendas.length).toBeGreaterThan(0);
    expect(vendas.every((v) => v.vendedor === "ana" && v.loja === "santa-candida")).toBe(true);
    const naLoja03 = vendasVisiveis({ ...vendedora, loja: "loja-03" });
    expect(naLoja03.every((v) => v.vendedor === "ana" && v.loja === "loja-03")).toBe(true);
  });

  it("gerente vê as vendas de todos os vendedores da loja dele, e de nenhuma outra loja", () => {
    const vendas = vendasVisiveis(gerente);
    expect(new Set(vendas.map((v) => v.vendedor)).size).toBeGreaterThan(1);
    expect(vendas.every((v) => v.loja === "santa-candida")).toBe(true);
    expect(vendas.length).toBe(VENDAS_HOJE.filter((v) => v.loja === "santa-candida").length);
  });

  it("dono na rede vê todas as vendas; numa loja, só as daquela loja", () => {
    expect(vendasVisiveis(donoRede).length).toBe(VENDAS_HOJE.length);
    expect(vendasVisiveis({ ...donoRede, loja: "loja-05" }).every((v) => v.loja === "loja-05")).toBe(true);
  });

  it("técnico não vê vendas", () => expect(vendasVisiveis(tecnico)).toEqual([]));

  it("vendedor vê só a si mesmo na lista de vendedores; gestão vê a equipe toda", () => {
    expect(vendedoresVisiveis(vendedora).map((v) => v.id)).toEqual(["ana"]);
    const equipe = vendedoresVisiveis(gerente).map((v) => v.id);
    expect(equipe).toEqual(expect.arrayContaining(["ana", "lucas", "julia", "rafael"]));
    expect(vendedoresVisiveis(donoRede).length).toBe(VENDEDORES.length);
  });

  it("só gerente e dono veem a fila de aprovação; o gerente só a da loja dele", () => {
    expect(aprovacoesVisiveis(vendedora)).toEqual([]);
    expect(aprovacoesVisiveis({ perfil: "administrador", pessoaId: "admin", loja: REDE })).toEqual([]);
    const daLoja = aprovacoesVisiveis(gerente);
    expect(daLoja.length).toBeGreaterThan(0);
    expect(daLoja.every((a) => a.venda.loja === "santa-candida")).toBe(true);
    expect(aprovacoesVisiveis(donoRede).length).toBeGreaterThan(daLoja.length);
  });

  it("estoque do vendedor é o da loja da sessão", () => {
    expect(estoqueVisivel(vendedora).every((u) => u.loja === "santa-candida")).toBe(true);
    expect(estoqueVisivel(donoRede).length).toBeGreaterThan(estoqueVisivel(vendedora).length);
  });

  it("alertas do vendedor não mostram caixa nem aprovações da loja", () => {
    const alertas = alertasDoEscopo(vendedora).map((a) => a.id);
    expect(alertas.some((id) => id.startsWith("caixa-") || id === "descontos")).toBe(false);
    expect(alertasDoEscopo(gerente).some((a) => a.id === "descontos")).toBe(true);
  });
});

describe("vendedor em mais de uma loja", () => {
  it("a vendedora da demonstração tem vínculo com duas lojas e turnos que não se sobrepõem", () => {
    const ana = pessoa("ana");
    expect(LOJAS_DO_PERFIL.vendedor).toEqual(ana?.lojas);
    const [a, b] = Object.values(ana?.turnos ?? {});
    expect(a && b && (a[1] <= b[0] || b[1] <= a[0])).toBe(true);
  });

  it("a produção soma as lojas, mas cada venda fica com a loja em que foi feita", () => {
    const ana = pessoa("ana");
    if (!ana) throw new Error("sem Ana");
    const total = desempenhoDe(ana);
    const porLoja = ana.lojas.map((l) => desempenhoDe(ana, l).vendido);
    expect(porLoja.reduce((s, v) => s + v, 0)).toBe(total.vendido);
    expect(total.porLoja.every((l) => ana.lojas.includes(l.loja))).toBe(true);
  });

  it("todas as lojas da rede têm vendedores e meta", () => {
    for (const loja of LOJAS) {
      expect(VENDEDORES.some((v) => v.lojas.includes(loja.codigo)), loja.nome).toBe(true);
      expect(loja.metaDia).toBeGreaterThan(0);
    }
  });
});

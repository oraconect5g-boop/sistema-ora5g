import { describe, expect, it } from "vitest";

import { montarMenu, PAGINAS_REAIS } from "./menu";

// Permissões de cada papel no banco (matriz do ADR-002, papel_permissoes), só as que o menu usa.
const PAPEL = {
  vendedor: ["venda.registrar", "caixa.abrir", "estoque.consultar", "connect.operar"],
  gerente: ["venda.registrar", "venda.ver_unidade", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver"],
  dono: ["venda.registrar", "venda.ver_unidade", "venda.ver_todas", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "usuarios.gerir"],
  administrador: ["venda.ver_todas", "estoque.consultar", "auditoria.ver", "usuarios.gerir"],
  tecnico: [],
} as const;
const menu = (papel: keyof typeof PAPEL) => montarMenu(new Set(PAPEL[papel]));

describe("menu único das telas reais", () => {
  it("vendedor: vende, vê as próprias vendas, caixa, Connect, estoque e catálogo; nada de gestão", () => {
    const m = menu("vendedor");
    expect(m.visiveis).toEqual(["inicio", "vender", "vendas", "caixa", "connect", "estoque", "transferencias", "catalogo"]);
    expect(m.atalhos).toEqual(["inicio", "vender", "vendas", "estoque"]);
    expect(m.grupos.map((g) => g.grupo)).toEqual(["Operação", "Estoque e catálogo"]);
  });

  it("gerente: ganha aprovações, notas e auditoria; aprovações vira atalho no celular; equipe continua com o dono", () => {
    const m = menu("gerente");
    expect(m.visiveis).toContain("aprovacoes");
    expect(m.visiveis).toContain("notas");
    expect(m.visiveis).toContain("auditoria");
    expect(m.visiveis).not.toContain("equipe");
    expect(m.atalhos).toEqual(["inicio", "vender", "aprovacoes", "vendas"]);
  });

  it("dono vê tudo; administrador não vende, mas vê vendas, equipe e auditoria", () => {
    expect(menu("dono").visiveis).toEqual(Object.keys(PAGINAS_REAIS));
    const admin = menu("administrador");
    expect(admin.visiveis).not.toContain("vender");
    expect(admin.visiveis).not.toContain("caixa");
    expect(admin.visiveis).toEqual(expect.arrayContaining(["vendas", "equipe", "auditoria", "estoque"]));
  });

  it("financeiro (#65): gerente, dono e administrador; vendedor e técnico não (abrir caixa não libera)", () => {
    expect(menu("gerente").visiveis).toContain("financeiro");
    expect(menu("dono").visiveis).toContain("financeiro");
    expect(menu("administrador").visiveis).toContain("financeiro");
    expect(menu("vendedor").visiveis).not.toContain("financeiro");
    expect(menu("tecnico").visiveis).not.toContain("financeiro");
    expect(menu("gerente").grupos.find((g) => g.grupo === "Gestão")?.paginas[0]).toBe("financeiro");
  });

  it("técnico (sem permissões de loja) só vê o início e o catálogo; nunca fica sem menu", () => {
    expect(menu("tecnico").visiveis).toEqual(["inicio", "catalogo"]);
    expect(menu("tecnico").atalhos).toEqual(["inicio", "catalogo"]);
  });

  it("no máximo 4 atalhos e cada página em um grupo só", () => {
    for (const papel of Object.keys(PAPEL) as (keyof typeof PAPEL)[]) {
      const m = menu(papel);
      expect(m.atalhos.length).toBeLessThanOrEqual(4);
      expect(m.grupos.flatMap((g) => g.paginas).sort()).toEqual([...m.visiveis].sort());
    }
  });
});

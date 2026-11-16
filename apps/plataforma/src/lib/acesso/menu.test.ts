import { describe, expect, it } from "vitest";

import { montarMenu, PAGINAS_REAIS } from "./menu";

// Permissões de cada papel no banco (matriz do ADR-002, papel_permissoes), só as que o menu usa.
const PAPEL = {
  vendedor: ["venda.registrar", "caixa.abrir", "estoque.consultar", "connect.operar", "cliente.buscar", "crm.atender", "metas.ver_propria", "os.abrir"],
  gerente: ["venda.registrar", "venda.ver_unidade", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "cliente.buscar", "crm.atender", "pagamento.conciliar", "terminal.gerir", "metas.gerir", "metas.ver_unidade", "conta_pagar.gerir", "os.abrir", "os.gerir"],
  dono: ["venda.registrar", "venda.ver_unidade", "venda.ver_todas", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar", "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "usuarios.gerir", "unidades.gerir", "catalogo.gerir", "cliente.buscar", "crm.atender", "pagamento.conciliar", "terminal.gerir", "metas.gerir", "metas.ver_unidade", "metas.ver_propria", "conta_pagar.gerir", "resultado.ver", "previsao.ver", "os.abrir", "os.gerir"],
  administrador: ["venda.ver_todas", "estoque.consultar", "auditoria.ver", "usuarios.gerir", "unidades.gerir", "catalogo.gerir"],
  tecnico: ["os.orcar"],
} as const;
const menu = (papel: keyof typeof PAPEL) => montarMenu(new Set(PAPEL[papel]));

describe("menu único das telas reais", () => {
  it("vendedor: vende, vê as próprias vendas, caixa, Connect, estoque e catálogo; da gestão, só as próprias metas", () => {
    const m = menu("vendedor");
    expect(m.visiveis).toEqual(["inicio", "vender", "vendas", "reservas_site", "clientes", "funil", "agenda", "caixa", "connect", "assistencia", "estoque", "transferencias", "catalogo", "metas"]);
    expect(m.atalhos).toEqual(["inicio", "vender", "vendas", "estoque"]);
    expect(m.grupos.map((g) => g.grupo)).toEqual(["Operação", "Clientes", "Estoque e catálogo", "Gestão"]);
    expect(m.grupos.find((g) => g.grupo === "Gestão")?.paginas).toEqual(["metas"]);
  });

  it("reservas do site (ONLINE-b): quem vende (dono, gerente e vendedor), no grupo Operação, sem tirar o estoque dos atalhos do celular", () => {
    for (const papel of ["dono", "gerente", "vendedor"] as const) expect(menu(papel).visiveis).toContain("reservas_site");
    for (const papel of ["administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("reservas_site");
    expect(PAGINAS_REAIS.reservas_site).toMatchObject({ caminho: "/reservas-do-site", grupo: "Operação" });
    expect(menu("vendedor").atalhos).toEqual(["inicio", "vender", "vendas", "estoque"]);
  });

  it("metas (G4b): dono e gerente (a loja e a equipe) e vendedor (as próprias), no grupo Gestão; administrador e técnico não", () => {
    for (const papel of ["dono", "gerente", "vendedor"] as const) expect(menu(papel).visiveis).toContain("metas");
    for (const papel of ["administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("metas");
    expect(PAGINAS_REAIS.metas).toMatchObject({ caminho: "/metas", grupo: "Gestão", icone: "metas" });
    expect(menu("gerente").grupos.find((g) => g.grupo === "Gestão")?.paginas.slice(0, 3)).toEqual(["financeiro", "relatorios", "metas"]);
  });

  it("contas a pagar (L8a): dono e gerente, no grupo Gestão, depois das metas; vendedor, administrador e técnico não", () => {
    for (const papel of ["dono", "gerente"] as const) expect(menu(papel).visiveis).toContain("contas_pagar");
    for (const papel of ["vendedor", "administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("contas_pagar");
    expect(PAGINAS_REAIS.contas_pagar).toMatchObject({ caminho: "/contas-a-pagar", grupo: "Gestão", icone: "contas" });
    expect(menu("gerente").grupos.find((g) => g.grupo === "Gestão")?.paginas.slice(0, 4)).toEqual(["financeiro", "relatorios", "metas", "contas_pagar"]);
  });

  it("resultado do mês (L8b): só o dono, no grupo Gestão, depois das contas a pagar; gerente, vendedor, administrador e técnico não", () => {
    expect(menu("dono").visiveis).toContain("resultado");
    for (const papel of ["gerente", "vendedor", "administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("resultado");
    expect(PAGINAS_REAIS.resultado).toMatchObject({ caminho: "/resultado", grupo: "Gestão", icone: "resultado" });
    expect(menu("dono").grupos.find((g) => g.grupo === "Gestão")?.paginas.slice(0, 5)).toEqual(["financeiro", "relatorios", "metas", "contas_pagar", "resultado"]);
  });

  it("previsão de caixa (L8c): só o dono, no grupo Gestão, depois do resultado do mês; gerente, vendedor, administrador e técnico não", () => {
    expect(menu("dono").visiveis).toContain("previsao");
    for (const papel of ["gerente", "vendedor", "administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("previsao");
    expect(PAGINAS_REAIS.previsao).toMatchObject({ caminho: "/previsao", grupo: "Gestão", icone: "previsao" });
    expect(menu("dono").grupos.find((g) => g.grupo === "Gestão")?.paginas.slice(0, 6)).toEqual(["financeiro", "relatorios", "metas", "contas_pagar", "resultado", "previsao"]);
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

  it("lojas da rede (L2): dono e administrador, no grupo Administração; gerente, vendedor e técnico não", () => {
    expect(menu("dono").visiveis).toContain("lojas");
    expect(menu("administrador").visiveis).toContain("lojas");
    for (const papel of ["gerente", "vendedor", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("lojas");
    expect(menu("dono").grupos.find((g) => g.grupo === "Administração")?.paginas).toEqual(["equipe", "lojas"]);
  });

  it("cadastro de produtos (L3a): dono e administrador, em Estoque e catálogo; gerente e vendedor só veem o catálogo", () => {
    expect(menu("dono").visiveis).toContain("produtos");
    expect(menu("administrador").visiveis).toContain("produtos");
    for (const papel of ["gerente", "vendedor", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("produtos");
    expect(PAGINAS_REAIS.produtos.grupo).toBe("Estoque e catálogo");
  });

  it("técnico: o início, a assistência (L12a) e o catálogo; nunca fica sem menu", () => {
    expect(menu("tecnico").visiveis).toEqual(["inicio", "assistencia", "catalogo"]);
    expect(menu("tecnico").atalhos).toEqual(["inicio", "assistencia", "catalogo"]);
  });

  it("no máximo 4 atalhos e cada página em um grupo só", () => {
    for (const papel of Object.keys(PAPEL) as (keyof typeof PAPEL)[]) {
      const m = menu(papel);
      expect(m.atalhos.length).toBeLessThanOrEqual(4);
      expect(m.grupos.flatMap((g) => g.paginas).sort()).toEqual([...m.visiveis].sort());
    }
  });

  it("clientes (L5a): quem atende (dono, gerente e vendedor) busca e abre a ficha; administrador e técnico não", () => {
    for (const papel of ["dono", "gerente", "vendedor"] as const) expect(menu(papel).visiveis).toContain("clientes");
    for (const papel of ["administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("clientes");
    expect(PAGINAS_REAIS.clientes.grupo).toBe("Clientes");
    for (const papel of ["dono", "gerente", "vendedor"] as const) expect(menu(papel).visiveis).toEqual(expect.arrayContaining(["funil", "agenda"]));
    for (const papel of ["administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("funil");
  });

  it("conciliação e maquininhas (L7a): gerência da loja (dono e gerente) em Gestão; vendedor, administrador e técnico não", () => {
    for (const papel of ["dono", "gerente"] as const) expect(menu(papel).visiveis).toEqual(expect.arrayContaining(["conciliacao", "maquininhas"]));
    for (const papel of ["vendedor", "administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("conciliacao");
    expect(PAGINAS_REAIS.conciliacao.grupo).toBe("Gestão");
  });

  it("assistência (L12a): quem recebe aparelho (dono, gerente, vendedor) e o técnico, em Operação; administrador não", () => {
    for (const papel of ["dono", "gerente", "vendedor", "tecnico"] as const) expect(menu(papel).visiveis).toContain("assistencia");
    expect(menu("administrador").visiveis).not.toContain("assistencia");
    expect(menu("tecnico").visiveis).toEqual(["inicio", "assistencia", "catalogo"]);
    expect(PAGINAS_REAIS.assistencia).toMatchObject({ grupo: "Operação", caminho: "/assistencia", icone: "assistencia" });
  });

  it("recebíveis (L8e): quem concilia (dono e gerente) em Gestão; vendedor, administrador e técnico não", () => {
    for (const papel of ["dono", "gerente"] as const) expect(menu(papel).visiveis).toContain("recebiveis");
    for (const papel of ["vendedor", "administrador", "tecnico"] as const) expect(menu(papel).visiveis).not.toContain("recebiveis");
    expect(PAGINAS_REAIS.recebiveis).toMatchObject({ grupo: "Gestão", caminho: "/pagamentos/recebiveis" });
  });
});

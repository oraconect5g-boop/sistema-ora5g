import { describe, expect, it } from "vitest";

import { ACESSO, ATALHOS_CELULAR, ehPerfil, LOJAS_DO_PERFIL, PAGINAS, PERFIL_PADRAO, PERFIS, podeAcessar, podeVerCusto, REDE, vePorVendedor, type Perfil } from "./perfis";

describe("REV-010 — perfil da demonstração", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "desconhecido", "", "DONO"])("%s não é perfil", (valor) => {
    expect(ehPerfil(valor)).toBe(false);
  });

  it.each(["dono", "gerente", "vendedor", "administrador", "tecnico"])("%s é perfil", (valor) => expect(ehPerfil(valor)).toBe(true));

  it("valores que não são texto não são perfil", () => {
    for (const valor of [undefined, null, 1, {}, []]) expect(ehPerfil(valor)).toBe(false);
  });
});

describe("matriz do ADR-002 aplicada às telas", () => {
  it("o perfil padrão existe", () => expect(ehPerfil(PERFIL_PADRAO)).toBe(true));

  it("vendedor não aprova, não vê caixa da loja, relatórios, lojas nem auditoria", () => {
    for (const p of ["aprovacoes", "financeiro", "relatorios", "lojas", "auditoria", "importacao"] as const) expect(podeAcessar("vendedor", p), p).toBe(false);
    expect(podeAcessar("vendedor", "vender")).toBe(true);
  });

  it("administrador não vende, não aprova e não confere caixa (separação de funções)", () => {
    for (const p of ["vender", "aprovacoes", "financeiro", "metas", "clientes"] as const) expect(podeAcessar("administrador", p), p).toBe(false);
    expect(podeAcessar("administrador", "importacao")).toBe(true);
  });

  it("técnico vê só o início e as ordens de serviço", () => {
    expect([...ACESSO.tecnico].sort()).toEqual(["assistencia", "inicio"]);
  });

  it("vendedor não vê custo nem os números dos colegas; gestão vê", () => {
    expect(podeVerCusto("vendedor")).toBe(false);
    expect(vePorVendedor("vendedor")).toBe(false);
    for (const p of ["gerente", "dono"] as const) {
      expect(podeVerCusto(p)).toBe(true);
      expect(vePorVendedor(p)).toBe(true);
    }
  });

  it("vendedor tem vínculo com mais de uma loja; dono e administrador olham a rede", () => {
    expect(LOJAS_DO_PERFIL.vendedor.length).toBeGreaterThan(1);
    expect(LOJAS_DO_PERFIL.dono).toContain(REDE);
    expect(LOJAS_DO_PERFIL.administrador).toContain(REDE);
  });

  it("atalhos do celular são telas que o perfil acessa, no máximo 4", () => {
    for (const perfil of Object.keys(PERFIS) as Perfil[]) {
      expect(ATALHOS_CELULAR[perfil].length).toBeLessThanOrEqual(4);
      for (const p of ATALHOS_CELULAR[perfil]) expect(podeAcessar(perfil, p), `${perfil}/${p}`).toBe(true);
    }
  });

  it("toda tela tem caminho dentro de /demo", () => {
    for (const p of Object.values(PAGINAS)) expect(p.caminho.startsWith("/demo")).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import { acaoDeAlerta, nomeDaAcao } from "./regras";

describe("auditoria real: nomes legíveis", () => {
  it("assunto e operação do gatilho de auditoria", () => {
    expect(nomeDaAcao("vendas.criado")).toBe("Venda: criado");
    expect(nomeDaAcao("vinculos.encerrado")).toBe("Acesso: encerrado");
    expect(nomeDaAcao("perfis_usuario.bloqueado")).toBe("Pessoa: bloqueado");
  });

  it("ações especiais da sessão e do estoque", () => {
    expect(nomeDaAcao("sessao.unidade_negada")).toBe("Tentou entrar numa loja sem acesso");
    expect(nomeDaAcao("estoque.item_conferido")).toBe("Conferiu um aparelho ou chip");
  });

  it("código desconhecido aparece como veio; nome herdado de objeto não vira texto", () => {
    expect(nomeDaAcao("algo.novo")).toBe("algo.novo");
    expect(nomeDaAcao("constructor.criado")).toBe("constructor.criado");
    expect(nomeDaAcao("vendas.toString")).toBe("vendas.toString");
  });

  it("tentativas negadas e bloqueios ficam em destaque", () => {
    expect(acaoDeAlerta("sessao.fora_do_turno")).toBe(true);
    expect(acaoDeAlerta("perfis_usuario.bloqueado")).toBe(true);
    expect(acaoDeAlerta("vendas.criado")).toBe(false);
  });
});

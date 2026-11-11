import { describe, expect, it } from "vitest";

import { acaoPossivel, centavosDoFormulario, erroDePreco, situacaoDoPreco, validarCampanha, validarCancelamento, validarPreco } from "./precos";

// Dados FICTÍCIOS.
const VARIANTE = "00000000-0000-4000-9000-000000000030";
const LOJA = "00000000-0000-4000-8000-000000000020";
const PRECO = "00000000-0000-4000-9000-000000000040";
const agora = new Date("2026-11-11T15:00:00.000Z"); // 12:00 em São Paulo
const formulario = (campos: Record<string, string>) => (nome: string) => campos[nome] ?? null;

describe("preço novo", () => {
  const base = { variante: VARIANTE, unidade: "rede", canal: "loja", valor: "1.299,90", quando: "agora", motivo: "Reajuste do fornecedor" };
  it("rede ou loja, canal, valor em reais e início agora ou futuro", () => {
    expect(validarPreco(formulario(base), agora)).toEqual({ ok: true, dados: { variante: VARIANTE, unidade: null, canal: "loja", valor: 129_990, inicio: null, motivo: "Reajuste do fornecedor" } });
    expect(validarPreco(formulario({ ...base, unidade: LOJA, canal: "online", quando: "data", inicio: "2026-11-12T08:00" }), agora))
      .toMatchObject({ ok: true, dados: { unidade: LOJA, canal: "online", inicio: "2026-11-12T11:00:00.000Z" } });
  });
  it("recusa valor, canal, alcance, início no passado e motivo fora da regra", () => {
    expect(validarPreco(formulario({ ...base, valor: "mil" }), agora)).toEqual({ ok: false, erro: "valor" });
    expect(validarPreco(formulario({ ...base, valor: "1.000.000,01" }), agora)).toEqual({ ok: false, erro: "valor" });
    expect(validarPreco(formulario({ ...base, valor: "-10" }), agora)).toEqual({ ok: false, erro: "valor" });
    expect(validarPreco(formulario({ ...base, canal: "balcao" }), agora)).toEqual({ ok: false, erro: "canal" });
    expect(validarPreco(formulario({ ...base, unidade: "x" }), agora)).toEqual({ ok: false, erro: "dados" });
    expect(validarPreco(formulario({ ...base, quando: "data", inicio: "2026-11-11T11:59" }), agora)).toEqual({ ok: false, erro: "inicio" });
    expect(validarPreco(formulario({ ...base, quando: "data", inicio: "" }), agora)).toEqual({ ok: false, erro: "inicio" });
    expect(validarPreco(formulario({ ...base, motivo: "ok" }), agora)).toEqual({ ok: false, erro: "motivo" });
  });
  it("lê reais com vírgula, ponto de milhar e zero", () => {
    expect(centavosDoFormulario("R$ 79,90")).toBe(7_990);
    expect(centavosDoFormulario("0")).toBe(0);
    expect(centavosDoFormulario("1.000.000,00")).toBe(100_000_000);
    expect(centavosDoFormulario("")).toBeNull();
  });
});

describe("campanha", () => {
  const base = { variante: VARIANTE, unidade: "rede", canal: "loja", valor: "1.199,90", quando: "agora", fim: "2026-11-30T23:59", motivo: "Black Friday" };
  it("exige fim depois do início, com no máximo um ano", () => {
    expect(validarCampanha(formulario(base), agora)).toEqual({
      ok: true, dados: { variante: VARIANTE, unidade: null, canal: "loja", valor: 119_990, inicio: null, fim: "2026-12-01T02:59:00.000Z", motivo: "Black Friday" },
    });
    expect(validarCampanha(formulario({ ...base, fim: "2026-11-11T11:00" }), agora)).toEqual({ ok: false, erro: "fim" });
    expect(validarCampanha(formulario({ ...base, fim: "2027-12-31T23:59" }), agora)).toEqual({ ok: false, erro: "fim" });
    expect(validarCampanha(formulario({ ...base, quando: "data", inicio: "2026-12-01T00:00", fim: "2026-11-30T23:59" }), agora)).toEqual({ ok: false, erro: "fim" });
    expect(validarCampanha(formulario({ ...base, fim: "" }), agora)).toEqual({ ok: false, erro: "fim" });
  });
});

describe("cancelamento e situação", () => {
  it("cancelar exige o preço, a variação e o motivo", () => {
    expect(validarCancelamento(formulario({ preco: PRECO, variante: VARIANTE, motivo: "Fornecedor recuou" }))).toEqual({ ok: true, dados: { preco: PRECO, variante: VARIANTE, motivo: "Fornecedor recuou" } });
    expect(validarCancelamento(formulario({ preco: "x", variante: VARIANTE, motivo: "Fornecedor recuou" }))).toEqual({ ok: false, erro: "dados" });
  });
  it("situação de cada linha e o que ainda dá para desfazer", () => {
    const linha = (inicio: string, fim: string | null, origem = "manual", cancelado_em: string | null = null) => ({ inicio, fim, origem, cancelado_em });
    expect(situacaoDoPreco(linha("2026-11-01T00:00:00Z", null), agora)).toBe("vigente");
    expect(situacaoDoPreco(linha("2026-11-20T00:00:00Z", null), agora)).toBe("agendado");
    expect(situacaoDoPreco(linha("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"), agora)).toBe("encerrado");
    expect(situacaoDoPreco(linha("2026-11-20T00:00:00Z", null, "manual", "2026-11-10T00:00:00Z"), agora)).toBe("cancelado");
    expect(acaoPossivel(linha("2026-11-20T00:00:00Z", null), agora)).toBe("cancelar");
    expect(acaoPossivel(linha("2026-11-01T00:00:00Z", "2026-11-30T00:00:00Z", "campanha"), agora)).toBe("encerrar");
    expect(acaoPossivel(linha("2026-11-01T00:00:00Z", null), agora)).toBeNull();
    expect(acaoPossivel(linha("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", "campanha"), agora)).toBeNull();
  });
});

describe("erros do banco", () => {
  it("cada código vira uma mensagem do catálogo", () => {
    expect(erroDePreco({ code: "OR022" })).toBe("agendada");
    expect(erroDePreco({ code: "OR021" })).toBe("sobreposta");
    expect(erroDePreco({ code: "40001" })).toBe("instante");
    expect(erroDePreco({ code: "P0002" })).toBe("permissao");
    expect(erroDePreco({ code: "22023", message: "Este preço já valeu: para mudar, defina um preço novo" })).toBe("ja_valeu");
    expect(erroDePreco({ code: "22023", message: "O preço novo vale de agora em diante: a vigência não começa no passado" })).toBe("inicio");
    expect(erroDePreco({ code: "22023", message: "A campanha precisa de fim depois do início" })).toBe("fim");
    expect(erroDePreco({ code: "22023", message: "A campanha dura no máximo um ano" })).toBe("fim");
    expect(erroDePreco({ code: "22023", message: "Canal inválido" })).toBe("canal");
    expect(erroDePreco({ code: "XX000" })).toBe("falha");
  });
});

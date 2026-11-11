import { describe, expect, it } from "vitest";

import {
  erroDoCadastro, percentualDosPontosBase, pontosBaseDoPercentual, validarNome, validarPolitica, validarProduto, validarVariante,
} from "./cadastro";

// Dados FICTÍCIOS.
const ID = "00000000-0000-4000-9000-000000000001";
const CATEGORIA = "00000000-0000-4000-9000-000000000002";
const MARCA = "00000000-0000-4000-9000-000000000003";

describe("categoria e marca", () => {
  it("normaliza o nome, exige motivo e só muda a situação quando o campo veio no formulário", () => {
    expect(validarNome({ nome: "  Smart   watches ", motivo: "Linha nova" })).toEqual({ ok: true, dados: { id: null, nome: "Smart watches", ativa: null, motivo: "Linha nova" } });
    expect(validarNome({ id: ID, nome: "Relógios", tem_ativo: "1", motivo: "Fim da linha" })).toMatchObject({ dados: { ativa: false } });
    expect(validarNome({ id: ID, nome: "Relógios", tem_ativo: "1", ativo: "on", motivo: "Volta" })).toMatchObject({ dados: { ativa: true } });
    expect(validarNome({ nome: "", motivo: "Linha nova" })).toEqual({ ok: false, erro: "nome" });
    expect(validarNome({ nome: "x".repeat(61), motivo: "Linha nova" })).toEqual({ ok: false, erro: "nome" });
    expect(validarNome({ id: "1", nome: "Relógios", motivo: "Linha nova" })).toEqual({ ok: false, erro: "dados" });
    expect(validarNome({ nome: "Relógios", motivo: "ok" })).toEqual({ ok: false, erro: "motivo" });
  });
});

describe("produto", () => {
  const novo = { tipo: "aparelho", nome: "Moto G35", categoria: CATEGORIA, marca: MARCA, modelo: "XT2433", descricao: "", chave: "form:abc12345", motivo: "Produto novo" };
  it("criação exige tipo e a chave do formulário; edição não manda tipo nem chave", () => {
    expect(validarProduto(novo)).toEqual({
      ok: true,
      dados: { id: null, tipo: "aparelho", nome: "Moto G35", categoria: CATEGORIA, marca: MARCA, modelo: "XT2433", descricao: null, publicarOnline: false, ativo: null, chave: "form:abc12345", motivo: "Produto novo" },
    });
    expect(validarProduto({ ...novo, tipo: "geladeira" })).toEqual({ ok: false, erro: "tipo" });
    expect(validarProduto({ ...novo, chave: "" })).toEqual({ ok: false, erro: "dados" });
    expect(validarProduto({ ...novo, chave: "<script>" })).toEqual({ ok: false, erro: "dados" });
    expect(validarProduto({ ...novo, id: ID, tipo: "", chave: "", tem_ativo: "1", publicar_online: "on" })).toMatchObject({ ok: true, dados: { id: ID, tipo: null, chave: null, ativo: false, publicarOnline: true } });
  });
  it("recusa nome, categoria, marca e textos fora da regra", () => {
    expect(validarProduto({ ...novo, nome: " " })).toEqual({ ok: false, erro: "nome" });
    expect(validarProduto({ ...novo, categoria: "" })).toEqual({ ok: false, erro: "categoria" });
    expect(validarProduto({ ...novo, marca: "x" })).toEqual({ ok: false, erro: "marca" });
    expect(validarProduto({ ...novo, marca: "" })).toMatchObject({ ok: true, dados: { marca: null } });
    expect(validarProduto({ ...novo, modelo: "m".repeat(61) })).toEqual({ ok: false, erro: "texto_longo" });
    expect(validarProduto({ ...novo, descricao: "d".repeat(2001) })).toEqual({ ok: false, erro: "texto_longo" });
  });
});

describe("variação", () => {
  const nova = { produto: ID, sku: " MOT-G35-128 ", nome: "Moto G35 128 GB Verde", cor: "Verde", capacidade: "128 GB", codigo_barras: "7891234 567895", estoque_minimo: "2", motivo: "Variação nova" };
  it("normaliza SKU, código de barras e estoque mínimo", () => {
    expect(validarVariante(nova)).toEqual({
      ok: true,
      dados: { produto: ID, id: null, sku: "MOT-G35-128", nome: "Moto G35 128 GB Verde", cor: "Verde", capacidade: "128 GB", codigoBarras: "7891234567895", estoqueMinimo: 2, ativa: null, motivo: "Variação nova" },
    });
    expect(validarVariante({ ...nova, estoque_minimo: "" })).toMatchObject({ dados: { estoqueMinimo: 0 } });
  });
  it("recusa SKU com espaço, código de barras curto e estoque mínimo inválido", () => {
    expect(validarVariante({ ...nova, sku: "MOT G35" })).toEqual({ ok: false, erro: "sku" });
    expect(validarVariante({ ...nova, sku: "-MOT" })).toEqual({ ok: false, erro: "sku" });
    expect(validarVariante({ ...nova, codigo_barras: "12345" })).toEqual({ ok: false, erro: "codigo_barras" });
    expect(validarVariante({ ...nova, estoque_minimo: "-1" })).toEqual({ ok: false, erro: "estoque_minimo" });
    expect(validarVariante({ ...nova, estoque_minimo: "1,5" })).toEqual({ ok: false, erro: "estoque_minimo" });
    expect(validarVariante({ ...nova, cor: "c".repeat(41) })).toEqual({ ok: false, erro: "texto_longo" });
    expect(validarVariante({ ...nova, produto: "x" })).toEqual({ ok: false, erro: "dados" });
  });
});

describe("política de desconto da categoria", () => {
  it("percentual vira pontos-base; teto e margem juntos; vazios desligam", () => {
    expect(pontosBaseDoPercentual("10")).toBe(1000);
    expect(pontosBaseDoPercentual("7,5%")).toBe(750);
    expect(pontosBaseDoPercentual("")).toBeNull();
    expect(pontosBaseDoPercentual("101")).toBeUndefined();
    expect(pontosBaseDoPercentual("dez")).toBeUndefined();
    expect(percentualDosPontosBase(750)).toBe("7,5");
    expect(percentualDosPontosBase(null)).toBe("");
    expect(validarPolitica({ categoria: CATEGORIA, teto: "10", margem: "5", motivo: "Política do dono" })).toEqual({ ok: true, dados: { categoria: CATEGORIA, teto: 1000, margem: 500, motivo: "Política do dono" } });
    expect(validarPolitica({ categoria: CATEGORIA, teto: "", margem: "", motivo: "Desliga" })).toMatchObject({ ok: true, dados: { teto: null, margem: null } });
    expect(validarPolitica({ categoria: CATEGORIA, teto: "10", margem: "", motivo: "Só teto" })).toEqual({ ok: false, erro: "politica" });
  });
});

describe("erros do banco", () => {
  it("cada código vira uma mensagem do catálogo", () => {
    expect(erroDoCadastro({ code: "42501" })).toBe("permissao");
    expect(erroDoCadastro({ code: "OR004" })).toBe("repetido");
    expect(erroDoCadastro({ code: "OR020", message: "Este SKU já foi usado em estoque, reserva ou venda e não muda" })).toBe("sku_fixo");
    expect(erroDoCadastro({ code: "OR020", message: "A variação ainda tem estoque ou reserva" })).toBe("em_uso");
    expect(erroDoCadastro({ code: "23505", message: "Este SKU já está em outra variação" })).toBe("sku_repetido");
    expect(erroDoCadastro({ code: "23505", message: "Este código de barras já está em outra variação" })).toBe("codigo_barras_repetido");
    expect(erroDoCadastro({ code: "23505", message: "Já existe outra categoria com este nome" })).toBe("nome_repetido");
    expect(erroDoCadastro({ code: "22023", message: "O tipo do produto não muda depois de criado" })).toBe("tipo_fixo");
    expect(erroDoCadastro({ code: "22023", message: "Escolha uma categoria ativa desta rede" })).toBe("categoria");
    expect(erroDoCadastro({ code: "22023", message: "Produto inativo: reative antes de criar variação" })).toBe("produto_inativo");
    expect(erroDoCadastro({ code: "22023", message: "Informe o teto e a margem mínima juntos" })).toBe("politica");
    expect(erroDoCadastro({ code: "XX000" })).toBe("falha");
  });
});

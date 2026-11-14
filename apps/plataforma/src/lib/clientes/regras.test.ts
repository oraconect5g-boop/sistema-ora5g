// Regras do formulário de cliente (L5a): a mesma régua do banco para não ir até ele com o que já está errado.
import { describe, expect, it } from "vitest";

import { erroDoCliente, formatarRevelado, lerCliente, valorDaBusca } from "./regras";

// CPF e CNPJ fictícios com dígitos válidos.
const CPF = "52998224725";
const CNPJ = "11222333000181";
const form = (campos: Record<string, string | string[]>) => ({
  get: (n: string) => { const v = campos[n]; return Array.isArray(v) ? v[0] ?? null : v ?? null; },
  getAll: (n: string) => { const v = campos[n]; return v === undefined ? [] : [v].flat(); },
});

describe("lerCliente (cadastro)", () => {
  it("normaliza documento, telefone, e-mail e endereço; só a finalidade marcada vai junto", () => {
    expect(lerCliente(form({ tipo: "pessoa_fisica", nome: "  Maria   Teste ", documento: "529.982.247-25", telefone: "+55 (41) 98765-0001", email: " Maria@Exemplo.com ",
      finalidade: ["nota_fiscal", "entrega", "inventada"], endereco_cep: "80000-000", endereco_logradouro: "Rua A", endereco_numero: "10",
      endereco_bairro: "Centro", endereco_cidade: "Curitiba", endereco_uf: "pr" }), false))
      .toEqual({ ok: true, dados: { tipo: "pessoa_fisica", nome: "Maria Teste", documento: CPF, telefone: "41987650001", email: "maria@exemplo.com",
        finalidades: ["entrega", "nota_fiscal"], endereco: { cep: "80000000", logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" } } });
  });

  it("recusa sem tipo, sem nome, sem WhatsApp, documento do tipo errado, telefone e data inválidos", () => {
    const base = { tipo: "pessoa_fisica", nome: "José Teste", telefone: "41987650002" };
    expect(lerCliente(form({ ...base, tipo: "" }), false)).toEqual({ ok: false, erro: "tipo" });
    expect(lerCliente(form({ ...base, nome: "J" }), false)).toEqual({ ok: false, erro: "nome" });
    expect(lerCliente(form({ tipo: "pessoa_fisica", nome: "José Teste", documento: CPF }), false)).toEqual({ ok: false, erro: "whatsapp" });
    expect(lerCliente(form({ ...base, documento: CNPJ }), false)).toEqual({ ok: false, erro: "documento" });
    expect(lerCliente(form({ ...base, tipo: "pessoa_juridica", documento: CNPJ }), false)).toMatchObject({ ok: true });
    expect(lerCliente(form({ ...base, telefone: "98765" }), false)).toEqual({ ok: false, erro: "telefone" });
    expect(lerCliente(form({ ...base, email: "sem-arroba" }), false)).toEqual({ ok: false, erro: "email" });
    expect(lerCliente(form({ ...base, nascimento: "1990-02-30", finalidade: "ora_connect", documento: CPF }), false)).toEqual({ ok: false, erro: "nascimento" });
    expect(lerCliente(form({ ...base, endereco_cep: "800", finalidade: "entrega" }), false)).toEqual({ ok: false, erro: "endereco" });
  });

  it("cada finalidade pede o que precisa; nascimento e endereço sem finalidade que justifique são recusados", () => {
    const base = { tipo: "pessoa_fisica", nome: "José Teste", telefone: "41987650002" };
    expect(lerCliente(form({ ...base, finalidade: "nota_fiscal" }), false)).toEqual({ ok: false, erro: "finalidade" });
    expect(lerCliente(form({ ...base, documento: CPF, finalidade: "nota_fiscal" }), false)).toEqual({ ok: false, erro: "finalidade" }); // sem endereço (#76)
    expect(lerCliente(form({ ...base, documento: CPF, finalidade: "ora_connect" }), false)).toEqual({ ok: false, erro: "finalidade" });
    expect(lerCliente(form({ ...base, documento: CPF, nascimento: "1990-05-10", finalidade: "ora_connect" }), false)).toMatchObject({ ok: true });
    // #76: financiamento sem e-mail passa (CPF, WhatsApp e nascimento bastam).
    expect(lerCliente(form({ ...base, documento: CPF, nascimento: "1990-05-10", finalidade: "financiamento" }), false)).toMatchObject({ ok: true });
    expect(lerCliente(form({ ...base, nascimento: "1990-05-10", finalidade: "financiamento" }), false)).toEqual({ ok: false, erro: "finalidade" });
    expect(lerCliente(form({ ...base, nascimento: "1990-05-10" }), false)).toEqual({ ok: false, erro: "minimo" });
    expect(lerCliente(form({ ...base, endereco_cep: "80000000", endereco_logradouro: "Rua A", endereco_numero: "1", endereco_bairro: "Centro",
      endereco_cidade: "Curitiba", endereco_uf: "PR" }), false)).toEqual({ ok: false, erro: "minimo" });
  });
});

describe("cadastro rápido (#76)", () => {
  it("nome completo + WhatsApp bastam; nome de uma palavra só em pessoa física é recusado; empresa usa a razão social", () => {
    expect(lerCliente(form({ tipo: "pessoa_fisica", nome: "Ana Rápida", telefone: "(41) 98765-0101" }), false))
      .toEqual({ ok: true, dados: { tipo: "pessoa_fisica", nome: "Ana Rápida", telefone: "41987650101", finalidades: [] } });
    expect(lerCliente(form({ tipo: "pessoa_fisica", nome: "Ana", telefone: "41987650101" }), false)).toEqual({ ok: false, erro: "nome_completo" });
    expect(lerCliente(form({ tipo: "pessoa_juridica", nome: "Ltda", telefone: "41987650101" }), false)).toMatchObject({ ok: true });
    expect(lerCliente(form({ tipo: "pessoa_fisica", nome: "Ana Rápida", telefone: "41987650101", email: "" }), false)).toMatchObject({ ok: true });
  });
  it("na correção o WhatsApp não se apaga; as mensagens novas do banco têm chave", () => {
    expect(lerCliente(form({ remover: ["telefone"] }), true)).toEqual({ ok: false, erro: "whatsapp_fixo" });
    expect(erroDoCliente({ code: "22023", message: "Informe o WhatsApp do cliente com DDD: é por ele que a loja fala com o cliente e envia a nota" })).toBe("whatsapp");
    expect(erroDoCliente({ code: "22023", message: "Informe o nome completo (nome e sobrenome)" })).toBe("nome_completo");
    expect(erroDoCliente({ code: "22023", message: "O WhatsApp não se apaga: troque pelo número novo" })).toBe("whatsapp_fixo");
    expect(erroDoCliente({ code: "22023", message: "Nota fiscal no nome do cliente pede o CPF ou o CNPJ e o endereço completo" })).toBe("finalidade");
  });
});

describe("lerCliente (correção)", () => {
  it("campo vazio fica como está; finalidades só quando o formulário as envia; remover só campos conhecidos", () => {
    expect(lerCliente(form({ telefone: "41 98765-0009" }), true)).toEqual({ ok: true, dados: { telefone: "41987650009" } });
    expect(lerCliente(form({ finalidades_enviadas: "sim" }), true)).toEqual({ ok: true, dados: { finalidades: [] } });
    expect(lerCliente(form({ remover: ["email", "senha", "email"], telefone_compartilhado: "sim" }), true))
      .toEqual({ ok: true, dados: { remover: ["email"], telefone_compartilhado: true } });
    expect(lerCliente(form({ tipo: "outro" }), true)).toEqual({ ok: false, erro: "tipo" });
  });
});

describe("busca e mensagens", () => {
  it("busca só exata para CPF/CNPJ e telefone; código e nome com o mínimo", () => {
    expect(valorDaBusca("documento", "529.982.247-25")).toEqual({ ok: true, criterio: "documento", valor: CPF });
    expect(valorDaBusca("documento", "529.982")).toEqual({ ok: false });
    expect(valorDaBusca("telefone", "(41) 98765-0001")).toEqual({ ok: true, criterio: "telefone", valor: "41987650001" });
    expect(valorDaBusca("codigo", "12a")).toEqual({ ok: false });
    expect(valorDaBusca("nome", "Ma")).toEqual({ ok: false });
    expect(valorDaBusca("email", "a@b.c")).toEqual({ ok: false });
  });

  it("erros do banco viram chaves do catálogo", () => {
    expect(erroDoCliente({ code: "OR026" })).toBe("duplicado");
    expect(erroDoCliente({ code: "OR027" })).toBe("telefone_repetido");
    expect(erroDoCliente({ code: "OR028" })).toBe("limite");
    expect(erroDoCliente({ code: "22023", message: "Nota fiscal no nome do cliente pede o CPF ou o CNPJ" })).toBe("finalidade");
    expect(erroDoCliente({ code: "22023", message: "Data de nascimento só fica guardada para Ora Connect ou financiamento (dados mínimos)" })).toBe("minimo");
    expect(erroDoCliente({ code: "22023", message: "Informe o motivo" })).toBe("motivo");
    expect(erroDoCliente({ code: "22023", message: "Cadastre o contato deste canal antes de registrar o consentimento" })).toBe("consentimento");
    expect(erroDoCliente({ code: "XX000" })).toBe("falha");
  });

  it("dado revelado formatado só para exibir", () => {
    expect(formatarRevelado("documento", CPF)).toBe("529.982.247-25");
    expect(formatarRevelado("documento", CNPJ)).toBe("11.222.333/0001-81");
    expect(formatarRevelado("telefone", "41987650001")).toBe("(41) 98765-0001");
    expect(formatarRevelado("nascimento", "1990-05-10")).toBe("10/05/1990");
    expect(formatarRevelado("endereco", { cep: "80000000", logradouro: "Rua A", numero: "10", bairro: "Centro", cidade: "Curitiba", uf: "PR" }))
      .toBe("Rua A, 10 · Centro · Curitiba/PR · CEP 80000-000");
    expect(formatarRevelado("email", null)).toBe("não informado");
  });
});

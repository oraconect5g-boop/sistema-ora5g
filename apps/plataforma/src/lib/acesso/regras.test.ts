import { describe, expect, it } from "vitest";

import { decidirSessao, erroDoBanco, horaDoFimDoTurno, papeisQuePodeConceder, type SituacaoSessao, validarConvite, validarSenhaNova } from "./regras";

const ok: SituacaoSessao = { usuario_ativo: true, sessao_no_turno: true, unidade_id: "u1", unidade_nome: "Loja", turno_termina_em: null };
const ORG = "0a5e0000-0000-4000-8000-000000000001";
const LOJA = "0a5e0000-0000-4000-8000-000000000020";

describe("decidirSessao", () => {
  it("sem usuário ou sem resposta do banco: volta ao login", () => {
    expect(decidirSessao({ temUsuario: false, situacao: ok, exigirLoja: false })).toEqual({ tipo: "entrar" });
    expect(decidirSessao({ temUsuario: true, situacao: null, exigirLoja: false })).toEqual({ tipo: "entrar" });
  });
  it("bloqueado e turno encerrado saem com o motivo; bloqueio vem antes do turno", () => {
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, usuario_ativo: false, sessao_no_turno: false }, exigirLoja: false })).toEqual({ tipo: "sair", erro: "bloqueado" });
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, sessao_no_turno: false }, exigirLoja: false })).toEqual({ tipo: "sair", erro: "turno" });
  });
  it("sem loja escolhida: escolher a loja só quando a tela exige", () => {
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, unidade_id: null }, exigirLoja: true })).toEqual({ tipo: "escolher_loja" });
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, unidade_id: null }, exigirLoja: false })).toEqual({ tipo: "seguir" });
    expect(decidirSessao({ temUsuario: true, situacao: ok, exigirLoja: true })).toEqual({ tipo: "seguir" });
  });

  it("o código do segundo fator pendente leva à tela do código, antes da loja; bloqueio e fim do turno vêm antes dele (ORG-007a)", () => {
    const pendente = { ...ok, unidade_id: null, segundo_fator_pendente: true };
    expect(decidirSessao({ temUsuario: true, situacao: pendente, exigirLoja: true })).toEqual({ tipo: "segundo_fator" });
    expect(decidirSessao({ temUsuario: true, situacao: pendente, exigirLoja: false })).toEqual({ tipo: "segundo_fator" });
    expect(decidirSessao({ temUsuario: true, situacao: { ...pendente, usuario_ativo: false }, exigirLoja: true })).toEqual({ tipo: "sair", erro: "bloqueado" });
    expect(decidirSessao({ temUsuario: true, situacao: { ...pendente, sessao_no_turno: false }, exigirLoja: true })).toEqual({ tipo: "sair", erro: "turno" });
    // Banco sem a migration (o campo não vem) ou com o código já digitado: segue como antes.
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, segundo_fator_pendente: false }, exigirLoja: true })).toEqual({ tipo: "seguir" });
    expect(decidirSessao({ temUsuario: true, situacao: { ...ok, segundo_fator_pendente: null }, exigirLoja: true })).toEqual({ tipo: "seguir" });
  });
});

describe("equipe", () => {
  it("administrador não concede dono nem administrador", () => {
    expect(papeisQuePodeConceder(false)).toEqual(["gerente", "vendedor", "tecnico"]);
    expect(papeisQuePodeConceder(true)).toContain("administrador");
  });

  it("convite normaliza nome e e-mail, tira lojas repetidas e exige motivo", () => {
    const r = validarConvite({ organizacao: ORG, nome: "  Ana   Paula ", email: " Ana@Teste.Invalid ", papel: "vendedor", unidades: [LOJA, LOJA, "lixo"], motivo: " Contratação " });
    expect(r).toEqual({ ok: true, dados: { organizacao: ORG, nome: "Ana Paula", email: "ana@teste.invalid", papel: "vendedor", unidades: [LOJA], motivo: "Contratação" } });
    expect(validarConvite({ organizacao: ORG, nome: "Ana", email: "ana@teste.invalid", papel: "vendedor", unidades: [LOJA], motivo: "ok" })).toEqual({ ok: false, erro: "motivo" });
  });

  it("recusa papel desconhecido, vendedor sem loja, administrador com loja e e-mail inválido", () => {
    const base = { organizacao: ORG, nome: "Ana", email: "ana@teste.invalid", unidades: [LOJA], motivo: "Contratação" };
    expect(validarConvite({ ...base, papel: "__proto__" }).ok).toBe(false);
    expect(validarConvite({ ...base, papel: "vendedor", unidades: [] }).ok).toBe(false);
    expect(validarConvite({ ...base, papel: "administrador" }).ok).toBe(false);
    expect(validarConvite({ ...base, papel: "vendedor", email: "sem-arroba" }).ok).toBe(false);
    expect(validarConvite({ ...base, papel: "vendedor", organizacao: "1 or 1=1" }).ok).toBe(false);
  });

  it("erro do banco vira código conhecido; código desconhecido ou herdado vira falha", () => {
    expect(erroDoBanco({ code: "OR006" })).toBe("ja_na_equipe");
    expect(erroDoBanco({ code: "42501" })).toBe("sem_permissao");
    expect(erroDoBanco({ code: "constructor" })).toBe("falha");
    expect(erroDoBanco(null)).toBe("falha");
  });
});

describe("senha nova e fim do turno", () => {
  it("pede 10+ caracteres com letras e números, sem espaço nas pontas, e confirmação igual", () => {
    expect(validarSenhaNova("curta1", "curta1")).toBe("curta");
    expect(validarSenhaNova("somenteletras", "somenteletras")).toBe("fraca");
    expect(validarSenhaNova(" comespaco123", " comespaco123")).toBe("espaco");
    expect(validarSenhaNova("SenhaBoa2026", "SenhaBoa2027")).toBe("diferente");
    expect(validarSenhaNova("x1".repeat(40), "x1".repeat(40))).toBe("longa");
    expect(validarSenhaNova("SenhaBoa2026", "SenhaBoa2026")).toBeNull();
  });
  it("mostra a hora do fim do turno em São Paulo", () => {
    expect(horaDoFimDoTurno("2026-11-09T23:00:00Z")).toBe("20:00");
    expect(horaDoFimDoTurno("data ruim")).toBeNull();
  });
});

// Regras do segundo fator (lote ORG-007a: ORA-ORG-007): as mensagens de cada recusa do Supabase Auth, o código, o nome
// do celular e a lista dos celulares. Quem exige o código é o banco (packages/banco/src/segundo-fator.test.ts).
import { describe, expect, it } from "vitest";

import {
  cadastrosAbandonados, caminhoDepoisDoCodigo, celularesCadastrados, codigoValido, depoisDoCodigo, enderecoDoCodigo, ERROS_DO_CADASTRO, ERROS_DO_CODIGO,
  erroDoCadastro, erroDoCodigo, nomeDoCelular, segredoEmGrupos,
} from "./segundo-fator";

describe("segundo fator (ORG-007a)", () => {
  it("cada recusa ao conferir o código tem a sua mensagem, e toda mensagem existe; o texto do serviço nunca vai para a tela", () => {
    const casos = [
      [{ code: "mfa_verification_failed", status: 422 }, "codigo"], [{ code: "mfa_verification_rejected" }, "codigo"], [{ code: "mfa_challenge_expired" }, "vencido"],
      [{ code: "over_request_rate_limit", status: 429 }, "muitas"], [{ status: 429 }, "muitas"], [{ code: "mfa_factor_not_found" }, "celular"],
      [{ code: "unexpected_failure", status: 500 }, "falha"], [null, "falha"],
    ] as const;
    for (const [erro, esperado] of casos) {
      expect(erroDoCodigo(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DO_CODIGO, esperado)).toBe(true);
    }
  });

  it("cada recusa ao cadastrar ou tirar um celular tem a sua mensagem", () => {
    const casos = [
      [{ code: "mfa_factor_name_conflict" }, "repetido"], [{ code: "too_many_enrolled_mfa_factors" }, "limite"], [{ code: "mfa_verification_failed" }, "codigo"],
      [{ code: "mfa_challenge_expired" }, "codigo"], [{ code: "over_request_rate_limit" }, "muitas"], [{ code: "mfa_totp_enroll_not_enabled" }, "desligado"],
      [{ code: "mfa_totp_verify_not_enabled" }, "desligado"], [{ code: "insufficient_aal" }, "sessao"], [{ code: "x", status: 503 }, "falha"], [undefined, "falha"],
    ] as const;
    for (const [erro, esperado] of casos) {
      expect(erroDoCadastro(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DO_CADASTRO, esperado)).toBe(true);
    }
  });

  it("o código: 6 algarismos, com espaço ou hífen no meio; o resto não vale", () => {
    expect(["123456", " 123 456 ", "123-456"].map(codigoValido)).toEqual(["123456", "123456", "123456"]);
    expect(["12345", "1234567", "12a456", "", null, 123456].map(codigoValido)).toEqual([null, null, null, null, null, null]);
  });

  it("o nome do celular: de 2 a 40 letras, sem espaço sobrando", () => {
    expect(nomeDoCelular("  Celular   do  João ")).toBe("Celular do João");
    expect([nomeDoCelular("x"), nomeDoCelular("x".repeat(41)), nomeDoCelular(null)]).toEqual([null, null, null]);
  });

  it("os celulares: só os do aplicativo (TOTP) já confirmados, do mais antigo ao mais novo; o cadastro pela metade sai antes de outro", () => {
    const lista = {
      all: [
        { id: "f3", friendly_name: "Reserva", factor_type: "totp", status: "verified", created_at: "2026-11-15T15:00:00Z" },
        { id: "f1", friendly_name: " ", factor_type: "totp", status: "verified", created_at: "2026-11-14T10:00:00Z" },
        { id: "f2", friendly_name: "Tentativa", factor_type: "totp", status: "unverified", created_at: "2026-11-15T16:00:00Z" },
        { id: "f4", friendly_name: "Telefone", factor_type: "phone", status: "verified", created_at: "2026-11-13T09:00:00Z" },
      ],
    };
    expect(celularesCadastrados(lista)).toEqual([
      { id: "f1", nome: "Celular", cadastradoEm: "2026-11-14T10:00:00Z" },
      { id: "f3", nome: "Reserva", cadastradoEm: "2026-11-15T15:00:00Z" },
    ]);
    expect(cadastrosAbandonados(lista)).toEqual(["f2"]);
    expect([celularesCadastrados(null), cadastrosAbandonados(undefined)]).toEqual([[], []]);
  });

  it("depois do código: a troca de senha (só a chave conhecida) ou a escolha da loja; o endereço leva o erro e o destino", () => {
    expect(["senha", "Senha", "/inicio", "https://outro.exemplo", null].map(depoisDoCodigo)).toEqual(["senha", null, null, null, null]);
    expect([caminhoDepoisDoCodigo("senha"), caminhoDepoisDoCodigo(null)]).toEqual(["/conta/senha", "/escolher-loja"]);
    expect([enderecoDoCodigo("codigo", "senha"), enderecoDoCodigo("falha", null), enderecoDoCodigo(null, "senha"), enderecoDoCodigo(null, null)])
      .toEqual(["/entrar/codigo?erro=codigo&depois=senha", "/entrar/codigo?erro=falha", "/entrar/codigo?depois=senha", "/entrar/codigo"]);
  });

  it("o segredo em grupos de 4, para digitar no aplicativo", () => {
    expect(segredoEmGrupos("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(segredoEmGrupos("ABCDE")).toBe("ABCD E");
  });
});

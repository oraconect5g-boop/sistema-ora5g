// Regras da confirmação de senha recente (lote ORG-006b: ORA-ORG-006): a volta só para as telas das ações sensíveis, o
// endereço da confirmação e a mensagem neutra de cada recusa da senha. Quem exige é o banco
// (packages/banco/src/confirmacao-recente.test.ts).
import { describe, expect, it } from "vitest";

import { enderecoDaConfirmacao, erroDaSenha, ERROS_DA_CONFIRMACAO, precisaConfirmar, voltaDaConfirmacao } from "./confirmacao";

describe("confirmação de senha recente (ORG-006b)", () => {
  it("a volta: só as telas das ações sensíveis (com o resto do endereço); o resto vira o Início", () => {
    const titular = "/clientes/00000000-0000-4000-8000-0000000000c1/titular";
    expect(["/equipe", "/aprovacoes", "/notas?ok=aprovada", "/caixa#saidas", "/notas/conciliacao", titular].map(voltaDaConfirmacao))
      .toEqual(["/equipe", "/aprovacoes", "/notas?ok=aprovada", "/caixa#saidas", "/notas/conciliacao", titular]);
    for (const fora of ["/financeiro", "https://outro.exemplo/equipe", "//outro.exemplo", "/equipe//x", "/equipe\\x", "/equipe?<script>", "equipe", "", null, 3, ["/equipe"]]) {
      expect(voltaDaConfirmacao(fora), JSON.stringify(fora)).toBe("/inicio");
    }
    expect(voltaDaConfirmacao(`/equipe?${"x".repeat(300)}`)).toBe("/inicio");
  });

  it("o endereço da confirmação leva a volta e a mensagem; o banco pede pela OR033", () => {
    expect(enderecoDaConfirmacao("/caixa")).toBe("/conta/confirmar?volta=%2Fcaixa");
    expect(enderecoDaConfirmacao("/notas?ok=x", "credenciais")).toBe("/conta/confirmar?volta=%2Fnotas%3Fok%3Dx&erro=credenciais");
    expect(enderecoDaConfirmacao("https://fora.exemplo")).toBe("/conta/confirmar?volta=%2Finicio");
    expect([precisaConfirmar({ code: "OR033" }), precisaConfirmar({ code: "42501" }), precisaConfirmar(null)]).toEqual([true, false, false]);
  });

  it("a recusa da senha é neutra: senha incorreta, muitas tentativas, bloqueado ou falha; toda mensagem existe", () => {
    const casos = [
      [{ code: "invalid_credentials", status: 400 }, "credenciais"], [{ status: 400 }, "credenciais"], [{ code: "over_request_rate_limit", status: 429 }, "muitas"],
      [{ status: 429 }, "muitas"], [{ code: "user_banned", status: 403 }, "bloqueado"], [{ code: "unexpected_failure", status: 500 }, "falha"], [null, "falha"],
    ] as const;
    for (const [erro, esperado] of casos) {
      expect(erroDaSenha(erro), JSON.stringify(erro)).toBe(esperado);
      expect(Object.hasOwn(ERROS_DA_CONFIRMACAO, esperado)).toBe(true);
    }
  });
});

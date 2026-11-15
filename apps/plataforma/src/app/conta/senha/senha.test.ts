// A troca de senha de quem tem o segundo fator (lote ORG-007a: ORA-ORG-007), com o Supabase SIMULADO: com o código
// pendente (inclusive na recuperação pelo e-mail), primeiro a tela do código, que volta para a senha; e, se o Supabase
// pedir o código ao gravar a senha (insufficient_aal), a mesma volta. Sem o segundo fator, tudo como antes.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  pendente: false as boolean | undefined,
  situacaoComErro: false,
  recusa: null as null | { code?: string; status?: number },
  gravadas: 0,
}));

vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
vi.mock("../../../lib/supabase/servidor", () => ({
  clienteSupabaseServidor: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "00000000-0000-4000-8000-000000000001", email: "dono@teste.invalid" } }, error: null }),
      updateUser: async () => {
        cenario.gravadas += 1;
        return { data: null, error: cenario.recusa };
      },
    },
    rpc: () => ({
      maybeSingle: async () => (cenario.situacaoComErro
        ? { data: null, error: { code: "57014" } }
        : { data: { usuario_ativo: true, sessao_no_turno: true, ...(cenario.pendente === undefined ? {} : { segundo_fator_pendente: cenario.pendente }) }, error: null }),
    }),
  }),
}));

import { definirSenha } from "./acoes";
import DefinirSenha from "./page";

async function destino(acao: Promise<unknown>) {
  try { await acao; } catch (e) { return (e as Error).message.replace("redirecionou para ", ""); }
  return null;
}
const formulario = (senha: string) => {
  const f = new FormData();
  f.set("senha", senha);
  f.set("confirmacao", senha);
  return f;
};
const pagina = () => destino(DefinirSenha({ searchParams: Promise.resolve({}) }));

beforeEach(() => {
  cenario.pendente = false;
  cenario.situacaoComErro = false;
  cenario.recusa = null;
  cenario.gravadas = 0;
});

describe("troca de senha com o segundo fator (ORG-007a)", () => {
  it("com o código pendente, a página leva primeiro ao código; sem ele, num banco sem a migration ou sem resposta, mostra o formulário", async () => {
    cenario.pendente = true;
    expect(await pagina()).toBe("/entrar/codigo?depois=senha");
    for (const caso of [{ pendente: false }, { pendente: undefined }, { situacaoComErro: true }]) {
      Object.assign(cenario, { pendente: false, situacaoComErro: false }, caso);
      expect(await pagina(), JSON.stringify(caso)).toBeNull();
    }
  });

  it("se o Supabase pedir o código ao gravar a senha, a ação leva ao código e volta; outra recusa continua sendo a do serviço", async () => {
    cenario.recusa = { code: "insufficient_aal", status: 401 };
    expect(await destino(definirSenha(formulario("SenhaNova2026ok")))).toBe("/entrar/codigo?depois=senha");
    cenario.recusa = { code: "weak_password", status: 422 };
    expect(await destino(definirSenha(formulario("SenhaNova2026ok")))).toBe("/conta/senha?erro=servico");
    cenario.recusa = null;
    expect(await destino(definirSenha(formulario("SenhaNova2026ok")))).toBe("/escolher-loja");
    expect(cenario.gravadas).toBe(3);
  });
});

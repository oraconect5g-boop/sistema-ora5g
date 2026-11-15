// A confirmação de senha recente (lote ORG-006b: ORA-ORG-006; ADR-002 §2.6): aprovar desconto, aprovar nota, conferir o
// caixa, decidir a saída de dinheiro e mexer na equipe pedem a senha (ou o código do segundo fator, ou o link do e-mail)
// digitada nos últimos 30 minutos — o amr do JWT. Sem isso, OR033 antes de qualquer outra conferência; com isso, a função
// segue para as conferências de sempre. Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa
// transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { amrDaSenha, comoUsuario, criarBanco, type Amr, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
const nova = (usuario: string, amr?: Amr | null): Sessao =>
  ({ usuario, sessao: `5c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`, ...(amr === undefined ? {} : { amr }) });
async function erroDe(s: Sessao, sql: string, params: unknown[] = []): Promise<string | null> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint tentativa");
    try {
      await db.query(sql, params);
      await db.exec("release savepoint tentativa");
      return null;
    } catch (e) {
      await db.exec("rollback to savepoint tentativa");
      await db.exec("release savepoint tentativa");
      return (e as { code?: string }).code ?? "sem-codigo";
    }
  });
}
const QUALQUER = "00000000-0000-4000-9000-0000000000ee";
/** As dez ações sensíveis, cada uma com argumentos que não existem (a recusa de depois da confirmação não importa aqui). */
const SENSIVEIS: [string, string, unknown[]][] = [
  ["convidar_pessoa", "select public.convidar_pessoa($1, 'Pessoa Teste', 'pessoa@teste.invalid', 'vendedor', array[$2]::uuid[], 'motivo de teste')", [ids.organizacao, ids.lojaA]],
  ["vincular_pessoa", "select public.vincular_pessoa($1, $2, 'vendedor', $3, 'motivo de teste')", [ids.semVinculo, ids.organizacao, ids.lojaA]],
  ["encerrar_vinculo", "select public.encerrar_vinculo($1, 'motivo de teste')", [QUALQUER]],
  ["alterar_situacao_pessoa", "select public.alterar_situacao_pessoa($1, 'bloqueado', 'motivo de teste')", [ids.vendedorA]],
  ["cancelar_convite", "select public.cancelar_convite($1, 'motivo de teste')", [QUALQUER]],
  ["repetir_convite", "select public.repetir_convite($1)", [QUALQUER]],
  ["decidir_aprovacao", "select public.decidir_aprovacao($1, true, null)", [QUALQUER]],
  ["notas_decidir", "select public.notas_decidir($1, true, null)", [QUALQUER]],
  ["conferir_caixa", "select public.conferir_caixa($1, null)", [QUALQUER]],
  ["caixa_decidir_saida", "select public.caixa_decidir_saida($1, true, 'motivo de teste')", [QUALQUER]],
];
const agora = () => Math.floor(Date.now() / 1000);

describe("a confirmação de senha recente (ORG-006b)", () => {
  it("sem senha digitada nos últimos 30 minutos, cada ação sensível pede a confirmação (OR033) antes de gravar qualquer coisa", async () => {
    for (const amr of [amrDaSenha(31 * 60), null, [{ method: "token_refresh", timestamp: agora() }], [{ method: "password", timestamp: "agora" }]] as (Amr | null)[]) {
      for (const [nome, sql, params] of SENSIVEIS) {
        // O notas_decidir busca o pedido (com a permissão) antes do corpo: o pedido que não existe é recusado ali.
        const esperado = nome === "notas_decidir" ? "P0002" : "OR033";
        expect(await erroDe(nova(ids.dono, amr), sql, params), `${nome} ${JSON.stringify(amr)}`).toBe(esperado);
      }
    }
  });

  it("de verdade, na nota: o dono não aprova o pedido de nota com a senha velha (OR033, nada muda); com a senha recente, aprova", async () => {
    let n = 0;
    const chave = (prefixo: string) => `${prefixo}-confirmacao-${String(++n).padStart(4, "0")}`;
    const ana = nova(ids.vendedorA);
    const valor = <T>(sql: string, params: unknown[]) => comoUsuario(db, ana, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
    await comoUsuario(db, ana, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    await valor("select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>("select public.criar_venda($1) as v", [chave("venda")]);
    await valor("select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor("select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
    const pedido = await valor<string>("select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    const situacao = async () => (await db.query<{ situacao: string }>("select situacao from public.notas_pedidos where id = $1", [pedido])).rows[0]?.situacao;
    expect(await situacao()).toBe("aguardando_aprovacao");
    // A aprovação vale na loja do turno: o dono escolhe a loja do pedido (escolher a loja não pede a confirmação).
    const doDonoNaLoja = async (amr?: Amr) => {
      const s = nova(ids.dono, amr);
      await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
      return s;
    };
    expect(await erroDe(await doDonoNaLoja(amrDaSenha(45 * 60)), "select public.notas_decidir($1, true, null)", [pedido])).toBe("OR033");
    expect(await situacao()).toBe("aguardando_aprovacao");
    expect(await erroDe(await doDonoNaLoja(), "select public.notas_decidir($1, true, null)", [pedido])).toBeNull();
    expect(await situacao()).toBe("aprovada");
  });

  it("com a senha, o código do segundo fator ou o link do e-mail há pouco, a ação segue para as conferências de sempre", async () => {
    for (const amr of [amrDaSenha(), amrDaSenha(29 * 60), [{ method: "totp", timestamp: agora() - 60 }, { method: "password", timestamp: agora() - 3 * 3600 }], [{ method: "recovery", timestamp: agora() }]] as Amr[]) {
      for (const [nome, sql, params] of SENSIVEIS) expect(await erroDe(nova(ids.dono, amr), sql, params), `${nome} ${JSON.stringify(amr)}`).not.toBe("OR033");
    }
  });

  it("de verdade: o dono bloqueia alguém da equipe com a senha recente; com a senha velha, não, e nada muda", async () => {
    const situacao = async () => (await db.query<{ status: string }>("select status from public.perfis_usuario where id = $1", [ids.vendedorA])).rows[0]?.status;
    const antes = await situacao();
    expect(await erroDe(nova(ids.dono, amrDaSenha(40 * 60)), "select public.alterar_situacao_pessoa($1, 'bloqueado', 'teste da confirmação')", [ids.vendedorA])).toBe("OR033");
    expect(await situacao()).toBe(antes);
    expect(await erroDe(nova(ids.dono), "select public.alterar_situacao_pessoa($1, 'bloqueado', 'teste da confirmação')", [ids.vendedorA])).toBeNull();
    expect(await situacao()).toBe("bloqueado");
  });

  it("o resto do sistema não pede a confirmação: ler e vender seguem com a senha velha", async () => {
    const velha = nova(ids.vendedorA, amrDaSenha(5 * 3600));
    expect(await erroDe(velha, "select public.selecionar_unidade($1)", [ids.lojaA])).toBeNull();
    expect(await comoUsuario(db, velha, async () => (await db.query<{ v: boolean }>("select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaA])).rows[0]?.v)).toBe(true);
  });

  it("as duas conferências não saem pela API (só as funções do banco as usam)", async () => {
    for (const funcao of ["privado.autenticacao_recente()", "privado.exigir_autenticacao_recente()"]) {
      const pode = await db.query<{ v: boolean }>("select has_function_privilege('authenticated', $1, 'execute') as v", [funcao]);
      expect(pode.rows[0]?.v, funcao).toBe(false);
    }
  });
});

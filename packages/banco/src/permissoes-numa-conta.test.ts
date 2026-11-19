// Lote VEL-e (19/11/2026; ORA-QUAL-010; migration das permissões numa conta só): privado.permissoes_vigentes responde,
// para um conjunto de permissões, exatamente o que public.tem_permissao responde uma por uma: em todo papel, com a loja do
// turno, outra loja da mesma rede, a loja de outra rede e sem loja, e nos estados da sessão que barram a entrada. O molde
// da sessão e o sino passam a usá-la; os testes deles (sessao-molde-e-pdv.test.ts e pendencias-numa-ida.test.ts) seguem
// valendo sem mudança. Dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
let codigos: string[] = [];
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  codigos = (await db.query<{ codigo: string }>("select codigo from public.permissoes order by codigo")).rows.map((r) => r.codigo);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
const nova = (usuario: string, aal?: "aal1" | "aal2"): Sessao =>
  ({ usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`, ...(aal ? { aal } : {}) });
async function naLoja(usuario: string, unidade: string, aal?: "aal1" | "aal2"): Promise<Sessao> {
  const s = nova(usuario, aal);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Opcoes = { criarSessao?: boolean };
const lista = async (s: Sessao | null, sql: string, params: unknown[], opcoes: Opcoes = {}) =>
  (await comoUsuario(db, s, async () => (await db.query<{ c: string }>(sql, params)).rows, opcoes)).map((l) => l.c);
/** O jeito de antes: uma pergunta à tem_permissao por permissão do catálogo. */
const umaPorUma = (s: Sessao, unidade: string | null, opcoes: Opcoes = {}) =>
  lista(s, "select c from unnest($1::text[]) c where public.tem_permissao(c, $2::uuid) order by c", [codigos, unidade], opcoes);
/** O jeito do VEL-e: o catálogo inteiro numa conta só. */
const numaConta = (s: Sessao, unidade: string | null, opcoes: Opcoes = {}) =>
  lista(s, "select c from privado.permissoes_vigentes($1::text[], $2::uuid) c order by c", [codigos, unidade], opcoes);

describe("as permissões numa conta só (VEL-e)", () => {
  it("em todo papel e em toda loja, a conta só responde o mesmo que tem_permissao, uma por uma, para o catálogo inteiro", async () => {
    expect(codigos.length).toBeGreaterThan(40);
    const quem: [string, string, string | null][] = [
      ["dono na loja A", ids.dono, ids.lojaA], ["dono sem loja", ids.dono, null], ["administrador na loja B", ids.administrador, ids.lojaB],
      ["gerente na loja B", ids.gerenteB, ids.lojaB], ["vendedor na loja A", ids.vendedorA, ids.lojaA],
      ["vendedor de duas lojas, na A", ids.vendedorAB, ids.lojaA], ["vendedor de duas lojas, na B", ids.vendedorAB, ids.lojaB],
      ["técnico na assistência", ids.tecnico, ids.assistencia], ["dono de outra rede", ids.donoOutraOrg, ids.lojaOutraOrg],
      ["pessoa sem vínculo", ids.semVinculo, null], ["vínculo encerrado", ids.encerrado, null],
    ];
    const perguntas: (string | null)[] = [ids.lojaA, ids.lojaB, ids.assistencia, ids.lojaOutraOrg, null];
    const vistos = new Set<string>();
    const tamanhos: Record<string, number> = {};
    for (const [rotulo, usuario, unidade] of quem) {
      const s = unidade ? await naLoja(usuario, unidade) : nova(usuario);
      for (const pergunta of perguntas) {
        const antes = await umaPorUma(s, pergunta);
        expect(await numaConta(s, pergunta), `${rotulo}, perguntando pela loja ${pergunta ?? "nenhuma"}`).toEqual(antes);
        for (const c of antes) vistos.add(c);
        tamanhos[`${rotulo}|${pergunta ?? "-"}`] = antes.length;
      }
    }
    // Não passa com as pontas vazias, e as perguntas por loja dão respostas diferentes onde a regra manda.
    expect(vistos.size).toBeGreaterThan(30);
    expect(tamanhos[`gerente na loja B|${ids.lojaB}`]).toBeGreaterThan(0);
    expect(tamanhos[`gerente na loja B|${ids.lojaA}`]).toBe(0);
    expect(tamanhos[`dono na loja A|${ids.lojaOutraOrg}`]).toBe(0);
    expect(tamanhos[`dono na loja A|${ids.lojaB}`]).toBe(tamanhos[`dono na loja A|${ids.lojaA}`]);
    expect(tamanhos["pessoa sem vínculo|-"]).toBe(0);
    expect(tamanhos["vínculo encerrado|-"]).toBe(0);
  });

  it("código que não existe, repetido, nulo ou lista vazia: o mesmo que tem_permissao (nada a mais)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await lista(dono, "select c from privado.permissoes_vigentes($1::text[], $2::uuid) c order by c",
      [["nao.existe", "venda.registrar", "venda.registrar", null, "usuarios.gerir"], ids.lojaA])).toEqual(["usuarios.gerir", "venda.registrar"]);
    expect(await lista(dono, "select c from privado.permissoes_vigentes('{}'::text[], $1::uuid) c", [ids.lojaA])).toEqual([]);
    expect(await lista(dono, "select c from privado.permissoes_vigentes(null::text[], $1::uuid) c", [ids.lojaA])).toEqual([]);
  });

  it("os estados que barram a entrada: bloqueado, fora do turno, prazo vencido, depois de sair e segundo fator pendente", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect((await numaConta(vendedor, ids.lojaA)).length).toBeGreaterThan(0);
    await db.exec("savepoint estado");
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.vendedorA]);
    expect(await numaConta(vendedor, ids.lojaA)).toEqual([]);
    expect(await umaPorUma(vendedor, ids.lojaA)).toEqual([]);
    await db.exec("rollback to savepoint estado");

    // 13 horas depois de entrar (o turno é de 12) e o prazo do Auth vencido.
    const longa = await naLoja(ids.dono, ids.lojaA);
    await db.query("update auth.sessions set created_at = now() - interval '13 hours' where id = $1", [longa.sessao]);
    expect(await numaConta(longa, null)).toEqual([]);
    const vencida = await naLoja(ids.gerenteB, ids.lojaB);
    await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [vencida.sessao]);
    expect(await numaConta(vencida, ids.lojaB)).toEqual([]);

    // Saiu: a linha da sessão some do Auth; o token antigo não vale mais.
    const saiu = await naLoja(ids.vendedorAB, ids.lojaB);
    await db.query("delete from auth.sessions where id = $1", [saiu.sessao]);
    expect(await numaConta(saiu, ids.lojaB, { criarSessao: false })).toEqual([]);
    expect(await umaPorUma(saiu, ids.lojaB, { criarSessao: false })).toEqual([]);

    // Segundo fator cadastrado: sem o código conferido, nada; com ele, o mesmo de tem_permissao.
    await db.query("insert into auth.mfa_factors (user_id, friendly_name, factor_type, status) values ($1, 'Celular', 'totp', 'verified')", [ids.administrador]);
    expect(await numaConta(nova(ids.administrador, "aal1"), null)).toEqual([]);
    const comCodigo = await naLoja(ids.administrador, ids.lojaB, "aal2");
    const comCodigoAntes = await umaPorUma(comCodigo, ids.lojaB);
    expect(comCodigoAntes.length).toBeGreaterThan(0);
    expect(await numaConta(comCodigo, ids.lojaB)).toEqual(comCodigoAntes);
  });

  it("quem não entrou não executa; quem entrou executa", async () => {
    // O ponto de salvamento fica dentro do papel de quem chama: o erro de verdade não some atrás da transação abortada.
    const erro = await comoUsuario(db, null, async () => {
      await db.exec("savepoint passo");
      try {
        await db.query("select privado.permissoes_vigentes(array['venda.registrar'], null)");
        await db.exec("release savepoint passo");
        return null;
      } catch (e) {
        await db.exec("rollback to savepoint passo");
        await db.exec("release savepoint passo");
        return (e as { code?: string }).code ?? "sem-codigo";
      }
    });
    expect(erro).toBe("42501");
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await lista(vendedor, "select c from privado.permissoes_vigentes(array['venda.registrar'], null) c", [])).toEqual(["venda.registrar"]);
  });
});

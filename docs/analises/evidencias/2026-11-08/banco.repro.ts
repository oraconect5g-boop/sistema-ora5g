import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { comDigitoLuhn, comoUsuario, criarBanco } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

// Revisão independente: só banco descartável e dados sintéticos. Cada caso é revertido.
let db: PGlite;
beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });
async function erroDe(acao: () => Promise<unknown>) {
  // Uma exceção SQL aborta a transação; restaurar o savepoint permite o reset role do helper.
  await db.exec("savepoint tentativa_revisao");
  try {
    await acao();
    await db.exec("release savepoint tentativa_revisao");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa_revisao");
    await db.exec("release savepoint tentativa_revisao");
    return (e as { code?: string }).code;
  }
}
const sessao = { usuario: ids.vendedorA, sessao: "40000000-0000-4000-8000-000000000001" };
async function naLoja<T>(acao: () => Promise<T>) {
  return comoUsuario(db, sessao, async () => {
    await db.query("select public.selecionar_unidade($1)", [ids.lojaA]);
    return acao();
  });
}
it("IMEI principal de um aparelho não pode ser IMEI2 de outro", async () => {
  expect(await erroDe(() => db.query("update public.itens_serializados set imei2=$1 where id=$2", [cat.imei1, itens.a2]))).toBe("23505");
});
it("a mesma chave de reserva com outra quantidade deve ser rejeitada", async () => {
  await naLoja(async () => {
    await db.query("select public.reservar_estoque($1,1,null,'auditoria:quantidade')", [cat.capa]);
    expect(await erroDe(() => db.query("select public.reservar_estoque($1,9,null,'auditoria:quantidade')", [cat.capa]))).toBe("OR004");
  });
});
it("a mesma chave de reserva com outra origem deve ser rejeitada", async () => {
  await naLoja(async () => {
    await db.query("select public.reservar_estoque($1,1,null,'auditoria:origem','pdv')", [cat.capa]);
    expect(await erroDe(() => db.query("select public.reservar_estoque($1,1,null,'auditoria:origem','online')", [cat.capa]))).toBe("OR004");
  });
});
it("entrada serializada não pode reutilizar chave de outro IMEI", async () => {
  const novoImei = comDigitoLuhn("35209900170999");
  expect(await erroDe(() => db.query("select privado.registrar_item_serializado($1,$2,$3,null,null,'entrada_importacao','teste:a1')", [ids.lojaA, cat.aparelho, novoImei]))).toBe("OR004");
});
it("entrada serializada não pode reutilizar chave de movimento por quantidade", async () => {
  const novoImei = comDigitoLuhn("35209900170998");
  expect(await erroDe(() => db.query("select privado.registrar_item_serializado($1,$2,$3,null,null,'entrada_importacao','teste:capaA')", [ids.lojaA, cat.aparelho, novoImei]))).toBe("OR004");
});
it("saldo serializado não pode duplicar o mesmo aparelho com outra chave", async () => {
  const rejeicao = await erroDe(() => db.query("select privado.lancar_movimento($1,$2,1,'entrada_compra',$3,null,null,null,'auditoria:entrada-duplicada')", [ids.lojaA, cat.aparelho, itens.a1]));
  expect(rejeicao).not.toBeNull();
  const { rows } = await db.query<{ quantidade: number; itens: number }>("select s.quantidade, (select count(*)::int from public.itens_serializados i where i.unidade_id=s.unidade_id and i.variante_id=s.variante_id and i.situacao='disponivel') as itens from public.estoque_saldos s where unidade_id=$1 and variante_id=$2", [ids.lojaA, cat.aparelho]);
  expect(rows[0]?.quantidade).toBe(rows[0]?.itens);
});

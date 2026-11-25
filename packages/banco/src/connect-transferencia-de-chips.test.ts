// Lote CONNECT-e (25/11/2026; ORA-INV-011): a transferência de chips pela Nogle, pelo sistema. Só o dono pede; o worker
// envia uma vez e confirma pelo estoque do PDV. O estoque livre vem da leitura (connect_worker_gravar_estoque, CONNECT-d),
// com PDVs e ICCIDs FICTÍCIOS. Cada teste roda numa transação desfeita no fim.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

const iccid = (n: number) => comDigitoLuhn(`89551701100000${String(n).padStart(4, "0")}`);
// Os físicos livres têm números seguidos (101 a 105), como um lote de verdade.
const [F1, F2, F3, F4, F5] = [101, 102, 103, 104, 105].map(iccid) as [string, string, string, string, string];
const [E1, E2, E3] = [201, 202, 203].map(iccid) as [string, string, string];
const P1 = iccid(301); // físico que já está na loja
const LOJA = { id: 5216, nome: "SUPERCELL LOJA A", cidade: "Curitiba", uf: "PR", estoque_minimo: 10 };
const REVENDA = { id: 5250, nome: "Revenda (teste)", cidade: "São Paulo", uf: "SP", estoque_minimo: null };
const PEDIR = "select public.connect_transferir_chips(p_tipo => $1, p_pdv => $2, p_iccid => $3, p_iccid_final => $4, p_quantidade => $5, p_motivo => $6, p_chave => $7) as v";

async function erroDe(acao: () => Promise<unknown>): Promise<string | null> {
  await db.exec("savepoint tentativa");
  try {
    await acao();
    await db.exec("release savepoint tentativa");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa");
    await db.exec("release savepoint tentativa");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}
async function comoServico<T>(acao: () => Promise<T>): Promise<T> {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
}
let sessoes = 0;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Pedido = { id: string; numero: number; situacao: string; quantidade: number; repetido: boolean };
const pedir = (s: Sessao, tipo: string, pdv: number, i: string | null, f: string | null, qtd: number | null, chave: string, motivo: string | null = null) =>
  comoUsuario(db, s, async () => (await db.query<{ v: Pedido }>(PEDIR, [tipo, pdv, i, f, qtd, motivo, chave])).rows[0]?.v as Pedido);
// O erro é pego dentro da sessão: fora dela, a volta do papel numa transação abortada esconderia o código.
const erroAoPedir = (s: Sessao | null, tipo: string, pdv: number, i: string | null, f: string | null, qtd: number | null, chave: string) =>
  comoUsuario(db, s, () => erroDe(() => db.query(PEDIR, [tipo, pdv, i, f, qtd, null, chave])));
const erroComo = (s: Sessao | null, sql: string, parametros: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, parametros)));

/** O estoque da última leitura: 5 físicos e 3 eSIM livres (sem PDV) e um físico na loja (ligada à loja A). */
async function estoque() {
  await comoServico(() => db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)", [ids.organizacao, JSON.stringify({
    pdvs: [LOJA, REVENDA],
    mvno: [F1, F2, F3, F4, F5, P1].map((i) => ({ iccid: i, tipo: "fisico" })).concat([E1, E2, E3].map((i) => ({ iccid: i, tipo: "esim" }))),
    estoques: [{ pdv: 5216, chips: [{ iccid: P1, tipo: "fisico" }] }, { pdv: 5250, chips: [] }],
    falhas: 0,
  })]));
  const dono = await naLoja(ids.dono, ids.lojaA);
  await comoUsuario(db, dono, () => db.query("select public.connect_ligar_pdv(5216, $1)", [ids.lojaA]));
  return dono;
}
const situacao = async (id: string) => (await db.query<{ situacao: string; mensagem: string | null; resultado: Record<string, unknown> }>(
  "select situacao, mensagem, resultado from public.connect_transferencias_chips where id = $1", [id])).rows[0];

describe("a transferência de chips pela Nogle (CONNECT-e; ORA-INV-011)", () => {
  it("o dono pede eSIM, um chip ou um lote; o clique repetido devolve o mesmo pedido; o estoque livre e os chips em andamento são conferidos", async () => {
    const dono = await estoque();
    const e = await pedir(dono, "esim", 5216, null, null, 2, "k1", "Reposição da loja");
    expect(e).toMatchObject({ situacao: "registrada", quantidade: 2, repetido: false });
    // O mesmo clique (a mesma chave e o mesmo conteúdo) devolve o mesmo pedido; outro conteúdo com a mesma chave, OR004.
    expect(await pedir(dono, "esim", 5216, null, null, 2, "k1", "Reposição da loja")).toMatchObject({ id: e.id, repetido: true });
    expect(await erroAoPedir(dono, "esim", 5216, null, null, 3, "k1")).toBe("OR004");
    expect(await pedir(dono, "unidade", 5216, F1, null, null, "k2")).toMatchObject({ quantidade: 1 });
    // O lote conta os físicos livres no intervalo (F2 a F5); o F1 já está num pedido em andamento.
    expect(await pedir(dono, "lote", 5250, F2, F5, null, "k3")).toMatchObject({ quantidade: 4 });
    expect(await erroAoPedir(dono, "lote", 5250, F1, F3, null, "k4")).toBe("OR053");
    expect(await erroAoPedir(dono, "unidade", 5250, F3, null, null, "k5")).toBe("OR053");
    // eSIM: 3 livres, 2 já pedidos.
    expect(await erroAoPedir(dono, "esim", 5250, null, null, 2, "k6")).toBe("OR052");
    expect(await pedir(dono, "esim", 5250, null, null, 1, "k7")).toMatchObject({ quantidade: 1 });
    // O chip que está num PDV, o eSIM e o que não existe não são "físico livre".
    for (const [i, chave] of [[P1, "k8"], [E3, "k9"], [iccid(999), "k10"]] as const) {
      expect(await erroAoPedir(dono, "unidade", 5250, i, null, null, chave), chave).toBe("OR052");
    }
    // A forma do pedido.
    expect(await erroAoPedir(dono, "lote", 5250, F5, F2, null, "k11")).toBe("22023");
    expect(await erroAoPedir(dono, "lote", 5250, F2, `${F5}0`, null, "k12")).toBe("22023");
    expect(await erroAoPedir(dono, "lote", 5250, iccid(401), iccid(405), null, "k13")).toBe("OR052");
    expect(await erroAoPedir(dono, "esim", 5250, F2, null, 1, "k14")).toBe("22023");
    expect(await erroAoPedir(dono, "esim", 5250, null, null, 0, "k15")).toBe("22023");
    expect(await erroAoPedir(dono, "chip", 5250, null, null, 1, "k16")).toBe("22023");
    expect(await erroAoPedir(dono, "unidade", 5250, "123", null, null, "k17")).toBe("22023");
    // O PDV que sumiu da lista da Nogle não recebe pedido novo.
    await comoServico(() => db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)",
      [ids.organizacao, JSON.stringify({ pdvs: [LOJA], mvno: null, estoques: [], falhas: 1 })]));
    expect(await erroAoPedir(dono, "esim", 5250, null, null, 1, "k18")).toBe("22023");
    // O pedido vai para a auditoria, com o motivo.
    const auditoria = (await db.query<{ motivo: string }>(
      "select motivo from public.auditoria where alvo_tipo = 'connect_transferencias_chips' and alvo_id = $1", [e.id])).rows;
    expect(auditoria.map((a) => a.motivo)).toEqual(["Pedido de transferência de 2 chip(s) (esim) para o PDV 5216 da Nogle (SUPERCELL LOJA A): Reposição da loja"]);
  });

  it("só o dono pede e cancela; o administrador lê; quem opera a loja e o dono de outra rede, nada", async () => {
    const dono = await estoque();
    const t = await pedir(dono, "esim", 5216, null, null, 1, "c1");
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const administrador = await naLoja(ids.administrador, ids.lojaA);
    const outro = await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg);
    for (const s of [vendedor, gerente, administrador, outro]) {
      expect(await erroAoPedir(s, "esim", 5216, null, null, 1, `c2:${s.usuario}`)).toBe("42501");
    }
    expect(await erroAoPedir(null, "esim", 5216, null, null, 1, "c3")).toBe("42501");
    const ve = (s: Sessao) => comoUsuario(db, s, async () => (await db.query("select 1 from public.connect_transferencias_chips")).rows.length);
    expect([await ve(dono), await ve(administrador), await ve(vendedor), await ve(outro)]).toEqual([1, 1, 0, 0]);
    // O cancelamento: só o dono, com motivo, enquanto não saiu.
    const CANCELAR = "select public.connect_cancelar_transferencia($1, $2)";
    expect(await erroComo(vendedor, CANCELAR, [t.id, "Tentativa"])).toBe("42501");
    expect(await erroComo(administrador, CANCELAR, [t.id, "Tentativa"])).toBe("42501");
    expect(await erroComo(dono, CANCELAR, [t.id, "x"])).toBe("22023");
    expect(await comoUsuario(db, dono, async () => (await db.query<{ v: string }>(`${CANCELAR} as v`, [t.id, "Pedido errado"])).rows[0]?.v)).toBe("cancelada");
    expect(await situacao(t.id)).toMatchObject({ situacao: "cancelada", mensagem: "Pedido errado" });
    expect(await erroComo(dono, CANCELAR, [t.id, "De novo"])).toBe("OR054");
    // O cancelado devolve o eSIM ao livre: os 3 podem ser pedidos de novo.
    expect(await pedir(dono, "esim", 5216, null, null, 3, "c4")).toMatchObject({ quantidade: 3 });
  });

  it("o worker pega a fila e registra o resultado; o que não saiu volta; o envio parado vira resultado desconhecido", async () => {
    const dono = await estoque();
    const t1 = await pedir(dono, "esim", 5216, null, null, 1, "w1");
    const t2 = await pedir(dono, "unidade", 5216, F1, null, null, "w2");
    const t3 = await pedir(dono, "lote", 5250, F2, F3, null, "w3");
    const fila = () => comoServico(async () => (await db.query<{ transferencia_id: string; tipo: string; pdv_id: number; iccid: string | null; iccid_final: string | null; quantidade: number }>(
      "select * from public.connect_worker_transferencias_a_enviar($1, 5)", [ids.organizacao])).rows);
    const REGISTRAR = "select public.connect_worker_registrar_transferencia($1, $2::jsonb) as v";
    const registrar = (id: string, r: object) => comoServico(async () => (await db.query<{ v: string }>(REGISTRAR, [id, JSON.stringify(r)])).rows[0]?.v);
    // O erro é pego dentro do papel do servidor (a volta do papel numa transação abortada esconderia o código).
    const erroAoRegistrar = (id: string, r: object) => comoServico(() => erroDe(() => db.query(REGISTRAR, [id, JSON.stringify(r)])));
    expect(await fila()).toEqual([
      { transferencia_id: t1.id, tipo: "esim", pdv_id: 5216, iccid: null, iccid_final: null, quantidade: 1 },
      { transferencia_id: t2.id, tipo: "unidade", pdv_id: 5216, iccid: F1, iccid_final: null, quantidade: 1 },
      { transferencia_id: t3.id, tipo: "lote", pdv_id: 5250, iccid: F2, iccid_final: F3, quantidade: 2 },
    ]);
    expect(await situacao(t1.id)).toMatchObject({ situacao: "enviando" });
    // Enviando não se cancela.
    expect(await erroComo(dono, "select public.connect_cancelar_transferencia($1, 'Tarde demais')", [t1.id])).toBe("OR054");

    expect(await registrar(t1.id, { envio: "aceita", mensagem: "Sucesso.", confirmacao: "confirmada", antes: { fisicos: 1, esims: 0 },
      depois: { fisicos: 1, esims: 1 }, novos: [E1] })).toBe("confirmada");
    expect(await situacao(t1.id)).toEqual({ situacao: "confirmada", mensagem: "Sucesso.",
      resultado: { antes: { fisicos: 1, esims: 0 }, depois: { fisicos: 1, esims: 1 }, novos: [E1] } });
    expect(await registrar(t2.id, { envio: "nao_enviada", mensagem: "Sem conexão com a Nogle: nada foi enviado." })).toBe("registrada");
    expect(await registrar(t3.id, { envio: "aceita", mensagem: "Processamento Concluído.", confirmacao: "nao_confirmada", transferidos: 2,
      nao_transferidos: 0, novos: [] })).toBe("resultado_desconhecido");
    expect((await situacao(t3.id))?.mensagem).toBe("Processamento Concluído. A Nogle respondeu, mas o estoque do PDV não mostrou os chips: confira no painel da Nogle.");
    // Só o pedido que está sendo enviado recebe resultado; a forma é conferida.
    expect(await erroAoRegistrar(t1.id, { envio: "recusada", mensagem: "x" })).toBe("22023");
    const [t2b] = await fila();
    expect(t2b?.transferencia_id).toBe(t2.id);
    expect(await erroAoRegistrar(t2.id, { envio: "aceita", mensagem: "x" })).toBe("22023");
    expect(await erroAoRegistrar(t2.id, { envio: "aceita", confirmacao: "confirmada", novos: ["123"] })).toBe("22023");
    expect(await erroAoRegistrar(t2.id, { envio: "talvez" })).toBe("22023");
    // O envio parado há mais de 10 minutos vira resultado desconhecido e não volta para a fila.
    await db.query("update public.connect_transferencias_chips set enviando_desde = now() - interval '11 minutes' where id = $1", [t2.id]);
    expect(await fila()).toEqual([]);
    expect(await situacao(t2.id)).toMatchObject({ situacao: "resultado_desconhecido" });
    // Pessoa logada, mesmo o dono, não chama as funções do worker.
    expect(await erroComo(dono, "select * from public.connect_worker_transferencias_a_enviar($1, 5)", [ids.organizacao])).toBe("42501");
    expect(await erroComo(dono, "select public.connect_worker_registrar_transferencia($1, '{}'::jsonb)", [t1.id])).toBe("42501");
  });
});

// ADR-007 (#60): pedidos internos de transferência e o local DEFEITOS. Banco em memória com todas
// as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
const defeitos = "4e000000-0000-4000-8000-0000000000d1";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo) values ($1, $2, $3, 'defeitos', 'DEFEITOS', 'excecao')",
    [defeitos, ids.organizacao, ids.empresa]);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (prefixo: string) => `${prefixo}:${++chaves}`;
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
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `4e000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

const SOLICITAR = "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v";
const solicitar = (s: Sessao, origem: string, destino: string, variante: string, quantidade: number, k = chave("t")) =>
  valor<string>(s, SOLICITAR, [origem, destino, variante, quantidade, "Reposição da loja", k]);
const separar = (s: Sessao, t: string, lista: string[] = []) => valor<string>(s, "select public.transferencia_separar($1, $2::uuid[]) as v", [t, lista]);
const enviar = (s: Sessao, t: string) => valor<string>(s, "select public.transferencia_enviar($1) as v", [t]);
const RECEBER = "select public.transferencia_receber($1, $2::text[], $3, $4) as v";
const receber = (s: Sessao, t: string, lidos: string[], quantidade: number | null, observacao: string | null = null) =>
  valor<string>(s, RECEBER, [t, lidos, quantidade, observacao]);
const saldo = async (unidade: string, variante: string) =>
  (await db.query<{ quantidade: number; reservado: number }>("select quantidade, reservado from public.estoque_saldos where unidade_id = $1 and variante_id = $2", [unidade, variante])).rows[0]
  ?? { quantidade: 0, reservado: 0 };
const posicao = async (item: string) =>
  (await db.query<{ unidade_id: string; situacao: string; em_estoque: boolean }>("select unidade_id, situacao, em_estoque from public.itens_serializados where id = $1", [item])).rows[0];
const imeiDe = async (item: string) => (await db.query<{ imei: string }>("select imei from public.itens_serializados where id = $1", [item])).rows[0]?.imei ?? "";
const divergencias = async () => (await db.query("select regra from privado.divergencias_estoque()")).rows;

describe("pedido interno de acessório", () => {
  // TRF-c (achado F18-05 da reanálise de 18/11; D-049 pela orientação do proprietário de 18/11): pedir já reserva.
  it("pedir reserva na origem uma vez; separar não reserva de novo; enviar tira da origem; receber põe no destino; cada passo repetido devolve o mesmo", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesA = await saldo(ids.lojaA, cat.capa);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const k = chave("t");
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2, k);
    expect(await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 2, k)).toBe(t);
    expect(await errou(pedinte, SOLICITAR, [ids.lojaA, ids.lojaB, cat.capa, 3, "Reposição da loja", k])).toBe("OR004");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antesA.quantidade, reservado: antesA.reservado + 2 });

    expect(await errou(pedinte, "select public.transferencia_separar($1, '{}'::uuid[])", [t])).toBe("42501");
    expect(await separar(origem, t)).toBe("separada");
    expect(await separar(origem, t)).toBe("separada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antesA.quantidade, reservado: antesA.reservado + 2 });

    expect(await enviar(origem, t)).toBe("enviada");
    expect(await enviar(origem, t)).toBe("enviada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antesA.quantidade - 2, reservado: antesA.reservado });
    expect(await saldo(ids.lojaB, cat.capa)).toEqual(antesB);
    const rede = await valor<{ unidade: string; chegando: number }[]>(origem, "select json_agg(r) as v from public.estoque_na_rede($1) r", [cat.capa]);
    expect(rede.find((r) => r.unidade === "Loja B")?.chegando).toBe(2);

    expect(await errou(origem, RECEBER, [t, [], 2, null])).toBe("42501");
    expect(await receber(pedinte, t, [], 2)).toBe("recebida");
    expect(await receber(pedinte, t, [], 2)).toBe("recebida");
    expect(await saldo(ids.lojaB, cat.capa)).toEqual({ quantidade: antesB.quantidade + 2, reservado: antesB.reservado });
    expect(await divergencias()).toEqual([]);
  });

  it("faltou item: sem explicação é recusado; com explicação entra só o contado e fica a divergência", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesB = await saldo(ids.lojaB, cat.capa);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 3);
    await separar(origem, t);
    await enviar(origem, t);
    expect(await errou(pedinte, RECEBER, [t, [], 2, null])).toBe("22023");
    expect(await errou(pedinte, RECEBER, [t, [], 4, "Chegou uma a mais na caixa"])).toBe("22023");
    expect(await receber(pedinte, t, [], 2, "Caixa chegou com uma capa a menos")).toBe("recebida_com_divergencia");
    expect((await saldo(ids.lojaB, cat.capa)).quantidade).toBe(antesB.quantidade + 2);
    expect((await db.query("select quantidade_recebida, observacao from public.transferencias where id = $1", [t])).rows)
      .toEqual([{ quantidade_recebida: 2, observacao: "Caixa chegou com uma capa a menos" }]);
  });

  it("cancelar antes do envio libera a reserva uma vez; depois do envio não cancela; a origem recusa só antes de separar", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antesA = await saldo(ids.lojaA, cat.capa);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await separar(origem, t);
    expect(await errou(origem, "select public.transferencia_encerrar($1, 'recusada', 'Sem estoque')", [t])).toBe("42501");
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antesA);

    const outra = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    await separar(origem, outra);
    await enviar(origem, outra);
    expect(await errou(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Desisti')", [outra])).toBe("42501");

    const antesDaRecusa = await saldo(ids.lojaA, cat.capa);
    const recusada = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    expect((await saldo(ids.lojaA, cat.capa)).reservado).toBe(antesDaRecusa.reservado + 1);
    expect(await valor(origem, "select public.transferencia_encerrar($1, 'recusada', 'Precisamos dela aqui') as v", [recusada])).toBe("recusada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antesDaRecusa);
    expect(await errou(origem, "select public.transferencia_separar($1, '{}'::uuid[])", [recusada])).toBe("OR004");
    expect(await divergencias()).toEqual([]);
  });

  it("pedir além do disponível é OR001 e nada fica gravado; vendedor da origem não separa", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const disponivel = await saldo(ids.lojaA, cat.capa);
    const pedidos = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.transferencias")).rows[0]?.n;
    const antes = await pedidos();
    expect(await errou(pedinte, SOLICITAR, [ids.lojaA, ids.lojaB, cat.capa, disponivel.quantidade - disponivel.reservado + 1, "Reposição da loja", chave("t")])).toBe("OR001");
    expect(await pedidos()).toBe(antes);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(disponivel);
    const pequena = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await errou(await naLoja(ids.vendedorA, ids.lojaA), "select public.transferencia_separar($1, '{}'::uuid[])", [pequena])).toBe("42501");
  });
});

describe("a reserva no pedido (TRF-c; achado F18-05 da reanálise de 18/11 e a D-049)", () => {
  it("a venda não leva o que o pedido reservou, e o pedido não leva o que a venda reservou; cancelar devolve ao disponível", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const vendedora = await naLoja(ids.vendedorA, ids.lojaA);
    const antes = await saldo(ids.lojaA, cat.capa);
    const livre = antes.quantidade - antes.reservado;
    await valor(vendedora, "select public.reservar_estoque($1, 1, null, $2) as v", [cat.capa, chave("r")]);
    expect(await errou(pedinte, SOLICITAR, [ids.lojaA, ids.lojaB, cat.capa, livre, "Reposição da loja", chave("t")])).toBe("OR001");
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, livre - 1);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antes.quantidade, reservado: antes.reservado + livre });
    expect(await errou(vendedora, "select public.reservar_estoque($1, 1, null, $2)", [cat.capa, chave("r")])).toBe("OR001");
    const rede = await valor<{ unidade: string; reservado: number; disponivel: number; pedidos_abertos: number }[]>(pedinte,
      "select json_agg(r) as v from public.estoque_na_rede($1) r", [cat.capa]);
    expect(rede.find((r) => r.unidade === "Loja A")).toMatchObject({ reservado: antes.reservado + livre, disponivel: 0, pedidos_abertos: 1 });
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antes.quantidade, reservado: antes.reservado + 1 });
    await valor(vendedora, "select public.reservar_estoque($1, 1, null, $2) as v", [cat.capa, chave("r")]);
    expect(await divergencias()).toEqual([]);
  });

  it("aparelho: o pedido reserva pela quantidade (o IMEI se escolhe na separação); a separação troca pela reserva do IMEI sem contar duas vezes", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const vendedora = await naLoja(ids.vendedorA, ids.lojaA);
    const antes = await saldo(ids.lojaA, cat.aparelho);
    expect(antes).toEqual({ quantidade: 2, reservado: 0 });
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 2);
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 2, reservado: 2 });
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "disponivel" });
    // Os dois aparelhos estão prometidos: a venda não reserva nenhum, mesmo com o IMEI ainda "disponível".
    expect(await errou(vendedora, "select public.reservar_estoque($1, 1, $2, $3)", [cat.aparelho, itens.a1, chave("r")])).toBe("OR001");
    expect(await divergencias()).toEqual([]);
    expect(await separar(origem, t, [itens.a1, itens.a2])).toBe("separada");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 2, reservado: 2 });
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "reservado" });
    expect((await db.query("select reserva_id from public.transferencias where id = $1", [t])).rows).toEqual([{ reserva_id: null }]);
    expect((await db.query("select situacao, count(*)::int as n from public.estoque_reservas where chave_idempotencia like $1 group by 1 order by 1", [`transferencia:${t}%`])).rows)
      .toEqual([{ situacao: "ativa", n: 2 }, { situacao: "consumida", n: 1 }]);
    expect(await divergencias()).toEqual([]);
    expect(await enviar(origem, t)).toBe("enviada");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 0, reservado: 0 });
    expect(await divergencias()).toEqual([]);
  });

  it("aparelho pedido e cancelado antes de separar, ou depois de separar: tudo volta, sem sobra de reserva", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [t])).toBe("cancelada");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 2, reservado: 0 });
    const outra = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    await separar(origem, outra, [itens.a2]);
    expect(await valor(pedinte, "select public.transferencia_encerrar($1, 'cancelada', 'Não precisa mais') as v", [outra])).toBe("cancelada");
    expect(await saldo(ids.lojaA, cat.aparelho)).toEqual({ quantidade: 2, reservado: 0 });
    expect(await posicao(itens.a2)).toMatchObject({ situacao: "disponivel" });
    expect(await divergencias()).toEqual([]);
  });

  it("o pedido de antes do TRF-c, sem reserva, reserva na separação; sem o livre, a separação é OR001", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const antes = await saldo(ids.lojaA, cat.capa);
    // Simula o pedido antigo: a reserva do pedido é desfeita direto no banco, como se o pedido fosse de antes do lote.
    const antigo = async (quantidade: number) => {
      const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, quantidade);
      await db.query("select privado.encerrar_reserva(reserva_id, 'liberada') from public.transferencias where id = $1", [t]);
      await db.query("update public.transferencias set reserva_id = null where id = $1", [t]);
      return t;
    };
    const t = await antigo(2);
    expect(await saldo(ids.lojaA, cat.capa)).toEqual(antes);
    expect(await separar(origem, t)).toBe("separada");
    expect(await saldo(ids.lojaA, cat.capa)).toEqual({ quantidade: antes.quantidade, reservado: antes.reservado + 2 });
    const livre = antes.quantidade - antes.reservado - 2;
    const semLivre = await antigo(livre);
    await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await errou(origem, "select public.transferencia_separar($1, '{}'::uuid[])", [semLivre])).toBe("OR001");
    expect(await divergencias()).toEqual([]);
  });
});

describe("pedido interno de aparelho", () => {
  it("o IMEI separado fica reservado (venda não pega); em trânsito sai do estoque; só o IMEI enviado é recebido", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    expect(await errou(origem, "select public.transferencia_separar($1, $2::uuid[])", [t, [itens.a1, itens.a2]])).toBe("22023");
    expect(await errou(origem, "select public.transferencia_separar($1, $2::uuid[])", [t, [itens.b1]])).toBe("OR003");
    expect(await separar(origem, t, [itens.a1])).toBe("separada");
    expect(await posicao(itens.a1)).toMatchObject({ situacao: "reservado", em_estoque: true });
    const vendedora = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await errou(vendedora, "select public.reservar_estoque($1, 1, $2, $3)", [cat.aparelho, itens.a1, chave("r")])).toBe("OR002");

    await enviar(origem, t);
    expect(await posicao(itens.a1)).toMatchObject({ unidade_id: ids.lojaA, situacao: "em_transito", em_estoque: false });
    expect(await errou(pedinte, RECEBER, [t, [comDigitoLuhn("35209900111111")], null, "IMEI diferente na caixa"])).toBe("22023");
    expect(await errou(pedinte, RECEBER, [t, [], null, null])).toBe("22023");
    expect(await receber(pedinte, t, [await imeiDe(itens.a1)], null)).toBe("recebida");
    expect(await posicao(itens.a1)).toEqual({ unidade_id: ids.lojaB, situacao: "disponivel", em_estoque: true });
    expect(await divergencias()).toEqual([]);
  });

  it("item que não chegou fica em trânsito e a transferência registra a divergência", async () => {
    const pedinte = await naLoja(ids.gerenteB, ids.lojaB);
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(pedinte, ids.lojaA, ids.lojaB, cat.aparelho, 1);
    await separar(origem, t, [itens.a2]);
    await enviar(origem, t);
    expect(await receber(pedinte, t, [], null, "A caixa chegou sem o aparelho")).toBe("recebida_com_divergencia");
    expect(await posicao(itens.a2)).toMatchObject({ situacao: "em_transito", em_estoque: false });
  });
});

describe("DEFEITOS (local de exceção)", () => {
  it("recebe o item com problema; não vende; aparece à parte na rede com disponível zero; regularizar exige quem ajusta estoque", async () => {
    const origem = await naLoja(ids.dono, ids.lojaA);
    const t = await solicitar(origem, ids.lojaA, defeitos, cat.aparelho, 1);
    await separar(origem, t, [itens.a1]);
    await enviar(origem, t);
    const naExcecao = await naLoja(ids.dono, defeitos);
    expect(await receber(naExcecao, t, [await imeiDe(itens.a1)], null)).toBe("recebida");
    expect(await posicao(itens.a1)).toMatchObject({ unidade_id: defeitos, situacao: "disponivel", em_estoque: true });

    expect(await errou(naExcecao, "select public.criar_venda($1)", [chave("v")])).toBe("42501");
    expect(await errou(naExcecao, "select public.reservar_estoque($1, 1, $2, $3)", [cat.aparelho, itens.a1, chave("r")])).toBe("42501");
    const rede = await valor<{ unidade: string; tipo: string; fisico: number; disponivel: number }[]>(naExcecao,
      "select json_agg(r) as v from public.estoque_na_rede($1) r", [cat.aparelho]);
    expect(rede.at(-1)).toMatchObject({ unidade: "DEFEITOS", tipo: "excecao", fisico: 1, disponivel: 0 });

    const volta = await solicitar(await naLoja(ids.gerenteB, ids.lojaB), defeitos, ids.lojaB, cat.aparelho, 1);
    expect(await separar(naExcecao, volta, [itens.a1])).toBe("separada");
    expect(await divergencias()).toEqual([]);
  });
});

describe("centro de distribuição (o depósito; INV-012)", () => {
  it("a mercadoria entra no depósito, vai para a loja e volta pelo mesmo pedido, com cada passo no livro do estoque", async () => {
    const cd = "4e000000-0000-4000-8000-0000000000c1";
    await db.query("insert into public.unidades (id, organizacao_id, empresa_id, codigo, nome, tipo) values ($1, $2, $3, 'cd', 'Centro de distribuição', 'deposito')",
      [cd, ids.organizacao, ids.empresa]);
    await db.query("select privado.lancar_movimento($1, $2, 5, 'entrada_importacao', null, null, null, null, 'teste:capa-cd')", [cd, cat.capa]);
    const noCd = await naLoja(ids.dono, cd);
    const lojaB = await naLoja(ids.gerenteB, ids.lojaB);
    const antesB = await saldo(ids.lojaB, cat.capa);

    const ida = await solicitar(lojaB, cd, ids.lojaB, cat.capa, 3);
    expect(await separar(noCd, ida)).toBe("separada");
    expect(await enviar(noCd, ida)).toBe("enviada");
    expect(await saldo(cd, cat.capa)).toEqual({ quantidade: 2, reservado: 0 });
    expect(await receber(lojaB, ida, [], 3)).toBe("recebida");
    expect(await saldo(ids.lojaB, cat.capa)).toEqual({ quantidade: antesB.quantidade + 3, reservado: antesB.reservado });

    const volta = await solicitar(lojaB, ids.lojaB, cd, cat.capa, 1);
    expect(await separar(lojaB, volta)).toBe("separada");
    expect(await enviar(lojaB, volta)).toBe("enviada");
    expect(await receber(noCd, volta, [], 1)).toBe("recebida");
    expect(await saldo(cd, cat.capa)).toEqual({ quantidade: 3, reservado: 0 });

    const livro = (await db.query<{ local: string; tipo: string; quantidade: number; por: string | null }>(
      `select u.codigo as local, m.tipo, m.quantidade, m.usuario_id::text as por from public.estoque_movimentos m join public.unidades u on u.id = m.unidade_id
       where m.referencia_id in ($1, $2) order by m.id`, [ida, volta])).rows;
    expect(livro).toEqual([
      { local: "cd", tipo: "transferencia_saida", quantidade: -3, por: ids.dono },
      { local: "loja-b", tipo: "transferencia_entrada", quantidade: 3, por: ids.gerenteB },
      { local: "loja-b", tipo: "transferencia_saida", quantidade: -1, por: ids.gerenteB },
      { local: "cd", tipo: "transferencia_entrada", quantidade: 1, por: ids.dono },
    ]);
    expect(await divergencias()).toEqual([]);
  });
});

describe("leitura dos pedidos", () => {
  it("as lojas envolvidas leem; outra rede não", async () => {
    const t = await solicitar(await naLoja(ids.gerenteB, ids.lojaB), ids.lojaA, ids.lojaB, cat.capa, 1);
    expect(await valor<number>(await naLoja(ids.vendedorA, ids.lojaA), "select count(*)::int as v from public.transferencias where id = $1", [t])).toBe(1);
    expect(await valor<number>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), "select count(*)::int as v from public.transferencias where id = $1", [t])).toBe(0);
  });
});

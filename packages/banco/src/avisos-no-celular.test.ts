// Lote PWA-b (17/11/2026; plano de 16/11, Onda 1, item 7, segunda parte; migration 20261117200000_avisos_no_celular): o
// aviso no celular quando um desconto, uma nota ou uma saída de caixa espera aprovação. A pessoa liga os avisos nos
// próprios celulares; os três pedidos põem o aviso na fila; o worker, com o segredo dos avisos, pega o lote com os
// celulares de quem decide (menos quem pediu) e devolve o resultado. Endereços, chaves e segredo FICTÍCIOS; cada teste
// numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

const SEGREDO = "segredo-ficticio-dos-avisos-para-o-teste-0123456789";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await db.query("select privado.lancar_movimento($1, $2, 20, 'entrada_importacao', null, null, null, null, 'avisos:capaB')", [ids.lojaB, cat.capa]);
});
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into privado.segredos_de_rotina (nome, impressao) values ('avisos_no_celular', sha256(convert_to($1, 'UTF8')))", [SEGREDO]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
let celulares = 0;
const chave = (p: string) => `${p}:avisos:${String(++chaves).padStart(5, "0")}`;
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
  const s = { usuario, sessao: `4d000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = <T>(s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const recusa = (s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });

/** Um celular fictício: o endereço de envio e as duas chaves no formato do navegador. */
const celular = () => {
  const n = String(++celulares).padStart(4, "0");
  return { endpoint: `https://push.exemplo.invalid/envio/${n}`, p256dh: `B${"A".repeat(82)}${n}`, auth: `auth${"x".repeat(14)}${n}` };
};
const INSCREVER = "select public.aviso_inscrever($1, $2, $3, $4) as v";
async function inscrever(s: Sessao, c = celular(), dispositivo = "Android · Chrome") {
  await valor(s, INSCREVER, [c.endpoint, c.p256dh, c.auth, dispositivo]);
  return c;
}
type Lote = { id: string; tipo: string; titulo: string; corpo: string; endereco: string; inscricoes: { id: string; endpoint: string }[] }[];
const A_ENVIAR = "select public.avisos_a_enviar($1) as v";
const lote = (s: Sessao | null = null) => valor<Lote>(s, A_ENVIAR, [SEGREDO]);
const RESULTADO = "select public.avisos_resultado($1, $2::jsonb) as v";
const aviso = async (tipo: string, alvo: string) =>
  (await db.query<Record<string, unknown>>("select * from privado.avisos where tipo = $1 and alvo_id = $2", [tipo, alvo])).rows[0];

/** O vendedor pede aprovação de um desconto na loja dele; devolve o pedido e a venda. */
async function pedirDesconto(s: Sessao) {
  const venda = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
  const item = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(s, "select public.aplicar_desconto($1, 500) as v", [item]);
  const pedido = await valor<string>(s, "select public.pedir_aprovacao($1, 'Cliente antigo') as v", [item]);
  return { pedido, venda };
}

describe("os celulares de cada pessoa (PWA-b)", () => {
  it("a pessoa liga, confere e desliga os avisos dos próprios celulares; vê quais avisos recebe", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c1 = await inscrever(dono);
    await inscrever(dono, celular(), "iPhone · Safari");
    const minhas = await valor<{ celulares: { dispositivo: string }[]; recebe: Record<string, boolean> }>(dono, "select public.aviso_minhas_inscricoes() as v");
    expect(minhas.celulares.map((c) => c.dispositivo).sort()).toEqual(["Android · Chrome", "iPhone · Safari"]);
    expect(minhas.recebe).toEqual({ desconto: true, nota: true, saida_caixa: true });
    expect((await valor<{ recebe: Record<string, boolean> }>(ana, "select public.aviso_minhas_inscricoes() as v")).recebe)
      .toEqual({ desconto: false, nota: false, saida_caixa: false });
    // A mesma pessoa inscreve de novo o mesmo celular: a data em que ligou fica.
    const antes = (await db.query<{ criada_em: string }>("select criada_em from privado.avisos_inscricoes where endpoint = $1", [c1.endpoint])).rows[0]?.criada_em;
    await db.query("update privado.avisos_inscricoes set criada_em = criada_em - interval '1 day' where endpoint = $1", [c1.endpoint]);
    await valor(dono, INSCREVER, [c1.endpoint, c1.p256dh, c1.auth, null]);
    const depois = (await db.query<{ criada_em: string; dispositivo: string }>("select criada_em, dispositivo from privado.avisos_inscricoes where endpoint = $1", [c1.endpoint])).rows[0];
    expect(new Date(depois?.criada_em ?? "").getTime()).toBeLessThan(new Date(antes ?? "").getTime());
    expect(depois?.dispositivo).toBe("Android · Chrome");
    // O mesmo celular com outra pessoa logada passa a ser dela.
    await valor(ana, INSCREVER, [c1.endpoint, c1.p256dh, c1.auth, null]);
    expect((await valor<{ celulares: unknown[] }>(dono, "select public.aviso_minhas_inscricoes() as v")).celulares).toHaveLength(1);
    // Desligar só vale para o próprio celular: o de outra pessoa é recusado, sem mudar nada.
    expect(await recusa(dono, "select public.aviso_cancelar($1) as v", [c1.endpoint])).toBe("42501");
    expect(await valor<boolean>(ana, "select public.aviso_cancelar($1) as v", [c1.endpoint])).toBe(true);
    expect((await valor<{ celulares: unknown[] }>(ana, "select public.aviso_minhas_inscricoes() as v")).celulares).toEqual([]);
  });

  it("recusa o celular fora do formato e quem não entrou; guarda no máximo 10 por pessoa", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const c = celular();
    for (const [e, p, a] of [["http://inseguro.invalid/x", c.p256dh, c.auth], [c.endpoint, "curta", c.auth], [c.endpoint, c.p256dh, "a b"]]) {
      expect(await recusa(dono, INSCREVER, [e, p, a, null])).toBe("22023");
    }
    expect(await recusa(null, INSCREVER, [c.endpoint, c.p256dh, c.auth, null])).toBe("42501");
    for (let i = 0; i < 12; i++) await inscrever(dono);
    expect((await db.query("select 1 from privado.avisos_inscricoes where usuario_id = $1", [ids.dono])).rows).toHaveLength(10);
  });
});

describe("os três pedidos põem o aviso na fila (PWA-b)", () => {
  it("desconto, nota e saída de caixa: quem pediu, a permissão de quem decide e o texto sem nome de cliente", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const { pedido, venda } = await pedirDesconto(ana);
    const numero = (await db.query<{ numero: number }>("select numero from public.vendas where id = $1", [venda])).rows[0]?.numero;
    expect(await aviso("desconto", pedido)).toMatchObject({
      solicitante_id: ids.vendedorA, permissao: "desconto.aprovar", unidade_id: ids.lojaA, situacao: "pendente",
      titulo: "Desconto para aprovar", corpo: `Loja A: desconto pedido na venda nº ${numero}`, endereco: "/aprovacoes",
    });

    // O caixa abre com R$ 5.000,00: a saída de R$ 1.234,56 cabe no dinheiro da gaveta.
    await valor(ana, "select public.abrir_caixa(500000, $1) as v", [chave("caixa")]);
    const concluida = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [concluida, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [concluida, chave("concluir")]);
    const nota = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [concluida, chave("nota")]);
    const numeroDaNota = (await db.query<{ numero: number }>("select numero from public.vendas where id = $1", [concluida])).rows[0]?.numero;
    expect(await aviso("nota", nota)).toMatchObject({ permissao: "nota.aprovar", corpo: `Loja A: pedido de nota da venda nº ${numeroDaNota}`, endereco: "/notas" });

    const saida = await valor<string>(ana, "select public.caixa_pedir_saida(123456, 'Compra de material de limpeza', $1) as v", [chave("saida")]);
    expect(await aviso("saida_caixa", saida)).toMatchObject({ permissao: "caixa.conferir", corpo: "Loja A: saída de R$ 1.234,56", endereco: "/caixa" });
  });

  it("a nota que volta a esperar aprovação arma o aviso de novo", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
    const nota = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    await db.query("update privado.avisos set situacao = 'enviado', tentativas = 1 where tipo = 'nota' and alvo_id = $1", [nota]);
    await db.query("update public.notas_pedidos set situacao = 'correcao_solicitada' where id = $1", [nota]);
    expect(await aviso("nota", nota)).toMatchObject({ situacao: "enviado" });
    await db.query("update public.notas_pedidos set situacao = 'aguardando_aprovacao' where id = $1", [nota]);
    expect(await aviso("nota", nota)).toMatchObject({ situacao: "pendente", tentativas: 0 });
  });
});

describe("o envio pelo worker, com o segredo dos avisos (PWA-b)", () => {
  it("só com o segredo; o lote leva os celulares de quem decide na loja, menos quem pediu, e cada aviso sai uma vez", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const gerenteB = await naLoja(ids.gerenteB, ids.lojaB);
    const vab = await naLoja(ids.vendedorAB, ids.lojaB);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const doDono = await inscrever(dono);
    const doGerente = await inscrever(gerenteB);
    await inscrever(ana);
    await inscrever(vab);
    await inscrever(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg));
    // A pessoa bloqueada não recebe, mesmo com o celular gravado de antes.
    await db.query("insert into privado.avisos_inscricoes (usuario_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)",
      [ids.bloqueado, "https://push.exemplo.invalid/bloqueado", `B${"A".repeat(86)}`, "x".repeat(22)]);

    expect(await recusa(null, A_ENVIAR, ["segredo-errado-com-tamanho-suficiente-000000"])).toBe("42501");
    expect(await recusa(null, A_ENVIAR, [null])).toBe("42501");

    const naA = await pedirDesconto(ana);
    const naB = await pedirDesconto(vab);
    const pegos = await lote();
    const idDe = async (alvo: string) => (await aviso("desconto", alvo))?.id;
    const [idA, idB] = [await idDe(naA.pedido), await idDe(naB.pedido)];
    expect(pegos.find((x) => x.id === idA)?.inscricoes.map((i) => i.endpoint)).toEqual([doDono.endpoint]);
    expect(pegos.find((x) => x.id === idB)?.inscricoes.map((i) => i.endpoint).sort()).toEqual([doDono.endpoint, doGerente.endpoint].sort());
    expect(await aviso("desconto", naA.pedido)).toMatchObject({ situacao: "enviando", tentativas: 1 });
    // Reservado: não sai de novo; passada a reserva, volta (a segunda tentativa).
    expect(await lote()).toEqual([]);
    await db.query("update privado.avisos set reservado_ate = now() - interval '1 second' where alvo_id = $1", [naA.pedido]);
    expect((await lote()).map((x) => x.tipo)).toEqual(["desconto"]);
    expect(await aviso("desconto", naA.pedido)).toMatchObject({ tentativas: 2 });
  });

  it("o resultado: entregue, falha que tenta de novo até 5 vezes e o celular que não existe mais sai", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await inscrever(dono);
    await inscrever(dono);
    const um = await pedirDesconto(ana);
    const dois = await pedirDesconto(ana);
    const pegos = await lote();
    expect(pegos).toHaveLength(2);
    const [a1, a2] = [pegos[0]!, pegos[1]!];
    const entregue = a1.inscricoes[0]!.id;
    const expirada = a1.inscricoes[1]!.id;
    expect(await valor<{ registrados: number }>(null, RESULTADO, [SEGREDO, JSON.stringify([
      { aviso: a1.id, entregues: [entregue], expiradas: [expirada], falhas: 0 },
      { aviso: a2.id, entregues: [], expiradas: [], falhas: 1 },
    ])])).toEqual({ registrados: 2 });
    const situacoes = (await db.query<{ alvo_id: string; situacao: string }>("select alvo_id, situacao from privado.avisos where alvo_id = any($1)", [[um.pedido, dois.pedido]])).rows;
    expect(situacoes.map((s) => s.situacao).sort()).toEqual(["enviado", "pendente"]);
    expect((await db.query("select id from privado.avisos_inscricoes where id = $1", [expirada])).rows).toEqual([]);
    expect((await db.query<{ ultimo_aviso_em: string | null }>("select ultimo_aviso_em from privado.avisos_inscricoes where id = $1", [entregue])).rows[0]?.ultimo_aviso_em).not.toBeNull();
    // A falha tenta de novo até a 5ª vez; depois, "falhou".
    await db.query("update privado.avisos set tentativas = 4 where id = $1", [a2.id]);
    expect((await lote()).map((x) => x.id)).toEqual([a2.id]);
    await valor(null, RESULTADO, [SEGREDO, JSON.stringify([{ aviso: a2.id, entregues: [], expiradas: [], falhas: 1 }])]);
    expect((await db.query<{ situacao: string }>("select situacao from privado.avisos where id = $1", [a2.id])).rows[0]?.situacao).toBe("falhou");
    expect(await lote()).toEqual([]);
    expect(await recusa(null, RESULTADO, ["segredo-errado-com-tamanho-suficiente-000000", "[]"])).toBe("42501");
    expect(await recusa(null, RESULTADO, [SEGREDO, JSON.stringify([{ aviso: "x" }])])).toBe("22023");
  });

  it("o pedido já decidido não vira aviso; sem celular de quem decide, fica sem destino", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await valor(ana, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    const saida = await valor<string>(ana, "select public.caixa_pedir_saida(5000, 'Troco para a loja vizinha', $1) as v", [chave("saida")]);
    await valor(ana, "select public.caixa_cancelar_saida($1) as v", [saida]);
    const { pedido } = await pedirDesconto(ana);
    expect(await lote()).toEqual([]);
    expect(await aviso("saida_caixa", saida)).toMatchObject({ situacao: "dispensado" });
    expect(await aviso("desconto", pedido)).toMatchObject({ situacao: "sem_destino" });
  });

  it("o aviso de teste vai só para os celulares de quem pediu, no máximo um por minuto", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await recusa(ana, "select public.aviso_teste() as v")).toBe("OR039");
    const daAna = await inscrever(ana);
    await inscrever(dono);
    expect(await valor(ana, "select public.aviso_teste() as v")).toEqual({ na_fila: true });
    expect(await recusa(ana, "select public.aviso_teste() as v")).toBe("OR040");
    expect(await recusa(null, "select public.aviso_teste() as v")).toBe("42501");
    const pegos = await lote();
    expect(pegos.map((x) => [x.tipo, x.titulo, x.endereco, x.inscricoes.map((i) => i.endpoint)])).toEqual([["teste", "Aviso de teste", "/inicio", [daAna.endpoint]]]);
  });
});

// Lote QUAL-006a (24/11/2026; ORA-QUAL-006 e ORA-QUAL-013; migration 20261124121856_aviso_do_erro_do_servidor): o aviso
// no celular quando há erro do servidor. O worker dos avisos relata a cada minuto a conta dos erros do site (ou que o site
// não respondeu), com o segredo dos avisos; o banco decide o alerta da rede e o põe na fila do PWA-b. Endereços, chaves e
// segredo FICTÍCIOS; cada teste numa transação desfeita (o now() é o do começo dela: o tempo passa mexendo nas datas).
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";

const SEGREDO = "segredo-ficticio-dos-avisos-para-o-teste-0123456789";

let db: PGlite;
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});
beforeEach(async () => {
  await db.exec("begin");
  await db.query("insert into privado.segredos_de_rotina (nome, impressao) values ('avisos_no_celular', sha256(convert_to($1, 'UTF8')))", [SEGREDO]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let celulares = 0;
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
const valor = <T>(s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
async function inscrever(s: Sessao) {
  const n = String(++celulares).padStart(4, "0");
  const endpoint = `https://push.exemplo.invalid/servidor/${n}`;
  await valor(s, "select public.aviso_inscrever($1, $2, $3, null) as v", [endpoint, `B${"A".repeat(82)}${n}`, `auth${"x".repeat(14)}${n}`]);
  return endpoint;
}

/** A recusa, com a tentativa dentro da sessão (o erro não deixa a transação abortada para a volta do papel). */
const recusa = (s: Sessao | null, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, () => erroDe(() => db.query(sql, params)), { criarSessao: false });
const RELATAR = "select public.erros_do_servidor_relatar($1, $2::jsonb) as v";
/** O relato, como o worker o manda: com a chave pública (sem sessão de pessoa) e o segredo dos avisos. */
const relatar = async (relato: unknown, segredo = SEGREDO) => (await valor<{ alertas: number }>(null, RELATAR, [segredo, JSON.stringify(relato)])).alertas;
const recusaDoRelato = (relato: unknown, segredo = SEGREDO) => recusa(null, RELATAR, [segredo, JSON.stringify(relato)]);
/** Um instante em UTC, como o site o escreve, a tantos minutos de agora. */
const ha = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString();
/** "14:05" no fuso de São Paulo, como o banco escreve no alerta. */
const hora = (instante: string | Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instante));
const respondeu = (desde: string, erros: number, ultimo: { quando: string; rota: string } | null = null) => ({ respondeu: true, desde, erros, ultimo });
const SEM_RESPOSTA = { respondeu: false };

type Alerta = { organizacao_id: string; unidade_id: string | null; permissao: string; titulo: string; corpo: string; endereco: string; solicitante_id: string | null };
const alertas = async () => (await db.query<Alerta>(
  "select organizacao_id, unidade_id, permissao, titulo, corpo, endereco, solicitante_id from privado.avisos where tipo = 'alerta' order by criado_em, titulo, organizacao_id")).rows;
const estado = async () => (await db.query<{ erros: number; pendentes: number; ultima_rota: string | null; sem_resposta: boolean }>(
  "select erros, pendentes, ultima_rota, sem_resposta_desde is not null as sem_resposta from privado.erros_do_servidor")).rows[0];
type Lote = { tipo: string; titulo: string; corpo: string; inscricoes: { endpoint: string }[] }[];
const lote = () => valor<Lote>(null, "select public.avisos_a_enviar($1, 100) as v", [SEGREDO]);
const REDES = [ids.organizacao, ids.outraOrganizacao].sort();

describe("o relato do worker (QUAL-006a)", () => {
  it("só com o segredo dos avisos; o relato fora do formato é recusado, e nada é gravado", async () => {
    const desde = ha(30);
    expect(await recusaDoRelato(respondeu(desde, 0), "segredo-errado-com-tamanho-suficiente-000000")).toBe("42501");
    expect(await recusaDoRelato(SEM_RESPOSTA, "")).toBe("42501");
    const quando = ha(2);
    for (const relato of [
      null, [], {}, { respondeu: "sim" }, { respondeu: true },
      { respondeu: true, desde: "ontem", erros: 0, ultimo: null },
      { respondeu: true, desde: "infinity", erros: 0, ultimo: null },
      { respondeu: true, desde, erros: 0 },
      respondeu(desde, -1), { ...respondeu(desde, 0), erros: 1.5 }, { ...respondeu(desde, 0), erros: "2" }, respondeu(desde, 10_000_000_000),
      respondeu(desde, 2), respondeu(desde, 0, { quando, rota: "/vender" }),
      respondeu(desde, 1, { quando, rota: "javascript:alert(1)" }), respondeu(desde, 1, { quando, rota: "/vendas/123?cpf=12345678900" }),
      respondeu(desde, 1, { quando, rota: `/${"a".repeat(161)}` }), respondeu(desde, 1, { quando: ha(40), rota: "/vender" }),
      respondeu(new Date(Date.now() + 3_600_000).toISOString(), 0), respondeu(desde, 1, { quando: "agora", rota: "/vender" }),
    ]) expect(await recusaDoRelato(relato), JSON.stringify(relato)).toBe("22023");
    expect(await estado()).toBeUndefined();
    expect(await alertas()).toEqual([]);
  });

  it("sem erro, só grava o relato; com erros, um alerta para cada rede ativa, para quem gere as lojas pela rede inteira, com o endereço da Saúde da operação", async () => {
    const doDono = await inscrever(await naLoja(ids.dono, ids.lojaA));
    const doAdministrador = await inscrever(await naLoja(ids.administrador, ids.lojaA));
    await inscrever(await naLoja(ids.gerenteB, ids.lojaB));
    await inscrever(await naLoja(ids.vendedorA, ids.lojaA));
    const daOutraRede = await inscrever(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg));
    const desde = ha(30);
    expect(await relatar(respondeu(desde, 0))).toBe(0);
    expect(await estado()).toEqual({ erros: 0, pendentes: 0, ultima_rota: null, sem_resposta: false });
    expect(await alertas()).toEqual([]);

    const quando = ha(1);
    expect(await relatar(respondeu(desde, 2, { quando, rota: "/vendas/[id]" }))).toBe(2);
    const corpo = `2 erros novos; o último às ${hora(quando)}, em /vendas/[id]. Veja na Saúde da operação.`;
    expect((await alertas()).map((a) => [a.organizacao_id, a.unidade_id, a.permissao, a.titulo, a.corpo, a.endereco, a.solicitante_id]).sort())
      .toEqual(REDES.map((rede) => [rede, null, "unidades.gerir", "Erros no servidor do site", corpo, "/operacao", null]));
    expect(await estado()).toEqual({ erros: 2, pendentes: 0, ultima_rota: "/vendas/[id]", sem_resposta: false });
    // Quem recebe: o dono e o administrador da rede (vínculo da rede inteira com unidades.gerir); na outra rede, o dono
    // dela. O gerente da loja e a vendedora, não.
    const destinos = (await lote()).filter((a) => a.tipo === "alerta").map((a) => a.inscricoes.map((i) => i.endpoint).sort()).sort((x, y) => x.length - y.length);
    expect(destinos).toEqual([[daOutraRede], [doDono, doAdministrador].sort()]);
    // O mesmo relato de novo não avisa de novo.
    expect(await relatar(respondeu(desde, 2, { quando, rota: "/vendas/[id]" }))).toBe(0);
  });

  it("no máximo um alerta por hora: os erros desse meio vão no próximo, e a publicação (um processo novo do site) não perde os que esperam", async () => {
    const desde = ha(50);
    expect(await relatar(respondeu(desde, 1, { quando: ha(40), rota: "/vender" }))).toBe(2);
    expect((await alertas())[0]).toMatchObject({ titulo: "Erro no servidor do site", corpo: `1 erro novo; o último às ${hora(ha(40))}, em /vender. Veja na Saúde da operação.` });
    expect(await relatar(respondeu(desde, 3, { quando: ha(30), rota: "/caixa" }))).toBe(0);
    expect(await estado()).toMatchObject({ erros: 3, pendentes: 2, ultima_rota: "/caixa" });
    // O site foi publicado: a conta dele recomeça; os 2 que esperam continuam esperando, mais o 1 do processo novo.
    const novo = ha(20);
    const ultimo = ha(10);
    expect(await relatar(respondeu(novo, 1, { quando: ultimo, rota: "/estoque" }))).toBe(0);
    expect(await estado()).toMatchObject({ erros: 1, pendentes: 3, ultima_rota: "/estoque" });
    // Uma hora depois do último alerta, o próximo relato leva os 3, mesmo sem erro novo.
    await db.query("update privado.erros_do_servidor set alerta_de_erros_em = now() - interval '61 minutes'");
    expect(await relatar(respondeu(novo, 1, { quando: ultimo, rota: "/estoque" }))).toBe(2);
    expect((await alertas()).slice(-2).map((a) => [a.titulo, a.corpo])).toEqual([1, 2].map(() =>
      ["Erros no servidor do site", `3 erros novos; o último às ${hora(ultimo)}, em /estoque. Veja na Saúde da operação.`]));
    expect(await estado()).toMatchObject({ pendentes: 0 });
    expect(await relatar(respondeu(novo, 1, { quando: ultimo, rota: "/estoque" }))).toBe(0);
    // A conta que volta para trás no mesmo processo não inventa erro nem fica negativa.
    expect(await relatar(respondeu(novo, 0))).toBe(0);
    expect(await estado()).toMatchObject({ erros: 0, pendentes: 0, ultima_rota: "/estoque" });
  });

  it("a regra muda sem migration: com 10 minutos entre os alertas, o seguinte sai depois de 10 minutos", async () => {
    const desde = ha(50);
    expect(await relatar(respondeu(desde, 1, { quando: ha(40), rota: "/vender" }))).toBe(2);
    await db.query("update privado.erros_do_servidor set alerta_a_cada = interval '10 minutes', alerta_de_erros_em = now() - interval '9 minutes'");
    expect(await relatar(respondeu(desde, 2, { quando: ha(5), rota: "/vender" }))).toBe(0);
    await db.query("update privado.erros_do_servidor set alerta_de_erros_em = now() - interval '11 minutes'");
    expect(await relatar(respondeu(desde, 2, { quando: ha(5), rota: "/vender" }))).toBe(2);
    expect(await erroDe(() => db.query("update privado.erros_do_servidor set alerta_a_cada = interval '1 minute'"))).toBe("23514");
  });

  it("o site sem resposta: a queda curta não avisa; depois de 5 minutos vira o alerta, de novo a cada hora enquanto durar, e a volta avisa", async () => {
    const desde = ha(50);
    expect(await relatar(respondeu(desde, 0))).toBe(0);
    expect(await relatar(SEM_RESPOSTA)).toBe(0);
    expect(await relatar(SEM_RESPOSTA)).toBe(0);
    expect(await estado()).toMatchObject({ sem_resposta: true });
    // A publicação: o site some por alguns segundos e volta; ninguém é avisado.
    expect(await relatar(respondeu(ha(1), 0))).toBe(0);
    expect(await estado()).toMatchObject({ sem_resposta: false });
    expect(await alertas()).toEqual([]);

    expect(await relatar(SEM_RESPOSTA)).toBe(0);
    await db.query("update privado.erros_do_servidor set sem_resposta_desde = now() - interval '6 minutes'");
    const caiu = (await db.query<{ v: Date }>("select sem_resposta_desde as v from privado.erros_do_servidor")).rows[0]?.v as Date;
    expect(await relatar(SEM_RESPOSTA)).toBe(2);
    expect((await alertas()).map((a) => [a.titulo, a.corpo, a.endereco, a.permissao])).toEqual([1, 2].map(() =>
      ["O site não responde", `O site não responde desde as ${hora(caiu)}. O servidor tenta religar sozinho a cada 5 minutos.`, "/operacao", "unidades.gerir"]));
    expect(await relatar(SEM_RESPOSTA)).toBe(0);
    await db.query("update privado.erros_do_servidor set alerta_de_fora_em = now() - interval '61 minutes'");
    expect(await relatar(SEM_RESPOSTA)).toBe(2);
    // Voltou: um alerta só da volta; o seguinte não repete.
    expect(await relatar(respondeu(ha(1), 0))).toBe(2);
    const agora = (await db.query<{ v: Date }>("select now() as v")).rows[0]?.v as Date;
    expect((await alertas()).slice(-2).map((a) => [a.titulo, a.corpo])).toEqual([1, 2].map(() =>
      ["O site voltou", `O site voltou a responder às ${hora(agora)} (estava sem responder desde as ${hora(caiu)}).`]));
    expect(await relatar(respondeu(ha(1), 0))).toBe(0);
    expect(await estado()).toMatchObject({ sem_resposta: false });
  });

  it("a rede inativa não recebe; o relato com erro na volta do site avisa a volta e os erros", async () => {
    await db.query("update public.organizacoes set status = 'inativa' where id = $1", [ids.outraOrganizacao]);
    expect(await relatar(SEM_RESPOSTA)).toBe(0);
    await db.query("update privado.erros_do_servidor set sem_resposta_desde = now() - interval '7 minutes'");
    expect(await relatar(SEM_RESPOSTA)).toBe(1);
    expect(await relatar(respondeu(ha(2), 1, { quando: ha(1), rota: "/inicio" }))).toBe(2);
    // (Na mesma transação, todos têm a mesma hora: a lista sai pelo título.)
    expect((await alertas()).map((a) => [a.organizacao_id, a.titulo])).toEqual([
      [ids.organizacao, "Erro no servidor do site"], [ids.organizacao, "O site não responde"], [ids.organizacao, "O site voltou"],
    ]);
  });
});

describe("a situação do aviso na Saúde da operação (QUAL-006a)", () => {
  type Situacao = { relatado_em: string | null; sem_resposta_desde: string | null; pendentes: number; alerta_de_erros_em: string | null; alerta_de_fora_em: string | null; alerta_a_cada_minutos: number; fora_apos_minutos: number };
  const situacao = (s: Sessao) => valor<Situacao>(s, "select public.erros_do_servidor_situacao() as v");

  it("quem recebe o alerta vê quando o worker conferiu o site e quando saiu o último alerta; antes do primeiro relato, tudo vazio", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await situacao(dono)).toEqual({ relatado_em: null, sem_resposta_desde: null, pendentes: 0, alerta_de_erros_em: null, alerta_de_fora_em: null, alerta_a_cada_minutos: 60, fora_apos_minutos: 5 });
    const desde = ha(50);
    await relatar(respondeu(desde, 1, { quando: ha(40), rota: "/vender" }));
    await relatar(respondeu(desde, 2, { quando: ha(30), rota: "/vender" }));
    const depois = await situacao(dono);
    expect(depois).toMatchObject({ sem_resposta_desde: null, pendentes: 1, alerta_de_fora_em: null, alerta_a_cada_minutos: 60, fora_apos_minutos: 5 });
    expect(depois.relatado_em).not.toBeNull();
    expect(depois.alerta_de_erros_em).not.toBeNull();
    // O administrador e o dono da outra rede (o site é um só) veem a mesma linha.
    expect(await situacao(await naLoja(ids.administrador, ids.lojaA))).toEqual(depois);
    expect(await situacao(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toEqual(depois);
  });

  it("o gerente da loja, a vendedora e o visitante sem login não veem", async () => {
    for (const s of [await naLoja(ids.gerenteB, ids.lojaB), await naLoja(ids.vendedorA, ids.lojaA)]) expect(await recusa(s, "select public.erros_do_servidor_situacao() as v")).toBe("42501");
    expect(await recusa(null, "select public.erros_do_servidor_situacao() as v")).toBe("42501");
  });
});

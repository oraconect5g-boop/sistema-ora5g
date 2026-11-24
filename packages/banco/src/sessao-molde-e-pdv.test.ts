import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

// VEL-a (QUAL-010, POS-002, D-047): a sessão com o molde e a tela do PDV numa ida só ao banco.
// As duas funções só leem, com os direitos de quem chama. O molde pergunta cada permissão ao tem_permissao (não decide
// por conta própria) e devolve a mesma situação da sessão que barra o bloqueado, o fora do turno e o segundo fator
// pendente (ORG-006 e ORG-007). O PDV devolve o que a pessoa já lia em separado, e nada de outra pessoa nem de outra loja.

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
let chaves = 0;
// De 8 a 80 caracteres, como os formulários exigem.
const chave = (prefixo: string) => `${prefixo}:${String(++chaves).padStart(8, "0")}`;
const nova = (usuario: string, aal?: "aal1" | "aal2"): Sessao =>
  ({ usuario, sessao: `6a000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`, ...(aal ? { aal } : {}) });
async function naLoja(usuario: string, unidade: string, aal?: "aal1" | "aal2"): Promise<Sessao> {
  const s = nova(usuario, aal);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
type Opcoes = { criarSessao?: boolean };
const linhas = async <T>(s: Sessao | null, sql: string, params: unknown[] = [], opcoes: Opcoes = {}) =>
  comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const { rows } = await db.query<T>(sql, params);
      await db.exec("release savepoint passo");
      return rows;
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      throw new Error(`${sql.slice(0, 70)} → ${(e as Error).message} (${(e as { code?: string }).code})`, { cause: e });
    }
  }, opcoes);
const valor = async <T>(s: Sessao | null, sql: string, params: unknown[] = [], opcoes: Opcoes = {}) =>
  (await linhas<{ v: T }>(s, sql, params, opcoes))[0]?.v as T;
const erroDe = (s: Sessao | null, sql: string, params: unknown[] = []) =>
  linhas(s, sql, params).then(() => null, (e: { cause?: { code?: string } }) => e.cause?.code ?? "sem-codigo");

// As 30 permissões que o menu pergunta (lib/acesso/menu.ts da plataforma) e as 3 que valem na rede inteira.
const REDE = ["usuarios.gerir", "unidades.gerir", "catalogo.gerir"];
const LOJA = [
  "venda.registrar", "venda.ver_unidade", "venda.ver_todas", "caixa.abrir", "caixa.conferir", "estoque.consultar", "connect.operar",
  "connect.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver", "cliente.buscar", "crm.atender", "pagamento.conciliar",
  "terminal.gerir", "metas.gerir", "metas.ver_unidade", "metas.ver_propria", "conta_pagar.gerir", "resultado.ver", "previsao.ver",
  "bonus.definir", "bonus.conferir", "bonus.aprovar", "os.abrir", "os.gerir", "os.orcar",
];

type Situacao = {
  usuario_ativo: boolean; sessao_no_turno: boolean; unidade_id: string | null; unidade_nome: string | null;
  turno_termina_em: string | null; segundo_fator_pendente: boolean;
};
type Molde = {
  situacao: Situacao;
  permissoes: string[];
  nome: string | null;
  vinculos: { papel: string; escopo: string; unidade_id: string | null }[];
  pendencias: { aprovacoes: number; notas: number };
};
const MOLDE = "select public.molde_da_sessao($1::text[], $2::text[]) as v";
const molde = (s: Sessao, loja: string[] = LOJA, rede: string[] = REDE, opcoes: Opcoes = {}) => valor<Molde>(s, MOLDE, [loja, rede], opcoes);

/** O que a aplicação fazia antes: uma pergunta ao tem_permissao por permissão (as da loja com a loja do turno, as da rede sem loja). */
async function umaPorUma(s: Sessao, unidade: string | null, loja: string[], rede: string[]) {
  const tem: string[] = [];
  for (const p of loja) if (await valor<boolean>(s, "select public.tem_permissao($1, $2) as v", [p, unidade])) tem.push(p);
  for (const p of rede) if (await valor<boolean>(s, "select public.tem_permissao($1) as v", [p])) tem.push(p);
  return [...new Set(tem)].sort();
}

const abrirCaixa = (s: Sessao, fundo = 10_000) => valor<string>(s, "select public.abrir_caixa($1, $2) as v", [fundo, chave("caixa")]);
const novaVenda = (s: Sessao) => valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
const adicionar = (s: Sessao, venda: string, variante: string, item: string | null = null, quantidade = 1) =>
  valor<string>(s, "select public.adicionar_item($1, $2, $3, $4, $5) as v", [venda, variante, item, quantidade, chave("item")]);

describe("molde_da_sessao: a sessão, as permissões, o nome, os vínculos e as contagens numa leitura (VEL-a)", () => {
  it("cada permissão sai igual ao tem_permissao perguntado uma por uma, em cada papel e loja", async () => {
    const casos: [string, () => Promise<Sessao>][] = [
      ["dono sem loja escolhida", async () => nova(ids.dono)],
      ["dono na loja A", () => naLoja(ids.dono, ids.lojaA)],
      ["administrador na loja B", () => naLoja(ids.administrador, ids.lojaB)],
      ["gerente na loja B", () => naLoja(ids.gerenteB, ids.lojaB)],
      ["vendedor na loja A", () => naLoja(ids.vendedorA, ids.lojaA)],
      ["vendedor de duas lojas, na loja B", () => naLoja(ids.vendedorAB, ids.lojaB)],
      ["técnico na assistência", () => naLoja(ids.tecnico, ids.assistencia)],
      ["pessoa sem vínculo", async () => nova(ids.semVinculo)],
      ["dono de outra rede", () => naLoja(ids.donoOutraOrg, ids.lojaOutraOrg)],
    ];
    const achado: Record<string, string[]> = {};
    for (const [quem, entrar] of casos) {
      const s = await entrar();
      const m = await molde(s);
      expect(m.permissoes, quem).toEqual(await umaPorUma(s, m.situacao.unidade_id, LOJA, REDE));
      achado[quem] = m.permissoes;
    }
    // Fatos da matriz de papéis, para a comparação acima não passar com as duas pontas vazias.
    expect(achado["vendedor na loja A"]).toEqual(expect.arrayContaining(["venda.registrar", "caixa.abrir", "cliente.buscar"]));
    for (const p of ["usuarios.gerir", "unidades.gerir", "catalogo.gerir", "desconto.aprovar", "nota.aprovar", "auditoria.ver"]) {
      expect(achado["vendedor na loja A"], p).not.toContain(p);
    }
    expect(achado["dono na loja A"]).toEqual(expect.arrayContaining([...REDE, "desconto.aprovar", "nota.aprovar", "venda.ver_todas"]));
    expect(achado["gerente na loja B"]).toContain("desconto.aprovar");
    expect(achado["gerente na loja B"]).not.toContain("usuarios.gerir");
    expect(achado["técnico na assistência"]).toContain("os.orcar");
    expect(achado["técnico na assistência"]).not.toContain("venda.registrar");
    expect(achado["pessoa sem vínculo"]).toEqual([]);
    expect(achado["dono de outra rede"]).toEqual(expect.arrayContaining(REDE));
  });

  it("a permissão da loja vale na loja do turno: gerente numa loja não aprova desconto na outra", async () => {
    await db.query(
      "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio) values ($1, $2, 'gerente', 'unidade', $3, now() - interval '1 hour')",
      [ids.vendedorAB, ids.organizacao, ids.lojaB]);
    const naA = await molde(await naLoja(ids.vendedorAB, ids.lojaA));
    const naB = await molde(await naLoja(ids.vendedorAB, ids.lojaB));
    expect(naA.situacao.unidade_id).toBe(ids.lojaA);
    expect(naA.permissoes).toContain("venda.registrar");
    expect(naA.permissoes).not.toContain("desconto.aprovar");
    expect(naB.situacao.unidade_id).toBe(ids.lojaB);
    expect(naB.permissoes).toContain("desconto.aprovar");
  });

  it("o catálogo inteiro de permissões, em blocos, sai igual ao tem_permissao; código que não existe não volta", async () => {
    const codigos = (await db.query<{ codigo: string }>("select codigo from public.permissoes order by codigo")).rows.map((r) => r.codigo);
    expect(codigos.length).toBeGreaterThan(40);
    const blocos: string[][] = [];
    for (let i = 0; i < codigos.length; i += 40) blocos.push(codigos.slice(i, i + 40));
    const quem: [string, string][] = [[ids.dono, ids.lojaA], [ids.administrador, ids.lojaA], [ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA], [ids.tecnico, ids.assistencia]];
    for (const [usuario, unidade] of quem) {
      const s = await naLoja(usuario, unidade);
      for (const bloco of blocos) {
        const daLoja = await linhas<{ c: string }>(s, "select c from unnest($1::text[]) c where public.tem_permissao(c, $2) order by c", [bloco, unidade]);
        expect((await molde(s, bloco, [])).permissoes, `${usuario} na loja`).toEqual(daLoja.map((l) => l.c));
        const daRede = await linhas<{ c: string }>(s, "select c from unnest($1::text[]) c where public.tem_permissao(c) order by c", [bloco]);
        expect((await molde(s, [], bloco)).permissoes, `${usuario} na rede`).toEqual(daRede.map((l) => l.c));
      }
    }
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await molde(dono, ["nao.existe", "venda.registrar", "venda.registrar"], ["tambem.nao", "venda.registrar", "usuarios.gerir"])).permissoes)
      .toEqual(["usuarios.gerir", "venda.registrar"]);
  });

  // VEL-b (18/11): as telas e as ações passam a ler do molde as permissões que antes perguntavam uma a uma, na loja do
  // turno ou sem loja. As duas perguntas dão a mesma resposta numa sessão: o vínculo de organização vale sem loja e em
  // qualquer loja dela; o de loja só vale na loja do turno (com ou sem a loja na pergunta). O molde responde pelas duas.
  it("na loja do turno e sem loja, a resposta é a mesma em todo papel, para o catálogo inteiro de permissões (VEL-b)", async () => {
    const codigos = (await db.query<{ codigo: string }>("select codigo from public.permissoes order by codigo")).rows.map((r) => r.codigo);
    const quem: [string, string | null][] = [
      [ids.dono, ids.lojaA], [ids.dono, null], [ids.administrador, ids.lojaB], [ids.gerenteB, ids.lojaB], [ids.vendedorA, ids.lojaA],
      [ids.vendedorAB, ids.lojaB], [ids.vendedorAB, ids.lojaA], [ids.tecnico, ids.assistencia], [ids.donoOutraOrg, ids.lojaOutraOrg], [ids.semVinculo, null],
    ];
    const vistos = new Set<string>();
    for (const [usuario, unidade] of quem) {
      const s = unidade ? await naLoja(usuario, unidade) : await nova(usuario);
      const naLojaDoTurno = await linhas<{ c: string }>(s, "select c from unnest($1::text[]) c where public.tem_permissao(c, public.unidade_atual()) order by c", [codigos]);
      const semLoja = await linhas<{ c: string }>(s, "select c from unnest($1::text[]) c where public.tem_permissao(c) order by c", [codigos]);
      expect(naLojaDoTurno, `${usuario} em ${unidade}`).toEqual(semLoja);
      expect((await molde(s, codigos.slice(0, 40), codigos.slice(40, 80))).permissoes, `${usuario} em ${unidade}: o molde`).toEqual(
        semLoja.map((l) => l.c).filter((c) => codigos.slice(0, 80).includes(c)));
      for (const l of semLoja) vistos.add(l.c);
    }
    // Não passa com as pontas vazias: os papéis de teste somam muitas permissões.
    expect(vistos.size).toBeGreaterThan(30);
  });

  it("a situação é a mesma de situacao_da_sessao, com os mesmos campos", async () => {
    const s = await naLoja(ids.vendedorAB, ids.lojaB);
    const m = await molde(s);
    const [linha] = await linhas<Omit<Situacao, "turno_termina_em"> & { turno_termina_em: Date }>(s, "select * from public.situacao_da_sessao()");
    expect(Object.keys(m).sort()).toEqual(["nome", "pendencias", "permissoes", "situacao", "vinculos"]);
    expect(Object.keys(m.situacao).sort()).toEqual(["segundo_fator_pendente", "sessao_no_turno", "turno_termina_em", "unidade_id", "unidade_nome", "usuario_ativo"]);
    expect(m.situacao).toMatchObject({ usuario_ativo: true, sessao_no_turno: true, unidade_id: ids.lojaB, unidade_nome: "Loja B", segundo_fator_pendente: false });
    expect({ ...m.situacao, turno_termina_em: null }).toEqual({ ...linha, turno_termina_em: null });
    // A hora do fim do turno vem como texto com fuso, como a API já mandava: a tela continua lendo a mesma hora.
    expect(typeof m.situacao.turno_termina_em).toBe("string");
    expect(new Date(m.situacao.turno_termina_em as string).getTime()).toBe(linha?.turno_termina_em.getTime());
  });

  it("quem não pode entrar recebe o motivo e nenhuma permissão: bloqueado, vínculo encerrado, sem vínculo", async () => {
    const vazio = { permissoes: [], pendencias: { aprovacoes: 0, notas: 0 } };
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await molde(ana)).toMatchObject({ situacao: { usuario_ativo: true, unidade_id: ids.lojaA }, nome: "vendedor.a", permissoes: expect.arrayContaining(["venda.registrar"]) });
    await db.exec("savepoint bloqueio");
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = any($1::uuid[])", [[ids.bloqueado, ids.vendedorA]]);
    // Bloqueado antes de entrar: nem o próprio nome lê (as regras de leitura exigem a conta ativa).
    expect(await molde(nova(ids.bloqueado))).toMatchObject({ ...vazio, situacao: { usuario_ativo: false, unidade_id: null, unidade_nome: null }, nome: null, vinculos: [] });
    // Bloqueado no meio do turno, com a loja já escolhida: perde a loja e as permissões na leitura seguinte.
    expect(await molde(ana)).toMatchObject({ ...vazio, situacao: { usuario_ativo: false, unidade_id: null, unidade_nome: null }, nome: null, vinculos: [] });
    await db.exec("rollback to savepoint bloqueio");
    // Vínculo encerrado no meio do turno: a conta segue ativa, mas sem loja e sem permissão.
    await db.query("update public.vinculos set fim = now() where usuario_id = $1", [ids.vendedorA]);
    expect(await molde(ana)).toMatchObject({ ...vazio, situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: null }, nome: "vendedor.a", vinculos: [] });
    // Vínculo encerrado ontem e pessoa sem vínculo nenhum.
    expect(await molde(nova(ids.encerrado))).toMatchObject({ ...vazio, situacao: { usuario_ativo: true, unidade_id: null }, nome: "encerrado", vinculos: [] });
    expect(await molde(nova(ids.semVinculo))).toMatchObject({ ...vazio, situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: null }, nome: "sem.vinculo", vinculos: [] });
  });

  it("fora do turno, com o prazo do Auth vencido ou depois de sair, a sessão não tem loja nem permissão (ORG-006)", async () => {
    const semNada = { permissoes: [], pendencias: { aprovacoes: 0, notas: 0 } };
    // 13 horas depois de entrar (o turno é de 12).
    const longa = await naLoja(ids.dono, ids.lojaA);
    expect((await molde(longa)).permissoes).toContain("usuarios.gerir");
    await db.query("update auth.sessions set created_at = now() - interval '13 hours' where id = $1", [longa.sessao]);
    expect(await molde(longa)).toMatchObject({ ...semNada, situacao: { usuario_ativo: true, sessao_no_turno: false, unidade_id: null } });
    // O prazo que o Auth deu à sessão venceu.
    const vencida = await naLoja(ids.gerenteB, ids.lojaB);
    await db.query("update auth.sessions set not_after = now() - interval '1 second' where id = $1", [vencida.sessao]);
    expect(await molde(vencida)).toMatchObject({ ...semNada, situacao: { sessao_no_turno: false, unidade_id: null } });
    // Saiu (ou foi desconectada por quem gere a equipe): a linha da sessão some do Auth; o token antigo não vale mais.
    const saiu = await naLoja(ids.vendedorA, ids.lojaA);
    await db.query("delete from auth.sessions where id = $1", [saiu.sessao]);
    expect(await molde(saiu, LOJA, REDE, { criarSessao: false }))
      .toMatchObject({ ...semNada, situacao: { usuario_ativo: true, sessao_no_turno: false, unidade_id: null, turno_termina_em: null } });
  });

  it("com o segundo fator pendente, avisa e não devolve permissão; com o código conferido, devolve (ORG-007)", async () => {
    await db.query("insert into auth.mfa_factors (user_id, friendly_name, factor_type, status) values ($1, 'Celular', 'totp', 'verified')", [ids.dono]);
    const semCodigo = await molde(nova(ids.dono, "aal1"));
    expect(semCodigo).toMatchObject({ permissoes: [], situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: null, segundo_fator_pendente: true } });
    const semNivel = await molde(nova(ids.dono));
    expect(semNivel).toMatchObject({ permissoes: [], situacao: { segundo_fator_pendente: true } });
    const comCodigo = await molde(await naLoja(ids.dono, ids.lojaA, "aal2"));
    expect(comCodigo.situacao).toMatchObject({ unidade_id: ids.lojaA, segundo_fator_pendente: false });
    expect(comCodigo.permissoes).toEqual(expect.arrayContaining(["usuarios.gerir", "venda.registrar"]));
  });

  it("o nome e os vínculos são os da própria pessoa, como ela lia em separado", async () => {
    const proprios = "select papel, escopo, unidade_id from public.vinculos where usuario_id = (select auth.uid()) and fim is null";
    const porLoja = (v: { unidade_id: string | null }[]) => [...v].sort((a, b) => String(a.unidade_id).localeCompare(String(b.unidade_id)));
    const bia = await naLoja(ids.vendedorAB, ids.lojaA);
    const daBia = await molde(bia);
    expect(daBia.nome).toBe("vendedor.ab");
    expect(porLoja(daBia.vinculos)).toEqual([
      { papel: "vendedor", escopo: "unidade", unidade_id: ids.lojaA }, { papel: "vendedor", escopo: "unidade", unidade_id: ids.lojaB },
    ]);
    expect(porLoja(daBia.vinculos)).toEqual(porLoja(await linhas(bia, proprios)));
    // O dono lê os vínculos da equipe inteira, mas o molde traz só os dele.
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect((await linhas(dono, "select 1 from public.vinculos where fim is null")).length).toBeGreaterThan(5);
    expect(await molde(dono)).toMatchObject({ nome: "dono", vinculos: [{ papel: "dono", escopo: "organizacao", unidade_id: null }] });
    expect((await linhas<{ nome: string }>(dono, "select nome from public.perfis_usuario where id = (select auth.uid())"))[0]?.nome).toBe("dono");
  });

  it("a contagem de descontos aguardando: só para quem aprova, e só os da loja do turno", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const capa = await adicionar(ana, await novaVenda(ana), cat.capa);
    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 500) as v", [capa])).toBe("precisa_aprovacao");
    const pedido = await valor<string>(ana, "select public.pedir_aprovacao($1, 'Cliente antigo da loja') as v", [capa]);
    const aguardando = async (s: Sessao) => (await molde(s)).pendencias.aprovacoes;
    expect(await aguardando(ana)).toBe(0); // quem pediu não aprova: não vê a fila
    expect(await aguardando(await naLoja(ids.vendedorAB, ids.lojaA))).toBe(0);
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await aguardando(dono)).toBe(1);
    expect(await aguardando(await naLoja(ids.administrador, ids.lojaA))).toBe(0); // o administrador não aprova desconto
    expect(await aguardando(await naLoja(ids.dono, ids.lojaB))).toBe(0); // é da loja A
    expect(await aguardando(await naLoja(ids.gerenteB, ids.lojaB))).toBe(0);
    expect(await aguardando(nova(ids.dono))).toBe(0); // sem loja escolhida não há fila
    // Quem vira gerente da loja A passa a ver a fila dela, e só no turno nela.
    await db.query(
      "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id, inicio) values ($1, $2, 'gerente', 'unidade', $3, now() - interval '1 hour')",
      [ids.vendedorAB, ids.organizacao, ids.lojaA]);
    expect(await aguardando(await naLoja(ids.vendedorAB, ids.lojaA))).toBe(1);
    expect(await aguardando(await naLoja(ids.vendedorAB, ids.lojaB))).toBe(0);
    // O que a tela contava em separado, com as regras de leitura de quem aprova.
    const contar = "select count(*)::int as v from public.aprovacoes_desconto where unidade_id = $1 and situacao = 'pendente'";
    expect(await valor<number>(dono, contar, [ids.lojaA])).toBe(1);
    expect(await valor<boolean>(dono, "select public.decidir_aprovacao($1, true, 'Ok') as v", [pedido])).toBe(true);
    expect(await aguardando(dono)).toBe(0);
  });

  it("a contagem de notas na fila: aguardando aprovação e aprovadas, só para quem aprova nota", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.capa);
    await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
    const nota = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
    const naFila = async (s: Sessao) => (await molde(s)).pendencias.notas;
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await naFila(ana)).toBe(0);
    expect(await naFila(dono)).toBe(1);
    expect(await naFila(await naLoja(ids.dono, ids.lojaB))).toBe(0);
    const contar = "select count(*)::int as v from public.notas_pedidos where unidade_id = $1 and situacao in ('aguardando_aprovacao', 'aprovada')";
    expect(await valor<number>(dono, contar, [ids.lojaA])).toBe(1);
    // Aprovada, continua na fila (falta registrar a emissão); o pedido não some da contagem ao ser aprovado.
    await valor(dono, "select public.notas_decidir($1, true, null) as v", [nota]);
    expect((await db.query<{ situacao: string }>("select situacao from public.notas_pedidos where id = $1", [nota])).rows[0]?.situacao).toBe("aprovada");
    expect(await naFila(dono)).toBe(1);
  });

  it("mais de 80 permissões numa leitura só é recusado; listas nulas ou vazias não quebram", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const muitas = (n: number) => Array.from({ length: n }, (_, i) => `x.p${"a".repeat(i % 5)}${i}`);
    expect(await erroDe(dono, MOLDE, [muitas(81), []])).toBe("22023");
    expect(await erroDe(dono, MOLDE, [muitas(41), muitas(40)])).toBe("22023");
    expect(await erroDe(dono, MOLDE, [muitas(40), muitas(40)])).toBeNull();
    expect((await valor<Molde>(dono, "select public.molde_da_sessao(null, null) as v")).permissoes).toEqual([]);
    expect((await valor<Molde>(dono, "select public.molde_da_sessao('{}'::text[]) as v")).permissoes).toEqual([]);
  });

  it("quem não entrou não executa nenhuma das duas; quem entrou executa", async () => {
    expect(await erroDe(null, "select public.molde_da_sessao('{}'::text[]) as v")).toBe("42501");
    expect(await erroDe(null, "select public.pdv_tela() as v")).toBe("42501");
    const pode = async (papel: string, funcao: string) =>
      (await db.query<{ v: boolean }>("select has_function_privilege($1, $2, 'execute') as v", [papel, funcao])).rows[0]?.v;
    for (const funcao of ["public.molde_da_sessao(text[], text[])", "public.pdv_tela()"]) {
      expect(await pode("anon", funcao), funcao).toBe(false);
      expect(await pode("authenticated", funcao), funcao).toBe(true);
    }
    // As duas rodam com os direitos de quem chama (não são "security definer") e não escrevem nada.
    const funcoes = (await db.query<{ nome: string; definer: boolean; volatil: string }>(
      "select proname as nome, prosecdef as definer, provolatile as volatil from pg_proc where pronamespace = 'public'::regnamespace and proname in ('molde_da_sessao', 'pdv_tela') order by 1")).rows;
    expect(funcoes).toEqual([{ nome: "molde_da_sessao", definer: false, volatil: "s" }, { nome: "pdv_tela", definer: false, volatil: "s" }]);
  });
});

type ItemDaTela = {
  id: string; variante_id: string; item_serializado_id: string | null; tipo: string; quantidade: number;
  preco_unitario_centavos: number; desconto_centavos: number; preco_id: string | null; os_id: string | null;
  variante: { sku: string; nome: string } | null;
  serial: { imei: string | null; iccid: string | null } | null;
  preco: { id: string; origem: string; unidade_id: string | null; motivo: string | null; fim: string | null } | null;
  os: { id: string; numero: number; situacao: string } | null;
  aprovacao: string | null;
};
type Tela = {
  caixa: { id: string; aberto_em: string } | null;
  venda: { id: string; numero: number; situacao: string } | null;
  itens: ItemDaTela[];
  terminais: { id: string; provedor: string; apelido: string; identificador: string }[];
};
const TELA = "select public.pdv_tela() as v";
const tela = (s: Sessao, opcoes: Opcoes = {}) => valor<Tela>(s, TELA, [], opcoes);
const VAZIA: Tela = { caixa: null, venda: null, itens: [], terminais: [] };
const doItem = (t: Tela, id: string) => t.itens.find((i) => i.id === id) as ItemDaTela;

describe("pdv_tela: o caixa, a venda em andamento, o carrinho e as maquininhas numa leitura (VEL-a)", () => {
  it("sem loja escolhida, devolve tudo vazio", async () => {
    expect(await tela(nova(ids.dono))).toEqual(VAZIA);
    expect(await tela(nova(ids.semVinculo))).toEqual(VAZIA);
    expect(await tela(nova(ids.vendedorAB))).toEqual(VAZIA); // tem duas lojas e ainda não escolheu
  });

  it("traz o caixa aberto e a venda de quem chama na loja do turno, com o carrinho igual ao que a tela lia em separado", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    expect(await tela(ana)).toEqual(VAZIA);
    const caixa = await abrirCaixa(ana);
    const soCaixa = await tela(ana);
    expect(soCaixa).toMatchObject({ caixa: { id: caixa }, venda: null, itens: [], terminais: [] });
    expect(Object.keys(soCaixa).sort()).toEqual(["caixa", "itens", "terminais", "venda"]);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa, null, 2);
    const aparelho = await adicionar(ana, venda, cat.aparelho, itens.a1);
    const t = await tela(ana);
    const numero = (await db.query<{ n: number }>("select numero::int as n from public.vendas where id = $1", [venda])).rows[0]?.n;
    // PAY-014b: a venda que não atende pedido pago pelo site traz o pago nulo.
    expect(t.venda).toEqual({ id: venda, numero, situacao: "rascunho", pago_pelo_site_centavos: null });
    expect(new Date(t.caixa?.aberto_em as string).getTime())
      .toBe((await db.query<{ em: Date }>("select aberto_em as em from public.caixas where id = $1", [caixa])).rows[0]?.em.getTime());
    expect(t.itens.map((i) => i.id).sort()).toEqual([capa, aparelho].sort());
    const linhaDoPreco = async (variante: string) =>
      (await db.query<{ id: string }>("select id from public.precos where variante_id = $1 and unidade_id is null and origem = 'importacao'", [variante])).rows[0]?.id as string;
    expect(doItem(t, capa)).toEqual({
      id: capa, variante_id: cat.capa, item_serializado_id: null, tipo: "acessorio", quantidade: 2, preco_unitario_centavos: 7_900, desconto_centavos: 0,
      preco_id: await linhaDoPreco(cat.capa), os_id: null, variante: { sku: "ACE-0001", nome: "Capa de proteção" }, serial: null,
      preco: { id: await linhaDoPreco(cat.capa), origem: "importacao", unidade_id: null, motivo: null, fim: null }, os: null, aprovacao: null,
      loja_reserva_id: null,
    });
    expect(doItem(t, aparelho)).toMatchObject({
      variante_id: cat.aparelho, item_serializado_id: itens.a1, tipo: "aparelho", quantidade: 1, preco_unitario_centavos: 149_900,
      variante: { sku: "APA-0001", nome: "Galaxy A15 128 GB Azul" }, serial: { imei: cat.imei1, iccid: null }, preco: { origem: "importacao", unidade_id: null },
    });
    // O que a tela lia em separado, com os direitos da própria vendedora.
    const emSeparado = await linhas<Record<string, unknown>>(ana,
      `select id, variante_id, item_serializado_id, tipo, quantidade, preco_unitario_centavos::int as preco_unitario_centavos,
              desconto_centavos::int as desconto_centavos, preco_id, os_id
       from public.venda_itens where venda_id = $1`, [venda]);
    for (const linha of emSeparado) expect(doItem(t, String(linha.id))).toMatchObject(linha);
    expect(emSeparado).toHaveLength(2);

    // A colega da mesma loja e o dono não recebem o caixa nem a venda da Ana.
    expect(await tela(await naLoja(ids.vendedorAB, ids.lojaA))).toEqual(VAZIA);
    expect(await tela(await naLoja(ids.dono, ids.lojaA))).toEqual(VAZIA);
    // Com a venda concluída, a tela volta a mostrar só o caixa.
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v",
      [venda, JSON.stringify([{ meio: "dinheiro", valor: 2 * 7_900 + 149_900 }]), chave("concluir")]);
    expect(await tela(ana)).toMatchObject({ caixa: { id: caixa }, venda: null, itens: [] });
  });

  it("a venda aberta numa loja não aparece no turno da pessoa em outra loja", async () => {
    const naB = await naLoja(ids.vendedorAB, ids.lojaB);
    const caixa = await abrirCaixa(naB);
    const venda = await novaVenda(naB);
    await adicionar(naB, venda, cat.capa);
    expect(await tela(naB)).toMatchObject({ caixa: { id: caixa }, venda: { id: venda } });
    expect(await tela(await naLoja(ids.vendedorAB, ids.lojaA))).toEqual(VAZIA);
    // A mesma sessão, depois de trocar de loja.
    await valor(naB, "select public.selecionar_unidade($1) as v", [ids.lojaA]);
    expect(await tela(naB)).toEqual(VAZIA);
  });

  it("quem foi bloqueado, passou do turno ou saiu não lê mais o caixa nem o carrinho", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    await adicionar(ana, venda, cat.capa);
    expect((await tela(ana)).itens).toHaveLength(1);
    await db.exec("savepoint barrada");
    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.vendedorA]);
    expect(await tela(ana)).toEqual(VAZIA);
    await db.exec("rollback to savepoint barrada");
    await db.query("update auth.sessions set created_at = now() - interval '13 hours' where id = $1", [ana.sessao]);
    expect(await tela(ana)).toEqual(VAZIA);
    await db.exec("rollback to savepoint barrada");
    await db.query("delete from auth.sessions where id = $1", [ana.sessao]);
    expect(await tela(ana, { criarSessao: false })).toEqual(VAZIA);
    await db.exec("rollback to savepoint barrada");
    expect((await tela(ana)).itens).toHaveLength(1);
  });

  it("o carrinho diz a campanha que deu o preço e a situação do último pedido de desconto", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    const fim = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const campanha = await valor<{ id: string }>(dono, "select public.preco_campanha($1, $2, $3, $4, $5, $6, $7) as v",
      [cat.capa, ids.lojaA, "loja", 6_900, null, fim, "Semana da capa"]);
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const capa = await adicionar(ana, venda, cat.capa);
    const comCampanha = doItem(await tela(ana), capa);
    expect(comCampanha).toMatchObject({
      preco_unitario_centavos: 6_900, preco_id: campanha.id, aprovacao: null,
      preco: { id: campanha.id, origem: "campanha", unidade_id: ids.lojaA, motivo: "Semana da capa" },
    });
    expect(new Date(comCampanha.preco?.fim as string).getTime()).toBe(new Date(fim).getTime());

    expect(await valor<string>(ana, "select public.aplicar_desconto($1, 500) as v", [capa])).toBe("precisa_aprovacao");
    expect(doItem(await tela(ana), capa)).toMatchObject({ desconto_centavos: 500, aprovacao: null });
    const pedido = await valor<string>(ana, "select public.pedir_aprovacao($1, 'Cliente antigo da loja') as v", [capa]);
    const pendente = await tela(ana);
    expect(pendente.venda).toMatchObject({ id: venda, situacao: "aguardando_aprovacao" });
    expect(doItem(pendente, capa)).toMatchObject({ desconto_centavos: 500, aprovacao: "pendente" });
    expect(await valor<boolean>(dono, "select public.decidir_aprovacao($1, true, 'Ok') as v", [pedido])).toBe(true);
    const aprovada = await tela(ana);
    expect(aprovada.venda).toMatchObject({ id: venda, situacao: "rascunho" });
    expect(doItem(aprovada, capa)).toMatchObject({ desconto_centavos: 500, aprovacao: "aprovada" });
    // Mudar o desconto depois invalida a aprovação; um pedido novo, mais recente, é o que vale na tela.
    await valor(ana, "select public.aplicar_desconto($1, 900) as v", [capa]);
    expect(doItem(await tela(ana), capa)).toMatchObject({ desconto_centavos: 900, aprovacao: "invalidada" });
    await db.query("update public.aprovacoes_desconto set solicitado_em = solicitado_em - interval '1 hour' where id = $1", [pedido]);
    await valor(ana, "select public.pedir_aprovacao($1, 'Cliente antigo, outro valor') as v", [capa]);
    expect(doItem(await tela(ana), capa)).toMatchObject({ aprovacao: "pendente" });
  });

  it("o conserto de uma ordem de serviço entra no carrinho com a OS dele", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const os = await osProntaNaLoja(ana);
    await abrirCaixa(ana);
    const venda = await novaVenda(ana);
    const conserto = await valor<string>(ana, "select public.os_cobrar($1, $2, $3) as v", [venda, os.id, chave("item")]);
    const item = doItem(await tela(ana), conserto);
    const situacao = (await db.query<{ situacao: string }>("select situacao from public.ordens_servico where id = $1", [os.id])).rows[0]?.situacao;
    expect(item).toMatchObject({
      tipo: "servico", quantidade: 1, preco_unitario_centavos: 33_000, desconto_centavos: 0, preco_id: null, preco: null, item_serializado_id: null, serial: null,
      os_id: os.id, os: { id: os.id, numero: os.numero, situacao }, aprovacao: null,
    });
    expect(item.variante).not.toBeNull();
  });

  it("as maquininhas ativas da loja do turno, por apelido; as desativadas e as de outra loja ficam fora", async () => {
    const SALVAR = "select public.terminal_salvar($1, $2, $3, $4, $5, $6, $7) as v";
    const dono = await naLoja(ids.dono, ids.lojaA);
    const caixa = await valor<string>(dono, SALVAR, [null, ids.lojaA, "pagbank", "PB-101", "Caixa", null, "Cadastro"]);
    const balcao = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-101", "Balcão", null, "Cadastro"]);
    const antiga = await valor<string>(dono, SALVAR, [null, ids.lojaA, "picpay", "PP-102", "Antiga", null, "Cadastro"]);
    await valor(dono, SALVAR, [antiga, null, null, null, "Antiga", false, "Quebrou"]);
    const daB = await valor<string>(dono, SALVAR, [null, ids.lojaB, "picpay", "PP-201", "Balcão B", null, "Cadastro"]);
    expect((await tela(await naLoja(ids.vendedorA, ids.lojaA))).terminais).toEqual([
      { id: balcao, provedor: "picpay", apelido: "Balcão", identificador: "PP-101" },
      { id: caixa, provedor: "pagbank", apelido: "Caixa", identificador: "PB-101" },
    ]);
    expect((await tela(await naLoja(ids.vendedorAB, ids.lojaB))).terminais).toEqual([{ id: daB, provedor: "picpay", apelido: "Balcão B", identificador: "PP-201" }]);
    expect((await tela(nova(ids.vendedorA))).terminais).toEqual([]);
  });
});

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Uma ordem de serviço consertada e de volta na loja A, pronta para cobrar no PDV (orçamento aprovado de R$ 330,00). */
async function osProntaNaLoja(ana: Sessao) {
  const cliente = (await valor<{ id: string }>(ana, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente da Assistência", documento: cpf("100000007"), telefone: "41987650001" }), chave("cliente")])).id;
  const os = await valor<{ id: string; numero: number }>(ana, "select public.os_abrir($1::jsonb, $2) as v", [JSON.stringify({
    cliente, aparelho: "Galaxy A15", imei: comDigitoLuhn("35209900800001"), defeito: "Tela não liga", estado: "Tampa traseira riscada",
    acessorios: ["carregador"], prazo: somarDias(hoje(), 7),
  }), chave("os")]);
  const PASSO = "select public.os_custodia($1, $2, $3, $4) as v";
  await valor(ana, PASSO, [os.id, "enviar_ao_tecnico", null, null]);
  const tecnico = await naLoja(ids.tecnico, ids.assistencia);
  await valor(tecnico, PASSO, [os.id, "tecnico_recebeu", null, null]);
  const orcamento = await valor<{ id: string }>(tecnico, "select public.os_orcar($1, $2::jsonb, $3) as v", [os.id, JSON.stringify({
    diagnostico: "Tela quebrada e conector oxidado", mao_de_obra: 8_000, pecas: [{ descricao: "Tela", quantidade: 1, valor: 25_000 }], prazo_dias: 3,
  }), chave("orcamento")]);
  await valor(ana, "select public.os_responder_orcamento($1, $2, $3, $4) as v", [orcamento.id, "aprovado", "loja", null]);
  await valor(tecnico, "select public.os_concluir_servico($1, $2) as v", [os.id, "Tela trocada"]);
  await valor(tecnico, PASSO, [os.id, "tecnico_devolveu", null, null]);
  await valor(ana, PASSO, [os.id, "loja_recebeu", null, null]);
  return os;
}

// Lojas (lote L2: ORA-ORG-001, ORA-ORG-008): cadastro, edição, situação e configuração com vigência.
// Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cnpj, comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario, RAIZ } from "./cenario";
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
const sessao = (usuario: string): Sessao => ({ usuario, sessao: `66000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` });
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = sessao(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}

// Cada chamada num ponto de salvamento dentro da sessão: o erro volta com a mensagem e o código reais.
type Falha = { codigo: string; mensagem: string };
async function tentar<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<{ v: T } | Falha> {
  return comoUsuario(db, s, async () => {
    await db.exec("savepoint passo");
    try {
      const v = (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T;
      await db.exec("release savepoint passo");
      return { v };
    } catch (e) {
      await db.exec("rollback to savepoint passo");
      await db.exec("release savepoint passo");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", mensagem: (e as Error).message };
    }
  });
}
async function valor<T>(s: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao | null, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};
// Como o banco (dono das tabelas), para provar regras que valem por qualquer caminho.
async function comoBanco(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec("savepoint direto");
  try {
    await db.query(sql, params);
    await db.exec("release savepoint direto");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint direto");
    await db.exec("release savepoint direto");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}

const CRIAR = "select public.loja_criar($1, $2, $3, $4, $5, $6, $7, $8, $9) as v";
const ATUALIZAR = "select public.loja_atualizar($1, $2, $3, $4, $5, $6) as v";
const SITUACAO = "select public.loja_definir_situacao($1, $2, $3) as v";
const CONFIGURAR = "select public.loja_definir_configuracao($1, $2::jsonb, $3, $4) as v";
type Criada = { id: string; repetida: boolean };
type LojaDaRede = {
  id: string; codigo: string; nome: string; tipo: string; cnpj: string | null; uf: string | null; cidade: string | null;
  status: string; telefone: string | null; cep: string | null; inscricao_estadual: string | null;
  horarios: { dia: number; abre: string; fecha: string }[] | null; versoes: number; proxima_versao: string | null;
};
const lojasDaRede = (s: Sessao) =>
  comoUsuario(db, s, async () => (await db.query<LojaDaRede>("select * from public.lojas_da_rede()")).rows);
const daRede = async (s: Sessao, unidade: string) => (await lojasDaRede(s)).find((l) => l.id === unidade);
const formatado = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
// Só o que as pessoas fizeram (a montagem do cenário, feita pelo banco, também deixa eventos).
const auditoria = async (alvoTipo: string, alvo: string) =>
  (await db.query<{ acao: string; motivo: string | null; usuario_id: string | null; antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }>(
    "select acao, motivo, usuario_id, antes, depois from public.auditoria where alvo_tipo = $1 and alvo_id = $2 and usuario_id is not null order by id",
    [alvoTipo, alvo],
  )).rows;
const emDias = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();

describe("cadastro de lojas (L2)", () => {
  it("o dono cria a loja com motivo, os dados saem normalizados e repetir devolve a mesma loja", async () => {
    const dono = sessao(ids.dono);
    const doc = cnpj(RAIZ, "0004");
    const params = [ids.empresa, " Loja-D ", "Loja D", "loja_fisica", formatado(doc), "pr", "Curitiba", null, "Abertura da loja D"];
    const criada = await valor<Criada>(dono, CRIAR, params);
    expect(criada.repetida).toBe(false);
    const { rows } = await db.query("select codigo, nome, uf, cnpj, cidade, status from public.unidades where id = $1", [criada.id]);
    expect(rows[0]).toEqual({ codigo: "loja-d", nome: "Loja D", uf: "PR", cnpj: doc, cidade: "Curitiba", status: "ativa" });

    expect(await valor<Criada>(dono, CRIAR, params)).toEqual({ id: criada.id, repetida: true });
    expect(await codigo(dono, CRIAR, [ids.empresa, "loja-d", "Outra loja", "loja_fisica", doc, "PR", null, null, "Abertura"])).toBe("23505");

    const eventos = await auditoria("unidades", criada.id);
    expect(eventos.map((e) => [e.acao, e.motivo, e.usuario_id])).toEqual([["unidades.criado", "Abertura da loja D", ids.dono]]);
  });

  it("regras do cadastro: código, nome, tipo, UF, CNPJ da filial e da raiz, CNPJ repetido, online sem emissora e motivo", async () => {
    const dono = sessao(ids.dono);
    const criar = (codigoLoja: string, nome: string, tipo: string, doc: string | null, uf: string | null, emissora: string | null, motivo = "Nova loja") =>
      codigo(dono, CRIAR, [ids.empresa, codigoLoja, nome, tipo, doc, uf, null, emissora, motivo]);
    const novo = cnpj(RAIZ, "0005");
    expect(await criar("a", "Loja", "loja_fisica", novo, "PR", null)).toBe("22023");
    expect(await criar("loja e", "Loja", "loja_fisica", novo, "PR", null)).toBe("22023");
    expect(await criar("loja-e", "  ", "loja_fisica", novo, "PR", null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "quiosque", novo, "PR", null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "loja_fisica", novo, "Paraná", null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "loja_fisica", null, "PR", null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "loja_fisica", `${novo.slice(0, 13)}${(Number(novo[13]) + 1) % 10}`, "PR", null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "loja_fisica", cnpj("99888777", "0009"), "PR", null)).toBe("23514");
    expect(await criar("loja-e", "Loja E", "loja_fisica", cnpj(RAIZ, "0001"), "PR", null)).toBe("23505");
    expect(await criar("loja-e", "Loja E", "online", null, null, null)).toBe("22023");
    expect(await criar("loja-e", "Loja E", "loja_fisica", novo, "PR", null, "ok")).toBe("22023");
    // Online sem CNPJ próprio, com a loja A emitindo por ela; depósito não precisa de CNPJ.
    expect(await criar("site-2", "Site 2", "online", null, null, ids.lojaA)).toBeNull();
    expect(await criar("deposito", "Depósito central", "deposito", null, "PR", null)).toBeNull();
  });

  it("só quem gere a rede (dono e administrador) cadastra, edita, configura e vê a lista completa", async () => {
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const gerente = await naLoja(ids.gerenteB, ids.lojaB);
    const outraRede = sessao(ids.donoOutraOrg);
    const admin = sessao(ids.administrador);
    const novo = (filial: string) => [ids.empresa, `loja-${filial}`, `Loja ${filial}`, "loja_fisica", cnpj(RAIZ, filial), "PR", null, null, "Nova loja"];

    for (const s of [vendedor, gerente, outraRede]) {
      expect(await codigo(s, CRIAR, novo("0006"))).toBe("42501");
      expect(await codigo(s, ATUALIZAR, [ids.lojaB, "Loja B nova", cnpj(RAIZ, "0002"), "PR", null, "Troca de nome"])).toBe("P0002");
      expect(await codigo(s, SITUACAO, [ids.lojaC, "inativa", "Fechamento"])).toBe("P0002");
      expect(await codigo(s, CONFIGURAR, [ids.lojaB, "{}", null, "Telefone novo"])).toBe("P0002");
      expect(await comoUsuario(db, s, async () => (await db.query("select * from public.loja_historico($1)", [ids.lojaB])).rows)).toEqual([]);
    }
    expect(await lojasDaRede(vendedor)).toEqual([]);
    expect(await lojasDaRede(gerente)).toEqual([]);
    expect((await lojasDaRede(outraRede)).map((l) => l.codigo)).toEqual(["loja-x"]);

    expect((await valor<Criada>(admin, CRIAR, novo("0007"))).repetida).toBe(false);
    const daRedeToda = (await lojasDaRede(admin)).map((l) => l.codigo);
    expect(daRedeToda).toEqual(expect.arrayContaining(["loja-a", "loja-b", "loja-c", "online", "assistencia", "loja-0007"]));
    expect(daRedeToda).not.toContain("loja-x");
    // Ninguém de fora do login chama as funções (o inventário de autorização confere todas).
    expect(await codigo(null, "select * from public.lojas_da_rede()")).toBe("42501");
  });

  it("a edição muda nome, CNPJ, UF e cidade com motivo e auditoria; repetir não grava de novo", async () => {
    const dono = sessao(ids.dono);
    const params = [ids.lojaC, "Loja C Centro", formatado(cnpj(RAIZ, "0003")), "pr", "Curitiba", "Nome comercial novo"];
    expect(await valor<boolean>(dono, ATUALIZAR, params)).toBe(true);
    expect(await valor<boolean>(dono, ATUALIZAR, params)).toBe(false);
    const eventos = await auditoria("unidades", ids.lojaC);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ acao: "unidades.alterado", motivo: "Nome comercial novo", usuario_id: ids.dono });
    expect([eventos[0]?.antes?.nome, eventos[0]?.depois?.nome, eventos[0]?.depois?.uf]).toEqual(["Loja C", "Loja C Centro", "PR"]);

    expect(await codigo(dono, ATUALIZAR, [ids.lojaC, "Loja C", null, "PR", null, "Sem CNPJ"])).toBe("22023");
    expect(await codigo(dono, ATUALIZAR, [ids.lojaC, "Loja C", cnpj(RAIZ, "0001"), "PR", null, "CNPJ da loja A"])).toBe("23505");
    expect(await codigo(dono, ATUALIZAR, [ids.online, "Loja Online", null, null, null, "Sem CNPJ"])).toBeNull();
    // Código e tipo não mudam (não há parâmetro para isso) e a escrita direta continua fechada.
    expect(await codigo(dono, "update public.unidades set codigo = 'outro' where id = $1", [ids.lojaC])).toBe("42501");
  });

  it("configuração com vigência: vale desde agora, a futura espera a data, o passado é recusado e nada é reescrito", async () => {
    const dono = sessao(ids.dono);
    const dados = {
      telefone: "(41) 3333-4444", cep: "80010-000", logradouro: "Rua Fictícia", numero: "100", bairro: "Centro",
      inscricao_estadual: "123.456.789-0",
      horarios: [{ dia: 6, abre: "09:00", fecha: "13:00" }, { dia: 1, abre: "09:00", fecha: "18:00", extra: "ignorado" }],
    };
    const primeira = await valor<Criada>(dono, CONFIGURAR, [ids.lojaC, JSON.stringify(dados), null, "Dados da loja"]);
    expect(primeira.repetida).toBe(false);
    let loja = await daRede(dono, ids.lojaC);
    expect(loja).toMatchObject({ telefone: "4133334444", cep: "80010000", inscricao_estadual: "1234567890", versoes: 1, proxima_versao: null });
    expect(loja?.horarios).toEqual([{ dia: 1, abre: "09:00", fecha: "18:00" }, { dia: 6, abre: "09:00", fecha: "13:00" }]);

    // Salvar de novo sem mudar nada (duplo clique) não cria versão.
    expect(await valor<Criada>(dono, CONFIGURAR, [ids.lojaC, JSON.stringify(dados), null, "Dados da loja"])).toEqual({ id: primeira.id, repetida: true });

    const daquiAUmaSemana = emDias(7);
    const futura = await valor<Criada>(dono, CONFIGURAR, [ids.lojaC, JSON.stringify({ ...dados, telefone: "41999998888" }), daquiAUmaSemana, "Troca de linha"]);
    loja = await daRede(dono, ids.lojaC);
    expect(loja?.telefone).toBe("4133334444");
    expect(loja?.versoes).toBe(2);
    expect(new Date(loja?.proxima_versao ?? 0).toISOString()).toBe(daquiAUmaSemana);

    expect(await valor<Criada>(dono, CONFIGURAR, [ids.lojaC, JSON.stringify({ ...dados, telefone: "41999998888" }), daquiAUmaSemana, "Troca de linha"]))
      .toEqual({ id: futura.id, repetida: true });
    expect(await codigo(dono, CONFIGURAR, [ids.lojaC, JSON.stringify({ telefone: "41988887777" }), daquiAUmaSemana, "Outra troca"])).toBe("23505");
    expect(await codigo(dono, CONFIGURAR, [ids.lojaC, JSON.stringify(dados), emDias(-1), "Retroativo"])).toBe("22023");

    const historico = await comoUsuario(db, dono, async () =>
      (await db.query<{ id: string; telefone: string; criado_por_nome: string; motivo: string }>("select * from public.loja_historico($1)", [ids.lojaC])).rows);
    expect(historico.map((h) => [h.telefone, h.motivo, h.criado_por_nome])).toEqual([
      ["41999998888", "Troca de linha", "dono"],
      ["4133334444", "Dados da loja", "dono"],
    ]);
    expect((await auditoria("unidade_configuracoes", String(primeira.id)))[0]).toMatchObject({ acao: "unidade_configuracoes.criado", motivo: "Dados da loja" });
    // As versões só aceitam inclusão, nem o dono do banco reescreve.
    expect(await comoBanco("update public.unidade_configuracoes set telefone = '4130000000' where unidade_id = $1", [ids.lojaC])).toBe("42501");
    expect(await comoBanco("delete from public.unidade_configuracoes where unidade_id = $1", [ids.lojaC])).toBe("42501");
  });

  it("dados da configuração: horários um por dia em HH:MM abrindo antes de fechar, telefone, CEP, inscrições e campos conhecidos", async () => {
    const dono = sessao(ids.dono);
    const configurar = (dados: object) => codigo(dono, CONFIGURAR, [ids.lojaC, JSON.stringify(dados), null, "Ajuste"]);
    expect(await configurar({ horarios: [{ dia: 1, abre: "18:00", fecha: "09:00" }] })).toBe("22023");
    expect(await configurar({ horarios: [{ dia: 1, abre: "09:00", fecha: "18:00" }, { dia: 1, abre: "10:00", fecha: "12:00" }] })).toBe("22023");
    expect(await configurar({ horarios: [{ dia: 7, abre: "09:00", fecha: "18:00" }] })).toBe("22023");
    expect(await configurar({ horarios: [{ dia: 1, abre: "9:00", fecha: "18:00" }] })).toBe("22023");
    expect(await configurar({ horarios: { dia: 1 } })).toBe("22023");
    expect(await configurar({ telefone: "1234" })).toBe("22023");
    expect(await configurar({ cep: "800" })).toBe("22023");
    expect(await configurar({ inscricao_estadual: "12-AB" })).toBe("22023");
    expect(await configurar({ gerente: "Fulano" })).toBe("22023");
    expect(await configurar({ logradouro: "R" })).toBe("22023");
    expect(await configurar({ inscricao_estadual: "isento", horarios: [] })).toBeNull();
  });

  it("a configuração segue a leitura da loja: o vendedor vê a da sua loja, não a das outras, e não grava direto", async () => {
    const dono = sessao(ids.dono);
    await valor(dono, CONFIGURAR, [ids.lojaA, JSON.stringify({ telefone: "4133330001" }), null, "Dados da loja A"]);
    await valor(dono, CONFIGURAR, [ids.lojaB, JSON.stringify({ telefone: "4133330002" }), null, "Dados da loja B"]);
    const vendedor = await naLoja(ids.vendedorA, ids.lojaA);
    const vistas = await comoUsuario(db, vendedor, async () =>
      (await db.query<{ unidade_id: string }>("select unidade_id from public.unidade_configuracoes")).rows.map((r) => r.unidade_id));
    expect(vistas).toEqual([ids.lojaA]);
    expect(await codigo(vendedor, "insert into public.unidade_configuracoes (organizacao_id, unidade_id, vigente_desde, motivo, criado_por) values ($1, $2, now(), 'teste', $3)",
      [ids.organizacao, ids.lojaA, ids.vendedorA])).toBe("42501");
    expect(await codigo(null, "select count(*) from public.unidade_configuracoes")).toBe("42501");
  });
});

describe("situação da loja (L2)", () => {
  it("inativar loja sem pendências: sai da escolha e da leitura comum, fica na gestão e volta ao reativar", async () => {
    const dono = sessao(ids.dono);
    expect(await valor<boolean>(dono, SITUACAO, [ids.lojaC, "inativa", "Loja fechada para reforma"])).toBe(true);
    expect(await valor<boolean>(dono, SITUACAO, [ids.lojaC, "inativa", "Loja fechada para reforma"])).toBe(false);
    expect((await daRede(dono, ids.lojaC))?.status).toBe("inativa");
    expect(await valor<boolean>(dono, "select public.selecionar_unidade($1) as v", [ids.lojaC])).toBe(false);
    const visiveis = await comoUsuario(db, dono, async () => (await db.query<{ id: string }>("select id from public.unidades")).rows.map((r) => r.id));
    expect(visiveis).not.toContain(ids.lojaC);
    const eventos = await auditoria("unidades", ids.lojaC);
    expect(eventos.map((e) => [e.acao, e.motivo, e.antes?.status, e.depois?.status])).toEqual([
      ["unidades.alterado", "Loja fechada para reforma", "ativa", "inativa"],
    ]);

    expect(await valor<boolean>(dono, SITUACAO, [ids.lojaC, "ativa", "Reforma concluída"])).toBe(true);
    expect(await valor<boolean>(dono, "select public.selecionar_unidade($1) as v", [ids.lojaC])).toBe(true);
    expect(await codigo(dono, SITUACAO, [ids.lojaC, "fechada", "Situação inexistente"])).toBe("22023");
  });

  it("inativar com pendência é recusado (OR019) e a mensagem diz o que falta resolver", async () => {
    const dono = await naLoja(ids.dono, ids.lojaC);
    const comEstoque = await tentar(dono, SITUACAO, [ids.lojaA, "inativa", "Fechamento"]);
    expect(comEstoque).toMatchObject({ codigo: "OR019" });
    expect((comEstoque as Falha).mensagem).toMatch(/saldo em estoque.*aparelho ou chip na loja/);

    await valor(dono, "select public.abrir_caixa($1, $2) as v", [10_000, "lojas:caixa:1"]);
    expect((await tentar(dono, SITUACAO, [ids.lojaC, "inativa", "Fechamento"]) as Falha).mensagem).toMatch(/caixa aberto/);
    await valor(dono, "select public.fechar_caixa($1, $2) as v", [10_000, "Fim do dia"]);
    expect((await tentar(dono, SITUACAO, [ids.lojaC, "inativa", "Fechamento"]) as Falha).mensagem).toMatch(/caixa fechado sem conferência/);
  });

  it("transferência pendente para a loja também impede a inativação", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v",
      [ids.lojaA, ids.lojaC, cat.capa, 1, "Reposição da vitrine", "lojas:transf:1"]);
    expect((await tentar(dono, SITUACAO, [ids.lojaC, "inativa", "Fechamento"]) as Falha).mensagem).toMatch(/transferência pendente/);
  });

  it("loja inativa não recebe movimento novo por nenhum caminho, nem pelo dono do banco (OR019)", async () => {
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(dono, SITUACAO, [ids.lojaC, "inativa", "Loja fechada"]);
    // A função de transferência já recusa loja inativa pela regra dela (22023); o gatilho fecha o resto.
    expect(await codigo(dono, "select public.transferencia_solicitar($1, $2, $3, $4, $5, $6) as v",
      [ids.lojaA, ids.lojaC, cat.capa, 1, "Reposição", "lojas:transf:2"])).toBe("22023");
    expect(await comoBanco("insert into public.transferencias (organizacao_id, origem_id, destino_id, variante_id, quantidade, motivo, chave, conteudo, solicitado_por) values ($1, $2, $3, $4, 1, 'Reposição', 'lojas:transf:3', 'Capa', $5)",
      [ids.organizacao, ids.lojaA, ids.lojaC, cat.capa, ids.dono])).toBe("OR019");
    expect(await comoBanco("select privado.lancar_movimento($1, $2, 5, 'entrada_importacao', null, null, null, null, 'lojas:mov:1')", [ids.lojaC, cat.capa])).toBe("OR019");
    expect(await comoBanco("select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_compra', 'lojas:item:1')",
      [ids.lojaC, cat.aparelho, comDigitoLuhn("35209900179001")])).toBe("OR019");
    expect(await comoBanco("insert into public.caixas (organizacao_id, unidade_id, operador_id, chave_abertura, fundo_centavos) values ($1, $2, $3, 'lojas:cx', 0)",
      [ids.organizacao, ids.lojaC, ids.dono])).toBe("OR019");
    expect(await comoBanco("insert into public.vendas (organizacao_id, unidade_id, vendedor_id, chave_criacao) values ($1, $2, $3, 'lojas:venda')",
      [ids.organizacao, ids.lojaC, ids.dono])).toBe("OR019");
    expect(await comoBanco("insert into public.estoque_reservas (organizacao_id, unidade_id, variante_id, quantidade, origem, chave_idempotencia, expira_em) values ($1, $2, $3, 1, 'pdv', 'lojas:res', now() + interval '1 hour')",
      [ids.organizacao, ids.lojaC, cat.capa])).toBe("OR019");
    // A loja ativa continua recebendo normalmente.
    expect(await comoBanco("select privado.lancar_movimento($1, $2, 1, 'entrada_importacao', null, null, null, null, 'lojas:mov:2')", [ids.lojaB, cat.capa])).toBeNull();
  });
});

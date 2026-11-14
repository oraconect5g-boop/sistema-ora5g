// ORA-005 — testes de permissão do ADR-002 §2.7 (T1–T12) contra o banco real
// (PostgreSQL em memória via PGlite, com a migration aplicada do zero).
import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { cnpj, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario, RAIZ } from "./cenario";

let db: PGlite;
let sessoes = 0;

const novaSessao = (usuario: string): Sessao => ({
  usuario,
  sessao: `10000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}`,
});

async function linhas<T = Record<string, unknown>>(sessao: Sessao | null, sql: string, params: unknown[] = []) {
  return comoUsuario(db, sessao, async () => (await db.query<T>(sql, params)).rows);
}

async function valor<T>(sessao: Sessao | null, sql: string, params: unknown[] = []): Promise<T> {
  const [linha] = await linhas<{ v: T }>(sessao, sql, params);
  return linha?.v as T;
}

async function falha(acao: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await acao;
  } catch (erro) {
    return erro as { code?: string; message: string };
  }
  throw new Error("era esperado um erro, mas a operação foi aceita");
}

const selecionar = (sessao: Sessao, unidade: string) =>
  valor<boolean>(sessao, "select public.selecionar_unidade($1) as v", [unidade]);

const unidadesVisiveis = async (sessao: Sessao) =>
  (await linhas<{ id: string }>(sessao, "select id from public.unidades order by codigo")).map((u) => u.id);

const pode = (sessao: Sessao, permissao: string, unidade: string | null = null) =>
  valor<boolean>(sessao, "select public.tem_permissao($1, $2) as v", [permissao, unidade]);

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
});

describe("T1 — vendedor de uma unidade não vê outra", () => {
  it("vendedor da loja A vê só a loja A", async () => {
    expect(await unidadesVisiveis(novaSessao(ids.vendedorA))).toEqual([ids.lojaA]);
  });

  it("não vê vínculos nem perfis de colegas da loja B", async () => {
    const s = novaSessao(ids.vendedorA);
    expect(await linhas(s, "select * from public.vinculos where unidade_id = $1", [ids.lojaB])).toEqual([]);
    expect(await linhas(s, "select * from public.perfis_usuario where id = $1", [ids.gerenteB])).toEqual([]);
  });

  it("não vê a auditoria de nenhuma unidade", async () => {
    const s = novaSessao(ids.vendedorA);
    await selecionar(s, ids.lojaA);
    expect(await linhas(s, "select * from public.auditoria")).toEqual([]);
  });

  it("vendedor em duas lojas vê só as duas; dono vê todas as da organização", async () => {
    expect(await unidadesVisiveis(novaSessao(ids.vendedorAB))).toEqual([ids.lojaA, ids.lojaB]);
    expect(await unidadesVisiveis(novaSessao(ids.dono))).toEqual(
      [ids.assistencia, ids.lojaA, ids.lojaB, ids.lojaC, ids.online],
    );
  });

  it("dono de outra organização não vê nada da Ora", async () => {
    expect(await unidadesVisiveis(novaSessao(ids.donoOutraOrg))).toEqual([ids.lojaOutraOrg]);
    expect(await linhas(novaSessao(ids.donoOutraOrg), "select * from public.empresas where id = $1", [ids.empresa])).toEqual([]);
  });
});

describe("T2/T3 — a unidade vem da sessão no servidor, não da requisição", () => {
  it("vendedor em A e B, com A escolhida, não opera em B", async () => {
    const s = novaSessao(ids.vendedorAB);
    await selecionar(s, ids.lojaA);

    expect(await valor(s, "select public.unidade_atual() as v")).toBe(ids.lojaA);
    expect(await pode(s, "venda.registrar", ids.lojaA)).toBe(true);
    expect(await pode(s, "venda.registrar", ids.lojaB)).toBe(false);
  });

  it("ao trocar para B, perde A no mesmo turno e a troca é auditada", async () => {
    const s = novaSessao(ids.vendedorAB);
    await selecionar(s, ids.lojaA);
    await selecionar(s, ids.lojaB);

    expect(await pode(s, "venda.registrar", ids.lojaA)).toBe(false);
    expect(await pode(s, "venda.registrar", ids.lojaB)).toBe(true);
    const [troca] = (await db.query<{ antes: unknown; depois: unknown }>(
      "select antes, depois from public.auditoria where usuario_id = $1 and acao = 'sessao.unidade_selecionada' order by id desc limit 1",
      [ids.vendedorAB],
    )).rows;
    expect(troca).toEqual({ antes: { unidade_id: ids.lojaA }, depois: { unidade_id: ids.lojaB } });
  });

  it("escolher unidade sem vínculo é recusado e auditado", async () => {
    const s = novaSessao(ids.vendedorA);
    expect(await selecionar(s, ids.lojaB)).toBe(false);
    expect(await valor(s, "select public.unidade_atual() as v")).toBeNull();
    const negadas = await db.query(
      "select 1 from public.auditoria where usuario_id = $1 and unidade_id = $2 and acao = 'sessao.unidade_negada'",
      [ids.vendedorA, ids.lojaB],
    );
    expect(negadas.rows).toHaveLength(1);
  });

  it("sem unidade escolhida, papel de unidade não tem permissão nenhuma", async () => {
    expect(await pode(novaSessao(ids.vendedorA), "venda.registrar")).toBe(false);
  });

  it("outro usuário não consegue sequestrar a sessão de um colega", async () => {
    const s = novaSessao(ids.vendedorA);
    await selecionar(s, ids.lojaA);
    expect(await selecionar({ usuario: ids.vendedorAB, sessao: s.sessao }, ids.lojaA)).toBe(false);
    const tentativas = await db.query(
      "select 1 from public.auditoria where usuario_id = $1 and acao = 'sessao.de_outro_usuario'",
      [ids.vendedorAB],
    );
    expect(tentativas.rows).toHaveLength(1);
    expect(await valor(s, "select public.unidade_atual() as v")).toBe(ids.lojaA);
  });

  it("o usuário não grava a própria sessão nem vínculos direto nas tabelas", async () => {
    const s = novaSessao(ids.vendedorA);
    const sessao = await falha(linhas(s, "insert into public.contexto_sessao (sessao_id, usuario_id, unidade_atual_id) values ($1, $2, $3)", [s.sessao, ids.vendedorA, ids.lojaB]));
    const vinculo = await falha(linhas(s, "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id) values ($1, $2, 'gerente', 'unidade', $3)", [ids.vendedorA, ids.organizacao, ids.lojaA]));
    const promocao = await falha(linhas(s, "update public.vinculos set papel = 'gerente' where usuario_id = $1", [ids.vendedorA]));

    expect([sessao.code, vinculo.code, promocao.code]).toEqual(["42501", "42501", "42501"]);
  });
});

describe("T6 — usuário bloqueado perde acesso mesmo com a sessão aberta", () => {
  it("depois do bloqueio, não vê nada nem tem permissão", async () => {
    const s = novaSessao(ids.bloqueado);
    expect(await selecionar(s, ids.lojaA)).toBe(true);
    expect(await pode(s, "venda.registrar", ids.lojaA)).toBe(true);

    await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.bloqueado]);

    expect(await pode(s, "venda.registrar", ids.lojaA)).toBe(false);
    expect(await valor(s, "select public.unidade_atual() as v")).toBeNull();
    expect(await unidadesVisiveis(s)).toEqual([]);
    expect(await linhas(s, "select * from public.perfis_usuario")).toEqual([]);
    expect(await linhas(s, "select * from public.papeis")).toEqual([]);
  });
});

describe("T7 — vínculo encerrado", () => {
  it("a unidade some da escolha e das consultas", async () => {
    const s = novaSessao(ids.encerrado);
    expect(await unidadesVisiveis(s)).toEqual([]);
    expect(await selecionar(s, ids.lojaA)).toBe(false);
  });

  it("encerrar o vínculo durante o turno corta o acesso na hora", async () => {
    const s = novaSessao(ids.gerenteB);
    await selecionar(s, ids.lojaB);
    expect(await pode(s, "caixa.conferir", ids.lojaB)).toBe(true);

    await db.query("update public.vinculos set fim = now() where usuario_id = $1", [ids.gerenteB]);

    expect(await pode(s, "caixa.conferir", ids.lojaB)).toBe(false);
    expect(await valor(s, "select public.unidade_atual() as v")).toBeNull();
  });
});

describe("T8 — administrador não vende nem aprova", () => {
  it.each(["venda.registrar", "desconto.dar", "desconto.aprovar", "nota.aprovar", "caixa.conferir", "preco.alterar"])(
    "administrador não tem %s",
    async (permissao) => {
      expect(await pode(novaSessao(ids.administrador), permissao, ids.lojaA)).toBe(false);
    },
  );

  it("mas gere usuários, unidades e integrações", async () => {
    const s = novaSessao(ids.administrador);
    for (const permissao of ["usuarios.gerir", "unidades.gerir", "integracoes.gerir", "importacao.executar"]) {
      expect(await pode(s, permissao)).toBe(true);
    }
  });

  it("dono aprova, mas não mexe em integrações nem executa importação", async () => {
    const s = novaSessao(ids.dono);
    expect(await pode(s, "desconto.aprovar", ids.lojaC)).toBe(true);
    expect(await pode(s, "integracoes.gerir")).toBe(false);
    expect(await pode(s, "importacao.executar")).toBe(false);
  });

  it("vendedor não aprova desconto nem vê custo; técnico só orça OS", async () => {
    const vendedor = novaSessao(ids.vendedorA);
    await selecionar(vendedor, ids.lojaA);
    expect(await pode(vendedor, "desconto.aprovar", ids.lojaA)).toBe(false);
    expect(await pode(vendedor, "custo.ver", ids.lojaA)).toBe(false);
    expect(await pode(vendedor, "ranking.ver", ids.lojaA)).toBe(false);

    const tecnico = novaSessao(ids.tecnico);
    await selecionar(tecnico, ids.assistencia);
    expect(await pode(tecnico, "os.orcar", ids.assistencia)).toBe(true);
    expect(await pode(tecnico, "venda.registrar", ids.assistencia)).toBe(false);
  });
});

describe("T9 — auditoria só de inserção", () => {
  it("usuário logado não altera nem apaga, inclusive o administrador", async () => {
    for (const usuario of [ids.administrador, ids.dono]) {
      const s = novaSessao(usuario);
      expect((await falha(linhas(s, "update public.auditoria set acao = 'x'"))).code).toBe("42501");
      expect((await falha(linhas(s, "delete from public.auditoria"))).code).toBe("42501");
    }
  });

  it("nem o dono do banco altera, apaga ou esvazia", async () => {
    expect((await falha(db.query("update public.auditoria set acao = 'x'"))).message).toMatch(/só aceita inserção/);
    expect((await falha(db.query("delete from public.auditoria"))).message).toMatch(/só aceita inserção/);
    expect((await falha(db.query("truncate public.auditoria"))).message).toMatch(/só aceita inserção/);
  });

  it("administrador e dono leem a auditoria; gerente só a da própria unidade", async () => {
    expect((await linhas(novaSessao(ids.administrador), "select 1 from public.auditoria")).length).toBeGreaterThan(0);

    const gerente = novaSessao(ids.gerenteB);
    await db.query("update public.vinculos set fim = null where usuario_id = $1", [ids.gerenteB]);
    await selecionar(gerente, ids.lojaB);
    const unidades = await linhas<{ unidade_id: string }>(gerente, "select distinct unidade_id from public.auditoria");
    expect(unidades.map((u) => u.unidade_id)).toEqual([ids.lojaB]);
  });
});

describe("T10 — cadastro de unidade validado pelo banco", () => {
  const inserir = (codigo: string, tipo: string, documento: string | null) =>
    db.query(
      "insert into public.unidades (organizacao_id, empresa_id, codigo, nome, tipo, cnpj) values ($1, $2, $3, 'Nova', $4, $5)",
      [ids.organizacao, ids.empresa, codigo, tipo, documento],
    );

  it("recusa CNPJ com dígito verificador errado", async () => {
    const valido = cnpj(RAIZ, "0009");
    const invalido = valido.slice(0, 13) + String((Number(valido[13]) + 1) % 10);
    expect((await falha(inserir("nova-1", "loja_fisica", invalido))).code).toBe("23514");
  });

  it("recusa CNPJ de outra raiz", async () => {
    expect((await falha(inserir("nova-2", "loja_fisica", cnpj("44555666", "0001")))).code).toBe("23514");
  });

  it("recusa loja física sem CNPJ e loja online sem emissor", async () => {
    expect((await falha(inserir("nova-3", "loja_fisica", null))).code).toBe("23514");
    expect((await falha(inserir("nova-4", "online", null))).code).toBe("23514");
  });

  it("aceita filial válida da mesma raiz", async () => {
    await inserir("nova-5", "loja_fisica", cnpj(RAIZ, "0010"));
  });
});

describe("Outras regras do ADR-002", () => {
  it("visitante sem login (anon) não lê nenhuma tabela", async () => {
    for (const tabela of ["organizacoes", "unidades", "perfis_usuario", "vinculos", "auditoria", "papeis"]) {
      expect((await falha(linhas(null, `select * from public.${tabela}`))).code).toBe("42501");
    }
  });

  it("papel só com o escopo certo e técnico só na assistência", async () => {
    const vinculo = (papel: string, escopo: string, unidade: string | null) =>
      db.query("insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id) values ($1, $2, $3, $4, $5)",
        [ids.semVinculo, ids.organizacao, papel, escopo, unidade]);

    expect((await falha(vinculo("vendedor", "organizacao", null))).code).toBe("23514");
    expect((await falha(vinculo("dono", "unidade", ids.lojaA))).code).toBe("23514");
    expect((await falha(vinculo("tecnico", "unidade", ids.lojaA))).code).toBe("23514");
    expect((await falha(vinculo("vendedor", "unidade", ids.lojaOutraOrg))).code).toBe("23514");
  });

  it("um único vínculo em aberto por usuário, papel e unidade", async () => {
    const erro = await falha(db.query(
      "insert into public.vinculos (usuario_id, organizacao_id, papel, escopo, unidade_id) values ($1, $2, 'vendedor', 'unidade', $3)",
      [ids.vendedorA, ids.organizacao, ids.lojaA],
    ));
    expect(erro.code).toBe("23505");
  });
});

// T4 (vendedor não aprova o próprio desconto) e T5 (dono não aprova a própria solicitação) viraram
// testes de verdade em vendas.test.ts, cenário B, junto com o módulo de vendas (ADR-004).
describe("T11 — vendedor só faz busca exata de cliente (lote L5a)", () => {
  it("a lista de clientes vem vazia para o vendedor; CPF completo acha; busca por nome é recusada", async () => {
    const s = novaSessao(ids.vendedorA);
    expect(await selecionar(s, ids.lojaA)).toBe(true);
    const documento = cpf("390533447");
    await valor(s, "select public.cliente_salvar(null, $1::jsonb, null, 'form:t11:0001') as v",
      [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente T11", documento, telefone: "41987650311" })]);
    expect(await linhas(s, "select * from public.clientes")).toEqual([]);
    expect((await valor<{ clientes: unknown[] }>(s, "select public.cliente_buscar('documento', $1) as v", [documento])).clientes).toHaveLength(1);
    expect((await falha(valor(s, "select public.cliente_buscar('nome', 'Cliente') as v"))).code).toBe("42501");
  });
});

describe("Testes que dependem de módulos futuros", () => {
  it.todo("T12 — técnico não vê OS de outro técnico (ordem de serviço, mês 3)");
});

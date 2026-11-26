// Lote AUD-f (auditoria de e7f55b2), Ora Connect no banco: o pagamento confirmado da ativação não é a linha ativa; o eSIM sem
// ICCID vai para a gerência; o material de instalação do eSIM e o Pix copia e cola ficam à parte (fora dos eventos). Banco em
// memória; respostas FICTÍCIAS no formato documentado (ICCID com o dígito verificador, uuid, código LPA e EMV inventados).
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let n = 0;
const chave = () => `aud-f:${++n}`;
const usuario = async (id: string = ids.vendedorA): Promise<Sessao> => {
  const s = { usuario: id, sessao: `4f000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
  return s;
};
const valor = <T>(s: Sessao, sql: string, p: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T);
// O savepoint deixa aparecer o erro de verdade (sem ele, o "reset role" depois da falha só diz "current transaction is aborted").
const servico = async <T>(acao: () => Promise<T>) => {
  await db.exec("savepoint servico; set role service_role");
  try {
    const r = await acao();
    await db.exec("reset role; release savepoint servico");
    return r;
  } catch (e) {
    await db.exec("rollback to savepoint servico; release savepoint servico; reset role");
    throw e;
  }
};
async function erroDe(acao: () => Promise<unknown>): Promise<string | null> {
  await db.exec("savepoint tentativa");
  try {
    await acao();
    await db.exec("release savepoint tentativa");
    return null;
  } catch (e) {
    await db.exec("rollback to savepoint tentativa; release savepoint tentativa");
    return (e as { code?: string }).code ?? "sem-codigo";
  }
}
const rpcServico = <T>(sql: string, p: unknown[] = []) => servico(async () => (await db.query<{ v: T }>(sql, p)).rows[0]?.v as T);
const cliente = {
  nome: "Cliente Ficticio", cpf: "12345678909", data_nascimento: "1990-05-20", email: "cliente@teste.invalid", telefone: "51999990000",
  endereco: { rua: "Rua Ficticia", numero: "1", bairro: "Centro", cep: "90000000", id_cidade: 7703 },
};
// Um ICCID por ativação: a trava do registro único recusa o mesmo chip em duas ativações abertas.
const novoIccid = () => comDigitoLuhn(`89551701100000${String(++n).padStart(4, "0")}`);
const UUID = "184d26de-ba03-4abd-870c-231231221231";
const EMV = "00020126580014BR.GOV.BCB.PIX0136a629532e-7693-4846-852d-1bbff817b5a85204000053039865802BR5913ORA TESTE6008CURITIBA62070503***6304ABCD";
const registrarAtivacao = (s: Sessao, esim: boolean) =>
  valor<string>(s, "select public.connect_registrar('ativacao', $1::jsonb, $2) as v",
    [JSON.stringify({ metodo: "LINK", esim, ...(esim ? {} : { iccid: novoIccid() }), ddd: 51, plano: 99999, cliente }), chave()]);
async function aceitar(id: string, extra: object = {}) {
  await rpcServico("select count(*) as v from public.connect_worker_reivindicar_envios($1, ARRAY['ativacao'], 5)", [ids.organizacao]);
  return rpcServico<string>("select public.connect_worker_registrar_envio($1, $2::jsonb) as v",
    [id, JSON.stringify({ resultado: "aceita", id_externo: "99999", data_cadastro: "2026-11-26 10:00:00", uuid: UUID, ...extra })]);
}
const consultar = (id: string, evidencia: object) => rpcServico<string>("select public.connect_worker_registrar_consulta($1, $2::jsonb) as v", [id, JSON.stringify(evidencia)]);
const operacao = async (id: string) => (await db.query<Record<string, unknown>>(
  "select situacao, pagamento_confirmado_em is not null as pago, numero_ativado, link_esim, esim_codigo, pix_copia_cola from public.connect_operacoes where id = $1", [id])).rows[0];
const eventos = async (id: string) => (await db.query<{ tipo: string; mensagem: string | null; dados: unknown }>(
  "select tipo, mensagem, dados from public.connect_eventos where operacao_id = $1 order by id", [id])).rows;
const producoes = async (id: string) => (await db.query<{ origem: string }>("select origem from public.connect_producao where operacao_id = $1", [id])).rows;
const PAGO = { evidencia: "pago", mensagem: "Ativação paga na Nogle; falta a prova da linha (o ICCID ativo).", dados: { uuid: UUID, data_pagamento: "2026-11-26" } };

beforeAll(async () => { db = await criarBanco(); await montarCenario(db); await montarCatalogo(db); });
beforeEach(async () => {
  await db.exec("begin");
  const listas = { plano: [{ codigo: "99999", nome: "Plano ficticio", valor_centavos: 4490 }], ddd: [{ codigo: "51", nome: "51", uf: "RS" }], cidade: [{ codigo: "7703", nome: "Cidade ficticia", uf: "RS" }] };
  for (const [tipo, itens] of Object.entries(listas)) await rpcServico("select public.connect_worker_atualizar_referencias($1, $2, $3::jsonb) as v", [ids.organizacao, tipo, JSON.stringify(itens)]);
  const admin = await usuario(ids.administrador);
  await valor(admin, "select public.connect_habilitar('ativacao', true, $1) as v", ["Homologacao ficticia local"]);
});
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("AUD-f — o pagamento confirmado da ativação não é a linha ativa", () => {
  it("o pago (pelo uuid da operação) guarda o pagamento e segue esperando; só a prova da linha (ICCID ativo e o número) confirma e conta", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, false);
    expect(await aceitar(op)).toBe("aguardando_operadora");
    expect(await consultar(op, PAGO)).toBe("aguardando_operadora");
    expect(await operacao(op)).toMatchObject({ situacao: "aguardando_operadora", pago: true, numero_ativado: null });
    expect(await producoes(op)).toEqual([]);
    expect((await eventos(op)).map((e) => e.tipo)).toContain("pagamento_confirmado");
    // A prova da linha: o ICCID ativo (11) com o número.
    expect(await consultar(op, { evidencia: "confirmada", mensagem: "ICCID ativo na Nogle (11).", numero: "51988887777", dados: { codigo: 11 } })).toBe("confirmada");
    expect(await operacao(op)).toMatchObject({ situacao: "confirmada", pago: true, numero_ativado: "51988887777" });
    expect(await producoes(op)).toEqual([{ origem: "evidencia_da_operadora" }]);
  });

  it("a ativação não confirma sem o número da linha: nem a \"confirmada\" antiga pelo uuid, nem o ICCID ativo sem a linha", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, false);
    await aceitar(op);
    expect(await consultar(op, { evidencia: "confirmada", mensagem: "Ativação paga e feita (consulta pelo uuid).", dados: { uuid: UUID, data_pagamento: "2026-11-26" } }))
      .toBe("aguardando_operadora");
    expect(await consultar(op, { evidencia: "confirmada", mensagem: "ICCID ativo", numero: "123" })).toBe("aguardando_operadora");
    expect(await producoes(op)).toEqual([]);
  });

  it("o pago de outro uuid, ou sem a data do pagamento, não guarda nada", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, false);
    await aceitar(op);
    expect(await consultar(op, { ...PAGO, dados: { uuid: "00000000-0000-4000-8000-000000000999", data_pagamento: "2026-11-26" } })).toBe("aguardando_operadora");
    expect(await consultar(op, { ...PAGO, dados: { uuid: UUID } })).toBe("aguardando_operadora");
    expect(await operacao(op)).toMatchObject({ pago: false });
  });

  it("o eSIM sem ICCID: pago sem prova da linha (ou sem a consulta do pagamento) vai para a gerência, que decide com a evidência", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, true);
    await aceitar(op);
    expect(await consultar(op, { ...PAGO, evidencia: "pago_sem_prova_da_linha" })).toBe("resultado_desconhecido");
    expect(await operacao(op)).toMatchObject({ situacao: "resultado_desconhecido", pago: true });
    expect((await eventos(op)).filter((e) => e.tipo === "conferencia").map((e) => e.mensagem))
      .toEqual([expect.stringMatching(/^Ativação paga na Nogle, sem ICCID para provar a linha/)]);
    expect(await producoes(op)).toEqual([]);
    const gerente = await usuario(ids.dono);
    expect(await valor<string>(gerente, "select public.connect_resolver($1, 'confirmada', 'Painel da Nogle: linha do eSIM ativa, conferida pelo dono') as v", [op])).toBe("confirmada");
    expect(await producoes(op)).toEqual([{ origem: "revisao_da_gerencia" }]);

    const outra = await registrarAtivacao(s, true);
    await aceitar(outra);
    expect(await consultar(outra, { evidencia: "sem_prova_da_linha", mensagem: "Sem ICCID" })).toBe("resultado_desconhecido");
    expect(await operacao(outra)).toMatchObject({ situacao: "resultado_desconhecido", pago: false });
  });
});

describe("AUD-f — o material do eSIM e o Pix copia e cola, à parte", () => {
  const MATERIAL = { link: "https://exemplo.invalido/esim-qr", codigo: "LPA:1$smdp.exemplo.invalido$ABC-123" };
  const material = (id: string, m: object) => rpcServico<boolean>("select public.connect_worker_registrar_material_esim($1, $2::jsonb) as v", [id, JSON.stringify(m)]);

  it("o material do eSIM é gravado uma vez, só no eSIM e no formato; o evento diz só que chegou", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, true);
    await aceitar(op);
    expect(await material(op, { link: "http://sem-https.invalido", codigo: "LPA:1$x" })).toBe(false);
    expect(await material(op, MATERIAL)).toBe(true);
    expect(await operacao(op)).toMatchObject({ link_esim: MATERIAL.link, esim_codigo: MATERIAL.codigo });
    expect(await material(op, { link: "https://exemplo.invalido/outro", codigo: "LPA:1$outro.invalido$XYZ" })).toBe(false);
    expect(await operacao(op)).toMatchObject({ link_esim: MATERIAL.link, esim_codigo: MATERIAL.codigo });
    const doMaterial = (await eventos(op)).filter((e) => e.tipo === "material_esim");
    expect(doMaterial).toEqual([{ tipo: "material_esim", mensagem: "Material de instalação do eSIM recebido da Nogle", dados: null }]);
    expect(JSON.stringify(await eventos(op))).not.toMatch(/LPA:|esim-qr/);
    const fisico = await registrarAtivacao(s, false);
    await aceitar(fisico);
    expect(await material(fisico, MATERIAL)).toBe(false);
  });

  it("o Pix copia e cola do envio fica na operação, só no formato do Pix e fora dos eventos; o link continua sendo o link", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, false);
    await aceitar(op, { link_pagamento: "https://pagar.exemplo.invalido/abc", pix_copia_cola: EMV, dados: { id: "99999" } });
    expect(await operacao(op)).toMatchObject({ pix_copia_cola: EMV });
    expect(JSON.stringify(await eventos(op))).not.toContain("000201");
    const outra = await registrarAtivacao(s, false);
    await aceitar(outra, { link_pagamento: "https://pagar.exemplo.invalido/def", pix_copia_cola: "https://nao-e-pix.invalido" });
    expect(await operacao(outra)).toMatchObject({ pix_copia_cola: null });
  });

  it("as funções novas são só do servidor", async () => {
    const s = await usuario();
    const op = await registrarAtivacao(s, true);
    expect(await comoUsuario(db, s, () => erroDe(() => db.query("select public.connect_worker_registrar_material_esim($1, '{}'::jsonb)", [op])))).toBe("42501");
    expect(await comoUsuario(db, s, () => erroDe(() => db.query("select * from public.connect_worker_operacoes_a_consultar($1, ARRAY['ativacao'], 1)", [ids.organizacao]))))
      .toBe("42501");
  });
});

describe("AUD-f — o cadastro do cliente na Nogle para preencher (parte B)", () => {
  const CPF = "12345678909";
  const naLoja = async (id: string, loja: string): Promise<Sessao> => {
    const s = { usuario: id, sessao: `4f000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
    await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [loja]));
    return s;
  };
  const pedir = (s: Sessao, documento: string) => valor<string>(s, "select public.connect_consultar('cliente_cadastro', $1, $2) as v", [chave(), documento]);
  const erroAoPedir = (s: Sessao, documento: string) =>
    comoUsuario(db, s, () => erroDe(() => db.query("select public.connect_consultar('cliente_cadastro', $1, $2)", [chave(), documento])));
  const ler = (s: Sessao, consulta: string, documento: string) =>
    valor<Record<string, unknown> | null>(s, "select public.connect_cadastro_da_nogle($1, $2) as v", [consulta, documento]);
  const descartar = (s: Sessao, consulta: string) => valor<boolean>(s, "select public.connect_cadastro_da_nogle_descartar($1) as v", [consulta]);
  const RESPOSTA = { situacao: "respondida", mensagem: "", resposta: { nome: "Cliente Ficticio", cep: "90000000" } };
  const pegarFila = () => servico(async () => (await db.query<{ consulta_id: string; tipo: string; parametro: string }>(
    "select * from public.connect_worker_consultas_a_fazer($1, 5)", [ids.organizacao])).rows);
  const gravar = (consulta: string, resultado: object = RESPOSTA) =>
    rpcServico<string>("select public.connect_worker_registrar_resposta_da_consulta($1, $2::jsonb) as v", [consulta, JSON.stringify(resultado)]);
  async function responder(resultado: object = RESPOSTA) {
    const fila = await pegarFila();
    for (const c of fila) await gravar(c.consulta_id, resultado);
    return fila;
  }
  const linha = async (id: string) => (await db.query<Record<string, unknown>>(
    "select tipo, parametro, parametro_mascarado, resposta, resposta_apagada_em is not null as apagada, sessao_id, situacao from public.connect_consultas where id = $1",
    [id])).rows[0];

  it("quem opera ou gere pede pelo CPF ou CNPJ válido; o worker recebe só o documento; o documento fica mascarado e a sessão anotada", async () => {
    const s = await usuario();
    const id = await pedir(s, "123.456.789-09");
    expect(await linha(id)).toMatchObject({ tipo: "cliente_cadastro", parametro: CPF, parametro_mascarado: "•••.•••.789-09", sessao_id: s.sessao, situacao: "na_fila" });
    expect(await responder()).toEqual([{ consulta_id: id, tipo: "cliente_cadastro", parametro: CPF }]);
    for (const errado of ["123.456.789-00", "1234", ""]) expect(await erroAoPedir(s, errado), errado).toBe("22023");
    expect(await pedir(await usuario(ids.dono), "11.222.333/0001-81")).toBeTruthy();
    // O técnico da assistência (sem a Ora Connect) não pede.
    expect(await erroAoPedir(await naLoja(ids.tecnico, ids.assistencia), CPF)).toBe("42501");
  });

  it("o limite próprio: 10 buscas por pessoa e 40 por loja por hora (as outras consultas seguem)", async () => {
    const s = await usuario();
    for (let i = 0; i < 10; i++) await pedir(s, CPF);
    expect(await erroAoPedir(s, CPF)).toBe("OR056");
    expect(await valor<string>(s, "select public.connect_consultar('linha_saldo', $1, '51988887777') as v", [chave()])).toBeTruthy();
    // A loja: 10 da pessoa + 30 de outra = 40 na última hora; quem ainda não pediu também espera.
    await db.query(`insert into public.connect_consultas (organizacao_id, unidade_id, pedida_por, chave, tipo, parametro, parametro_mascarado, sessao_id)
      select $1, $2, $3, 'loja:' || g, 'cliente_cadastro', $4, 'x', gen_random_uuid() from generate_series(1, 30) g`, [ids.organizacao, ids.lojaA, ids.vendedorAB, CPF]);
    expect(await erroAoPedir(await usuario(ids.dono), CPF)).toBe("OR056");
    // Na outra loja, a mesma pessoa (que não passou do limite dela) pede.
    expect(await pedir(await naLoja(ids.dono, ids.lojaB), CPF)).toBeTruthy();
  });

  it("a resposta só sai para quem pediu, na loja e na sessão do pedido, para o mesmo documento e por 15 minutos; a tabela não a mostra", async () => {
    const s = await usuario(ids.vendedorAB);
    const id = await pedir(s, CPF);
    expect(await ler(s, id, CPF)).toEqual({ situacao: "na_fila", mensagem: null, resposta: null });
    await responder();
    const respondida = { situacao: "respondida", mensagem: null, resposta: RESPOSTA.resposta };
    expect(await ler(s, id, "123.456.789-09")).toEqual(respondida);
    expect(await ler(s, id, "11222333000181")).toBeNull();
    expect(await ler(await usuario(ids.vendedorAB), id, CPF)).toBeNull(); // outra sessão da mesma pessoa
    expect(await ler(await usuario(ids.vendedorA), id, CPF)).toBeNull(); // outra pessoa
    expect(await valor<number>(s, "select count(*)::int as v from public.connect_consultas where id = $1", [id])).toBe(0);
    // Outra loja na mesma sessão: nada; de volta à loja do pedido, a resposta.
    await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaB]));
    expect(await ler(s, id, CPF)).toBeNull();
    await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [ids.lojaA]));
    expect(await ler(s, id, CPF)).toEqual(respondida);
    // Depois de 15 minutos, nada (mesmo antes da limpeza do worker).
    await db.query("update public.connect_consultas set pedida_em = now() - interval '16 minutes' where id = $1", [id]);
    expect(await ler(s, id, CPF)).toBeNull();
    // Sem sessão válida, nem a leitura nem o descarte.
    expect(await comoUsuario(db, { usuario: ids.vendedorAB, sessao: null } as unknown as Sessao, () => erroDe(() => db.query("select public.connect_cadastro_da_nogle($1, $2)", [id, CPF]))))
      .toBe("42501");
  });

  it("quem pediu descarta (saem a resposta e o documento; fica o mascarado); outra pessoa não; a limpeza apaga em 15 minutos", async () => {
    const s = await usuario(ids.vendedorAB);
    const id = await pedir(s, CPF);
    await responder();
    expect(await comoUsuario(db, await usuario(ids.vendedorA), () => erroDe(() => db.query("select public.connect_cadastro_da_nogle_descartar($1)", [id])))).toBe("P0002");
    expect(await descartar(s, id)).toBe(true);
    expect(await linha(id)).toMatchObject({ parametro: null, resposta: null, apagada: true, parametro_mascarado: "•••.•••.789-09" });
    expect(await ler(s, id, CPF)).toBeNull();
    // Descartada na fila, o worker não pega; descartada enquanto consulta, a resposta que chega é ignorada.
    const naFila = await pedir(s, CPF);
    await descartar(s, naFila);
    expect(await pegarFila()).toEqual([]);
    const consultando = await pedir(s, CPF);
    expect(await pegarFila()).toHaveLength(1);
    await descartar(s, consultando);
    expect(await gravar(consultando)).toBe("ignorada");
    expect(await linha(consultando)).toMatchObject({ resposta: null, parametro: null, situacao: "falhou" });
    // A limpeza do worker: o cadastro sai em 15 minutos; as outras consultas, em 24 horas.
    const velha = await pedir(s, CPF);
    await responder();
    const saldo = await valor<string>(s, "select public.connect_consultar('linha_saldo', $1, '51988887777') as v", [chave()]);
    await responder({ situacao: "respondida", mensagem: "", resposta: { saldo_centavos: 100 } });
    await db.query("update public.connect_consultas set pedida_em = now() - interval '20 minutes', respondida_em = now() - interval '20 minutes' where id = any($1::uuid[])",
      [[velha, saldo]]);
    expect(await rpcServico("select public.connect_worker_limpar_consultas($1) as v", [ids.organizacao])).toMatchObject({ apagadas: 1 });
    expect(await linha(velha)).toMatchObject({ resposta: null, parametro: null, apagada: true });
    expect(await linha(saldo)).toMatchObject({ apagada: false, parametro: "51988887777" });
  });
});

describe("AUD-f — as somas da produção no banco (parte C)", () => {
  const naLoja = async (id: string, loja: string): Promise<Sessao> => {
    const s = { usuario: id, sessao: `4f000000-0000-4000-8000-${String(++n).padStart(12, "0")}` };
    await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [loja]));
    return s;
  };
  const enviar = async (id: string, resultado: object) => {
    await rpcServico("select count(*) as v from public.connect_worker_reivindicar_envios($1, ARRAY['ativacao'], 5)", [ids.organizacao]);
    return rpcServico<string>("select public.connect_worker_registrar_envio($1, $2::jsonb) as v", [id, JSON.stringify(resultado)]);
  };
  const somas = (s: Sessao, unidade: string | null = null, vendedor: string | null = null) => comoUsuario(db, s, async () => (await db.query<Record<string, unknown>>(
    `select vendedor_id, unidade_id, operacoes::int, ativacoes::int, recargas::int, portabilidades::int, em_andamento::int, sem_resultado::int, nao_feitas::int,
            valor_de_face_centavos::int, recebido_centavos::int
     from public.connect_somas_por(now() - interval '1 day', now() + interval '1 day', $1, $2) order by vendedor_id, unidade_id`, [unidade, vendedor])).rows);
  const zero = { ativacoes: 0, recargas: 0, portabilidades: 0, em_andamento: 0, sem_resultado: 0, nao_feitas: 0, valor_de_face_centavos: 0, recebido_centavos: 0 };

  it("soma cada categoria por vendedor e loja, com as regras de leitura de quem pede (quem só opera, as próprias; quem gere, as das lojas dele)", async () => {
    const ana = await usuario();
    const confirmada = await registrarAtivacao(ana, false);
    await aceitar(confirmada);
    expect(await consultar(confirmada, { evidencia: "confirmada", mensagem: "ICCID ativo na Nogle (11).", numero: "51988887777", dados: { codigo: 11 } })).toBe("confirmada");
    const recusada = await registrarAtivacao(ana, false);
    expect(await enviar(recusada, { resultado: "recusada", status_http: 422, mensagem: "Plano informado não existe." })).toBe("recusada");
    await registrarAtivacao(ana, false); // fica registrada (em andamento)
    const ab = await usuario(ids.vendedorAB);
    const desconhecida = await registrarAtivacao(ab, false);
    expect(await enviar(desconhecida, { resultado: "desconhecida", mensagem: "Sem resposta da Nogle." })).toBe("resultado_desconhecido");
    await registrarAtivacao(await naLoja(ids.vendedorAB, ids.lojaB), false); // na loja B, registrada

    const daAnaNaLojaA = { vendedor_id: ids.vendedorA, unidade_id: ids.lojaA, operacoes: 3, ...zero, ativacoes: 1, em_andamento: 1, nao_feitas: 1, valor_de_face_centavos: 4490 };
    const doAbNaLojaA = { vendedor_id: ids.vendedorAB, unidade_id: ids.lojaA, operacoes: 1, ...zero, sem_resultado: 1 };
    const doAbNaLojaB = { vendedor_id: ids.vendedorAB, unidade_id: ids.lojaB, operacoes: 1, ...zero, em_andamento: 1 };
    const dono = await usuario(ids.dono);
    expect(await somas(dono)).toEqual([daAnaNaLojaA, doAbNaLojaA, doAbNaLojaB].sort((a, b) => a.vendedor_id.localeCompare(b.vendedor_id) || a.unidade_id.localeCompare(b.unidade_id)));
    expect(await somas(dono, ids.lojaA)).toEqual([daAnaNaLojaA, doAbNaLojaA].sort((a, b) => a.vendedor_id.localeCompare(b.vendedor_id)));
    expect(await somas(dono, null, ids.vendedorAB)).toEqual([doAbNaLojaA, doAbNaLojaB].sort((a, b) => a.unidade_id.localeCompare(b.unidade_id)));
    // Quem só opera: só as próprias (o mesmo RLS de connect_operacoes), mesmo pedindo a loja inteira.
    expect(await somas(ana, ids.lojaA)).toEqual([daAnaNaLojaA]);
    // O gerente da loja B: só a loja B.
    expect(await somas(await naLoja(ids.gerenteB, ids.lojaB))).toEqual([doAbNaLojaB]);
    // O visitante sem login não executa.
    expect(await comoUsuario(db, null, () => erroDe(() => db.query("select * from public.connect_somas_por(now(), now())")))).toBe("42501");
  });
});

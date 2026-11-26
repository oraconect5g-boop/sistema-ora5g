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

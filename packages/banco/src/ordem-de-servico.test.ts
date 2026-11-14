// Ordem de serviço da assistência técnica (lote L12a: ORA-OS-001, ORA-OS-002 e ORA-OS-005 em parte). Abertura com o
// cliente da rede e o aparelho, custódia loja → técnico → loja, devolução e cancelamento, fotos no bucket privado,
// contato para o aviso pelo WhatsApp e quem vê. Banco em memória com todas as migrations; dados FICTÍCIOS. Cada teste
// numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { montarCatalogo } from "./cenario-catalogo";

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
const chave = (prefixo = "os") => `${prefixo}:${String(++chaves).padStart(5, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `0512a000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
async function tentar<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<{ v: T } | { codigo: string; mensagem: string }> {
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
async function valor<T>(s: Sessao, sql: string, params: unknown[] = []): Promise<T> {
  const r = await tentar<T>(s, sql, params);
  if ("codigo" in r) throw new Error(`${sql.slice(0, 70)} → ${r.mensagem} (${r.codigo})`);
  return r.v;
}
const codigo = async (s: Sessao, sql: string, params: unknown[] = []) => {
  const r = await tentar(s, sql, params);
  return "codigo" in r ? r.codigo : null;
};
const comoLinhas = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, async () => (await db.query<Record<string, unknown>>(sql, params)).rows);

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const ABRIR = "select public.os_abrir($1::jsonb, $2) as v";
const PASSO = "select public.os_custodia($1, $2, $3, $4) as v";
const FOTO = "select public.os_anexar_foto($1, $2, $3) as v";
const CONTATO = "select public.os_contato_whatsapp($1, $2) as v";
let imeis = 0;
const imei = () => comDigitoLuhn(`35209900${String(800_000 + ++imeis).padStart(6, "0")}`);

async function cliente(s: Sessao, telefone = "41987650001") {
  return (await valor<{ id: string }>(s, "select public.cliente_salvar(null, $1::jsonb, null, $2) as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente da Assistência", documento: cpf(String(100_000_000 + ++imeis * 7)), telefone }), chave("cliente")])).id;
}
const dados = (clienteId: string, extra: Record<string, unknown> = {}) => ({
  cliente: clienteId, aparelho: "Galaxy A15", imei: imei(), defeito: "Tela não liga", estado: "Tampa traseira riscada",
  acessorios: ["carregador", "capa"], prazo: somarDias(hoje(), 7), ...extra,
});
async function abrir(s: Sessao, clienteId: string, extra: Record<string, unknown> = {}) {
  return valor<{ id: string; numero: number; repetida: boolean }>(s, ABRIR, [JSON.stringify(dados(clienteId, extra)), chave()]);
}
type Os = { local: string; situacao: string; assistencia_id: string | null; motivo_encerramento: string | null; encerrada: boolean };
const os = async (id: string) =>
  (await db.query<Os>("select local, situacao, assistencia_id, motivo_encerramento, encerrada_em is not null as encerrada from public.ordens_servico where id = $1", [id])).rows[0];
const eventos = async (id: string) =>
  (await db.query<{ tipo: string; de: string | null; para: string | null; em_nome: boolean; observacao: string | null }>(
    "select tipo, local_de as de, local_para as para, em_nome_do_tecnico as em_nome, observacao from public.os_eventos where os_id = $1 order by id", [id])).rows;

describe("abrir a ordem de serviço (L12a, ORA-OS-001)", () => {
  it("o vendedor abre com o cliente e o aparelho; a mesma chave devolve a mesma OS; o cliente ganha a finalidade assistência", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c = await cliente(ana);
    const d = dados(c);
    const k = chave();
    const r = await valor<{ id: string; numero: number; repetida: boolean }>(ana, ABRIR, [JSON.stringify(d), k]);
    expect(r.repetida).toBe(false);
    expect(await valor(ana, ABRIR, [JSON.stringify(d), k])).toEqual({ ...r, repetida: true });
    expect(await codigo(ana, ABRIR, [JSON.stringify({ ...d, defeito: "Outro defeito" }), k])).toBe("OR004");
    const linha = (await db.query<Record<string, unknown>>(
      "select unidade_id, cliente_nome, contato_mascarado, aparelho, imei, defeito, estado_entrada, acessorios, prazo::text as prazo, local, situacao, aberta_por from public.ordens_servico where id = $1", [r.id])).rows[0];
    expect(linha).toMatchObject({
      unidade_id: ids.lojaA, cliente_nome: "Cliente da Assistência", aparelho: "Galaxy A15", imei: d.imei, defeito: "Tela não liga",
      estado_entrada: "Tampa traseira riscada", acessorios: ["capa", "carregador"], prazo: d.prazo, local: "loja", situacao: "aberta", aberta_por: ids.vendedorA,
    });
    expect(String(linha?.contato_mascarado)).not.toContain("987650001");
    expect((await db.query<{ f: string[] }>("select finalidades as f from public.clientes where id = $1", [c])).rows[0]?.f).toContain("assistencia");
    expect(await eventos(r.id)).toEqual([{ tipo: "aberta", de: null, para: "loja", em_nome: false, observacao: null }]);
    // O mesmo IMEI não tem duas OS abertas na rede, nem pela outra loja.
    const bia = await naLoja(ids.vendedorAB, ids.lojaB);
    expect(await codigo(bia, ABRIR, [JSON.stringify({ ...d, cliente: c }), chave()])).toBe("OR031");
    // Sem IMEI, pelo número de série.
    expect((await abrir(ana, c, { imei: null, serie: " sn-123 abc " })).repetida).toBe(false);
  });

  it("recusa o que falta ou não confere; cliente sem WhatsApp; quem não abre OS na loja do turno", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c = await cliente(ana);
    for (const [extra, nome] of [
      [{ cliente: null }, "sem cliente"], [{ imei: "352099001700011" }, "IMEI inválido"], [{ imei: null, serie: null }, "sem identificação"],
      [{ aparelho: "x" }, "aparelho"], [{ defeito: "ab" }, "defeito"], [{ estado: "" }, "estado"], [{ acessorios: ["bateria"] }, "acessório"],
      [{ acessorios: "capa" }, "acessórios fora de lista"], [{ prazo: somarDias(hoje(), -1) }, "prazo passado"], [{ prazo: somarDias(hoje(), 91) }, "prazo longe"],
      [{ prazo: "14/11/2026" }, "prazo em outro formato"], [{ serie: "a" , imei: null }, "série curta"],
    ] as const) {
      expect(await codigo(ana, ABRIR, [JSON.stringify(dados(c, extra as Record<string, unknown>)), chave()]), nome).toBe("22023");
    }
    expect(await codigo(ana, ABRIR, [JSON.stringify(dados(randomUUID())), chave()])).toBe("P0002");
    // Cadastro antigo sem WhatsApp: a OS pede completar o cadastro.
    const antigo = await cliente(ana, "41987650002");
    await db.query("update privado.cliente_dados set telefone = null where cliente_id = $1", [antigo]);
    const semWhats = await tentar(ana, ABRIR, [JSON.stringify(dados(antigo)), chave()]);
    expect(semWhats).toMatchObject({ codigo: "22023" });
    expect("mensagem" in semWhats ? semWhats.mensagem : "").toContain("WhatsApp");
    // O técnico não abre OS; o vendedor da loja B não abre na loja A (abre na loja do turno).
    expect(await codigo(await naLoja(ids.tecnico, ids.assistencia), ABRIR, [JSON.stringify(dados(c)), chave()])).toBe("42501");
    const naB = await valor<{ id: string }>(await naLoja(ids.vendedorAB, ids.lojaB), ABRIR, [JSON.stringify(dados(c)), chave()]);
    expect((await db.query<{ u: string }>("select unidade_id as u from public.ordens_servico where id = $1", [naB.id])).rows[0]?.u).toBe(ids.lojaB);
  });
});

describe("custódia: loja → técnico → loja (L12a, ORA-OS-002)", () => {
  it("ida e volta com o técnico, passo repetido não muda, fora de ordem é recusado; a trilha guarda tudo; devolver encerra", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c = await cliente(ana);
    const { id } = await abrir(ana, c);
    expect(await codigo(ana, PASSO, [id, "enviar_ao_tecnico", ids.lojaB, null])).toBe("22023"); // não é assistência
    // Sem escolher, vai para a única assistência ativa da rede (o técnico central).
    expect(await valor(ana, PASSO, [id, "enviar_ao_tecnico", null, null])).toBe(true);
    expect(await valor(ana, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null])).toBe(false);
    expect(await codigo(ana, PASSO, [id, "loja_recebeu", null, null])).toBe("22023");
    expect(await codigo(ana, PASSO, [id, "tecnico_recebeu", null, null])).toBe("42501"); // vendedor não registra pelo técnico
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await valor(tecnico, PASSO, [id, "tecnico_recebeu", null, null])).toBe(true);
    expect(await codigo(tecnico, PASSO, [id, "loja_recebeu", null, null])).toBe("42501"); // o técnico vê a OS, mas este passo é da loja
    const dono = await naLoja(ids.dono, ids.lojaA);
    expect(await codigo(dono, PASSO, [id, "tecnico_devolveu", null, null])).toBe("22023"); // em nome do técnico pede observação
    expect(await valor(dono, PASSO, [id, "tecnico_devolveu", null, "Técnico avisou por mensagem que mandou de volta"])).toBe(true);
    expect(await valor(ana, PASSO, [id, "loja_recebeu", null, null])).toBe(true);
    expect(await os(id)).toMatchObject({ local: "loja", situacao: "aberta", assistencia_id: ids.assistencia });
    expect(await valor(ana, "select public.os_assistencias() as v")).toEqual([{ id: ids.assistencia, nome: "Assistência" }]);
    expect(await codigo(tecnico, "select public.os_assistencias() as v")).toBe("42501");
    expect(await codigo(ana, PASSO, [id, "devolver_ao_cliente", null, "ok"])).toBe("22023");
    expect(await valor(ana, PASSO, [id, "devolver_ao_cliente", null, "Cliente desistiu do conserto"])).toBe(true);
    expect(await valor(ana, PASSO, [id, "devolver_ao_cliente", null, "Cliente desistiu do conserto"])).toBe(false);
    expect(await os(id)).toEqual({ local: "com_cliente", situacao: "devolvida", assistencia_id: ids.assistencia, motivo_encerramento: "Cliente desistiu do conserto", encerrada: true });
    expect(await codigo(ana, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null])).toBe("22023");
    expect((await eventos(id)).map((e) => [e.tipo, e.de, e.para, e.em_nome])).toEqual([
      ["aberta", null, "loja", false], ["enviada_ao_tecnico", "loja", "a_caminho_do_tecnico", false],
      ["recebida_pelo_tecnico", "a_caminho_do_tecnico", "com_tecnico", false], ["devolvida_pelo_tecnico", "com_tecnico", "a_caminho_da_loja", true],
      ["recebida_na_loja", "a_caminho_da_loja", "loja", false], ["devolvida_ao_cliente", "loja", "com_cliente", false],
    ]);
    // Encerrada, o mesmo aparelho pode voltar numa OS nova.
    const imeiDaPrimeira = (await db.query<{ imei: string }>("select imei from public.ordens_servico where id = $1", [id])).rows[0]?.imei;
    expect((await abrir(ana, c, { imei: imeiDaPrimeira })).repetida).toBe(false);
  });

  it("para onde vai: a única assistência ativa; com duas, escolher; sem nenhuma, cadastrar", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const c = await cliente(ana);
    const { id } = await abrir(ana, c);
    await db.query("select set_config('ora.motivo', 'Segunda assistência (teste)', true)");
    const segunda = (await db.query<{ id: string }>(
      "insert into public.unidades (organizacao_id, empresa_id, codigo, nome, tipo) values ($1, $2, 'assistencia-2', 'Assistência 2', 'assistencia') returning id",
      [ids.organizacao, ids.empresa])).rows[0]?.id ?? "";
    expect(await codigo(ana, PASSO, [id, "enviar_ao_tecnico", null, null])).toBe("22023");
    expect((await valor<{ id: string }[]>(ana, "select public.os_assistencias() as v")).map((a) => a.id).sort()).toEqual([ids.assistencia, segunda].sort());
    expect(await valor(ana, PASSO, [id, "enviar_ao_tecnico", segunda, null])).toBe(true);
    expect(await os(id)).toMatchObject({ local: "a_caminho_do_tecnico", assistencia_id: segunda });
    await db.query("update public.unidades set status = 'inativa' where tipo = 'assistencia'");
    const outra = await abrir(ana, c);
    const semNenhuma = await tentar(ana, PASSO, [outra.id, "enviar_ao_tecnico", null, null]);
    expect(semNenhuma).toMatchObject({ codigo: "22023" });
    expect("mensagem" in semNenhuma ? semNenhuma.mensagem : "").toContain("cadastre");
    expect(await valor(ana, "select public.os_assistencias() as v")).toEqual([]);
  });

  it("cancelar é da gerência e só antes de o aparelho sair da loja", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const c = await cliente(ana);
    const primeira = await abrir(ana, c);
    expect(await codigo(ana, PASSO, [primeira.id, "cancelar", null, "Aberta por engano"])).toBe("42501");
    expect(await codigo(dono, PASSO, [primeira.id, "cancelar", null, null])).toBe("22023");
    expect(await valor(dono, PASSO, [primeira.id, "cancelar", null, "Aberta por engano"])).toBe(true);
    expect(await os(primeira.id)).toMatchObject({ situacao: "cancelada", local: "com_cliente" });
    const segunda = await abrir(ana, c);
    await valor(ana, PASSO, [segunda.id, "enviar_ao_tecnico", ids.assistencia, null]);
    await valor(dono, PASSO, [segunda.id, "tecnico_recebeu", null, "Entregue em mãos"]);
    await valor(dono, PASSO, [segunda.id, "tecnico_devolveu", null, "Voltou pelo motoboy"]);
    await valor(ana, PASSO, [segunda.id, "loja_recebeu", null, null]);
    expect(await codigo(dono, PASSO, [segunda.id, "cancelar", null, "Engano"])).toBe("22023");
    expect(await codigo(ana, PASSO, [segunda.id, "passear", null, null])).toBe("22023");
  });
});

describe("quem vê e quem mexe (L12a)", () => {
  it("a loja da OS e a rede veem; outra loja e outra rede não; o técnico só depois que ela vai para a assistência", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const { id } = await abrir(ana, await cliente(ana));
    const ver = async (s: Sessao) => (await comoLinhas(s, "select id from public.ordens_servico")).map((l) => l.id);
    const verEventos = async (s: Sessao) => (await comoLinhas(s, "select os_id from public.os_eventos")).length;
    expect(await ver(ana)).toEqual([id]);
    expect(await ver(await naLoja(ids.dono, ids.lojaB))).toEqual([id]); // o dono vê a rede de qualquer loja do turno
    expect(await ver(await naLoja(ids.vendedorAB, ids.lojaB))).toEqual([]); // na loja B, a OS da A não aparece
    expect(await ver(await naLoja(ids.gerenteB, ids.lojaB))).toEqual([]);
    expect(await ver(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg))).toEqual([]);
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await ver(tecnico)).toEqual([]);
    expect(await verEventos(tecnico)).toBe(0);
    await valor(ana, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null]);
    expect(await ver(tecnico)).toEqual([id]);
    expect(await verEventos(tecnico)).toBe(2);
    // Ninguém escreve direto nas tabelas.
    for (const sql of ["update public.ordens_servico set local = 'loja'", "delete from public.os_eventos", "insert into public.os_fotos (organizacao_id, os_id, caminho, tipo, bytes, sha256, enviada_por) values (gen_random_uuid(), gen_random_uuid(), 'x', 'image/jpeg', 1, 'a', gen_random_uuid())"]) {
      expect(await codigo(ana, sql), sql).toBe("42501");
    }
  });

  it("fotos: só no caminho da OS, só imagem que chegou ao Storage, até 8, sem duplicar; quem lê a OS lê as fotos", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const { id } = await abrir(ana, await cliente(ana));
    const pasta = `${ids.organizacao}/${ids.lojaA}/${id}`;
    const ENVIAR = "insert into storage.objects (bucket_id, name, metadata) values ('os', $1, $2)";
    const enviar = async (s: Sessao, caminho: string, tipo = "image/jpeg") => codigo(s, ENVIAR, [caminho, JSON.stringify({ mimetype: tipo, size: 182_345 })]);
    const sha = "b".repeat(64);
    const primeira = `${pasta}/${randomUUID()}.jpg`;
    expect(await enviar(ana, primeira)).toBeNull();
    const f1 = await valor<string>(ana, FOTO, [id, primeira, sha]);
    expect(await valor(ana, FOTO, [id, primeira, sha])).toBe(f1);
    expect(await codigo(ana, FOTO, [id, `${pasta}/${randomUUID()}.jpg`, sha])).toBe("P0002"); // não chegou ao Storage
    expect(await codigo(ana, FOTO, [id, `${ids.organizacao}/${ids.lojaA}/${randomUUID()}/${randomUUID()}.jpg`, sha])).toBe("22023");
    expect(await codigo(ana, FOTO, [id, primeira.replace(".jpg", ".gif"), sha])).toBe("22023");
    expect(await codigo(ana, FOTO, [id, `${pasta}/${randomUUID()}.jpg`, "xyz"])).toBe("22023");
    const pdf = `${pasta}/${randomUUID()}.png`;
    await enviar(ana, pdf, "application/pdf");
    expect(await codigo(ana, FOTO, [id, pdf, sha])).toBe("22023");
    for (let i = 0; i < 7; i++) {
      const caminho = `${pasta}/${randomUUID()}.webp`;
      await enviar(ana, caminho, "image/webp");
      await valor(ana, FOTO, [id, caminho, sha]);
    }
    const nona = `${pasta}/${randomUUID()}.jpg`;
    await enviar(ana, nona);
    expect(await codigo(ana, FOTO, [id, nona, sha])).toBe("22023");
    expect((await db.query<{ n: string }>("select count(*)::text as n from public.os_fotos where os_id = $1", [id])).rows[0]?.n).toBe("8");
    expect((await eventos(id)).filter((e) => e.tipo === "foto")).toHaveLength(8);
    // A loja B não grava na pasta da loja A; o técnico lê as fotos quando a OS chega à assistência.
    expect(await enviar(await naLoja(ids.vendedorAB, ids.lojaB), `${pasta}/${randomUUID()}.jpg`)).toBe("42501");
    const tecnico = await naLoja(ids.tecnico, ids.assistencia);
    expect(await comoLinhas(tecnico, "select name from storage.objects where bucket_id = 'os'")).toEqual([]);
    await valor(ana, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null]);
    expect((await comoLinhas(tecnico, "select name from storage.objects where bucket_id = 'os'")).length).toBe(10);
    expect((await comoLinhas(tecnico, "select id from public.os_fotos")).length).toBe(8);
  });

  it("contato para o aviso pelo WhatsApp: só para a loja da OS; fica na trilha e na auditoria sem o número", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const { id } = await abrir(ana, await cliente(ana, "41987650077"));
    expect(await valor(ana, CONTATO, [id, "comprovante"])).toBe("41987650077");
    expect(await codigo(ana, CONTATO, [id, "na_loja"])).toBe("22023"); // ainda não foi e voltou
    expect(await codigo(ana, CONTATO, [id, "propaganda"])).toBe("22023");
    expect(await codigo(await naLoja(ids.tecnico, ids.assistencia), CONTATO, [id, "comprovante"])).toBe("P0002");
    expect(await codigo(await naLoja(ids.vendedorAB, ids.lojaB), CONTATO, [id, "comprovante"])).toBe("P0002");
    const dono = await naLoja(ids.dono, ids.lojaA);
    await valor(ana, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null]);
    await valor(dono, PASSO, [id, "tecnico_recebeu", null, "Recebeu em mãos"]);
    await valor(dono, PASSO, [id, "tecnico_devolveu", null, "Devolveu pelo motoboy"]);
    await valor(ana, PASSO, [id, "loja_recebeu", null, null]);
    expect(await valor(ana, CONTATO, [id, "na_loja"])).toBe("41987650077");
    expect((await eventos(id)).filter((e) => e.tipo === "aviso_whatsapp").map((e) => e.observacao)).toEqual(["Comprovante", "Aparelho de volta na loja"]);
    const auditoria = (await db.query<{ depois: unknown }>("select depois from public.auditoria where acao = 'os.contato_whatsapp' and alvo_id = $1 order by id", [id])).rows;
    expect(auditoria.map((a) => a.depois)).toEqual([{ aviso: "comprovante" }, { aviso: "na_loja" }]);
    expect(JSON.stringify(auditoria)).not.toContain("987650077");
  });

  it("inativar a loja (ou a assistência) com OS aberta é recusado; encerrada a OS, inativa", async () => {
    const dono = await naLoja(ids.dono, ids.lojaC);
    const { id } = await abrir(dono, await cliente(dono));
    const INATIVAR = "select public.loja_definir_situacao($1, 'inativa', 'Loja fechada (teste)') as v";
    const recusa = await tentar(dono, INATIVAR, [ids.lojaC]);
    expect(recusa).toMatchObject({ codigo: "OR019" });
    expect("mensagem" in recusa ? recusa.mensagem : "").toContain("ordem de serviço aberta");
    await valor(dono, PASSO, [id, "enviar_ao_tecnico", ids.assistencia, null]);
    expect(await codigo(dono, INATIVAR, [ids.assistencia])).toBe("OR019");
    await valor(dono, PASSO, [id, "tecnico_recebeu", null, "Recebeu"]);
    await valor(dono, PASSO, [id, "tecnico_devolveu", null, "Devolveu"]);
    await valor(dono, PASSO, [id, "loja_recebeu", null, null]);
    await valor(dono, PASSO, [id, "devolver_ao_cliente", null, "Cliente buscou sem conserto"]);
    expect(await valor(dono, INATIVAR, [ids.lojaC])).toBe(true);
    // Loja inativa não abre OS nova.
    const c = await cliente(await naLoja(ids.dono, ids.lojaA), "41987650099");
    expect(await codigo(dono, ABRIR, [JSON.stringify(dados(c)), chave()])).not.toBeNull();
  });
});

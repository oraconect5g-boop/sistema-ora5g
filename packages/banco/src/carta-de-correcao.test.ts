// Lote FISC-009b (15/11/2026, ORA-FISC-009 em parte; migration 20261115200000_carta_de_correcao): a carta de correção
// da NF-e feita no portal do fisco, registrada com o número, o protocolo e o texto. As regras são as do Manual de
// Orientação ao Contribuinte (SEFAZ-PR, Web Service da Carta de Correção): só NF-e (modelo 55), autorizada e não
// cancelada; número de 1 a 20; texto de 15 a 1.000 caracteres; a mais recente substitui as anteriores. Dados
// FICTÍCIOS; nada é emitido.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let cnpjDaLojaA = "";
let aamm = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  cnpjDaLojaA = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]?.cnpj ?? "";
  aamm = (await db.query<{ aamm: string }>("select to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') as aamm")).rows[0]?.aamm ?? "";
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
  const s = { usuario, sessao: `4c000000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T);
const errou = (s: Sessao, sql: string, params: unknown[] = []) => comoUsuario(db, s, () => erroDe(() => db.query(sql, params)));

// Chave de acesso fictícia (cUF 43, AAMM, CNPJ, modelo, série 1, número, emissão normal, código), dígito calculado aqui.
function chaveDeAcesso(numero: number, modelo: "55" | "65") {
  const base = `43${aamm}${cnpjDaLojaA}${modelo}001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

// Uma capa vendida e paga em dinheiro na loja A, com a nota pedida por quem vendeu e, se houver modelo, registrada pelo dono.
async function vendaComNota(ana: Sessao, dono: Sessao, numero: number, modelo: "55" | "65" | null) {
  const aberto = await db.query("select 1 from public.caixas where operador_id = $1 and situacao = 'aberto'", [ana.usuario]);
  if (aberto.rows.length === 0) await valor(ana, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
  const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
  await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
  await valor(ana, "select public.concluir_venda($1, '[{\"meio\":\"dinheiro\",\"valor\":7900}]'::jsonb, '{}'::jsonb, $2) as v", [venda, chave("concluir")]);
  const pedido = await valor<string>(ana, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [venda, chave("nota")]);
  if (modelo) await valor(dono, "select public.notas_registrar_emissao($1, $2, null) as v", [pedido, chaveDeAcesso(numero, modelo)]);
  return { venda, pedido };
}

const REGISTRAR = "select public.notas_registrar_carta_de_correcao($1, $2, $3, $4) as v";
const PROTOCOLO_1 = "141260000777001";
const PROTOCOLO_2 = "141260000777002";
const TEXTO_1 = "Endereço do destinatário: onde se lê Rua A, 10, leia-se Rua A, 100";
const TEXTO_2 = "Endereço do destinatário: Rua A, 100, fundos; e o volume: 1 caixa";
const cartas = async (pedido: string) => (await db.query<{ numero: number; protocolo: string; correcao: string; registrada_por: string }>(
  "select numero, protocolo, correcao, registrada_por from public.notas_cartas_de_correcao where pedido_id = $1 order by numero", [pedido])).rows;
const eventos = async (pedido: string) => (await db.query<{ tipo: string; observacao: string | null }>(
  "select tipo, observacao from public.notas_eventos where pedido_id = $1 order by id", [pedido])).rows;

describe("carta de correção da NF-e, registrada (FISC-009b)", () => {
  it("quem aprova nota registra, na loja do pedido; uma vez por número; o protocolo não se repete; o histórico guarda", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 951, "55");
    // Quem não aprova nota, de outra loja ou de outra empresa: o pedido "não existe".
    expect(await errou(ana, REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("P0002");
    expect(await errou(await naLoja(ids.gerenteB, ids.lojaB), REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("P0002");
    expect(await errou(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("P0002");
    // As regras do evento no fisco: número de 1 a 20, protocolo de 15 dígitos, texto de 15 a 1.000 caracteres.
    for (const [numero, protocolo, texto] of [
      [0, PROTOCOLO_1, TEXTO_1], [21, PROTOCOLO_1, TEXTO_1], [null, PROTOCOLO_1, TEXTO_1], [1, "14126000077700", TEXTO_1],
      [1, "", TEXTO_1], [1, PROTOCOLO_1, "Rua A, 100"], [1, PROTOCOLO_1, "x".repeat(1001)], [1, PROTOCOLO_1, null],
    ] as const) {
      expect(await errou(dono, REGISTRAR, [nota.pedido, numero, protocolo, texto]), JSON.stringify([numero, protocolo, texto?.length])).toBe("22023");
    }
    // Registrada (o protocolo com pontos e o texto com espaços nas pontas são limpos); repetir igual devolve falso.
    expect(await valor<boolean>(dono, REGISTRAR, [nota.pedido, 1, "141.260.000.777.001", `  ${TEXTO_1}  `])).toBe(true);
    expect(await valor<boolean>(dono, REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe(false);
    // O mesmo número com outro texto ou outro protocolo, ou o mesmo protocolo noutra carta: recusados.
    expect(await errou(dono, REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_2])).toBe("22023");
    expect(await errou(dono, REGISTRAR, [nota.pedido, 1, PROTOCOLO_2, TEXTO_1])).toBe("22023");
    expect(await errou(dono, REGISTRAR, [nota.pedido, 2, PROTOCOLO_1, TEXTO_2])).toBe("22023");
    // A segunda carta (a mais recente substitui as anteriores, no fisco); o texto de 1.000 caracteres cabe.
    expect(await valor<boolean>(dono, REGISTRAR, [nota.pedido, 2, PROTOCOLO_2, TEXTO_2])).toBe(true);
    expect(await valor<boolean>(dono, REGISTRAR, [nota.pedido, 20, "141260000777020", "y".repeat(1000)])).toBe(true);
    expect((await cartas(nota.pedido)).map((c) => [c.numero, c.protocolo, c.correcao.length, c.registrada_por])).toEqual([
      [1, PROTOCOLO_1, TEXTO_1.length, ids.dono], [2, PROTOCOLO_2, TEXTO_2.length, ids.dono], [20, "141260000777020", 1000, ids.dono],
    ]);
    expect((await eventos(nota.pedido)).filter((e) => e.tipo === "carta_de_correcao").map((e) => e.observacao)).toEqual([
      `Carta nº 1, protocolo ${PROTOCOLO_1}: ${TEXTO_1}`, `Carta nº 2, protocolo ${PROTOCOLO_2}: ${TEXTO_2}`, `Carta nº 20, protocolo 141260000777020: ${"y".repeat(200)}`,
    ]);
    // O protocolo também não se repete em outra nota da mesma empresa.
    const outra = await vendaComNota(ana, dono, 952, "55");
    expect(await errou(dono, REGISTRAR, [outra.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("22023");
  });

  it("só a NF-e emitida e não cancelada: a NFC-e, o pedido na fila e a nota cancelada no fisco são recusados", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nfce = await vendaComNota(ana, dono, 961, "65");
    expect(await errou(dono, REGISTRAR, [nfce.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("22023");
    const naFila = await vendaComNota(ana, dono, 0, null);
    expect(await errou(dono, REGISTRAR, [naFila.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe("22023");
    // A carta registrada antes do cancelamento continua no histórico; repetir devolve falso; uma nova é recusada.
    const nfe = await vendaComNota(ana, dono, 962, "55");
    expect(await valor<boolean>(dono, REGISTRAR, [nfe.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe(true);
    await valor(dono, "select public.notas_registrar_cancelamento($1, '141260000888001', 'Cliente desistiu antes de sair da loja') as v", [nfe.pedido]);
    expect(await valor<boolean>(dono, REGISTRAR, [nfe.pedido, 1, PROTOCOLO_1, TEXTO_1])).toBe(false);
    expect(await errou(dono, REGISTRAR, [nfe.pedido, 2, PROTOCOLO_2, TEXTO_2])).toBe("22023");
    expect((await cartas(nfe.pedido)).map((c) => c.numero)).toEqual([1]);
  });

  it("quem vê a nota vê as cartas; ninguém grava direto, e o registro não muda nem some", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const nota = await vendaComNota(ana, dono, 971, "55");
    await valor(dono, REGISTRAR, [nota.pedido, 1, PROTOCOLO_1, TEXTO_1]);
    const LER = "select count(*)::int as v from public.notas_cartas_de_correcao where pedido_id = $1";
    expect(await valor<number>(ana, LER, [nota.pedido])).toBe(1);
    expect(await valor<number>(dono, LER, [nota.pedido])).toBe(1);
    expect(await valor<number>(await naLoja(ids.gerenteB, ids.lojaB), LER, [nota.pedido])).toBe(0);
    expect(await valor<number>(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg), LER, [nota.pedido])).toBe(0);
    // Pela API, nem quem aprova nota grava direto (só pela função).
    expect(await errou(dono, "insert into public.notas_cartas_de_correcao (organizacao_id, pedido_id, numero, protocolo, correcao, registrada_por) values ($1, $2, 2, $3, $4, $5)",
      [ids.organizacao, nota.pedido, PROTOCOLO_2, TEXTO_2, ids.dono])).toBe("42501");
    // Nem o dono do banco altera, apaga ou esvazia: o registro só aceita inserção.
    expect(await erroDe(() => db.query("update public.notas_cartas_de_correcao set correcao = $2 where pedido_id = $1", [nota.pedido, TEXTO_2]))).toBe("42501");
    expect(await erroDe(() => db.query("delete from public.notas_cartas_de_correcao where pedido_id = $1", [nota.pedido]))).toBe("42501");
    expect(await erroDe(() => db.query("truncate public.notas_cartas_de_correcao"))).toBe("42501");
    expect((await cartas(nota.pedido)).map((c) => c.correcao)).toEqual([TEXTO_1]);
  });
});

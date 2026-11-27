// NF-e modelo 55 no fluxo interno, de ponta a ponta numa venda só (frente pedida pelo proprietário em 27/11/2026). Cada
// pedaço já tem a sua prova (clientes, notas, destinatario-fiscal, carta-de-correcao, whatsapp-nota, pendencias-numa-ida);
// esta junta o caminho como a loja vai vivê-lo, com as funções que já existem (nada novo no banco):
//   1. a venda concluída SEM cliente (a identificação não é exigida em toda venda);
//   2. o cadastro rápido (nome completo + WhatsApp) e a ligação à venda já concluída, com motivo;
//   3. a nota no nome do cliente pede o CPF e o endereço; completados no MESMO cadastro, o pedido entra na fila uma vez;
//   4. o dono vê a contagem nas pendências e aprova (a vendedora não); com a sessão dele, lê os dados para emitir e as
//      mesmas tabelas que a tela "Dados para emitir" lê (a gerente de outra loja não lê a venda);
//   5. a emissão EXTERNA registrada pela chave de acesso FICTÍCIA de modelo 55, do CNPJ da loja: sem emissão, assinatura,
//      SEFAZ nem tributo (o modelo e os tributos são do contador, ADR-006);
//   6. o PDF guardado e o envio pelo WhatsApp SÓ na fila, com a trilha e sem duplicar; nenhum worker roda (a Meta não está
//      configurada).
// Banco em memória com todas as migrations; dados FICTÍCIOS; cada teste numa transação desfeita.
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario } from "./cenario";
import { cat, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let cnpjA = "";
let aamm = "";
beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  cnpjA = (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]!.cnpj;
  aamm = (await db.query<{ aamm: string }>("select to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') as aamm")).rows[0]!.aamm;
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

let sessoes = 0;
let chaves = 0;
const chave = (p: string) => `nfe55:${p}:${String(++chaves).padStart(4, "0")}`;
async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = { usuario, sessao: `7e550000-0000-4000-8000-${String(++sessoes).padStart(12, "0")}` };
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
// O passo num savepoint: o erro de verdade aparece (e não o "current transaction is aborted" do passo seguinte).
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

/** Chave de acesso FICTÍCIA de NF-e: cUF 41 (PR), AAMM de agora, o CNPJ, modelo 55, série 1, o número, emissão normal, código; DV aqui. */
function chaveDaNfe(numero: number, cnpj = cnpjA) {
  const base = `41${aamm}${cnpj}55001${String(numero).padStart(9, "0")}187654321`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) { soma += Number(base[i]) * peso; peso = peso === 9 ? 2 : peso + 1; }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

const SALVAR = "select public.cliente_salvar($1, $2::jsonb, $3, $4) as v";
const SOLICITAR = "select public.notas_solicitar($1, $2::jsonb, $3) as v";
const PENDENCIAS = "select public.pendencias_da_loja() as v";
const REGISTRAR = "select public.notas_registrar_emissao($1, $2, null) as v";
const ENVIAR = "select public.nota_enviar_whatsapp($1, $2, $3) as v";
const ENDERECO = { cep: "82000100", logradouro: "Rua das Notas", numero: "55", bairro: "Santa Cândida", cidade: "Curitiba", uf: "PR" };

describe("NF-e modelo 55 no fluxo interno, de ponta a ponta (27/11/2026)", () => {
  it("venda sem cliente → cadastro rápido e ligação → CPF e endereço só quando a nota no nome pede → fila e contagem do dono → aprovação → chave 55 → PDF → WhatsApp na fila, sem duplicar", async () => {
    const ana = await naLoja(ids.vendedorA, ids.lojaA);
    const dono = await naLoja(ids.dono, ids.lojaA);
    const notasNaFila = async () => {
      const notas = (await valor<Record<string, number>>(dono, PENDENCIAS)).notas;
      if (notas === undefined) throw new Error("o dono não vê a fila de notas nas pendências");
      return notas;
    };
    const antes = await notasNaFila();
    // A loja com os dados fiscais configurados pelo caminho de sempre (o dono, com motivo): é o que a tela mostra de quem emite.
    await valor(dono, "select public.loja_definir_configuracao($1, $2::jsonb, null, 'Dados fiscais da loja de teste') as v",
      [ids.lojaA, JSON.stringify({ cep: "82000000", logradouro: "Rua do Teste", numero: "100", bairro: "Santa Cândida", inscricao_estadual: "1234567890" })]);

    // 1. Uma capa em dinheiro, concluída sem cliente.
    await valor(ana, "select public.abrir_caixa(10000, $1) as v", [chave("caixa")]);
    const venda = await valor<string>(ana, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(ana, "select public.adicionar_item($1, $2, null, 1, $3) as v", [venda, cat.capa, chave("item")]);
    await valor(ana, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [venda, JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);

    // 2. O cadastro rápido é nome completo + WhatsApp (o CPF não é pedido aqui); a ligação à venda concluída leva motivo.
    expect(await tentar(ana, SALVAR, [null, JSON.stringify({ tipo: "pessoa_fisica", nome: "Joana", telefone: "41987650955" }), null, chave("cliente")]))
      .toMatchObject({ codigo: "22023", mensagem: "Informe o nome completo (nome e sobrenome)" });
    const joana = (await valor<{ id: string }>(ana, SALVAR, [null, JSON.stringify({ tipo: "pessoa_fisica", nome: "Joana Nota Teste", telefone: "41987650955" }), null, chave("cliente")])).id;
    await valor(ana, "select public.venda_vincular_cliente($1, $2, 'Cliente pediu a nota no nome dela') as v", [venda, joana]);

    // 3. A nota no nome da cliente pede o CPF e depois o endereço; os dois entram no MESMO cadastro, e o pedido sai uma vez.
    const NO_NOME = JSON.stringify({ cliente: joana });
    expect(await tentar(ana, SOLICITAR, [venda, NO_NOME, chave("nota")])).toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("não tem CPF/CNPJ no cadastro") });
    await valor(ana, SALVAR, [joana, JSON.stringify({ documento: cpf("529982955") }), "CPF para a nota fiscal da venda", null]);
    expect(await tentar(ana, SOLICITAR, [venda, NO_NOME, chave("nota")])).toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("não tem o endereço completo") });
    // Dados mínimos: o endereço só fica guardado com a finalidade que o pede (aqui, a nota fiscal). As finalidades vão
    // inteiras a cada gravação (a lista substitui a anterior): quem completa o cadastro manda as atuais mais "nota_fiscal".
    expect(await tentar(ana, SALVAR, [joana, JSON.stringify({ endereco: ENDERECO }), "Endereço para a nota fiscal da venda", null]))
      .toMatchObject({ codigo: "22023", mensagem: expect.stringContaining("Endereço só fica guardado para entrega, Ora Connect, financiamento ou nota fiscal") });
    await valor(ana, SALVAR, [joana, JSON.stringify({ endereco: ENDERECO, finalidades: ["nota_fiscal"] }), "Endereço para a nota fiscal da venda", null]);
    const doPedido = chave("nota");
    const pedido = await valor<string>(ana, SOLICITAR, [venda, NO_NOME, doPedido]);
    expect(await valor<string>(ana, SOLICITAR, [venda, NO_NOME, doPedido])).toBe(pedido); // o mesmo clique, repetido
    expect(await tentar(ana, SOLICITAR, [venda, NO_NOME, chave("nota")])).toMatchObject({ codigo: "OR014" }); // outro pedido para a mesma venda

    // 4. O dono vê a contagem e aprova; a vendedora não vê a fila nem aprova. Aprovada, a nota segue na conta até a emissão.
    expect(await notasNaFila()).toBe(antes + 1);
    expect(Object.keys(await valor<Record<string, number>>(ana, PENDENCIAS))).not.toContain("notas");
    expect(await tentar(ana, "select public.notas_decidir($1, true, null) as v", [pedido])).toMatchObject({ codigo: "P0002" });
    expect(await valor<string>(dono, "select public.notas_decidir($1, true, null) as v", [pedido])).toBe("aprovada");
    expect(await notasNaFila()).toBe(antes + 1);
    expect(await valor<Record<string, unknown>>(dono, "select public.notas_dados_para_emitir($1) as v", [pedido]))
      .toMatchObject({ nome: "Joana Nota Teste", documento: cpf("529982955"), endereco: ENDERECO, cliente: joana });
    // O que a tela "Dados para emitir" lê, com a sessão de quem abre: o dono lê tudo; a gerente da loja B, nada da venda.
    // (Revisão de 27/11: as mesmas colunas da leitura do comprovante, com o troco, a entrada, o estorno e a devolução.)
    const fatos = (s: Sessao) => comoUsuario(db, s, async () => ({
      venda: (await db.query(
        "select numero::int, situacao, total_centavos::int as total, troco_centavos::int as troco, a_receber_centavos::int as a_receber, devolvido_centavos::int as devolvido from public.vendas where id = $1",
        [venda])).rows,
      itens: (await db.query("select variante_id, tipo, quantidade::int, preco_unitario_centavos::int as unitario from public.venda_itens where venda_id = $1", [venda])).rows,
      pagamentos: (await db.query(
        "select meio, valor_centavos::int as valor, entrada_centavos::int as entrada, situacao, parcelas, entrada_do_financiamento, acrescimo_cliente_centavos from public.venda_pagamentos where venda_id = $1",
        [venda])).rows,
      devolucoes: (await db.query("select id from public.venda_devolucoes where venda_id = $1", [venda])).rows,
      estornos: (await db.query("select id from public.estornos_externos where venda_id = $1", [venda])).rows,
      variantes: (await db.query("select sku, nome from public.variantes where id = $1", [cat.capa])).rows,
      loja: (await db.query("select cnpj, unidade_emissora_id from public.unidades where id = $1", [ids.lojaA])).rows,
      configuracao: (await db.query(
        "select inscricao_estadual, logradouro, numero from public.unidade_configuracoes where unidade_id = $1 and vigente_desde <= now() order by vigente_desde desc, id desc limit 1",
        [ids.lojaA])).rows,
    }));
    expect(await fatos(dono)).toMatchObject({
      venda: [{ situacao: "concluida", total: 7_900, troco: 0, a_receber: 0, devolvido: 0 }], itens: [{ variante_id: cat.capa, tipo: "acessorio", quantidade: 1, unitario: 7_900 }],
      pagamentos: [{ meio: "dinheiro", valor: 7_900, entrada: 0, situacao: "confirmado", parcelas: null, entrada_do_financiamento: false }], devolucoes: [], estornos: [],
      variantes: [{ sku: "ACE-0001" }], loja: [{ cnpj: cnpjA, unidade_emissora_id: null }], configuracao: [{ inscricao_estadual: "1234567890", logradouro: "Rua do Teste", numero: "100" }],
    });
    expect(await fatos(await naLoja(ids.gerenteB, ids.lojaB))).toMatchObject({ venda: [], itens: [], pagamentos: [], devolucoes: [], estornos: [], configuracao: [] });

    // 5. A emissão externa registrada pela chave: de outro CNPJ, recusada; a do CNPJ da loja vira NF-e 55, série 1, nº 955.
    expect(await tentar(dono, REGISTRAR, [pedido, chaveDaNfe(955, "11444777000161")])).toMatchObject({ codigo: "22023", mensagem: "A chave de acesso não é do CNPJ desta loja" });
    await valor(dono, REGISTRAR, [pedido, chaveDaNfe(955)]);
    expect((await db.query("select situacao, origem_emissao, modelo, serie, numero_documento::int as numero, chave_acesso from public.notas_pedidos where id = $1", [pedido])).rows[0])
      .toEqual({ situacao: "emitida", origem_emissao: "manual_portal", modelo: "55", serie: 1, numero: 955, chave_acesso: chaveDaNfe(955) });
    expect(await notasNaFila()).toBe(antes);
    // O CPF guardado só para a emissão sai do pedido; os dados para emitir não abrem mais.
    expect((await db.query("select 1 from privado.notas_destinatarios where pedido_id = $1", [pedido])).rows).toHaveLength(0);
    expect(await tentar(dono, "select public.notas_dados_para_emitir($1) as v", [pedido])).toMatchObject({ codigo: "22023" });

    // 6. O PDF guardado e o envio SÓ na fila: o mesmo clique e outro clique com o envio na fila não duplicam; a trilha tem
    // um passo; ninguém reivindica o envio (o worker da Meta não existe aqui), e o número fica só no privado.
    const caminho = `${ids.organizacao}/${ids.lojaA}/${pedido}/00000000-0000-4000-a000-000000000955.pdf`;
    await comoUsuario(db, dono, () => db.query("insert into storage.objects (bucket_id, name, metadata) values ('notas', $1, $2)", [caminho, JSON.stringify({ size: 50_000, mimetype: "application/pdf" })]));
    await valor(dono, "select public.notas_anexar_documento($1, 'pdf', $2, $3, null) as v", [pedido, caminho, "c".repeat(64)]);
    const envio = await valor<string>(ana, ENVIAR, [pedido, "form:envio:0955", null]);
    expect(await valor<string>(ana, ENVIAR, [pedido, "form:envio:0955", null])).toBe(envio);
    expect(await valor<string>(dono, ENVIAR, [pedido, "form:envio:0956", null])).toBe(envio);
    expect((await db.query("select id, situacao, tentativas, provedor_id, destino_mascarado from public.whatsapp_envios where pedido_id = $1", [pedido])).rows)
      .toEqual([{ id: envio, situacao: "na_fila", tentativas: 0, provedor_id: null, destino_mascarado: "(41) •••••-0955" }]);
    expect((await db.query<{ situacao: string; origem: string }>("select situacao, origem from public.whatsapp_envio_eventos where envio_id = $1 order by id", [envio])).rows
      .map((e) => `${e.situacao}/${e.origem}`)).toEqual(["na_fila/pedido"]);
    expect((await db.query("select telefone from privado.whatsapp_destinos where envio_id = $1", [envio])).rows).toEqual([{ telefone: "41987650955" }]);
  });
});

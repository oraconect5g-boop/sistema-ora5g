// Inventário de autorização (prioridade 1 do diagnóstico de 10/11/2026; ORA-ORG-004 e ORA-QUAL-002).
// O aviso 0029 do Supabase lista as funções SECURITY DEFINER que qualquer usuário logado pode chamar
// pela API: 70 em 11/11 (48 + 6 do cadastro de lojas, L2, + 5 do cadastro do catálogo, L3a, + 4 dos preços, L3b,
// + 4 da importação do catálogo, L3c, + 3 da entrada de mercadoria, L4a). Elas rodam com poder total e cada uma confere sessão, loja e permissão por
// conta própria. Este teste monta um "mundo" fictício com objetos reais em duas lojas e tenta cada
// função como 13 tipos de atacante. Recusa = erro, ou resposta vazia numa leitura, e nada muda no
// banco. O teste lista as funções no próprio banco e falha se aparecer uma nova sem casos aqui.
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cnpj, comDigitoLuhn, comoUsuario, criarBanco, type Sessao } from "./banco-de-teste";
import { ids, montarCenario, RAIZ } from "./cenario";
import { cat, itens, montarCatalogo } from "./cenario-catalogo";

let db: PGlite;
let contador = 0;
const chave = (prefixo: string) => `${prefixo}:${++contador}`;
const novaSessao = (usuario: string): Sessao => ({ usuario, sessao: `47000000-0000-4000-8000-${String(++contador).padStart(12, "0")}` });

async function naLoja(usuario: string, unidade: string): Promise<Sessao> {
  const s = novaSessao(usuario);
  await comoUsuario(db, s, () => db.query("select public.selecionar_unidade($1)", [unidade]));
  return s;
}
const valor = async <T>(s: Sessao, sql: string, params: unknown[] = []) =>
  comoUsuario(db, s, async () => (await db.query<{ v: T }>(sql, params)).rows[0]?.v as T, { criarSessao: false });
const servico = async <T>(acao: () => Promise<T>) => {
  await db.exec("set role service_role");
  try { return await acao(); } finally { await db.exec("reset role"); }
};

// ---------------------------------------------------------------------------------------------
// Atacantes. "Identidade": quem não tem acesso válido algum (ou só um papel sem permissão).
// "Objeto": vendedor da loja A, com sessão válida, mirando o que não é dele.
// ---------------------------------------------------------------------------------------------
type Rodar = <T>(acao: () => Promise<T>) => Promise<T>;
async function comClaims<T>(claims: object | null, papel: "anon" | "authenticated", acao: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [claims ? JSON.stringify(claims) : ""]);
  await db.exec(`set role ${papel}`);
  try {
    return await acao();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}
const comSessao = (s: Sessao): Rodar => (acao) => comoUsuario(db, s, acao, { criarSessao: false });

type NomeAtacante =
  | "anonimo" | "semLogin" | "semSessao" | "sessaoEncerrada" | "foraDoTurno" | "bloqueado" | "vinculoEncerrado"
  | "semVinculo" | "tecnico" | "outraOrganizacao" | "outraLoja" | "outroVendedor" | "semPermissao";
const IDENTIDADE: NomeAtacante[] = ["anonimo", "semLogin", "semSessao", "sessaoEncerrada", "foraDoTurno", "bloqueado", "vinculoEncerrado", "semVinculo", "tecnico"];
const atacantes = {} as Record<NomeAtacante, Rodar>;

// ---------------------------------------------------------------------------------------------
// Alvos: objetos reais criados pelos donos legítimos. A = loja A (do vendedorAB), B = loja B.
// ---------------------------------------------------------------------------------------------
const alvo: Record<string, string> = {};
const CAMINHO_FOTO = `${ids.organizacao}/${cat.produtoCapa}/produto/${randomUUID()}.webp`;

function chaveDeAcesso(cnpj: string, numero: number) {
  const base = `432611${cnpj}65001${String(numero).padStart(9, "0")}112345678`;
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return base + String(resto < 2 ? 0 : 11 - resto);
}

async function montarMundo() {
  // Ora Connect habilitada e listas oficiais (fictícias), como nos testes do ADR-005.
  const admin = await naLoja(ids.administrador, ids.lojaA);
  for (const tipo of ["ativacao", "recarga", "portabilidade"]) {
    await valor(admin, "select public.connect_habilitar($1, true, 'Homologado com linha de teste (fictício)') as v", [tipo]);
  }
  await servico(() => db.query("select public.connect_worker_atualizar_referencias($1, 'plano', $2::jsonb)",
    [ids.organizacao, JSON.stringify([{ codigo: "99999", nome: "7 GB", valor_centavos: 4490 }])]));

  // Mais estoque: capas na loja B e dois aparelhos em cada loja para as vendas canceladas.
  await db.query("select privado.lancar_movimento($1, $2, 10, 'entrada_importacao', null, null, null, null, 'mundo:capaB')", [ids.lojaB, cat.capa]);
  const aparelho = async (unidade: string, final: string) => (await db.query<{ id: string }>(
    "select privado.registrar_item_serializado($1, $2, $3, null, null, 'entrada_importacao', $4) as id",
    [unidade, cat.aparelho, comDigitoLuhn(`3520990017${final}`), `mundo:${final}`])).rows[0]?.id ?? "";
  const aparelhoA = await aparelho(ids.lojaA, "1001");
  const aparelhoB = await aparelho(ids.lojaB, "1002");

  const vabA = await naLoja(ids.vendedorAB, ids.lojaA);
  const vabB = await naLoja(ids.vendedorAB, ids.lojaB);
  const donoA = await naLoja(ids.dono, ids.lojaA);
  const donoC = await naLoja(ids.dono, ids.lojaC);
  const gerB = await naLoja(ids.gerenteB, ids.lojaB);
  // Quem cancela também precisa do próprio caixa aberto na loja.
  for (const s of [donoA, gerB]) await valor(s, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);

  for (const [lado, s, aparelhoDaLoja, quemCancela] of [["A", vabA, aparelhoA, donoA], ["B", vabB, aparelhoB, gerB]] as const) {
    alvo[`caixa${lado}`] = await valor<string>(s, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    // Rascunho simples (adicionar, desconto, remover, concluir).
    alvo[`venda${lado}`] = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    alvo[`itemVenda${lado}`] = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [alvo[`venda${lado}`], cat.capa, chave("item")]);
    // Rascunho com pedido de aprovação de desconto.
    const vendaAprovacao = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    const itemAprovacao = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [vendaAprovacao, cat.capa, chave("item")]);
    await valor(s, "select public.aplicar_desconto($1, 500) as v", [itemAprovacao]);
    alvo[`aprovacao${lado}`] = await valor<string>(s, "select public.pedir_aprovacao($1, 'Cliente antigo') as v", [itemAprovacao]);
    // Venda concluída em dinheiro, com pedido de nota.
    alvo[`concluida${lado}`] = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    alvo[`itemConcluida${lado}`] = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [alvo[`concluida${lado}`], cat.capa, chave("item")]);
    await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [alvo[`concluida${lado}`], JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]), chave("concluir")]);
    alvo[`nota${lado}`] = await valor<string>(s, "select public.notas_solicitar($1, '{}'::jsonb, $2) as v", [alvo[`concluida${lado}`], chave("nota")]);
    // Venda de aparelho no Pix cancelada pela gerência: retorno a conferir e estorno a confirmar.
    const vendaPix = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    await valor(s, "select public.adicionar_item($1, $2, $3, 1, $4) as v", [vendaPix, cat.aparelho, aparelhoDaLoja, chave("item")]);
    const precoAparelho = lado === "A" ? 149_900 : 139_900;
    await valor(s, "select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3) as v", [vendaPix, JSON.stringify([{ meio: "pix_direto", valor: precoAparelho, comprovante: "E2E-FICTICIO-1" }]), chave("concluir")]);
    await valor(quemCancela, "select public.cancelar_venda($1, 'Cliente desistiu') as v", [vendaPix]);
    alvo[`retorno${lado}`] = (await db.query<{ id: string }>("select id from public.venda_retornos where venda_id = $1 and situacao = 'pendente'", [vendaPix])).rows[0]?.id ?? "";
    alvo[`estorno${lado}`] = (await db.query<{ id: string }>("select id from public.estornos_externos where venda_id = $1 and situacao = 'pendente'", [vendaPix])).rows[0]?.id ?? "";
    // Reserva e operação da Connect do vendedorAB.
    alvo[`reserva${lado}`] = await valor<string>(s, "select public.reservar_estoque($1, 1, null, $2, 'pdv', 30) as v", [cat.capa, chave("reserva")]);
    alvo[`operacao${lado}`] = await valor<string>(s, "select public.connect_registrar('recarga', $1::jsonb, $2) as v",
      [JSON.stringify({ linha: lado === "A" ? "51988887777" : "51977776666", plano: 99999, metodo: "LINK" }), chave("op")]);
    // Caixa fechado, à espera da conferência.
    await comoUsuario(db, s, () => db.query("select * from public.fechar_caixa(0, 'Fechamento do teste de autorização')"), { criarSessao: false });
  }

  // Transferências: A = a loja A é a origem (separar, enviar, encerrar) ou o destino (receber).
  const solicitar = (s: Sessao, origem: string, destino: string) =>
    valor<string>(s, "select public.transferencia_solicitar($1, $2, $3, 1, 'Reposição', $4) as v", [origem, destino, cat.capa, chave("t")]);
  const separar = (s: Sessao, t: string) => valor(s, "select public.transferencia_separar($1, '{}'::uuid[]) as v", [t]);
  const enviar = (s: Sessao, t: string) => valor(s, "select public.transferencia_enviar($1) as v", [t]);
  alvo.transfSolicitadaA = await solicitar(gerB, ids.lojaA, ids.lojaB);
  alvo.transfSolicitadaB = await solicitar(donoC, ids.lojaB, ids.lojaC);
  alvo.transfSeparadaA = await solicitar(gerB, ids.lojaA, ids.lojaB);
  await separar(donoA, alvo.transfSeparadaA);
  alvo.transfSeparadaB = await solicitar(donoC, ids.lojaB, ids.lojaC);
  await separar(gerB, alvo.transfSeparadaB);
  alvo.transfEnviadaA = await solicitar(donoA, ids.lojaB, ids.lojaA);
  await separar(gerB, alvo.transfEnviadaA);
  await enviar(gerB, alvo.transfEnviadaA);
  alvo.transfEnviadaB = await solicitar(gerB, ids.lojaA, ids.lojaB);
  await separar(donoA, alvo.transfEnviadaB);
  await enviar(donoA, alvo.transfEnviadaB);

  // Equipe: convite pendente e o vínculo do vendedorAB na loja A.
  alvo.convite = await valor<string>(donoA, "select public.convidar_pessoa($1, 'Pessoa Convidada', 'convidada@teste.invalid', 'vendedor', $2::uuid[], 'Contratação') as v",
    [ids.organizacao, [ids.lojaA]]);
  alvo.vinculoAB = (await db.query<{ id: string }>("select id from public.vinculos where usuario_id = $1 and unidade_id = $2 and fim is null", [ids.vendedorAB, ids.lojaA])).rows[0]?.id ?? "";

  // Arquivo de foto já no Storage, à espera do registro.
  await db.query("insert into storage.objects (bucket_id, name, metadata) values ('produtos', $1, $2)",
    [CAMINHO_FOTO, JSON.stringify({ size: 120_000, mimetype: "image/webp" })]);

  // Atacantes com sessão. Os que perderam o acesso tinham escolhido a loja antes.
  const encerrada = await naLoja(ids.vendedorAB, ids.lojaA);
  await db.query("delete from auth.sessions where id = $1", [encerrada.sessao]);
  const antiga = await naLoja(ids.vendedorAB, ids.lojaA);
  await db.query("update auth.sessions set created_at = now() - interval '13 hours' where id = $1", [antiga.sessao]);
  const bloqueado = await naLoja(ids.bloqueado, ids.lojaA);
  await db.query("update public.perfis_usuario set status = 'bloqueado' where id = $1", [ids.bloqueado]);

  atacantes.anonimo = (acao) => comClaims(null, "anon", acao);
  atacantes.semLogin = (acao) => comClaims({ role: "authenticated" }, "authenticated", acao);
  atacantes.semSessao = (acao) => comClaims({ sub: ids.vendedorAB, role: "authenticated" }, "authenticated", acao);
  atacantes.sessaoEncerrada = comSessao(encerrada);
  atacantes.foraDoTurno = comSessao(antiga);
  atacantes.bloqueado = comSessao(bloqueado);
  atacantes.vinculoEncerrado = comSessao(await naLoja(ids.encerrado, ids.lojaA));
  atacantes.semVinculo = comSessao(await naLoja(ids.semVinculo, ids.lojaA));
  atacantes.tecnico = comSessao(await naLoja(ids.tecnico, ids.assistencia));
  atacantes.outraOrganizacao = comSessao(await naLoja(ids.donoOutraOrg, ids.lojaOutraOrg));
  const vendedorA = comSessao(await naLoja(ids.vendedorA, ids.lojaA));
  atacantes.outraLoja = vendedorA;
  atacantes.outroVendedor = vendedorA;
  atacantes.semPermissao = vendedorA;
}

// ---------------------------------------------------------------------------------------------
// Catálogo das 70 funções. Cada chamada usa argumentos válidos, para a recusa vir do controle de
// acesso e não de um parâmetro errado. "A": alvos da loja A (do vendedorAB); "B": da loja B.
//   identidade: os 9 atacantes sem acesso válido, sempre contra os alvos da loja A;
//   outraOrganizacao: dono de outra rede, contra a loja A (omitido onde a função só age no
//     contexto do próprio usuário, que para ele é legítimo);
//   outraLoja: vendedor da loja A contra os alvos da loja B;
//   outroVendedor: vendedor da loja A contra o que é do vendedorAB na mesma loja;
//   semPermissao: vendedor da loja A numa função que exige permissão que o vendedor não tem.
// ---------------------------------------------------------------------------------------------
type Chamada = [string, unknown[]];
type Caso = {
  leitura?: boolean;
  A: () => Chamada;
  B?: () => Chamada;
  outraOrganizacao?: boolean;
  outroVendedor?: boolean;
  semPermissao?: boolean;
  // Atacantes para quem a chamada é legítima no próprio contexto (ex.: o técnico lendo a própria loja).
  contextoProprio?: NomeAtacante[];
  // Códigos de domínio que também significam "não é seu" (ex.: OR003, item de outra loja).
  outrosCodigosDeRecusa?: string[];
};
const pagamentoDinheiro = JSON.stringify([{ meio: "dinheiro", valor: 7_900 }]);
const cnpjLojaA = async () => (await db.query<{ cnpj: string }>("select cnpj from public.unidades where id = $1", [ids.lojaA])).rows[0]?.cnpj ?? "";
let chaveNotaA = "";

const CASOS: Record<string, Caso> = {
  "abrir_caixa(bigint,text)": { A: () => ["select public.abrir_caixa(10000, $1)", [chave("ataque")]], outraOrganizacao: false },
  "adicionar_item(uuid,uuid,uuid,integer,text)": {
    A: () => ["select public.adicionar_item($1, $2, null, 1, $3)", [alvo.vendaA, cat.capa, chave("ataque")]],
    B: () => ["select public.adicionar_item($1, $2, null, 1, $3)", [alvo.vendaB, cat.capa, chave("ataque")]], outroVendedor: true,
  },
  "alterar_situacao_pessoa(uuid,text,text)": { A: () => ["select public.alterar_situacao_pessoa($1, 'bloqueado', 'Tentativa de bloqueio')", [ids.vendedorAB]], semPermissao: true },
  "aplicar_desconto(uuid,bigint)": {
    A: () => ["select public.aplicar_desconto($1, 100)", [alvo.itemVendaA]], B: () => ["select public.aplicar_desconto($1, 100)", [alvo.itemVendaB]], outroVendedor: true,
  },
  // Catálogo pela tela (L3a): catalogo.gerir na rede; política de desconto só com preco.alterar.
  "catalogo_definir_politica_desconto(uuid,integer,integer,text)": {
    A: () => ["select public.catalogo_definir_politica_desconto($1, 1000, 500, 'Tentativa')", [cat.celulares]], semPermissao: true,
  },
  "catalogo_salvar_categoria(uuid,uuid,text,boolean,text)": {
    A: () => ["select public.catalogo_salvar_categoria($1, null, 'Categoria intrusa', null, 'Tentativa')", [ids.organizacao]], semPermissao: true,
  },
  "catalogo_salvar_marca(uuid,uuid,text,text)": {
    A: () => ["select public.catalogo_salvar_marca($1, null, 'Marca intrusa', 'Tentativa')", [ids.organizacao]], semPermissao: true,
  },
  "catalogo_salvar_produto(uuid,uuid,text,text,uuid,uuid,text,text,boolean,boolean,text,text)": {
    A: () => ["select public.catalogo_salvar_produto($1, null, 'acessorio', 'Produto intruso', $2, null, null, null, false, null, $3, 'Tentativa')",
      [ids.organizacao, cat.acessorios, chave("ataque:produto")]],
    semPermissao: true,
  },
  "catalogo_salvar_variante(uuid,uuid,text,text,text,text,text,integer,boolean,text)": {
    A: () => ["select public.catalogo_salvar_variante($1, null, $2, 'Variação intrusa', null, null, null, 0, null, 'Tentativa')", [cat.produtoCapa, `INV-${++contador}`]],
    semPermissao: true,
  },
  "cancelar_convite(uuid,text)": { A: () => ["select public.cancelar_convite($1, 'Tentativa')", [alvo.convite]], semPermissao: true },
  "cancelar_venda(uuid,text)": {
    A: () => ["select public.cancelar_venda($1, 'Tentativa')", [alvo.concluidaA]], B: () => ["select public.cancelar_venda($1, 'Tentativa')", [alvo.concluidaB]], semPermissao: true,
  },
  "concluir_venda(uuid,jsonb,jsonb,text)": {
    A: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaA, pagamentoDinheiro, chave("ataque")]],
    B: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaB, pagamentoDinheiro, chave("ataque")]], outroVendedor: true,
  },
  "conferir_caixa(uuid,text)": {
    A: () => ["select public.conferir_caixa($1, null)", [alvo.caixaA]], B: () => ["select public.conferir_caixa($1, null)", [alvo.caixaB]], semPermissao: true,
  },
  "conferir_item(uuid)": { A: () => ["select public.conferir_item($1)", [itens.a2]], B: () => ["select public.conferir_item($1)", [itens.b1]] },
  "conferir_retorno(uuid,boolean,text,text,text)": {
    A: () => ["select public.conferir_retorno($1, false, null, null, 'Tentativa')", [alvo.retornoA]],
    B: () => ["select public.conferir_retorno($1, false, null, null, 'Tentativa')", [alvo.retornoB]], semPermissao: true,
  },
  "confirmar_estorno_externo(uuid,text,text)": {
    A: () => ["select public.confirmar_estorno_externo($1, 'EST-123456', null)", [alvo.estornoA]],
    B: () => ["select public.confirmar_estorno_externo($1, 'EST-123456', null)", [alvo.estornoB]], semPermissao: true,
  },
  "connect_cancelar(uuid,text)": {
    A: () => ["select public.connect_cancelar($1, 'Tentativa')", [alvo.operacaoA]], B: () => ["select public.connect_cancelar($1, 'Tentativa')", [alvo.operacaoB]], outroVendedor: true,
  },
  "connect_habilitar(text,boolean,text)": { A: () => ["select public.connect_habilitar('recarga', false, 'Tentativa de desligar')", []], outraOrganizacao: false, semPermissao: true },
  "connect_registrar(text,jsonb,text)": {
    A: () => ["select public.connect_registrar('recarga', $1::jsonb, $2)", [JSON.stringify({ linha: "51966665555", plano: 99999, metodo: "LINK" }), chave("ataque")]], outraOrganizacao: false,
  },
  "connect_resolver(uuid,text,text)": {
    A: () => ["select public.connect_resolver($1, 'confirmada', 'Tentativa de confirmar sem prova')", [alvo.operacaoA]],
    B: () => ["select public.connect_resolver($1, 'confirmada', 'Tentativa de confirmar sem prova')", [alvo.operacaoB]], semPermissao: true,
  },
  "convidar_pessoa(uuid,text,text,text,uuid[],text)": {
    A: () => ["select public.convidar_pessoa($1, 'Intrusa', 'intrusa@teste.invalid', 'gerente', $2::uuid[], 'Tentativa')", [ids.organizacao, [ids.lojaA]]], semPermissao: true,
  },
  "criar_venda(text)": { A: () => ["select public.criar_venda($1)", [chave("ataque")]], outraOrganizacao: false },
  "decidir_aprovacao(uuid,boolean,text)": {
    A: () => ["select public.decidir_aprovacao($1, true, 'Tentativa')", [alvo.aprovacaoA]], B: () => ["select public.decidir_aprovacao($1, true, 'Tentativa')", [alvo.aprovacaoB]], semPermissao: true,
  },
  "devolver_itens(uuid,jsonb,jsonb,text,text)": {
    A: () => ["select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Tentativa', $4)", [alvo.concluidaA, JSON.stringify([{ item: alvo.itemConcluidaA, quantidade: 1 }]), pagamentoDinheiro, chave("ataque")]],
    B: () => ["select public.devolver_itens($1, $2::jsonb, $3::jsonb, 'Tentativa', $4)", [alvo.concluidaB, JSON.stringify([{ item: alvo.itemConcluidaB, quantidade: 1 }]), pagamentoDinheiro, chave("ataque")]],
    semPermissao: true,
  },
  "disponibilidade_na_rede(uuid)": { leitura: true, A: () => ["select * from public.disponibilidade_na_rede($1)", [cat.aparelho]] },
  "encerrar_vinculo(uuid,text)": { A: () => ["select public.encerrar_vinculo($1, 'Tentativa')", [alvo.vinculoAB]], semPermissao: true },
  // Entrada de mercadoria (L4a): estoque.receber na loja (dono e gerente; o gerente na loja do turno).
  "estoque_estornar_entrada(uuid,text)": {
    A: () => ["select public.estoque_estornar_entrada($1, 'Tentativa')", [alvo.entradaA]], B: () => ["select public.estoque_estornar_entrada($1, 'Tentativa')", [alvo.entradaB]],
    semPermissao: true,
  },
  "estoque_na_rede(uuid)": { leitura: true, A: () => ["select * from public.estoque_na_rede($1)", [cat.aparelho]] },
  "estoque_registrar_entrada(uuid,text,uuid,text,jsonb,text,text)": {
    A: () => ["select public.estoque_registrar_entrada($1, 'carga_inicial', null, null, $2::jsonb, $3, 'Tentativa')",
      [ids.lojaA, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque:entrada")]],
    B: () => ["select public.estoque_registrar_entrada($1, 'carga_inicial', null, null, $2::jsonb, $3, 'Tentativa')",
      [ids.lojaB, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque:entrada")]],
    semPermissao: true,
  },
  "fechar_caixa(bigint,text)": { A: () => ["select * from public.fechar_caixa(0, 'Tentativa')", []], outraOrganizacao: false },
  "fiscal_definir_politica(integer,text)": { A: () => ["select public.fiscal_definir_politica(30, 'Tentativa')", []], outraOrganizacao: false, semPermissao: true },
  // Importação do catálogo (L3c): importacao.executar gera a prévia; importacao.aprovar aplica e desfaz.
  "fornecedor_salvar(uuid,uuid,text,text,text,boolean,text)": {
    A: () => ["select public.fornecedor_salvar($1, null, 'Fornecedor intruso', null, null, null, 'Tentativa')", [ids.organizacao]], semPermissao: true,
  },
  "importacao_aplicar(uuid,text)": { A: () => ["select public.importacao_aplicar($1, 'Tentativa')", [alvo.importacaoPrevia]], semPermissao: true },
  "importacao_catalogo_previa(uuid,text,text,jsonb,jsonb)": {
    A: () => ["select public.importacao_catalogo_previa($1, 'ataque.csv', $2, '{}'::jsonb, $3::jsonb)",
      [ids.organizacao, "a".repeat(64), JSON.stringify([{ numero: 2, sku: "ATQ-1", nome: "Ataque", tipo: "acessorio", categoria: "Ataque", erros: [] }])]],
    semPermissao: true,
  },
  "importacao_descartar(uuid,text)": { A: () => ["select public.importacao_descartar($1, 'Tentativa')", [alvo.importacaoPrevia]], semPermissao: true },
  "importacao_desfazer(uuid,text)": { A: () => ["select public.importacao_desfazer($1, 'Tentativa')", [alvo.importacaoAplicada]], semPermissao: true },
  "liberar_reserva(uuid)": {
    A: () => ["select public.liberar_reserva($1)", [alvo.reservaA]], B: () => ["select public.liberar_reserva($1)", [alvo.reservaB]], outroVendedor: true,
  },
  // Lojas (L2): só quem tem unidades.gerir num vínculo de organização (dono e administrador).
  "loja_atualizar(uuid,text,text,text,text,text)": {
    A: () => ["select public.loja_atualizar($1, 'Loja A tomada', $2, 'PR', null, 'Tentativa')", [ids.lojaA, cnpj(RAIZ, "0001")]],
    B: () => ["select public.loja_atualizar($1, 'Loja B tomada', $2, 'PR', null, 'Tentativa')", [ids.lojaB, cnpj(RAIZ, "0002")]], semPermissao: true,
  },
  "loja_criar(uuid,text,text,text,text,text,text,uuid,text)": {
    A: () => ["select public.loja_criar($1, 'loja-intrusa', 'Loja intrusa', 'deposito', null, 'PR', null, null, 'Tentativa')", [ids.empresa]], semPermissao: true,
  },
  "loja_definir_configuracao(uuid,jsonb,timestamp with time zone,text)": {
    A: () => ["select public.loja_definir_configuracao($1, '{\"telefone\": \"4133339999\"}'::jsonb, null, 'Tentativa')", [ids.lojaA]],
    B: () => ["select public.loja_definir_configuracao($1, '{\"telefone\": \"4133339999\"}'::jsonb, null, 'Tentativa')", [ids.lojaB]], semPermissao: true,
  },
  "loja_definir_situacao(uuid,text,text)": {
    A: () => ["select public.loja_definir_situacao($1, 'inativa', 'Tentativa')", [ids.lojaA]],
    B: () => ["select public.loja_definir_situacao($1, 'inativa', 'Tentativa')", [ids.lojaB]], semPermissao: true,
  },
  "loja_historico(uuid)": {
    leitura: true, A: () => ["select * from public.loja_historico($1)", [ids.lojaA]], B: () => ["select * from public.loja_historico($1)", [ids.lojaB]], semPermissao: true,
  },
  "lojas_da_rede()": { leitura: true, A: () => ["select * from public.lojas_da_rede()", []], semPermissao: true },
  "movimentar_caixa(text,bigint,text,text)": { A: () => ["select public.movimentar_caixa('sangria', 100, 'Tentativa', $1)", [chave("ataque")]], outraOrganizacao: false },
  "notas_cancelar(uuid,text)": {
    A: () => ["select public.notas_cancelar($1, 'Tentativa')", [alvo.notaA]], B: () => ["select public.notas_cancelar($1, 'Tentativa')", [alvo.notaB]], semPermissao: true,
  },
  "notas_corrigir(uuid,jsonb)": {
    A: () => ["select public.notas_corrigir($1, $2::jsonb)", [alvo.notaA, JSON.stringify({ nome: "Outro Nome" })]],
    B: () => ["select public.notas_corrigir($1, $2::jsonb)", [alvo.notaB, JSON.stringify({ nome: "Outro Nome" })]], outroVendedor: true,
  },
  "notas_decidir(uuid,boolean,text)": {
    A: () => ["select public.notas_decidir($1, true, null)", [alvo.notaA]], B: () => ["select public.notas_decidir($1, true, null)", [alvo.notaB]], semPermissao: true,
  },
  "notas_registrar_emissao(uuid,text,text)": {
    A: () => ["select public.notas_registrar_emissao($1, $2, null)", [alvo.notaA, chaveNotaA]],
    B: () => ["select public.notas_registrar_emissao($1, $2, null)", [alvo.notaB, chaveNotaA]], semPermissao: true,
  },
  "notas_solicitar(uuid,jsonb,text)": {
    A: () => ["select public.notas_solicitar($1, '{}'::jsonb, $2)", [alvo.concluidaA, chave("ataque")]],
    B: () => ["select public.notas_solicitar($1, '{}'::jsonb, $2)", [alvo.concluidaB, chave("ataque")]], outroVendedor: true,
  },
  "pedir_aprovacao(uuid,text)": {
    A: () => ["select public.pedir_aprovacao($1, 'Tentativa')", [alvo.itemVendaA]], B: () => ["select public.pedir_aprovacao($1, 'Tentativa')", [alvo.itemVendaB]], outroVendedor: true,
  },
  // O catálogo (nomes e SKUs, sem custo) é visível a quem é da rede, como as políticas de produtos.
  "pendencias_de_foto()": { leitura: true, A: () => ["select * from public.pendencias_de_foto()", []], contextoProprio: ["tecnico"] },
  // Preços pela tela (L3b): preco.alterar na rede (preço geral) ou na loja (exceção).
  "preco_campanha(uuid,uuid,text,bigint,timestamp with time zone,timestamp with time zone,text)": {
    A: () => ["select public.preco_campanha($1, null, 'loja', 1, null, now() + interval '1 day', 'Tentativa')", [cat.capa]],
    B: () => ["select public.preco_campanha($1, $2, 'loja', 1, null, now() + interval '1 day', 'Tentativa')", [cat.capa, ids.lojaB]],
    semPermissao: true,
  },
  "preco_cancelar(uuid,text)": {
    A: () => ["select public.preco_cancelar($1, 'Tentativa')", [alvo.precoAgendadoA]], B: () => ["select public.preco_cancelar($1, 'Tentativa')", [alvo.precoAgendadoB]],
    semPermissao: true,
  },
  "preco_definir(uuid,uuid,text,bigint,timestamp with time zone,text)": {
    A: () => ["select public.preco_definir($1, null, 'loja', 1, null, 'Tentativa')", [cat.capa]],
    B: () => ["select public.preco_definir($1, $2, 'loja', 1, null, 'Tentativa')", [cat.capa, ids.lojaB]],
    semPermissao: true,
  },
  "preco_vigente(uuid,uuid,text,timestamp with time zone)": { leitura: true, A: () => ["select public.preco_vigente($1, $2, 'loja', now()) as v", [cat.aparelho, ids.lojaA]] },
  "precos_por_loja(uuid,text)": { leitura: true, A: () => ["select * from public.precos_por_loja($1, 'loja')", [cat.capa]] },
  "registrar_foto(uuid,uuid,text,integer,integer,boolean)": {
    A: () => ["select public.registrar_foto($1, null, $2, 1200, 1200, false)", [cat.produtoCapa, CAMINHO_FOTO]], semPermissao: true,
  },
  "remover_item(uuid)": { A: () => ["select public.remover_item($1)", [alvo.itemVendaA]], B: () => ["select public.remover_item($1)", [alvo.itemVendaB]], outroVendedor: true },
  "repetir_convite(uuid)": { A: () => ["select public.repetir_convite($1)", [alvo.convite]], semPermissao: true },
  "reservar_estoque(uuid,integer,uuid,text,text,integer)": {
    A: () => ["select public.reservar_estoque($1, 1, $2, $3, 'pdv', 30)", [cat.aparelho, itens.a2, chave("ataque")]],
    B: () => ["select public.reservar_estoque($1, 1, $2, $3, 'pdv', 30)", [cat.aparelho, itens.b1, chave("ataque")]], outrosCodigosDeRecusa: ["OR003"],
  },
  "selecionar_unidade(uuid)": { A: () => ["select public.selecionar_unidade($1) as v", [ids.lojaA]], B: () => ["select public.selecionar_unidade($1) as v", [ids.lojaB]] },
  "situacao_da_sessao()": { leitura: true, A: () => ["select * from public.situacao_da_sessao()", []], outraOrganizacao: false, contextoProprio: ["tecnico"] },
  "tem_permissao(text,uuid)": {
    leitura: true, A: () => ["select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaA]], B: () => ["select public.tem_permissao('venda.registrar', $1) as v", [ids.lojaB]],
  },
  "transferencia_encerrar(uuid,text,text)": {
    A: () => ["select public.transferencia_encerrar($1, 'cancelada', 'Tentativa')", [alvo.transfSolicitadaA]],
    B: () => ["select public.transferencia_encerrar($1, 'cancelada', 'Tentativa')", [alvo.transfSolicitadaB]], semPermissao: true,
  },
  "transferencia_enviar(uuid)": {
    A: () => ["select public.transferencia_enviar($1)", [alvo.transfSeparadaA]], B: () => ["select public.transferencia_enviar($1)", [alvo.transfSeparadaB]], semPermissao: true,
  },
  "transferencia_receber(uuid,text[],integer,text)": {
    A: () => ["select public.transferencia_receber($1, '{}'::text[], 1, null)", [alvo.transfEnviadaA]],
    B: () => ["select public.transferencia_receber($1, '{}'::text[], 1, null)", [alvo.transfEnviadaB]], semPermissao: true,
  },
  "transferencia_separar(uuid,uuid[])": {
    A: () => ["select public.transferencia_separar($1, '{}'::uuid[])", [alvo.transfSolicitadaA]],
    B: () => ["select public.transferencia_separar($1, '{}'::uuid[])", [alvo.transfSolicitadaB]], semPermissao: true,
  },
  // Pedir é de quem consulta estoque na origem ou no destino (ADR-007 §3); fora das duas lojas, não.
  "transferencia_solicitar(uuid,uuid,uuid,integer,text,text)": {
    A: () => ["select public.transferencia_solicitar($1, $2, $3, 1, 'Tentativa', $4)", [ids.lojaB, ids.lojaA, cat.capa, chave("ataque")]],
    B: () => ["select public.transferencia_solicitar($1, $2, $3, 1, 'Tentativa', $4)", [ids.lojaB, ids.lojaC, cat.capa, chave("ataque")]],
  },
  "unidade_atual()": { leitura: true, A: () => ["select public.unidade_atual() as v", []], outraOrganizacao: false, contextoProprio: ["tecnico"] },
  "vincular_pessoa(uuid,uuid,text,uuid,text)": {
    A: () => ["select public.vincular_pessoa($1, $2, 'gerente', $3, 'Tentativa de se promover')", [ids.vendedorA, ids.organizacao, ids.lojaA]], semPermissao: true,
  },
};

// ---------------------------------------------------------------------------------------------
// Execução de uma tentativa: savepoint dentro da sessão do atacante; impressão digital do banco
// antes e depois (só a auditoria pode crescer, e só com registros de recusa).
// ---------------------------------------------------------------------------------------------
type Resultado = { codigo: string | null; linhas: Record<string, unknown>[] };
async function tentar(rodar: Rodar, [sql, params]: Chamada): Promise<Resultado> {
  return rodar(async () => {
    await db.exec("savepoint tentativa");
    try {
      const { rows } = await db.query<Record<string, unknown>>(sql, params);
      await db.exec("release savepoint tentativa");
      return { codigo: null, linhas: rows };
    } catch (e) {
      await db.exec("rollback to savepoint tentativa");
      await db.exec("release savepoint tentativa");
      return { codigo: (e as { code?: string }).code ?? "sem-codigo", linhas: [] };
    }
  });
}
const impressao = async () => (await db.query<{ v: string }>("select teste.impressao() as v")).rows[0]?.v;
const auditoriaDesde = async (marca: number) => (await db.query<{ acao: string }>("select acao from public.auditoria where id > $1 order by id", [marca])).rows.map((r) => r.acao);
const ultimaAuditoria = async () => Number((await db.query<{ v: string }>("select coalesce(max(id), 0) as v from public.auditoria")).rows[0]?.v ?? 0);

// Vazio numa leitura: nenhuma linha, ou uma linha só com nulos/falsos (tem_permissao, preco_vigente,
// unidade_atual). situacao_da_sessao descreve a própria sessão: vale se não mostrar loja nenhuma.
// "Na rede" pode listar as lojas da rede de quem pergunta, zeradas, mas nunca uma loja da rede atacada.
const LOJAS_DA_REDE_ATACADA = new Set([ids.lojaA, ids.lojaB, ids.lojaC, ids.online, ids.assistencia]);
function vazio(funcao: string, linhas: Record<string, unknown>[]) {
  if (linhas.length === 0) return true;
  if (funcao === "situacao_da_sessao()") return linhas.length === 1 && linhas[0]?.unidade_id == null;
  // A lista de lojas pode trazer as da rede de quem pergunta, nunca uma da rede atacada.
  if (funcao === "lojas_da_rede()") return linhas.every((l) => !LOJAS_DA_REDE_ATACADA.has(String(l.id)));
  if (funcao.endsWith("_na_rede(uuid)")) {
    return linhas.every((l) => !LOJAS_DA_REDE_ATACADA.has(String(l.unidade_id))
      && Object.values(l).every((v) => typeof v !== "number" || v === 0));
  }
  return linhas.length === 1 && Object.values(linhas[0] ?? {}).every((v) => v === null || v === false);
}
// Recusa de escrita: erro de acesso (42501 sem permissão, P0002 não encontrado para você). Exceção
// documentada: selecionar_unidade recusa a loja alheia devolvendo falso e registrando na auditoria.
const CODIGOS_DE_RECUSA = new Set(["42501", "P0002"]);
const AUDITORIA_DE_RECUSA = /^sessao\.(unidade_negada|fora_do_turno|de_outro_usuario)$/;

beforeAll(async () => {
  db = await criarBanco();
  await montarCenario(db);
  await montarCatalogo(db);
  await montarMundo();
  // Uma entrada de mercadoria em cada loja (gravadas pelo banco: só alvo, sem itens).
  for (const [chaveDoAlvo, loja] of [["entradaA", ids.lojaA], ["entradaB", ids.lojaB]] as const) {
    alvo[chaveDoAlvo] = (await db.query<{ id: string }>(
      "insert into public.entradas_estoque (organizacao_id, unidade_id, tipo, chave, conteudo, total_unidades, criado_por) values ($1, $2, 'carga_inicial', $3, 'mundo', 1, $4) returning id",
      [ids.organizacao, loja, `mundo:entrada:${chaveDoAlvo}`, ids.dono])).rows[0]?.id ?? "";
  }
  // Uma prévia e uma importação aplicada da rede A (gravadas pelo banco: só alvo, sem linhas).
  for (const [chave, situacao] of [["importacaoPrevia", "previa"], ["importacaoAplicada", "aplicada"]] as const) {
    alvo[chave] = (await db.query<{ id: string }>(
      "insert into public.importacoes (organizacao_id, arquivo_nome, arquivo_sha256, mapeamento, situacao, criado_por) values ($1, $2, $3, '{}'::jsonb, $4, $5) returning id",
      [ids.organizacao, `mundo-${situacao}.csv`, (situacao === "previa" ? "b" : "c").repeat(64), situacao, ids.administrador])).rows[0]?.id ?? "";
  }
  alvo.precoAgendadoA = (await db.query<{ id: string }>(
    "insert into public.precos (organizacao_id, variante_id, canal, valor_centavos, inicio, origem, motivo) values ($1, $2, 'online', 8900, now() + interval '2 days', 'manual', 'Mundo do teste') returning id",
    [ids.organizacao, cat.capa])).rows[0]?.id ?? "";
  alvo.precoAgendadoB = (await db.query<{ id: string }>(
    "insert into public.precos (organizacao_id, variante_id, unidade_id, canal, valor_centavos, inicio, origem, motivo) values ($1, $2, $3, 'loja', 7500, now() + interval '2 days', 'manual', 'Mundo do teste') returning id",
    [ids.organizacao, cat.capa, ids.lojaB])).rows[0]?.id ?? "";
  await db.query(`insert into public.unidade_configuracoes (organizacao_id, unidade_id, vigente_desde, telefone, motivo, criado_por)
    values ($1, $2, now() - interval '1 day', '4133330001', 'Mundo do teste', $4), ($1, $3, now() - interval '1 day', '4133330002', 'Mundo do teste', $4)`,
  [ids.organizacao, ids.lojaA, ids.lojaB, ids.dono]);
  chaveNotaA = chaveDeAcesso(await cnpjLojaA(), 4242);
  await db.exec(`
    create schema teste;
    -- Impressão digital de todas as tabelas de dados, menos a auditoria (que registra recusas).
    create function teste.impressao() returns text language plpgsql as $f$
    declare t record; parte text; tudo text := '';
    begin
      for t in select format('%I.%I', n.nspname, c.relname) as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname in ('public', 'privado', 'auth', 'storage') and c.relkind = 'r'
                 and format('%I.%I', n.nspname, c.relname) <> 'public.auditoria' order by 1 loop
        execute format('select coalesce(md5(string_agg(x::text, ''|'' order by x::text)), ''-'') from %s x', t.nome) into parte;
        tudo := tudo || t.nome || '=' || parte || ';';
      end loop;
      return md5(tudo);
    end $f$;
  `);
});
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("inventário: toda função SECURITY DEFINER exposta tem casos de recusa", () => {
  it("as funções que um usuário logado pode chamar são exatamente as do catálogo deste teste", async () => {
    const { rows } = await db.query<{ f: string }>(`
      select regexp_replace(p.oid::regprocedure::text, '^public\\.', '') as f from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prosecdef and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      order by 1`);
    const expostas = rows.map((r) => r.f);
    expect(expostas.filter((f) => !(f in CASOS)), "função nova exposta sem casos de recusa: acrescente ao CASOS").toEqual([]);
    expect(Object.keys(CASOS).filter((f) => !expostas.includes(f)), "caso de função que não existe mais").toEqual([]);
    expect(expostas).toHaveLength(70);
  });

  it("visitante anônimo não executa nenhuma função do esquema public; no privado só um gatilho, que não roda sozinho", async () => {
    const { rows } = await db.query<{ f: string; gatilho: boolean }>(`
      select p.oid::regprocedure::text as f, p.prorettype = 'trigger'::regtype as gatilho from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'privado'::regnamespace) and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    expect(rows).toEqual([{ f: "privado.auditoria_completar_organizacao()", gatilho: true }]);
  });
});

describe("cada função recusa quem não tem acesso", () => {
  for (const [funcao, caso] of Object.entries(CASOS)) {
    it(funcao, async () => {
      const tentativas: [NomeAtacante, () => Chamada][] = IDENTIDADE.filter((a) => !caso.contextoProprio?.includes(a)).map((a) => [a, caso.A]);
      if (caso.outraOrganizacao !== false) tentativas.push(["outraOrganizacao", caso.A]);
      if (caso.B) tentativas.push(["outraLoja", caso.B]);
      if (caso.outroVendedor) tentativas.push(["outroVendedor", caso.A]);
      if (caso.semPermissao) tentativas.push(["semPermissao", caso.A]);
      const falhas: string[] = [];
      for (const [atacante, chamada] of tentativas) {
        const antes = await impressao();
        const marca = await ultimaAuditoria();
        const r = await tentar(atacantes[atacante], chamada());
        const depois = await impressao();
        const novasNaAuditoria = await auditoriaDesde(marca);
        const descricao = `${atacante}: ${r.codigo ?? JSON.stringify(r.linhas)}`;
        if (atacante === "anonimo") {
          if (r.codigo !== "42501") falhas.push(`${descricao} (anônimo não pode nem executar)`);
          continue;
        }
        if (antes !== depois) falhas.push(`${descricao} (o banco mudou)`);
        if (novasNaAuditoria.some((acao) => !AUDITORIA_DE_RECUSA.test(acao))) falhas.push(`${descricao} (auditoria registrou ${novasNaAuditoria.join(", ")})`);
        if (r.codigo === null) {
          const aceitavel = caso.leitura ? vazio(funcao, r.linhas)
            : funcao === "selecionar_unidade(uuid)" && r.linhas[0]?.v === false && novasNaAuditoria.length > 0;
          if (!aceitavel) falhas.push(`${descricao} (não recusou)`);
        } else if (!CODIGOS_DE_RECUSA.has(r.codigo) && !caso.outrosCodigosDeRecusa?.includes(r.codigo)) {
          falhas.push(`${descricao} (recusou, mas por outro motivo que não o acesso)`);
        }
      }
      expect(falhas).toEqual([]);
    });
  }
});

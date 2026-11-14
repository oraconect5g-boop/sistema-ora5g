// Inventário de autorização (prioridade 1 do diagnóstico de 10/11/2026; ORA-ORG-004 e ORA-QUAL-002).
// O aviso 0029 do Supabase lista as funções SECURITY DEFINER que qualquer usuário logado pode chamar
// pela API: 145 em 14/11 (48 + 6 do cadastro de lojas, L2, + 5 do cadastro do catálogo, L3a, + 4 dos preços, L3b,
// + 4 da importação do catálogo, L3c, + 3 da entrada de mercadoria, L4a, + 5 do inventário, L4b, + 6 dos clientes, L5a,
// + 9 do funil e da agenda, L5b, + 4 da mesclagem e dos segmentos, L5c, + 4 das maquininhas e da conciliação, L7a,
// + 2 da leitura das entradas, R1, + 1 do nome no ranking, G1, + 2 das metas, G4b, + 3 das financeiras, L7b, + 3 da saída autorizada do caixa, L7c, + 6 das contas a pagar, L8a, + 1 das regras do bônus por meta, L9a, + 2 do fechamento do bônus, L9b, + 1 da correção do repasse das financeiras, B4, + 1 dos dados para emitir a nota, K1b, + 1 dos documentos da nota emitida, L10a, + 2 do envio da nota pelo WhatsApp, K1c, + 1 dos recebíveis por loja e adquirente, L8e, + 5 da ordem de serviço, L12a, + 3 do orçamento da OS, L12b, + 2 da cobrança e da entrega da OS, L12c, + 3 das peças da OS, L12d, + 1 dos relatórios da assistência, L12e, + 2 dos documentos da venda, L5d, + 2 da conciliação fiscal, L10b, + 2 do cancelamento e da correção da nota, L10c, + 1 do valor do estoque a custo, G3b; no L8b, a das categorias ganhou o parâmetro "entra no resultado"). Elas rodam com poder total e cada uma confere sessão, loja e permissão por
// conta própria. Este teste monta um "mundo" fictício com objetos reais em duas lojas e tenta cada
// função como 13 tipos de atacante. Recusa = erro, ou resposta vazia numa leitura, e nada muda no
// banco. O teste lista as funções no próprio banco e falha se aparecer uma nova sem casos aqui.
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { cnpj, comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
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
// Catálogo das 109 funções. Cada chamada usa argumentos válidos, para a recusa vir do controle de
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
  // Registro de consulta legítima no próprio contexto (a busca de cliente fica na auditoria mesmo vazia).
  auditoriaDaConsulta?: RegExp;
};
const CPF_DO_MUNDO = cpf("246813579");
const IMEI_INTRUSO = comDigitoLuhn("35209900700001");
const AMANHA = new Date(Date.now() + 86_400_000).toISOString();
// Conta a pagar que o atacante tenta lançar (L8a), com vencimento em 10 dias.
const contaIntrusa = (unidade: string) => JSON.stringify({
  unidade, categoria: alvo.categoriaPagar, descricao: "Conta intrusa", valor: 100, forma: "unica",
  vencimento: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10),
});
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
  // Clientes (L5a): o cliente é da rede, sem "outra loja"; o vendedor tem cliente.buscar e cliente.cadastrar.
  // Quem é de outra rede busca na própria (nada acha; a busca fica registrada) e não abre nem altera este.
  // Mesclagem e segmentos (L5c): só o dono. O vendedor da loja A é o "sem permissão"; o dono de outra rede
  // vê a própria lista (vazia) e não alcança os cadastros desta.
  "clientes_duplicados()": { leitura: true, A: () => ["select public.clientes_duplicados() as v", []], semPermissao: true },
  "clientes_marcar_diferentes(uuid,uuid,text)": {
    A: () => ["select public.clientes_marcar_diferentes($1, $2, 'Tentativa')", [alvo.clienteA, alvo.clienteA2]], semPermissao: true,
  },
  "clientes_mesclar(uuid,uuid,text)": { A: () => ["select public.clientes_mesclar($1, $2, 'Tentativa')", [alvo.clienteA, alvo.clienteA2]], semPermissao: true },
  "clientes_segmentos()": { leitura: true, A: () => ["select public.clientes_segmentos() as v", []], semPermissao: true },
  "cliente_buscar(text,text)": { leitura: true, A: () => ["select public.cliente_buscar('documento', $1) as v", [CPF_DO_MUNDO]], auditoriaDaConsulta: /^cliente\.busca$/ },
  "cliente_consentir(uuid,text,text,boolean,text)": { A: () => ["select public.cliente_consentir($1, 'whatsapp', 'ofertas', true, 'loja')", [alvo.clienteA]] },
  "cliente_ficha(uuid)": { A: () => ["select public.cliente_ficha($1) as v", [alvo.clienteA]] },
  "cliente_revelar(uuid,text)": { A: () => ["select public.cliente_revelar($1, 'documento') as v", [alvo.clienteA]] },
  "cliente_salvar(uuid,jsonb,text,text)": { A: () => ["select public.cliente_salvar($1, '{\"nome\": \"Tentativa\"}'::jsonb, 'Tentativa', null)", [alvo.clienteA]] },
  "concluir_venda(uuid,jsonb,jsonb,text)": {
    A: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaA, pagamentoDinheiro, chave("ataque")]],
    B: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaB, pagamentoDinheiro, chave("ataque")]], outroVendedor: true,
  },
  // Funil e agenda (L5b): quem atende conduz o que é seu na loja do turno; a gerência, a loja. Ler o próprio
  // funil ou a própria agenda (vazios) é legítimo para quem é de outra rede.
  "crm_agenda()": { leitura: true, A: () => ["select public.crm_agenda() as v", []] },
  "crm_funil()": { leitura: true, A: () => ["select public.crm_funil() as v", []] },
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
  // Leitura das entradas (R1): estoque.consultar na loja pedida (o vendedor lê as da própria loja, sem custo;
  // o custo só sai com custo.ver, provado em entrada-estoque.test.ts). Recusa por erro, nunca por lista vazia.
  "estoque_entrada(uuid,uuid,bigint)": {
    leitura: true, A: () => ["select public.estoque_entrada($1, $2, null) as v", [ids.lojaA, alvo.entradaA]], B: () => ["select public.estoque_entrada($1, $2, null) as v", [ids.lojaB, alvo.entradaB]],
  },
  "estoque_entradas(uuid,bigint,integer)": {
    leitura: true, A: () => ["select public.estoque_entradas($1, null, null) as v", [ids.lojaA]], B: () => ["select public.estoque_entradas($1, null, null) as v", [ids.lojaB]],
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
  "atividade_criar(jsonb,text)": {
    A: () => ["select public.atividade_criar($1::jsonb, $2)", [JSON.stringify({ tipo: "tarefa", descricao: "Tentativa", vence_em: AMANHA, oportunidade: alvo.oportunidadeA }), chave("ataque:atividade")]],
    B: () => ["select public.atividade_criar($1::jsonb, $2)", [JSON.stringify({ tipo: "tarefa", descricao: "Tentativa", vence_em: AMANHA, oportunidade: alvo.oportunidadeB }), chave("ataque:atividade")]],
    outroVendedor: true,
  },
  "atividade_encerrar(uuid,boolean,text)": {
    A: () => ["select public.atividade_encerrar($1, true, 'Tentativa')", [alvo.atividadeA]], B: () => ["select public.atividade_encerrar($1, true, 'Tentativa')", [alvo.atividadeB]],
    outroVendedor: true,
  },
  "importacao_aplicar(uuid,text,integer)": { A: () => ["select public.importacao_aplicar($1, 'Tentativa', 1)", [alvo.importacaoPrevia]], semPermissao: true },
  "importacao_catalogo_previa(uuid,text,text,jsonb,jsonb)": {
    A: () => ["select public.importacao_catalogo_previa($1, 'ataque.csv', $2, '{}'::jsonb, $3::jsonb)",
      [ids.organizacao, "a".repeat(64), JSON.stringify([{ numero: 2, sku: "ATQ-1", nome: "Ataque", tipo: "acessorio", categoria: "Ataque", erros: [] }])]],
    semPermissao: true,
  },
  "importacao_descartar(uuid,text)": { A: () => ["select public.importacao_descartar($1, 'Tentativa')", [alvo.importacaoPrevia]], semPermissao: true },
  "importacao_desfazer(uuid,text)": { A: () => ["select public.importacao_desfazer($1, 'Tentativa')", [alvo.importacaoAplicada]], semPermissao: true },
  // Inventário (L4b): conta e pede ajuste quem confere o estoque da loja (o vendedor também, na loja dele);
  // decide quem tem estoque.ajustar. Contra a loja B, o vendedor da loja A é recusado.
  "inventario_abrir(uuid,uuid[],text,text)": {
    A: () => ["select public.inventario_abrir($1, $2::uuid[], 'Tentativa', $3)", [ids.lojaA, [cat.capa], chave("ataque:inventario")]],
    B: () => ["select public.inventario_abrir($1, $2::uuid[], 'Tentativa', $3)", [ids.lojaB, [cat.capa], chave("ataque:inventario")]],
  },
  "inventario_cancelar(uuid,text)": {
    A: () => ["select public.inventario_cancelar($1, 'Tentativa')", [alvo.inventarioA]], B: () => ["select public.inventario_cancelar($1, 'Tentativa')", [alvo.inventarioB]],
  },
  "inventario_contar(uuid,uuid,integer,text[])": {
    A: () => ["select public.inventario_contar($1, $2, 1, null)", [alvo.inventarioA, cat.capa]], B: () => ["select public.inventario_contar($1, $2, 1, null)", [alvo.inventarioB, cat.capa]],
  },
  "inventario_decidir(uuid,boolean,text)": {
    A: () => ["select public.inventario_decidir($1, true, 'Tentativa')", [alvo.inventarioEnviadoA]], B: () => ["select public.inventario_decidir($1, true, 'Tentativa')", [alvo.inventarioEnviadoB]],
    semPermissao: true,
  },
  "inventario_enviar(uuid,text)": {
    A: () => ["select public.inventario_enviar($1, 'Tentativa')", [alvo.inventarioA]], B: () => ["select public.inventario_enviar($1, 'Tentativa')", [alvo.inventarioB]],
  },
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
  // Metas (G4b): definir exige metas.gerir na loja (dono e gerente); a equipe da loja só para quem vê ou
  // define as metas dela. O vendedor da loja A é o "sem permissão" nas duas.
  "metas_definir(uuid,uuid,date,jsonb,text)": {
    A: () => ["select public.metas_definir($1, null, date_trunc('month', now())::date, '{\"connect\": 10}'::jsonb, null)", [ids.lojaA]],
    B: () => ["select public.metas_definir($1, null, date_trunc('month', now())::date, '{\"connect\": 10}'::jsonb, null)", [ids.lojaB]], semPermissao: true,
  },
  "metas_equipe(uuid,date)": {
    leitura: true, A: () => ["select public.metas_equipe($1, date_trunc('month', now())::date) as v", [ids.lojaA]],
    B: () => ["select public.metas_equipe($1, date_trunc('month', now())::date) as v", [ids.lojaB]], semPermissao: true,
  },
  // Saída autorizada do caixa (L7c): pede quem tem caixa.abrir (no próprio caixa aberto); decide quem tem
  // caixa.conferir na loja (gerente e dono); cancela só quem pediu, com sessão válida.
  "caixa_pedir_saida(bigint,text,text)": { A: () => ["select public.caixa_pedir_saida(100, 'Tentativa de saída', $1)", [chave("ataque")]], outraOrganizacao: false },
  "caixa_decidir_saida(uuid,boolean,text)": {
    A: () => ["select public.caixa_decidir_saida($1, true, null)", [alvo.saidaA]], B: () => ["select public.caixa_decidir_saida($1, true, null)", [alvo.saidaB]], semPermissao: true,
  },
  "caixa_cancelar_saida(uuid)": {
    A: () => ["select public.caixa_cancelar_saida($1)", [alvo.saidaA]], B: () => ["select public.caixa_cancelar_saida($1)", [alvo.saidaB]], outroVendedor: true,
  },
  // Contas a pagar (L8a): o dono na rede e em todas as lojas, o gerente na loja dele (conta_pagar.gerir);
  // o vendedor da loja A é o "sem permissão". As categorias, só o dono.
  "conta_pagar_lancar(jsonb,text)": {
    A: () => ["select public.conta_pagar_lancar($1::jsonb, $2)", [contaIntrusa(ids.lojaA), chave("ataque")]],
    B: () => ["select public.conta_pagar_lancar($1::jsonb, $2)", [contaIntrusa(ids.lojaB), chave("ataque")]], semPermissao: true,
  },
  "conta_pagar_corrigir(uuid,jsonb,text)": {
    A: () => ["select public.conta_pagar_corrigir($1, '{\"valor\": 1}'::jsonb, 'Tentativa')", [alvo.contaPagarA]],
    B: () => ["select public.conta_pagar_corrigir($1, '{\"valor\": 1}'::jsonb, 'Tentativa')", [alvo.contaPagarB]], semPermissao: true,
  },
  "conta_pagar_pagar(uuid,date,bigint,text)": {
    A: () => ["select public.conta_pagar_pagar($1, current_date, 100, 'ATAQUE')", [alvo.contaPagarA]],
    B: () => ["select public.conta_pagar_pagar($1, current_date, 100, 'ATAQUE')", [alvo.contaPagarB]], semPermissao: true,
  },
  "conta_pagar_desfazer_pagamento(uuid,text)": {
    A: () => ["select public.conta_pagar_desfazer_pagamento($1, 'Tentativa')", [alvo.contaPagarA]],
    B: () => ["select public.conta_pagar_desfazer_pagamento($1, 'Tentativa')", [alvo.contaPagarB]], semPermissao: true,
  },
  "conta_pagar_cancelar(uuid,text,boolean)": {
    A: () => ["select public.conta_pagar_cancelar($1, 'Tentativa', true)", [alvo.contaPagarA]],
    B: () => ["select public.conta_pagar_cancelar($1, 'Tentativa', true)", [alvo.contaPagarB]], semPermissao: true,
  },
  "conta_pagar_categoria_salvar(uuid,text,boolean,boolean)": {
    A: () => ["select public.conta_pagar_categoria_salvar($1, 'Intrusa', null, false)", [alvo.categoriaPagar]], semPermissao: true,
  },
  // Bônus por meta (L9a): só o dono define as regras, na organização da loja do turno; o vendedor da
  // loja A é o "sem permissão". O dono de outra rede define as da própria rede (legítimo).
  "bonus_definir(date,jsonb,text)": {
    A: () => ["select public.bonus_definir(date_trunc('month', now())::date, '{\"connect\": [{\"a_partir_de\": 100, \"valor\": 1000}]}'::jsonb, null)", []],
    outraOrganizacao: false, semPermissao: true,
  },
  // Fechamento do bônus (L9b): envia quem confere a loja (bonus.conferir: o gerente, na dele, e o dono);
  // aprova só o dono (bonus.aprovar). O vendedor da loja A é o "sem permissão".
  "bonus_fechamento_aprovar(uuid,jsonb)": {
    A: () => ["select public.bonus_fechamento_aprovar($1, '{}'::jsonb)", [alvo.fechamentoA]],
    B: () => ["select public.bonus_fechamento_aprovar($1, '{}'::jsonb)", [alvo.fechamentoB]], semPermissao: true,
  },
  "bonus_fechamento_enviar(date,uuid,jsonb,jsonb)": {
    A: () => ["select public.bonus_fechamento_enviar((date_trunc('month', now()) - interval '1 month')::date, $1, '{}'::jsonb, null)", [ids.lojaA]],
    B: () => ["select public.bonus_fechamento_enviar((date_trunc('month', now()) - interval '1 month')::date, $1, '{}'::jsonb, null)", [ids.lojaB]], semPermissao: true,
  },
  "movimentar_caixa(text,bigint,text,text)": { A: () => ["select public.movimentar_caixa('sangria', 100, 'Tentativa', $1)", [chave("ataque")]], outraOrganizacao: false },
  // L10a (FISC-005): anexar o documento da nota é de quem aprova a nota na loja (nota.aprovar).
  "notas_anexar_documento(uuid,text,text,text,text)": {
    A: () => ["select public.notas_anexar_documento($1, 'pdf', $2, $3, null)", [alvo.notaA, `${ids.organizacao}/${ids.lojaA}/${alvo.notaA}/00000000-0000-4000-a000-000000000001.pdf`, "a".repeat(64)]],
    B: () => ["select public.notas_anexar_documento($1, 'pdf', $2, $3, null)", [alvo.notaB, `${ids.organizacao}/${ids.lojaB}/${alvo.notaB}/00000000-0000-4000-a000-000000000002.pdf`, "a".repeat(64)]], semPermissao: true,
  },
  // K1c (#76): pedir o envio da nota pelo WhatsApp (vendedor da venda ou quem aprova) e conferir o desconhecido (quem aprova).
  "nota_enviar_whatsapp(uuid,text,text)": {
    A: () => ["select public.nota_enviar_whatsapp($1, $2, null)", [alvo.notaA, chave("ataque")]],
    B: () => ["select public.nota_enviar_whatsapp($1, $2, null)", [alvo.notaB, chave("ataque")]], outroVendedor: true,
  },
  "whatsapp_envio_resolver(uuid,text)": {
    A: () => ["select public.whatsapp_envio_resolver($1, 'Tentativa')", [randomUUID()]], semPermissao: true, outraOrganizacao: false,
  },
  "notas_cancelar(uuid,text)": {
    A: () => ["select public.notas_cancelar($1, 'Tentativa')", [alvo.notaA]], B: () => ["select public.notas_cancelar($1, 'Tentativa')", [alvo.notaB]], semPermissao: true,
  },
  "notas_corrigir(uuid,jsonb)": {
    A: () => ["select public.notas_corrigir($1, $2::jsonb)", [alvo.notaA, JSON.stringify({ nome: "Outro Nome" })]],
    B: () => ["select public.notas_corrigir($1, $2::jsonb)", [alvo.notaB, JSON.stringify({ nome: "Outro Nome" })]], outroVendedor: true,
  },
  // K1b (#76): os dados do destinatário para emitir são de quem aprova a nota na loja (nota.aprovar).
  "notas_dados_para_emitir(uuid)": {
    A: () => ["select public.notas_dados_para_emitir($1)", [alvo.notaA]], B: () => ["select public.notas_dados_para_emitir($1)", [alvo.notaB]], semPermissao: true,
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
  "oportunidade_anotar(uuid,text)": {
    A: () => ["select public.oportunidade_anotar($1, 'Tentativa de anotar')", [alvo.oportunidadeA]], B: () => ["select public.oportunidade_anotar($1, 'Tentativa de anotar')", [alvo.oportunidadeB]],
    outroVendedor: true,
  },
  "oportunidade_atribuir(uuid,uuid,text)": {
    A: () => ["select public.oportunidade_atribuir($1, $2, 'Tentativa')", [alvo.oportunidadeA, ids.vendedorA]],
    B: () => ["select public.oportunidade_atribuir($1, $2, 'Tentativa')", [alvo.oportunidadeB, ids.vendedorA]], outroVendedor: true, semPermissao: true,
  },
  "oportunidade_detalhe(uuid)": {
    leitura: true, A: () => ["select public.oportunidade_detalhe($1) as v", [alvo.oportunidadeA]], B: () => ["select public.oportunidade_detalhe($1) as v", [alvo.oportunidadeB]],
    outroVendedor: true,
  },
  "oportunidade_mover(uuid,text,jsonb)": {
    A: () => ["select public.oportunidade_mover($1, 'contato', '{}'::jsonb)", [alvo.oportunidadeA]], B: () => ["select public.oportunidade_mover($1, 'contato', '{}'::jsonb)", [alvo.oportunidadeB]],
    outroVendedor: true,
  },
  "oportunidade_registrar(uuid,jsonb,text)": {
    A: () => ["select public.oportunidade_registrar($1, '{\"origem\": \"loja\", \"interesse\": \"Tentativa\"}'::jsonb, $2)", [alvo.clienteA, chave("ataque:oportunidade")]],
  },
  // Maquininhas e conciliação (L7a): da gerência da loja (terminal.gerir, pagamento.conciliar); o vendedor não.
  "pagamento_conciliar(uuid,text,bigint,date)": {
    A: () => ["select public.pagamento_conciliar($1, 'ATAQUE', 100, current_date)", [alvo.pagamentoA]],
    B: () => ["select public.pagamento_conciliar($1, 'ATAQUE', 100, current_date)", [alvo.pagamentoB]], semPermissao: true,
  },
  "pagamento_desconciliar(uuid,text)": {
    A: () => ["select public.pagamento_desconciliar($1, 'Tentativa')", [alvo.pagamentoA]], B: () => ["select public.pagamento_desconciliar($1, 'Tentativa')", [alvo.pagamentoB]],
    semPermissao: true,
  },
  // Financeiras (L7b): registrar e desfazer o repasse e a lista são da gerência da loja (pagamento.conciliar).
  "financeira_receber(uuid,text,bigint,date)": {
    A: () => ["select public.financeira_receber($1, 'ATAQUE', 100, current_date)", [alvo.contaReceberA]],
    B: () => ["select public.financeira_receber($1, 'ATAQUE', 100, current_date)", [alvo.contaReceberB]], semPermissao: true,
  },
  "financeira_desfazer_recebimento(uuid,text)": {
    A: () => ["select public.financeira_desfazer_recebimento($1, 'Tentativa')", [alvo.contaReceberA]],
    B: () => ["select public.financeira_desfazer_recebimento($1, 'Tentativa')", [alvo.contaReceberB]], semPermissao: true,
  },
  // Correção do repasse registrado (B4, #83): também só da gerência da loja; na conta do mundo (aberta) ninguém corrige.
  "financeira_corrigir_recebimento(uuid,text,bigint,date,text)": {
    A: () => ["select public.financeira_corrigir_recebimento($1, 'ATAQUE', 100, current_date, 'Tentativa')", [alvo.contaReceberA]],
    B: () => ["select public.financeira_corrigir_recebimento($1, 'ATAQUE', 100, current_date, 'Tentativa')", [alvo.contaReceberB]], semPermissao: true,
  },
  "financeiras_a_receber()": { leitura: true, A: () => ["select public.financeiras_a_receber() as v", []], semPermissao: true },
  "pagamentos_do_periodo(date,date)": { leitura: true, A: () => ["select public.pagamentos_do_periodo(current_date, current_date) as v", []], semPermissao: true },
  // Recebíveis por loja e adquirente (L8e): só quem concilia a loja; a loja de outro alcance é recusada (42501), sem resposta parcial.
  "recebiveis_painel(uuid,integer)": {
    leitura: true, A: () => ["select public.recebiveis_painel($1, 30) as v", [ids.lojaA]], B: () => ["select public.recebiveis_painel($1, 30) as v", [ids.lojaB]], semPermissao: true,
  },
  // Ordem de serviço (L12a): abrir é na loja do turno (sem "outra loja"); custódia, foto e contato só na loja da OS ou
  // na assistência para onde ela foi. O vendedor da loja A é o dono legítimo das OS da loja A: sem o caso "sem permissão".
  "os_abrir(jsonb,text)": {
    A: () => ["select public.os_abrir($1::jsonb, 'ataque:os:0001')", [JSON.stringify({ cliente: alvo.clienteA, aparelho: "Aparelho intruso", imei: IMEI_INTRUSO, defeito: "Defeito intruso", estado: "Estado intruso" })]],
  },
  "os_custodia(uuid,text,uuid,text)": {
    A: () => ["select public.os_custodia($1, 'enviar_ao_tecnico', $2, null)", [alvo.osA, ids.assistencia]], B: () => ["select public.os_custodia($1, 'enviar_ao_tecnico', $2, null)", [alvo.osB, ids.assistencia]],
  },
  "os_anexar_foto(uuid,text,text)": {
    A: () => ["select public.os_anexar_foto($1, $2, $3)", [alvo.osA, `${ids.organizacao}/${ids.lojaA}/${alvo.osA}/00000000-0000-4000-a000-000000000011.jpg`, "a".repeat(64)]],
    B: () => ["select public.os_anexar_foto($1, $2, $3)", [alvo.osB, `${ids.organizacao}/${ids.lojaB}/${alvo.osB}/00000000-0000-4000-a000-000000000012.jpg`, "a".repeat(64)]],
  },
  "os_assistencias()": { leitura: true, A: () => ["select public.os_assistencias() as v", []] },
  // Orçamento da OS (L12b): orçar e concluir são do técnico ou da gerência (o vendedor da loja A é recusado: "sem permissão");
  // registrar a resposta do cliente é da loja da OS (o vendedor da loja A é legítimo: sem o caso "sem permissão").
  "os_orcar(uuid,jsonb,text)": {
    A: () => ["select public.os_orcar($1, $2::jsonb, 'ataque:orcamento:0001')", [alvo.osA, JSON.stringify({ diagnostico: "Intruso", mao_de_obra: 100 })]],
    B: () => ["select public.os_orcar($1, $2::jsonb, 'ataque:orcamento:0002')", [alvo.osB, JSON.stringify({ diagnostico: "Intruso", mao_de_obra: 100 })]], semPermissao: true,
  },
  "os_responder_orcamento(uuid,text,text,text)": {
    A: () => ["select public.os_responder_orcamento($1, 'aprovado', 'loja', null)", [alvo.orcamentoA]], B: () => ["select public.os_responder_orcamento($1, 'aprovado', 'loja', null)", [alvo.orcamentoB]],
  },
  "os_concluir_servico(uuid,text)": {
    A: () => ["select public.os_concluir_servico($1, 'Intruso')", [alvo.osA]], B: () => ["select public.os_concluir_servico($1, 'Intruso')", [alvo.osB]], semPermissao: true,
  },
  "os_contato_whatsapp(uuid,text)": {
    A: () => ["select public.os_contato_whatsapp($1, 'comprovante')", [alvo.osA]], B: () => ["select public.os_contato_whatsapp($1, 'comprovante')", [alvo.osB]],
  },
  // Documentos da venda (L5d): anexar é de quem vendeu ou da gerência da loja ("outro vendedor": a venda do vendedorAB);
  // retirar é da gerência (o vendedor da loja A é recusado: "sem permissão").
  "venda_anexar_documento(uuid,text,text,text,text)": {
    A: () => ["select public.venda_anexar_documento($1, 'comprovante_assinado', null, $2, $3)", [alvo.concluidaA, `${ids.organizacao}/${ids.lojaA}/${alvo.concluidaA}/00000000-0000-4000-a000-000000000041.pdf`, "b".repeat(64)]],
    B: () => ["select public.venda_anexar_documento($1, 'comprovante_assinado', null, $2, $3)", [alvo.concluidaB, `${ids.organizacao}/${ids.lojaB}/${alvo.concluidaB}/00000000-0000-4000-a000-000000000042.pdf`, "b".repeat(64)]],
    outroVendedor: true,
  },
  "venda_retirar_anexo(uuid,text)": {
    A: () => ["select public.venda_retirar_anexo($1, 'Tentativa')", [alvo.anexoA]], B: () => ["select public.venda_retirar_anexo($1, 'Tentativa')", [alvo.anexoB]], semPermissao: true,
  },
  // Conciliação fiscal (L10b): ler e conferir divergência são de quem aprova nota (nota.aprovar); o vendedor da loja A é
  // recusado nas duas (a conferência confere a permissão antes de olhar se a divergência existe).
  "notas_conciliacao(date,date,uuid)": {
    leitura: true, A: () => ["select public.notas_conciliacao(date_trunc('month', now())::date, current_date, $1) as v", [ids.lojaA]],
    B: () => ["select public.notas_conciliacao(date_trunc('month', now())::date, current_date, $1) as v", [ids.lojaB]], semPermissao: true,
  },
  "notas_conferir_divergencia(uuid,text,text)": {
    A: () => ["select public.notas_conferir_divergencia($1, 'chave_fora_do_mes', 'Tentativa de conferência')", [alvo.notaA]],
    B: () => ["select public.notas_conferir_divergencia($1, 'chave_fora_do_mes', 'Tentativa de conferência')", [alvo.notaB]], semPermissao: true,
  },
  // Cancelamento no fisco e correção da chave (L10c): de quem aprova nota, na loja do pedido (o vendedor da loja A é
  // recusado antes de qualquer conferência da nota).
  "notas_registrar_cancelamento(uuid,text,text)": {
    A: () => ["select public.notas_registrar_cancelamento($1, '141260000654321', 'Tentativa de cancelamento intrusa')", [alvo.notaA]],
    B: () => ["select public.notas_registrar_cancelamento($1, '141260000654321', 'Tentativa de cancelamento intrusa')", [alvo.notaB]], semPermissao: true,
  },
  "notas_corrigir_chave(uuid,text,text)": {
    A: () => ["select public.notas_corrigir_chave($1, $2, 'Tentativa de correção intrusa')", [alvo.notaA, chaveNotaA]],
    B: () => ["select public.notas_corrigir_chave($1, $2, 'Tentativa de correção intrusa')", [alvo.notaB, chaveNotaA]], semPermissao: true,
  },
  // Valor do estoque a custo (G3b): de quem tem custo.ver e estoque.consultar; o vendedor da loja A é recusado.
  "estoque_valor_em_custo(uuid)": {
    leitura: true, A: () => ["select public.estoque_valor_em_custo($1) as v", [ids.lojaA]], B: () => ["select public.estoque_valor_em_custo($1) as v", [ids.lojaB]], semPermissao: true,
  },
  // Relatórios da assistência (L12e): de quem gere a assistência (os.gerir); o vendedor da loja A é recusado.
  "os_relatorio(date,date,uuid)": {
    leitura: true, A: () => ["select public.os_relatorio(date_trunc('month', now())::date, current_date, $1) as v", [ids.lojaA]],
    B: () => ["select public.os_relatorio(date_trunc('month', now())::date, current_date, $1) as v", [ids.lojaB]], semPermissao: true,
  },
  // Peças da OS (L12d): usar e devolver são do técnico ou da gerência (o vendedor da loja A é recusado: "sem permissão");
  // marcar a categoria como peça é de quem cadastra o catálogo.
  "os_usar_peca(uuid,uuid,integer,text,text)": {
    A: () => ["select public.os_usar_peca($1, $2, 1, 'Intruso', $3)", [alvo.osA, cat.capa, chave("ataque:peca")]],
    B: () => ["select public.os_usar_peca($1, $2, 1, 'Intruso', $3)", [alvo.osB, cat.capa, chave("ataque:peca")]], semPermissao: true,
  },
  "os_devolver_peca(uuid,text)": {
    A: () => ["select public.os_devolver_peca($1, 'Tentativa')", [alvo.pecaA]], B: () => ["select public.os_devolver_peca($1, 'Tentativa')", [alvo.pecaB]], semPermissao: true,
  },
  "catalogo_definir_peca_de_assistencia(uuid,uuid,boolean,text)": {
    A: () => ["select public.catalogo_definir_peca_de_assistencia($1, $2, true, 'Tentativa')", [ids.organizacao, cat.acessorios]], semPermissao: true,
  },
  // Cobrança e entrega da OS (L12c): cobrar é no carrinho de quem vende ("outro vendedor": o carrinho do vendedorAB);
  // entregar é da loja da OS (o vendedor da loja A é legítimo: sem os casos "outro vendedor" e "sem permissão").
  "os_cobrar(uuid,uuid,text)": {
    A: () => ["select public.os_cobrar($1, $2, $3)", [alvo.vendaA, alvo.osA, chave("ataque")]],
    B: () => ["select public.os_cobrar($1, $2, $3)", [alvo.vendaB, alvo.osB, chave("ataque")]], outroVendedor: true,
  },
  "os_entregar(uuid,text)": {
    A: () => ["select public.os_entregar($1, null)", [alvo.osA]], B: () => ["select public.os_entregar($1, null)", [alvo.osB]],
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
  // O nome de quem aparece no ranking (G1): só recebe alguma linha quem tem ranking.ver na loja da venda.
  "ranking_nomes(uuid[])": { leitura: true, A: () => ["select * from public.ranking_nomes($1::uuid[])", [[ids.vendedorAB]]], semPermissao: true },
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
  "terminal_salvar(uuid,uuid,text,text,text,boolean,text)": {
    A: () => ["select public.terminal_salvar($1, null, null, null, 'Tentativa', false, 'Tentativa')", [alvo.terminalA]],
    B: () => ["select public.terminal_salvar($1, null, null, null, 'Tentativa', false, 'Tentativa')", [alvo.terminalB]], semPermissao: true,
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
  "venda_vincular_cliente(uuid,uuid,text)": {
    A: () => ["select public.venda_vincular_cliente($1, $2, 'Tentativa')", [alvo.concluidaA, alvo.clienteA]],
    B: () => ["select public.venda_vincular_cliente($1, $2, 'Tentativa')", [alvo.concluidaB, alvo.clienteA]], outroVendedor: true,
  },
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
  if (funcao === "financeiras_a_receber()") {
    const v = (linhas[0]?.v ?? {}) as { por_devedor?: unknown[]; contas?: unknown[] };
    return linhas.length === 1 && (v.por_devedor ?? [1]).length === 0 && (v.contas ?? [1]).length === 0;
  }
  if (funcao === "pagamentos_do_periodo(date,date)") {
    const v = (linhas[0]?.v ?? {}) as { totais?: object; pagamentos?: unknown[] };
    return linhas.length === 1 && Object.keys(v.totais ?? { x: 1 }).length === 0 && (v.pagamentos ?? [1]).length === 0;
  }
  if (funcao === "clientes_duplicados()" || funcao === "metas_equipe(uuid,date)" || funcao === "os_assistencias()") return linhas.length === 1 && Array.isArray(linhas[0]?.v) && (linhas[0]?.v as unknown[]).length === 0;
  if (funcao === "clientes_segmentos()") return linhas.length === 1 && ((linhas[0]?.v as { segmentos?: unknown[] } | undefined)?.segmentos ?? [1]).length === 0;
  if (funcao === "crm_funil()" || funcao === "crm_agenda()") {
    const v = (linhas[0]?.v ?? {}) as { oportunidades?: unknown[]; atividades?: unknown[] };
    return linhas.length === 1 && (v.oportunidades ?? v.atividades ?? [1]).length === 0;
  }
  if (funcao === "cliente_buscar(text,text)") return linhas.length === 1 && (linhas[0]?.v as { clientes?: unknown[] } | undefined)?.clientes?.length === 0;
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
  // Um inventário em contagem e um enviado em cada loja (gravados pelo banco), com a capa como item.
  for (const [loja, sufixo] of [[ids.lojaA, "A"], [ids.lojaB, "B"]] as const) {
    for (const situacao of ["em_contagem", "enviado"] as const) {
      const id = (await db.query<{ id: string }>(
        `insert into public.inventarios (organizacao_id, unidade_id, descricao, chave, situacao, criado_por${situacao === "enviado" ? ", enviado_por, enviado_em, motivo_envio" : ""})
         values ($1, $2, 'Mundo do teste', $3, $4, $5${situacao === "enviado" ? ", $5, now(), 'Mundo'" : ""}) returning id`,
        [ids.organizacao, loja, `mundo:inventario:${sufixo}:${situacao}`, situacao, ids.gerenteB])).rows[0]?.id ?? "";
      await db.query("insert into public.inventario_itens (inventario_id, organizacao_id, variante_id, tipo, sistema_quantidade, contado_quantidade, contado_em) values ($1, $2, $3, 'acessorio', 1, 1, now())",
        [id, ids.organizacao, cat.capa]);
      alvo[situacao === "enviado" ? `inventarioEnviado${sufixo}` : `inventario${sufixo}`] = id;
    }
  }
  // Um cliente da rede A, cadastrado pelo vendedorAB na loja A (dados fictícios).
  alvo.clienteA = (await valor<{ id: string }>(await naLoja(ids.vendedorAB, ids.lojaA), "select public.cliente_salvar(null, $1::jsonb, null, 'mundo:cliente:A') as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente do Mundo", documento: CPF_DO_MUNDO, telefone: "41987650100" })])).id;
  alvo.clienteA2 = (await valor<{ id: string }>(await naLoja(ids.vendedorAB, ids.lojaA), "select public.cliente_salvar(null, $1::jsonb, null, 'mundo:cliente:A2') as v",
    [JSON.stringify({ tipo: "pessoa_fisica", nome: "Cliente do Mundo 2", telefone: "41987650101" })])).id;
  // Uma ordem de serviço aberta em cada loja (L12a; gravadas pelo banco: só alvo), do cliente do mundo.
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    alvo[`os${lado}`] = (await db.query<{ id: string }>(
      `insert into public.ordens_servico (organizacao_id, unidade_id, cliente_id, cliente_nome, contato_mascarado, aparelho, imei, defeito, estado_entrada, chave, conteudo, aberta_por)
       values ($1, $2, $3, 'Cliente do Mundo', '(41) •••••-0100', 'Aparelho do mundo', $4, 'Defeito do mundo', 'Estado do mundo', $5, 'mundo', $6) returning id`,
      [ids.organizacao, loja, alvo.clienteA, comDigitoLuhn(`35209900${lado === "A" ? "9" : "8"}00001`), `mundo:os:${lado}`, ids.dono])).rows[0]?.id ?? "";
    // Um orçamento esperando o cliente (L12b), também gravado pelo banco.
    alvo[`orcamento${lado}`] = (await db.query<{ id: string }>(
      `insert into public.os_orcamentos (organizacao_id, os_id, diagnostico, mao_de_obra_centavos, pecas_centavos, total_centavos, chave, conteudo, registrado_por)
       values ($1, $2, 'Diagnóstico do mundo', 100, 0, 100, $3, 'mundo', $4) returning id`, [ids.organizacao, alvo[`os${lado}`], `mundo:orcamento:${lado}`, ids.dono])).rows[0]?.id ?? "";
    // Uma peça usada (L12d), do estoque da assistência, com o movimento do livro: só alvo.
    await db.query("select privado.lancar_movimento($1, $2, 1, 'entrada_compra', null, null, null, null, $3)", [ids.assistencia, cat.capa, `mundo:peca:entrada:${lado}`]);
    const movimento = (await db.query<{ v: string }>("select privado.lancar_movimento($1, $2, -1, 'consumo_os', null, null, 'os', $3, $4) as v",
      [ids.assistencia, cat.capa, alvo[`os${lado}`], `mundo:peca:${lado}`])).rows[0]?.v;
    alvo[`peca${lado}`] = (await db.query<{ id: string }>(
      `insert into public.os_pecas (organizacao_id, os_id, unidade_id, variante_id, quantidade, movimento_id, chave, registrado_por)
       values ($1, $2, $3, $4, 1, $5, $6, $7) returning id`, [ids.organizacao, alvo[`os${lado}`], ids.assistencia, cat.capa, movimento, `mundo:peca:${lado}`, ids.dono])).rows[0]?.id ?? "";
    // Um documento da venda concluída (L5d), gravado pelo banco: só alvo.
    alvo[`anexo${lado}`] = (await db.query<{ id: string }>(
      `insert into public.venda_anexos (organizacao_id, unidade_id, venda_id, tipo, caminho, formato, bytes, sha256, enviado_por)
       values ($1, $2, $3, 'comprovante_assinado', $4, 'pdf', 1000, $5, $6) returning id`,
      [ids.organizacao, loja, alvo[`concluida${lado}`], `${ids.organizacao}/${loja}/${alvo[`concluida${lado}`]}/00000000-0000-4000-a000-00000000003${lado === "A" ? 1 : 2}.pdf`, "a".repeat(64), ids.vendedorAB])).rows[0]?.id ?? "";
  }
  // Uma oportunidade e uma atividade do vendedorAB em cada loja (pelas funções, como na tela).
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    const s = await naLoja(ids.vendedorAB, loja);
    alvo[`oportunidade${lado}`] = (await valor<{ id: string }>(s, "select public.oportunidade_registrar($1, $2::jsonb, $3) as v",
      [alvo.clienteA, JSON.stringify({ origem: "loja", interesse: `Mundo ${lado}` }), `mundo:oportunidade:${lado}`])).id;
    alvo[`atividade${lado}`] = (await valor<{ id: string }>(s, "select public.atividade_criar($1::jsonb, $2) as v",
      [JSON.stringify({ tipo: "ligacao", descricao: `Mundo ${lado}`, vence_em: AMANHA, oportunidade: alvo[`oportunidade${lado}`] }), `mundo:atividade:${lado}`])).id;
  }
  // Uma maquininha e um pagamento por Pix em cada loja (gravados pelo banco: só alvo).
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    alvo[`terminal${lado}`] = (await db.query<{ id: string }>(
      "insert into public.terminais (organizacao_id, unidade_id, provedor, identificador, apelido, criado_por) values ($1, $2, 'pagbank', $3, 'Mundo', $4) returning id",
      [ids.organizacao, loja, `MUNDO-${lado}`, ids.dono])).rows[0]?.id ?? "";
    alvo[`pagamento${lado}`] = (await db.query<{ id: string }>(
      "insert into public.venda_pagamentos (organizacao_id, venda_id, ordem, meio, valor_centavos, comprovante, confirmacao) values ($1, $2, 9, 'pix_direto', 100, 'MUNDO-PIX', 'manual') returning id",
      [ids.organizacao, alvo[`concluida${lado}`]])).rows[0]?.id ?? "";
    // Um pedido de saída do caixa (L7c), pendente, do vendedorAB.
    alvo[`saida${lado}`] = (await db.query<{ id: string }>(
      "insert into public.caixa_saidas (organizacao_id, unidade_id, caixa_id, valor_centavos, motivo, chave, pedida_por) values ($1, $2, $3, 100, 'Pedido do mundo', $4, $5) returning id",
      [ids.organizacao, loja, alvo[`caixa${lado}`], `mundo:saida:${lado}`, ids.vendedorAB])).rows[0]?.id ?? "";
    // Uma conta a receber de financeira (L7b), aberta.
    alvo[`contaReceber${lado}`] = (await db.query<{ id: string }>(
      "insert into public.contas_a_receber (organizacao_id, unidade_id, venda_id, pagamento_id, devedor, valor_centavos) values ($1, $2, $3, $4, 'payjoy', 100) returning id",
      [ids.organizacao, loja, alvo[`concluida${lado}`], alvo[`pagamento${lado}`]])).rows[0]?.id ?? "";
  }
  // Uma conta a pagar aberta em cada loja (L8a), na categoria "Outras" da lista inicial (gravadas pelo banco: só alvo).
  alvo.categoriaPagar = (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = 'Outras'", [ids.organizacao])).rows[0]?.id ?? "";
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    alvo[`contaPagar${lado}`] = (await db.query<{ id: string }>(
      `insert into public.contas_a_pagar (organizacao_id, unidade_id, categoria_id, descricao, valor_centavos, vencimento, grupo_id, forma, chave, criada_por)
       values ($1, $2, $3, 'Conta do mundo', 100, current_date + 10, gen_random_uuid(), 'unica', $4, $5) returning id`,
      [ids.organizacao, loja, alvo.categoriaPagar, `mundo:contapagar:${lado}`, ids.dono])).rows[0]?.id ?? "";
  }
  // Um fechamento do bônus do mês passado enviado em cada loja (L9b), à espera do dono (gravados pelo banco: só alvo).
  for (const [lado, loja, quem] of [["A", ids.lojaA, ids.dono], ["B", ids.lojaB, ids.gerenteB]] as const) {
    alvo[`fechamento${lado}`] = (await db.query<{ id: string }>(
      `insert into public.bonus_fechamentos (organizacao_id, unidade_id, mes, apuracao, total_calculado, enviado_por)
       values ($1, $2, (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')::date, '{}'::jsonb, 0, $3) returning id`,
      [ids.organizacao, loja, quem])).rows[0]?.id ?? "";
  }
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
    expect(expostas).toHaveLength(145);
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
        if (novasNaAuditoria.some((acao) => !AUDITORIA_DE_RECUSA.test(acao) && !caso.auditoriaDaConsulta?.test(acao))) falhas.push(`${descricao} (auditoria registrou ${novasNaAuditoria.join(", ")})`);
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

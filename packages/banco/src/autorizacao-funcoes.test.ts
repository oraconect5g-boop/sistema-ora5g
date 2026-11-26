// Inventário de autorização (prioridade 1 do diagnóstico de 10/11/2026; ORA-ORG-004 e ORA-QUAL-002).
// O aviso 0029 do Supabase lista as funções SECURITY DEFINER que qualquer usuário logado pode chamar
// pela API: 238 em 25/11 (48 + 6 do cadastro de lojas, L2, + 5 do cadastro do catálogo, L3a, + 4 dos preços, L3b,
// + 4 da importação do catálogo, L3c, + 3 da entrada de mercadoria, L4a, + 5 do inventário, L4b, + 6 dos clientes, L5a,
// + 9 do funil e da agenda, L5b, + 4 da mesclagem e dos segmentos, L5c, + 4 das maquininhas e da conciliação, L7a,
// + 2 da leitura das entradas, R1, + 1 do nome no ranking, G1, + 2 das metas, G4b, + 3 das financeiras, L7b, + 3 da saída autorizada do caixa, L7c, + 6 das contas a pagar, L8a, + 1 das regras do bônus por meta, L9a, + 2 do fechamento do bônus, L9b, + 1 da correção do repasse das financeiras, B4, + 1 dos dados para emitir a nota, K1b, + 1 dos documentos da nota emitida, L10a, + 2 do envio da nota pelo WhatsApp, K1c, + 1 dos recebíveis por loja e adquirente, L8e, + 5 da ordem de serviço, L12a, + 3 do orçamento da OS, L12b, + 2 da cobrança e da entrega da OS, L12c, + 3 das peças da OS, L12d, + 1 dos relatórios da assistência, L12e, + 2 dos documentos da venda, L5d, + 2 da conciliação fiscal, L10b, + 2 do cancelamento e da correção da nota, L10c, + 1 do valor do estoque a custo, G3b, + 2 dos códigos de outros canais, CAT-009, + 2 das regiões, ORG-009, + 1 da conta ligada à entrada, FIN-004a, + 1 da ligação do PDV da Nogle à loja, CONNECT-d, + 2 da transferência de chips, CONNECT-e, + 1 das divergências dos chips da Nogle, CONNECT-f, + 1 das consultas da Nogle, CONNECT-g, + 2 das ações na Nogle, CONNECT-j, + 2 dos documentos da conta, FIN-004b, + 1 da correção do custo, CAT-008b, + 2 da limpeza das fotos, CAT-011b, + 5 do pedido de compra, INV-009a, + 1 da carta de correção, FISC-009b, + 1 do relatório do titular, QUAL-011a, + 2 da vitrine da loja online, ONLINE-a, públicas de propósito, + 5 da reserva do site, ONLINE-b (a de reservar, pública), + 1 da conclusão da limpeza das fotos, INTEG-b, + 1 da situação das rotinas agendadas, ROT-a, + 1 da conferência do destinatário da nota, INTEG-c, + 2 da Saúde da operação e da página /saude, SAUDE-a, + 3 da remessa de transferência, TRF-a, + 6 dos avisos no celular, PWA-b (as duas da fila pedem o segredo do worker), + 7 dos extratos e da conciliação por arquivo, EXT-a, + 1 da importação do custo dos anúncios, META-a, + 1 da importação dos pedidos dos marketplaces, MKTPL-a, + 4 da carga do estoque inicial por loja, REIN-b, + 4 do pedido do site, ONLINE-d, + 1 da resolução da diferença na carga do estoque, REIN-c, + 3 das contas bancárias, CONTAS-a, + 2 dos repasses dos marketplaces, REPASSE-a, + 1 da divergência da transferência, TRF-d, + 1 da conferência do período, FIN-001a, + 1 da conferência do que foi desfeito, FIN-001b, + 3 dos repasses atrasados, FIN-007a, + 3 do débito do extrato e do estorno da venda, PAY-011a, + 2 do depósito da maquininha, FIN-006a, + 2 do aviso do erro do servidor, QUAL-006a, + 2 do pagamento pelo site, PAY-014a, + 3 do Pix pela Asaas no caixa, PAY-015a, + 3 do cartão pela Asaas no caixa, PAY-015b, + 3 da assinatura no cartão, PAY-015c; no L8b, a das categorias ganhou o parâmetro "entra no resultado"). Elas rodam com poder total e cada uma confere sessão, loja e permissão por
// conta própria. Este teste monta um "mundo" fictício com objetos reais em duas lojas e tenta cada
// função como 13 tipos de atacante. Recusa = erro, ou resposta vazia numa leitura, e nada muda no
// banco. O teste lista as funções no próprio banco e falha se aparecer uma nova sem casos aqui.
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { amrDaSenha, cnpj, comDigitoLuhn, comoUsuario, cpf, criarBanco, type Sessao } from "./banco-de-teste";
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
  // CONNECT-d: um PDV da Nogle (fictício), lido pelo worker e sem loja ligada; ligar é do dono ou do administrador.
  await servico(() => db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)",
    [ids.organizacao, JSON.stringify({ pdvs: [{ id: 7001, nome: "PDV do mundo (fictício)" }],
      mvno: [{ iccid: comDigitoLuhn("895517011000009001"), tipo: "esim" }], estoques: [], falhas: 0 })]));
  // CONNECT-e: um pedido de transferência do dono (1 eSIM para o PDV do mundo), ainda na fila.
  const donoDoMundo = await naLoja(ids.dono, ids.lojaA);
  alvo.transferenciaA = (await valor<{ id: string }>(donoDoMundo,
    "select public.connect_transferir_chips(p_tipo => 'esim', p_pdv => 7001, p_quantidade => 1, p_chave => 'mundo:transferencia') as v"))?.id ?? "";
  // CONNECT-f: outro PDV (fictício), ligado à loja B e lido sem chips, e um chip disponível na loja B: a divergência que só o
  // dono vê. A loja A fica sem PDV ligado, para o ataque de ligar o PDV 7001 a ela ser recusado pela permissão.
  await servico(() => db.query("select public.connect_worker_gravar_estoque($1, $2::jsonb)",
    [ids.organizacao, JSON.stringify({ pdvs: [{ id: 7001, nome: "PDV do mundo (fictício)" }, { id: 7002, nome: "PDV da loja B (fictício)" }],
      mvno: null, estoques: [{ pdv: 7002, chips: [] }], falhas: 0 })]));
  await valor(donoDoMundo, "select public.connect_ligar_pdv(7002, $1) as v", [ids.lojaB]);
  await db.query("select privado.registrar_item_serializado($1, $2, null, null, $3, 'entrada_importacao', 'mundo:chipB')",
    [ids.lojaB, cat.chip, comDigitoLuhn("895510000000000777")]);
  // CONNECT-j: um pedido de ação na Nogle do dono (desbloquear uma linha fictícia), ainda na fila.
  alvo.acaoA = (await valor<{ id: string }>(donoDoMundo,
    "select public.connect_pedir_acao(p_tipo => 'linha_desbloquear', p_chave => 'mundo:acao', p_motivo => 'Pedido do mundo (fictício)', p_parametros => '{\"linha\":\"41999998888\"}'::jsonb) as v"))?.id ?? "";
  // Sem a divergência no mundo, a recusa da leitura não provaria nada: o dono tem de vê-la.
  const divergencias = (await comoUsuario(db, donoDoMundo, () => db.query("select iccid from public.connect_chips_divergentes()"))).rows;
  if (divergencias.length !== 1) throw new Error(`o mundo devia ter 1 divergência de chip, tem ${divergencias.length}`);

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
  // PAY-015a: o Pix pela Asaas ligado no caixa (o worker conferiu a chave Pix), para a recusa vir do acesso.
  await servico(() => db.query("select public.caixa_pix_situacao(true, null)"));
  // PAY-015b: o cartão pela Asaas ligado no caixa (o worker falou com a Asaas).
  await servico(() => db.query("select public.caixa_cartao_situacao(true, null)"));

  for (const [lado, s, aparelhoDaLoja, quemCancela] of [["A", vabA, aparelhoA, donoA], ["B", vabB, aparelhoB, gerB]] as const) {
    alvo[`caixa${lado}`] = await valor<string>(s, "select public.abrir_caixa(50000, $1) as v", [chave("caixa")]);
    // Rascunho simples (adicionar, desconto, remover, concluir).
    alvo[`venda${lado}`] = await valor<string>(s, "select public.criar_venda($1) as v", [chave("venda")]);
    alvo[`itemVenda${lado}`] = await valor<string>(s, "select public.adicionar_item($1, $2, null, 1, $3) as v", [alvo[`venda${lado}`], cat.capa, chave("item")]);
    // PAY-015a: um QR do Pix pela Asaas pedido para essa venda (esperando o worker).
    alvo[`pix${lado}`] = (await valor<{ id: string }>(s, "select public.caixa_pix_pedir($1, 1000, $2) as v", [alvo[`venda${lado}`], chave("pix")]))?.id ?? "";
    // PAY-015b: um link do cartão pela Asaas pedido para essa venda (esperando o worker).
    alvo[`cartao${lado}`] = (await valor<{ id: string }>(s, "select public.caixa_cartao_pedir($1, 1000, $2) as v", [alvo[`venda${lado}`], chave("cartao")]))?.id ?? "";
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
  // Recebidas com divergência (TRF-d): A saiu da loja A para a B e a caixa chegou vazia; B saiu da loja B para a C.
  // Com estoque próprio, para não gastar as capas que o resto do mundo usa.
  for (const loja of [ids.lojaA, ids.lojaB]) {
    await db.query("select privado.lancar_movimento($1, $2, 1, 'entrada_importacao', null, null, null, null, $3)", [loja, cat.capa, `mundo:capa-da-divergencia:${loja}`]);
  }
  const receberSemNada = (s: Sessao, t: string) =>
    valor(s, "select public.transferencia_receber($1, '{}'::text[], 0, 'A caixa chegou vazia na loja') as v", [t]);
  alvo.transfDivergenteA = await solicitar(gerB, ids.lojaA, ids.lojaB);
  await separar(donoA, alvo.transfDivergenteA);
  await enviar(donoA, alvo.transfDivergenteA);
  await receberSemNada(gerB, alvo.transfDivergenteA);
  alvo.transfDivergenteB = await solicitar(donoC, ids.lojaB, ids.lojaC);
  await separar(gerB, alvo.transfDivergenteB);
  await enviar(gerB, alvo.transfDivergenteB);
  await receberSemNada(donoC, alvo.transfDivergenteB);
  // Remessas (TRF-a): A sai da loja A, B sai da loja B; cada uma com a transferência dela já separada.
  const remessa = async (s: Sessao, origem: string, destino: string) =>
    (await valor<{ remessa: string; transferencias: string[] }>(s, "select public.transferencia_solicitar_remessa($1, $2, $3::jsonb, 'Reposição', $4) as v",
      [origem, destino, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("remessa")]));
  const remessaA = await remessa(gerB, ids.lojaA, ids.lojaB);
  await separar(donoA, remessaA.transferencias[0] as string);
  alvo.remessaA = remessaA.remessa;
  const remessaB = await remessa(donoC, ids.lojaB, ids.lojaC);
  await separar(gerB, remessaB.transferencias[0] as string);
  alvo.remessaB = remessaB.remessa;

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
  // Com o amr de quem acabou de entrar (ORG-006b): o inventário prova a autorização, não a confirmação recente.
  atacantes.semLogin = (acao) => comClaims({ role: "authenticated", amr: amrDaSenha() }, "authenticated", acao);
  atacantes.semSessao = (acao) => comClaims({ sub: ids.vendedorAB, role: "authenticated", amr: amrDaSenha() }, "authenticated", acao);
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
  // Leitura pública de propósito (a vitrine da loja online, ONLINE-a): qualquer um, até o visitante sem login, recebe
  // a resposta; o que se confere é que ela só traz o que é do site, que nada muda e que nada vai para a auditoria.
  publica?: (linhas: Record<string, unknown>[]) => Promise<boolean>;
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
  // Códigos de outros canais (CAT-009): catalogo.gerir na rede; o vendedor da loja A é recusado.
  "catalogo_ligar_codigo(uuid,text,text,text,text)": {
    A: () => ["select public.catalogo_ligar_codigo($1, 'rein', $2, null, 'Tentativa')", [cat.capa, `ATAQUE-${++contador}`]], semPermissao: true,
  },
  "catalogo_desligar_codigo(uuid,text)": { A: () => ["select public.catalogo_desligar_codigo($1, 'Tentativa')", [alvo.codigoCanal]], semPermissao: true },
  // Correção do custo (CAT-008b): catalogo.gerir e custo.ver na rede; o vendedor da loja A é recusado.
  "custo_corrigir(uuid,bigint,text)": { A: () => ["select public.custo_corrigir($1, 1234, 'Tentativa')", [cat.capa]], semPermissao: true },
  "cancelar_convite(uuid,text)": { A: () => ["select public.cancelar_convite($1, 'Tentativa')", [alvo.convite]], semPermissao: true },
  // Regiões (ORG-009): de quem gere as lojas da rede (unidades.gerir); o vendedor da loja A é recusado.
  "regiao_salvar(uuid,uuid,text,boolean,text)": {
    A: () => ["select public.regiao_salvar($1, null, $2, null, 'Tentativa')", [ids.organizacao, `Intrusa ${++contador}`]], semPermissao: true,
  },
  "loja_definir_regiao(uuid,uuid,text)": {
    A: () => ["select public.loja_definir_regiao($1, $2, 'Tentativa')", [ids.lojaA, alvo.regiao]],
    B: () => ["select public.loja_definir_regiao($1, $2, 'Tentativa')", [ids.lojaB, alvo.regiao]], semPermissao: true,
  },
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
  // PAY-015c: a assinatura no cartão (a do cliente do mundo; a de cada loja é do vendedorAB).
  "assinatura_pedir(uuid,text,bigint,text,text,text)": {
    A: () => ["select public.assinatura_pedir($1, 'Plano de ataque', 1000, 'MONTHLY', null, $2)", [alvo.clienteA, chave("ataque")]],
  },
  "assinatura_cancelar(uuid,text)": {
    A: () => ["select public.assinatura_cancelar($1, 'Tentativa')", [alvo.assinaturaA]], B: () => ["select public.assinatura_cancelar($1, 'Tentativa')", [alvo.assinaturaB]],
    outroVendedor: true,
  },
  "assinaturas_do_cliente(uuid)": { leitura: true, A: () => ["select public.assinaturas_do_cliente($1) as v", [alvo.clienteA]] },
  "cliente_revelar(uuid,text)": { A: () => ["select public.cliente_revelar($1, 'documento') as v", [alvo.clienteA]] },
  // Relatório dos dados do titular (QUAL-011a): só o dono (cliente.exportar), com a senha recente e um motivo; o
  // vendedor da loja A é recusado antes de qualquer leitura do cliente.
  "cliente_dados_do_titular(uuid,text)": { A: () => ["select public.cliente_dados_do_titular($1, 'Tentativa de relatório') as v", [alvo.clienteA]], semPermissao: true },
  // A vitrine da loja online (ONLINE-a): pública de propósito. Só pode trazer produto marcado para o site e ativo
  // (neste mundo, nenhum: a lista vem vazia e o detalhe de um produto da rede é "não encontrado").
  // A leitura leve do banco da página /saude (SAUDE-a): pública de propósito. Só a hora do banco e se a migration
  // pedida está no histórico; nunca um dado de negócio.
  "saude_do_banco(text)": { A: () => ["select public.saude_do_banco('20261117145723') as v", []], publica: async (linhas) => {
    const v = linhas[0]?.v as Record<string, unknown> | undefined;
    return linhas.length === 1 && v !== undefined && Object.keys(v).sort().join(",") === "hora,migracao";
  } },
  // ONLINE-f: a vitrine ganhou a página (p_pagina); o que ela devolve segue só o que é do site.
  "loja_vitrine(uuid,text,uuid,integer)": { A: () => ["select public.loja_vitrine($1, null, null, 2) as v", [ids.organizacao]], publica: async (linhas) => {
    const produtos = ((linhas[0]?.v as { produtos?: { id: string }[] } | undefined)?.produtos ?? []).map((p) => p.id);
    const doSite = (await db.query<{ id: string }>("select id from public.produtos where publicar_online and ativo")).rows.map((r) => r.id);
    return produtos.every((id) => doSite.includes(id));
  } },
  // A reserva do site (ONLINE-b): a primeira gravação aberta ao visitante. Aqui o atacante tenta reservar o aparelho,
  // que está fora do site: todos são recusados e nada muda (reservar o que está no site é o uso normal, provado em
  // loja-online-reserva.test.ts). A recusa é o código OR036, "não está à venda na loja online" (ONLINE-c; antes,
  // P0002, que a API do banco respondia com HTTP 500).
  "loja_reservar(uuid,uuid,uuid,text,text,text,jsonb)": {
    A: () => ["select public.loja_reservar($1, $2, $3, 'Atacante', '41999990009', $4) as v", [ids.organizacao, cat.aparelho, ids.lojaA, chave("ataque")]],
    publica: async () => false, outrosCodigosDeRecusa: ["OR036"],
  },
  // Avisos no celular (PWA-b): a própria pessoa liga, confere, testa e desliga os avisos dos próprios celulares (o técnico,
  // no contexto dele, é legítimo); quem não tem a sessão válida é recusado, e desligar o celular de outra pessoa também.
  // O worker lê a fila só com o segredo dos avisos: sem ele, todos são recusados, até o visitante sem login.
  "aviso_inscrever(text,text,text,text)": {
    A: () => ["select public.aviso_inscrever($1, $2, $3, null) as v", ["https://push.exemplo.invalid/ataque", `B${"C".repeat(86)}`, "y".repeat(22)]],
    contextoProprio: ["tecnico"], outraOrganizacao: false,
  },
  "aviso_cancelar(text)": { A: () => ["select public.aviso_cancelar($1) as v", [alvo.celularA]], outroVendedor: true },
  "aviso_minhas_inscricoes()": { leitura: true, A: () => ["select public.aviso_minhas_inscricoes() as v", []], contextoProprio: ["tecnico"], outraOrganizacao: false },
  "aviso_teste()": { A: () => ["select public.aviso_teste() as v", []], contextoProprio: ["tecnico"], outraOrganizacao: false },
  "avisos_a_enviar(text,integer)": { A: () => ["select public.avisos_a_enviar('segredo-errado-com-tamanho-suficiente-000000') as v", []] },
  "avisos_resultado(text,jsonb)": { A: () => ["select public.avisos_resultado('segredo-errado-com-tamanho-suficiente-000000', '[]'::jsonb) as v", []] },
  // A loja atende a reserva do site: quem vende na loja da reserva; o de outra loja e quem não tem acesso, não.
  "loja_reserva_contato(uuid)": { A: () => ["select public.loja_reserva_contato($1) as v", [alvo.reservaSiteA]], B: () => ["select public.loja_reserva_contato($1) as v", [alvo.reservaSiteB]] },
  "loja_reserva_cancelar(uuid,text)": {
    A: () => ["select public.loja_reserva_cancelar($1, 'Tentativa') as v", [alvo.reservaSiteA]], B: () => ["select public.loja_reserva_cancelar($1, 'Tentativa') as v", [alvo.reservaSiteB]],
  },
  // O pedido do site (ONLINE-d): o visitante pede e consulta (a consulta sem o par código e WhatsApp certo devolve nulo); a loja
  // de retirada atende ou cancela, como a reserva avulsa.
  "loja_pedir(uuid,uuid,jsonb,text,text,text,jsonb)": {
    A: () => ["select public.loja_pedir($1, $2, $3::jsonb, 'Atacante', '41999990009', $4) as v", [ids.organizacao, ids.lojaA, JSON.stringify([{ variante: cat.aparelho }]), chave("ataque")]],
    publica: async () => false, outrosCodigosDeRecusa: ["OR036"],
  },
  "loja_pedido_consultar(uuid,text,text)": { A: () => ["select public.loja_pedido_consultar($1, 'AAAAAA', '41999990009') as v", [ids.organizacao]],
    publica: async (linhas) => linhas.length === 1 && linhas[0]?.v === null },
  // O pagamento pelo site (PAY-014a): o visitante pede para pagar com o código e o WhatsApp do pedido (sem o par certo,
  // nada); o aviso da Asaas só passa com o token conferido.
  "loja_pagamento_pedir(uuid,text,text)": { A: () => ["select public.loja_pagamento_pedir($1, 'AAAAAA', '41999990009') as v", [ids.organizacao]],
    publica: async (linhas) => linhas.length === 1 && linhas[0]?.v === null },
  // Se o pagamento pelo site está ligado: público e sem dado nenhum (no cenário, desligado).
  "loja_pagamento_disponivel()": { A: () => ["select public.loja_pagamento_disponivel() as v", []],
    publica: async (linhas) => linhas.length === 1 && linhas[0]?.v === false },
  "pagamento_aviso_receber(text,jsonb)": {
    A: () => ["select public.pagamento_aviso_receber('token-errado-com-tamanho-suficiente-0000000000', '{\"id\": \"evt_x\", \"evento\": \"PAYMENT_RECEIVED\"}'::jsonb) as v", []],
  },
  "loja_pedido_cancelar(uuid,text)": {
    A: () => ["select public.loja_pedido_cancelar($1, 'Tentativa') as v", [alvo.pedidoSiteA]], B: () => ["select public.loja_pedido_cancelar($1, 'Tentativa') as v", [alvo.pedidoSiteB]],
  },
  "loja_pedido_atender(uuid,text)": {
    A: () => ["select public.loja_pedido_atender($1, $2) as v", [alvo.pedidoSiteA, chave("ataque")]], B: () => ["select public.loja_pedido_atender($1, $2) as v", [alvo.pedidoSiteB, chave("ataque")]],
  },
  "loja_reserva_atender(uuid,text)": {
    A: () => ["select public.loja_reserva_atender($1, $2) as v", [alvo.reservaSiteA, chave("ataque")]], B: () => ["select public.loja_reserva_atender($1, $2) as v", [alvo.reservaSiteB, chave("ataque")]],
  },
  // Age só na loja do turno de quem chama (soltar as reservas do site vencidas dela): para quem vende em outra loja ou rede, é o
  // próprio contexto, legítimo; os 9 sem acesso válido são recusados.
  "loja_reservas_liberar_vencidas()": { A: () => ["select public.loja_reservas_liberar_vencidas() as v", []], outraOrganizacao: false },
  // O aparelho está fora do site: o detalhe vem vazio, sem erro (ONLINE-c). Se viesse um produto, teria de ser do site.
  "loja_produto(uuid,uuid)": { A: () => ["select public.loja_produto($1, $2) as v", [ids.organizacao, cat.produtoAparelho]], publica: async (linhas) => {
    if (linhas.length === 1 && linhas[0]?.v === null) return true;
    const produto = (linhas[0]?.v as { id?: string } | undefined)?.id;
    return Boolean(produto) && (await db.query("select 1 from public.produtos where id = $1 and publicar_online and ativo", [produto])).rows.length === 1;
  } },
  "cliente_salvar(uuid,jsonb,text,text)": { A: () => ["select public.cliente_salvar($1, '{\"nome\": \"Tentativa\"}'::jsonb, 'Tentativa', null)", [alvo.clienteA]] },
  "concluir_venda(uuid,jsonb,jsonb,text)": {
    A: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaA, pagamentoDinheiro, chave("ataque")]],
    B: () => ["select public.concluir_venda($1, $2::jsonb, '{}'::jsonb, $3)", [alvo.vendaB, pagamentoDinheiro, chave("ataque")]], outroVendedor: true,
  },
  // PAY-015a: o Pix pela Asaas no caixa (o QR da venda aberta do vendedorAB).
  "caixa_pix_pedir(uuid,bigint,text)": {
    A: () => ["select public.caixa_pix_pedir($1, 100, $2)", [alvo.vendaA, chave("ataque")]],
    B: () => ["select public.caixa_pix_pedir($1, 100, $2)", [alvo.vendaB, chave("ataque")]], outroVendedor: true,
  },
  "caixa_pix_cancelar(uuid)": {
    A: () => ["select public.caixa_pix_cancelar($1)", [alvo.pixA]], B: () => ["select public.caixa_pix_cancelar($1)", [alvo.pixB]], outroVendedor: true,
  },
  "caixa_pix_da_venda(uuid)": {
    A: () => ["select public.caixa_pix_da_venda($1)", [alvo.vendaA]], B: () => ["select public.caixa_pix_da_venda($1)", [alvo.vendaB]], outroVendedor: true,
  },
  // PAY-015b: o cartão pela Asaas no caixa (o link da venda aberta do vendedorAB).
  "caixa_cartao_pedir(uuid,bigint,text)": {
    A: () => ["select public.caixa_cartao_pedir($1, 100, $2)", [alvo.vendaA, chave("ataque")]],
    B: () => ["select public.caixa_cartao_pedir($1, 100, $2)", [alvo.vendaB, chave("ataque")]], outroVendedor: true,
  },
  "caixa_cartao_cancelar(uuid)": {
    A: () => ["select public.caixa_cartao_cancelar($1)", [alvo.cartaoA]], B: () => ["select public.caixa_cartao_cancelar($1)", [alvo.cartaoB]], outroVendedor: true,
  },
  "caixa_cartao_da_venda(uuid)": {
    A: () => ["select public.caixa_cartao_da_venda($1)", [alvo.vendaA]], B: () => ["select public.caixa_cartao_da_venda($1)", [alvo.vendaB]], outroVendedor: true,
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
  // As divergências dos chips da Nogle (CONNECT-f): só quem gere a Ora Connect na rede (no mundo, o chip da loja B que não
  // está no PDV 7002).
  "connect_chips_divergentes()": { leitura: true, A: () => ["select * from public.connect_chips_divergentes()", []], semPermissao: true },
  // As consultas da Nogle que só leem (CONNECT-g): o pedido vale na loja do turno de quem opera a Ora Connect (o vendedor da
  // loja A é legítimo, e quem é de outra rede consulta a própria); os atacantes sem acesso válido são recusados.
  "connect_consultar(text,text,text)": {
    A: () => ["select public.connect_consultar(p_tipo => 'linha_saldo', p_parametro => '51988887777', p_chave => $1)", [chave("ataque")]], outraOrganizacao: false,
  },
  // As ações na Nogle (CONNECT-j; a D-061): só o dono e os gerentes pedem (o vendedor é recusado); quem é de outra rede pede na
  // própria. O cancelamento é de quem pediu ou de quem gere a loja do pedido.
  "connect_pedir_acao(text,text,text,jsonb,jsonb)": {
    A: () => ["select public.connect_pedir_acao(p_tipo => 'linha_desbloquear', p_chave => $1, p_motivo => 'Tentativa', p_parametros => '{\"linha\":\"41999998888\"}'::jsonb)",
      [chave("ataque")]], semPermissao: true, outraOrganizacao: false,
  },
  "connect_cancelar_acao(uuid,text)": { A: () => ["select public.connect_cancelar_acao($1, 'Tentativa de cancelar')", [alvo.acaoA]], semPermissao: true },
  "connect_cancelar_transferencia(uuid,text)": {
    A: () => ["select public.connect_cancelar_transferencia($1, 'Tentativa de cancelar')", [alvo.transferenciaA]], semPermissao: true,
  },
  "connect_habilitar(text,boolean,text)": { A: () => ["select public.connect_habilitar('recarga', false, 'Tentativa de desligar')", []], outraOrganizacao: false, semPermissao: true },
  "connect_ligar_pdv(integer,uuid)": { A: () => ["select public.connect_ligar_pdv(7001, $1)", [ids.lojaA]], semPermissao: true },
  "connect_transferir_chips(text,integer,text,text,text,integer,text)": {
    A: () => ["select public.connect_transferir_chips(p_tipo => 'esim', p_pdv => 7001, p_quantidade => 1, p_chave => $1)", [chave("ataque")]], semPermissao: true,
  },
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
  // A carga do estoque inicial por loja (REIN-b): gera a prévia quem importa (o administrador); aplica e desfaz quem aprova
  // (o dono). O vendedor, o gerente e a outra rede são recusados.
  "estoque_carga_previa(uuid,uuid,text,text,timestamp with time zone,jsonb,jsonb)": {
    A: () => ["select public.estoque_carga_previa($1, $2, 'ataque.csv', $3, now() - interval '1 hour', '{}'::jsonb, $4::jsonb)",
      [ids.organizacao, ids.lojaA, "f".repeat(64), JSON.stringify([{ numero: 2, sku: "ACE-0001", fisico: 1 }])]],
    semPermissao: true,
  },
  "estoque_carga_aplicar(uuid,text)": { A: () => ["select public.estoque_carga_aplicar($1, 'Tentativa')", [alvo.cargaPrevia]], semPermissao: true },
  "estoque_carga_descartar(uuid,text)": { A: () => ["select public.estoque_carga_descartar($1, 'Tentativa')", [alvo.cargaPrevia]], semPermissao: true },
  "estoque_carga_desfazer(uuid,text)": { A: () => ["select public.estoque_carga_desfazer($1, 'Tentativa')", [alvo.cargaAplicada]], semPermissao: true },
  "estoque_carga_resolver(uuid,text,text,integer)": { A: () => ["select public.estoque_carga_resolver($1, 'disponivel', 'Tentativa')", [alvo.cargaPrevia]], semPermissao: true },
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
  // FIN-004b: os documentos da conta (boleto, nota, comprovante); quem gere a conta.
  "conta_pagar_anexar(uuid,text,text,text,text)": {
    A: () => ["select public.conta_pagar_anexar($1, 'boleto', null, $2, $3)", [alvo.contaPagarA, `${ids.organizacao}/${alvo.contaPagarA}/00000000-0000-4000-a000-000000000061.pdf`, "b".repeat(64)]],
    B: () => ["select public.conta_pagar_anexar($1, 'boleto', null, $2, $3)", [alvo.contaPagarB, `${ids.organizacao}/${alvo.contaPagarB}/00000000-0000-4000-a000-000000000062.pdf`, "b".repeat(64)]],
    semPermissao: true,
  },
  "conta_pagar_retirar_anexo(uuid,text)": {
    A: () => ["select public.conta_pagar_retirar_anexo($1, 'Tentativa')", [alvo.anexoContaA]], B: () => ["select public.conta_pagar_retirar_anexo($1, 'Tentativa')", [alvo.anexoContaB]], semPermissao: true,
  },
  // FIN-004a: ligar (ou desligar) o lançamento à entrada de mercadoria; quem gere a conta.
  "conta_pagar_ligar_entrada(uuid,uuid,text)": {
    A: () => ["select public.conta_pagar_ligar_entrada($1, null, 'Tentativa')", [alvo.contaPagarA]],
    B: () => ["select public.conta_pagar_ligar_entrada($1, null, 'Tentativa')", [alvo.contaPagarB]], semPermissao: true,
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
  // INTEG-c (#101): a conferência do destinatário é da gerência (nota.aprovar) da loja da nota.
  "nota_confirmar_destinatario(uuid,text)": {
    A: () => ["select public.nota_confirmar_destinatario($1, 'Conferi o CPF no PDF da nota')", [alvo.notaA]],
    B: () => ["select public.nota_confirmar_destinatario($1, 'Conferi o CPF no PDF da nota')", [alvo.notaB]], semPermissao: true,
  },
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
  // Pedidos dos marketplaces por arquivo (MKTPL-a): do dono (resultado.ver), na rede dele; o dono de outra rede grava na rede dele.
  "marketplace_importar(text,text,text,integer,jsonb,jsonb)": {
    A: () => ["select public.marketplace_importar('mercado_livre', 'ataque.csv', $1, 1, '[{\"id_externo\": \"ATAQUE\", \"data\": \"2026-11-17\", \"bruto\": 100, \"itens\": [{\"numero\": 1, \"quantidade\": 1, \"valor\": 100}]}]'::jsonb, '{}'::jsonb)", ["f".repeat(64)]],
    outraOrganizacao: false, semPermissao: true,
  },
  // Custo dos anúncios por arquivo (META-a): do dono (resultado.ver), na rede dele; o dono de outra rede grava na rede dele.
  "anuncios_importar(text,text,text,jsonb,jsonb)": {
    A: () => ["select public.anuncios_importar('meta', 'ataque.csv', $1, '[{\"numero\": 1, \"dia\": \"2026-11-17\", \"campanha\": \"Ataque\", \"gasto\": 100}]'::jsonb, '{}'::jsonb)", ["e".repeat(64)]],
    outraOrganizacao: false, semPermissao: true,
  },
  // Extratos e conciliação por arquivo (EXT-a): de quem concilia pagamentos na loja (pagamento.conciliar); o vendedor não.
  "extrato_importar(uuid,text,text,text[],text,text,jsonb,jsonb)": {
    A: () => ["select public.extrato_importar($1, 'maquininha', 'Ataque', '{pix_direto}', 'ataque.csv', $2, '[{\"numero\": 1, \"data\": \"2026-11-17\", \"valor\": 100}]'::jsonb, '{}'::jsonb)", [ids.lojaA, "c".repeat(64)]],
    B: () => ["select public.extrato_importar($1, 'maquininha', 'Ataque', '{pix_direto}', 'ataque.csv', $2, '[{\"numero\": 1, \"data\": \"2026-11-17\", \"valor\": 100}]'::jsonb, '{}'::jsonb)", [ids.lojaB, "d".repeat(64)]],
    semPermissao: true,
  },
  // FIN-001a: a conferência do período é de quem vê as vendas da loja ou da rede; o vendedor, que só vê as próprias, não.
  "financeiro_conferencia(timestamp with time zone,timestamp with time zone,uuid)": {
    leitura: true,
    A: () => ["select public.financeiro_conferencia(now() - interval '1 day', now() + interval '1 day', $1) as v", [ids.lojaA]],
    B: () => ["select public.financeiro_conferencia(now() - interval '1 day', now() + interval '1 day', $1) as v", [ids.lojaB]], semPermissao: true,
  },
  // FIN-001b: a conferência do que foi desfeito, com as mesmas pessoas da conferência do período.
  "financeiro_conferencia_do_desfeito(timestamp with time zone,timestamp with time zone,uuid)": {
    leitura: true,
    A: () => ["select public.financeiro_conferencia_do_desfeito(now() - interval '1 day', now() + interval '1 day', $1) as v", [ids.lojaA]],
    B: () => ["select public.financeiro_conferencia_do_desfeito(now() - interval '1 day', now() + interval '1 day', $1) as v", [ids.lojaB]], semPermissao: true,
  },
  "extratos_recentes(integer)": { leitura: true, A: () => ["select * from public.extratos_recentes(50)", []], semPermissao: true },
  "extrato_sugestoes(uuid)": {
    leitura: true, A: () => ["select * from public.extrato_sugestoes($1)", [alvo.extratoA]], B: () => ["select * from public.extrato_sugestoes($1)", [alvo.extratoB]],
    semPermissao: true,
  },
  "extrato_conciliar(uuid,uuid)": {
    A: () => ["select public.extrato_conciliar($1, $2)", [alvo.linhaExtratoA, alvo.pagamentoA]],
    B: () => ["select public.extrato_conciliar($1, $2)", [alvo.linhaExtratoB, alvo.pagamentoB]], semPermissao: true,
  },
  "extrato_conciliar_certas(uuid)": {
    A: () => ["select public.extrato_conciliar_certas($1)", [alvo.extratoA]], B: () => ["select public.extrato_conciliar_certas($1)", [alvo.extratoB]],
    semPermissao: true,
  },
  "extrato_ignorar(uuid,text)": {
    A: () => ["select public.extrato_ignorar($1, 'Tentativa')", [alvo.linhaExtratoA]], B: () => ["select public.extrato_ignorar($1, 'Tentativa')", [alvo.linhaExtratoB]],
    semPermissao: true,
  },
  // PAY-011a: o débito do extrato e o estorno da venda. As sugestões e ligar são de quem concilia na loja do extrato; o
  // débito e o estorno de cada loja existem e casam (o mesmo valor e o mesmo meio): a recusa aqui é só a do acesso.
  "extrato_sugestoes_de_estorno(uuid)": {
    leitura: true, A: () => ["select * from public.extrato_sugestoes_de_estorno($1)", [alvo.extratoA]],
    B: () => ["select * from public.extrato_sugestoes_de_estorno($1)", [alvo.extratoB]], semPermissao: true,
  },
  "extrato_casar_estorno(uuid,uuid,boolean)": {
    A: () => ["select public.extrato_casar_estorno($1, $2, false)", [alvo.linhaDebitoA, alvo.estornoA]],
    B: () => ["select public.extrato_casar_estorno($1, $2, false)", [alvo.linhaDebitoB, alvo.estornoB]], semPermissao: true,
  },
  // A marca de chargeback: o débito de cada loja já está ligado a um estorno confirmado (alvo.linhaDeEstorno), sem a marca.
  "extrato_estorno_chargeback(uuid,boolean,text)": {
    A: () => ["select public.extrato_estorno_chargeback($1, true, 'Tentativa')", [alvo.linhaDeEstornoA]],
    B: () => ["select public.extrato_estorno_chargeback($1, true, 'Tentativa')", [alvo.linhaDeEstornoB]], semPermissao: true,
  },
  // Contas bancárias (CONTAS-a): de quem concilia pela rede inteira (o dono); a gerência da loja e o vendedor, não. O dono
  // de outra rede não cria conta na empresa desta nem acha a conta e o extrato dela.
  "conta_bancaria_criar(uuid,text,text,text,text,bigint,date)": {
    A: () => ["select public.conta_bancaria_criar($1, 'Conta intrusa', 'Banco intruso', null, null, 0, current_date)", [ids.empresa]], semPermissao: true,
  },
  "conta_bancaria_atualizar(uuid,text,text,text,text,bigint,date,boolean,text)": {
    A: () => ["select public.conta_bancaria_atualizar($1, 'Conta intrusa', 'Banco intruso', null, null, 0, current_date, false, 'Tentativa')", [alvo.contaBancaria]],
    semPermissao: true,
  },
  "extrato_da_conta(uuid,uuid,text)": {
    A: () => ["select public.extrato_da_conta($1, $2, 'Tentativa')", [alvo.extratoBanco, alvo.contaBancaria]], semPermissao: true,
  },
  // Repasses dos marketplaces (REPASSE-a): de quem vê o resultado e concilia pela rede (o dono). O dono de outra rede não
  // acha a linha do extrato desta. Desfazer pede o canal e a data, sem objeto: o dono de outra rede só desfaz na rede dele
  // (aqui não acha nada, e nada muda nesta).
  "marketplace_repasse_casar(text,date,uuid,text)": {
    A: () => ["select public.marketplace_repasse_casar('mercado_livre', current_date - 2, $1, 'Tentativa')", [alvo.linhaBanco]], semPermissao: true,
  },
  "marketplace_repasse_desfazer(text,date,text)": {
    A: () => ["select public.marketplace_repasse_desfazer('shopee', current_date - 5, 'Tentativa')", []], outraOrganizacao: false, semPermissao: true,
  },
  // Depósitos das maquininhas (FIN-006a): de quem concilia pela rede inteira (o dono). O dono de outra rede não acha a linha
  // do extrato desta; desfazer pede a maquininha e o dia, sem objeto: na rede dele não acha nada, e nada muda nesta.
  "maquininha_deposito_casar(text,date,uuid,text)": {
    A: () => ["select public.maquininha_deposito_casar('picpay', current_date, $1, 'Tentativa')", [alvo.linhaBanco]], semPermissao: true,
  },
  "maquininha_deposito_desfazer(text,date,text)": {
    A: () => ["select public.maquininha_deposito_desfazer('picpay', current_date, 'Tentativa')", []], outraOrganizacao: false, semPermissao: true,
  },
  // O aviso do erro do servidor (QUAL-006a): o relato pede o segredo dos avisos (o worker chama sem sessão de pessoa); a
  // situação é de quem gere as lojas pela rede inteira, e a linha é a mesma para todas as redes (o site é um só): para o
  // dono de outra rede, ler é legítimo.
  "erros_do_servidor_relatar(text,jsonb)": {
    A: () => ["select public.erros_do_servidor_relatar('segredo-errado-com-tamanho-suficiente-000000', '{\"respondeu\": false}'::jsonb) as v", []],
  },
  "erros_do_servidor_situacao()": {
    leitura: true, A: () => ["select public.erros_do_servidor_situacao() as v", []], outraOrganizacao: false, semPermissao: true,
  },
  "extrato_desfazer(uuid,text)": {
    A: () => ["select public.extrato_desfazer($1, 'Tentativa')", [alvo.linhaIgnoradaA]], B: () => ["select public.extrato_desfazer($1, 'Tentativa')", [alvo.linhaIgnoradaB]],
    semPermissao: true,
  },
  // Financeiras (L7b): registrar e desfazer o repasse e a lista são da gerência da loja (pagamento.conciliar).
  "financeira_registrar_repasse(uuid,text,bigint,date,bigint,uuid)": {
    A: () => ["select public.financeira_registrar_repasse($1, 'Teste de autorização', 100, current_date, null, gen_random_uuid())", [alvo.contaReceberA]],
    B: () => ["select public.financeira_registrar_repasse($1, 'Teste de autorização', 100, current_date, null, gen_random_uuid())", [alvo.contaReceberB]], semPermissao: true,
  },
  "financeira_desfazer_repasse_final(uuid,uuid,text)": {
    A: () => ["select public.financeira_desfazer_repasse_final($1, gen_random_uuid(), 'Tentativa')", [alvo.contaReceberA]],
    B: () => ["select public.financeira_desfazer_repasse_final($1, gen_random_uuid(), 'Tentativa')", [alvo.contaReceberB]], semPermissao: true,
  },
  "financeira_desfazer_repasse_parcial(uuid,uuid,text)": {
    A: () => ["select public.financeira_desfazer_repasse_parcial($1, gen_random_uuid(), 'Tentativa')", [alvo.contaReceberA]],
    B: () => ["select public.financeira_desfazer_repasse_parcial($1, gen_random_uuid(), 'Tentativa')", [alvo.contaReceberB]], semPermissao: true,
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
  // FIN-007a: o prazo de repasse é de quem concilia pela rede inteira (para o dono de outra rede, definir o da rede dele é
  // legítimo); a cobrança, de quem concilia na loja da conta; a lista dos atrasados, de quem concilia na loja ou na rede.
  "prazo_de_repasse_definir(text,integer,text)": {
    A: () => ["select public.prazo_de_repasse_definir('payjoy', 30, 'Tentativa de definir o prazo')", []], outraOrganizacao: false, semPermissao: true,
  },
  "cobranca_de_repasse_registrar(uuid,text,text,text,date,text)": {
    A: () => ["select public.cobranca_de_repasse_registrar($1, 'telefone', 'Tentativa de cobrança', null, null, $2)", [alvo.contaReceberA, chave("ataque")]],
    B: () => ["select public.cobranca_de_repasse_registrar($1, 'telefone', 'Tentativa de cobrança', null, null, $2)", [alvo.contaReceberB, chave("ataque")]], semPermissao: true,
  },
  "repasses_atrasados(uuid)": {
    leitura: true, A: () => ["select public.repasses_atrasados($1) as v", [ids.lojaA]], B: () => ["select public.repasses_atrasados($1) as v", [ids.lojaB]], semPermissao: true,
  },
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
  // A fila das vendas sem pedido de nota da Saúde da operação (SAUDE-a): só quem aprova nota, nas lojas dele; a
  // outra rede recebe a conta dela (zero), nunca a da rede atacada.
  "notas_vendas_sem_pedido()": { leitura: true, A: () => ["select public.notas_vendas_sem_pedido() as v", []], semPermissao: true },
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
  // Carta de correção da NF-e (FISC-009b): de quem aprova nota, na loja do pedido (o vendedor da loja A é recusado
  // antes de qualquer conferência da nota).
  "notas_registrar_carta_de_correcao(uuid,integer,text,text)": {
    A: () => ["select public.notas_registrar_carta_de_correcao($1, 1, '141260000654322', 'Tentativa de carta de correção intrusa')", [alvo.notaA]],
    B: () => ["select public.notas_registrar_carta_de_correcao($1, 1, '141260000654322', 'Tentativa de carta de correção intrusa')", [alvo.notaB]], semPermissao: true,
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
  // Pedido de compra (INV-009a): quem recebe mercadoria na loja (estoque.receber); o vendedor da loja A é recusado.
  "pedido_compra_criar(uuid,uuid,text,date,jsonb,text,text)": {
    A: () => ["select public.pedido_compra_criar($1, $2, null, null, $3::jsonb, null, $4)", [ids.lojaA, alvo.fornecedor, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque:pedido:a")]],
    B: () => ["select public.pedido_compra_criar($1, $2, null, null, $3::jsonb, null, $4)", [ids.lojaB, alvo.fornecedor, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque:pedido:b")]],
    semPermissao: true,
  },
  "pedido_compra_encerrar(uuid,text)": {
    A: () => ["select public.pedido_compra_encerrar($1, 'Tentativa')", [alvo.pedidoA]], B: () => ["select public.pedido_compra_encerrar($1, 'Tentativa')", [alvo.pedidoB]], semPermissao: true,
  },
  "pedido_compra_ligar_entrada(uuid,uuid,text)": {
    A: () => ["select public.pedido_compra_ligar_entrada($1, $2, 'Tentativa')", [alvo.entradaA, alvo.pedidoA]],
    B: () => ["select public.pedido_compra_ligar_entrada($1, $2, 'Tentativa')", [alvo.entradaB, alvo.pedidoB]], semPermissao: true,
  },
  "pedidos_compra(uuid,text)": {
    leitura: true, A: () => ["select public.pedidos_compra($1, null) as v", [ids.lojaA]], B: () => ["select public.pedidos_compra($1, null) as v", [ids.lojaB]], semPermissao: true,
  },
  "pedido_compra(uuid)": {
    leitura: true, A: () => ["select public.pedido_compra($1) as v", [alvo.pedidoA]], B: () => ["select public.pedido_compra($1) as v", [alvo.pedidoB]], semPermissao: true,
  },
  "pendencias_de_foto()": { leitura: true, A: () => ["select * from public.pendencias_de_foto()", []], contextoProprio: ["tecnico"] },
  // Limpeza das fotos enviadas sem registro (CAT-011b): quem envia fotos (catalogo.fotos); o vendedor é recusado.
  "fotos_sem_registro()": { leitura: true, A: () => ["select public.fotos_sem_registro() as v", []], semPermissao: true },
  "fotos_sem_registro_limpar(text[])": {
    A: () => ["select public.fotos_sem_registro_limpar($1::text[]) as v", [[`${ids.organizacao}/${cat.produtoCapa}/produto/00000000-0000-4000-a000-000000000071.webp`]]], semPermissao: true,
  },
  // #98 (INTEG-b): concluir a limpeza só das separações abertas da rede de quem envia fotos.
  "fotos_limpeza_concluir(text[])": {
    A: () => ["select public.fotos_limpeza_concluir($1::text[]) as v", [[`${ids.organizacao}/${cat.produtoCapa}/produto/00000000-0000-4000-a000-000000000071.webp`]]], semPermissao: true,
  },
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
  // ROT-a: as rotinas são do sistema, não de uma empresa; o dono de outra empresa vê a mesma lista na própria loja.
  "rotinas_situacao()": { leitura: true, A: () => ["select * from public.rotinas_situacao()", []], outraOrganizacao: false, semPermissao: true },
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
  // TRF-d: o que faltou no recebimento só tem destino pela loja de origem (voltou; a baixa, por quem ajusta estoque) ou
  // pela de destino (chegou depois). O vendedor da origem, sem estoque.transferir, é recusado.
  "transferencia_resolver_divergencia(uuid,text,text[],integer,text,text)": {
    A: () => ["select public.transferencia_resolver_divergencia($1, 'voltou_a_origem', null, 1, 'Tentativa de dar destino ao que faltou', $2)", [alvo.transfDivergenteA, chave("ataque")]],
    B: () => ["select public.transferencia_resolver_divergencia($1, 'voltou_a_origem', null, 1, 'Tentativa de dar destino ao que faltou', $2)", [alvo.transfDivergenteB, chave("ataque")]], semPermissao: true,
  },
  "transferencia_separar(uuid,uuid[])": {
    A: () => ["select public.transferencia_separar($1, '{}'::uuid[])", [alvo.transfSolicitadaA]],
    B: () => ["select public.transferencia_separar($1, '{}'::uuid[])", [alvo.transfSolicitadaB]], semPermissao: true,
  },
  // Pedir é de quem consulta estoque na origem ou no destino (ADR-007 §3); fora das duas lojas, não.
  // A remessa (TRF-a): pedir vários produtos de uma vez segue as regras do pedido avulso; enviar a remessa é só da
  // loja de origem, e o vendedor da origem, sem estoque.transferir, é recusado ao enviar a transferência separada.
  "transferencia_solicitar_remessa(uuid,uuid,jsonb,text,text)": {
    A: () => ["select public.transferencia_solicitar_remessa($1, $2, $3::jsonb, 'Tentativa', $4)", [ids.lojaB, ids.lojaA, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque")]],
    B: () => ["select public.transferencia_solicitar_remessa($1, $2, $3::jsonb, 'Tentativa', $4)", [ids.lojaB, ids.lojaC, JSON.stringify([{ variante: cat.capa, quantidade: 1 }]), chave("ataque")]],
  },
  // As lojas para escolher a origem e o destino (TRF-a): a outra rede recebe as dela, nunca uma da rede atacada.
  "transferencia_lojas()": { leitura: true, A: () => ["select * from public.transferencia_lojas()", []] },
  "transferencia_remessa_enviar(uuid)": {
    A: () => ["select public.transferencia_remessa_enviar($1)", [alvo.remessaA]], B: () => ["select public.transferencia_remessa_enviar($1)", [alvo.remessaB]], semPermissao: true,
  },
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
  // A lista dos arquivos sem registro de outra rede: a do atacante, vazia (nunca os da rede atacada).
  if (funcao === "fotos_sem_registro()") return linhas.length === 1 && ((linhas[0]?.v as { arquivos?: unknown[] } | undefined)?.arquivos ?? [1]).length === 0;
  if (funcao === "notas_vendas_sem_pedido()") return linhas.length === 1 && (linhas[0]?.v as { quantidade?: number } | undefined)?.quantidade === 0;
  if (funcao === "cliente_buscar(text,text)") return linhas.length === 1 && (linhas[0]?.v as { clientes?: unknown[] } | undefined)?.clientes?.length === 0;
  // A lista de lojas pode trazer as da rede de quem pergunta, nunca uma da rede atacada.
  if (funcao === "lojas_da_rede()" || funcao === "transferencia_lojas()") return linhas.every((l) => !LOJAS_DA_REDE_ATACADA.has(String(l.id)));
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
  // PAY-015c: uma assinatura no cartão do cliente do mundo em cada loja (pedidas pelo vendedorAB, esperando o worker).
  alvo.assinaturaA = (await valor<{ id: string }>(await naLoja(ids.vendedorAB, ids.lojaA),
    "select public.assinatura_pedir($1, 'Plano do mundo', 5490, 'MONTHLY', null, 'mundo:assinatura:A') as v", [alvo.clienteA])).id;
  alvo.assinaturaB = (await valor<{ id: string }>(await naLoja(ids.vendedorAB, ids.lojaB),
    "select public.assinatura_pedir($1, 'Plano do mundo', 5490, 'MONTHLY', null, 'mundo:assinatura:B') as v", [alvo.clienteA])).id;
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
  // Uma região (ORG-009), da rede, gravada pelo banco: só alvo.
  alvo.regiao = (await db.query<{ id: string }>("insert into public.regioes (organizacao_id, nome, criado_por) values ($1, 'Região do mundo', $2) returning id",
    [ids.organizacao, ids.dono])).rows[0]?.id ?? "";
  // Um código de outro canal (CAT-009), da rede, gravado pelo banco: só alvo.
  alvo.codigoCanal = (await db.query<{ id: string }>(
    "insert into public.variante_codigos_externos (organizacao_id, variante_id, canal, codigo, ligado_por) values ($1, $2, 'rein', 'MUNDO-1', $3) returning id",
    [ids.organizacao, cat.capa, ids.dono])).rows[0]?.id ?? "";
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
    // Um extrato da maquininha (EXT-a) com uma linha pendente do valor desse Pix e uma ignorada (gravados pelo banco: só alvo).
    alvo[`extrato${lado}`] = (await db.query<{ id: string }>(
      `insert into public.extratos (organizacao_id, unidade_id, tipo, fonte, meios, arquivo, impressao, periodo_inicio, periodo_fim, linhas, importado_por)
       values ($1, $2, 'maquininha', 'Extrato do mundo', '{pix_direto}', 'mundo.csv', $3, current_date, current_date, 4, $4) returning id`,
      [ids.organizacao, loja, (lado === "A" ? "a" : "b").repeat(64), ids.dono])).rows[0]?.id ?? "";
    alvo[`linhaExtrato${lado}`] = (await db.query<{ id: string }>(
      "insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, referencia) values ($1, $2, 1, current_date, 100, 'MUNDO-PIX') returning id",
      [alvo[`extrato${lado}`], ids.organizacao])).rows[0]?.id ?? "";
    alvo[`linhaIgnorada${lado}`] = (await db.query<{ id: string }>(
      `insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, situacao, motivo, decidida_por, decidida_em)
       values ($1, $2, 2, current_date, -100, 'ignorada', 'Estorno do mundo', $3, now()) returning id`,
      [alvo[`extrato${lado}`], ids.organizacao, ids.dono])).rows[0]?.id ?? "";
    // PAY-011a: um débito pendente do valor do estorno a confirmar da loja (alvo.estorno), para a tentativa de ligar os dois.
    alvo[`linhaDebito${lado}`] = (await db.query<{ id: string }>(
      "insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, descricao) values ($1, $2, 3, current_date, $3, 'Estorno do Pix do mundo') returning id",
      [alvo[`extrato${lado}`], ids.organizacao, lado === "A" ? -149_900 : -139_900])).rows[0]?.id ?? "";
    // E um débito já ligado a um estorno confirmado (os dois gravados pelo banco: só alvo), para a tentativa de mexer na marca de chargeback.
    const estornoConfirmado = (await db.query<{ id: string }>(
      `insert into public.estornos_externos (organizacao_id, unidade_id, venda_id, pagamento_id, meio, valor_centavos, situacao, solicitado_por, confirmado_por, confirmado_em, comprovante)
       values ($1, $2, $3, $4, 'pix_direto', 250, 'confirmado', $5, $5, now(), 'MUNDO-ESTORNO') returning id`,
      [ids.organizacao, loja, alvo[`concluida${lado}`], alvo[`pagamento${lado}`], ids.dono])).rows[0]?.id ?? "";
    alvo[`linhaDeEstorno${lado}`] = (await db.query<{ id: string }>(
      `insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, situacao, estorno_id, confirmou_o_estorno, chargeback, decidida_por, decidida_em)
       values ($1, $2, 4, current_date, -250, 'estorno', $3, false, false, $4, now()) returning id`,
      [alvo[`extrato${lado}`], ids.organizacao, estornoConfirmado, ids.dono])).rows[0]?.id ?? "";
    // Um pedido de saída do caixa (L7c), pendente, do vendedorAB.
    alvo[`saida${lado}`] = (await db.query<{ id: string }>(
      "insert into public.caixa_saidas (organizacao_id, unidade_id, caixa_id, valor_centavos, motivo, chave, pedida_por) values ($1, $2, $3, 100, 'Pedido do mundo', $4, $5) returning id",
      [ids.organizacao, loja, alvo[`caixa${lado}`], `mundo:saida:${lado}`, ids.vendedorAB])).rows[0]?.id ?? "";
    // Uma conta a receber de financeira (L7b), aberta.
    alvo[`contaReceber${lado}`] = (await db.query<{ id: string }>(
      "insert into public.contas_a_receber (organizacao_id, unidade_id, venda_id, pagamento_id, devedor, valor_centavos) values ($1, $2, $3, $4, 'payjoy', 100) returning id",
      [ids.organizacao, loja, alvo[`concluida${lado}`], alvo[`pagamento${lado}`]])).rows[0]?.id ?? "";
  }
  // Uma conta bancária da rede (CONTAS-a), um extrato do banco da rede ainda sem conta, com duas linhas de crédito, um pedido
  // do Mercado Livre com a data de repasse e um repasse da Shopee já casado com a segunda linha (REPASSE-a): só alvo.
  alvo.contaBancaria = (await db.query<{ id: string }>(
    `insert into public.contas_bancarias (organizacao_id, empresa_id, apelido, banco, saldo_inicial_centavos, saldo_inicial_em, criada_por)
     values ($1, $2, 'Conta do mundo', 'Banco do mundo', 0, current_date - 30, $3) returning id`, [ids.organizacao, ids.empresa, ids.dono])).rows[0]?.id ?? "";
  alvo.extratoBanco = (await db.query<{ id: string }>(
    `insert into public.extratos (organizacao_id, unidade_id, tipo, fonte, meios, arquivo, impressao, periodo_inicio, periodo_fim, linhas, importado_por)
     values ($1, null, 'banco', 'Banco do mundo', '{pix_direto}', 'mundo.ofx', $2, current_date - 5, current_date - 1, 2, $3) returning id`,
    [ids.organizacao, "9".repeat(64), ids.dono])).rows[0]?.id ?? "";
  alvo.linhaBanco = (await db.query<{ id: string }>(
    "insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, descricao) values ($1, $2, 1, current_date - 1, 900, 'TED do mundo') returning id",
    [alvo.extratoBanco, ids.organizacao])).rows[0]?.id ?? "";
  const linhaCasada = (await db.query<{ id: string }>(
    "insert into public.extrato_linhas (extrato_id, organizacao_id, numero, data, valor_centavos, descricao) values ($1, $2, 2, current_date - 5, 500, 'TED do mundo') returning id",
    [alvo.extratoBanco, ids.organizacao])).rows[0]?.id ?? "";
  const importacaoDoMundo = (await db.query<{ id: string }>(
    `insert into public.marketplace_importacoes (organizacao_id, canal, arquivo, impressao, periodo_inicio, periodo_fim, linhas, pedidos, novos, atualizados, importado_por)
     values ($1, 'mercado_livre', 'mundo.csv', $2, current_date - 3, current_date - 3, 1, 1, 1, 0, $3) returning id`, [ids.organizacao, "8".repeat(64), ids.dono])).rows[0]?.id ?? "";
  await db.query(
    `insert into public.marketplace_pedidos (organizacao_id, canal, id_externo, data, bruto_centavos, liquido_centavos, data_repasse, importacao_id)
     values ($1, 'mercado_livre', 'MUNDO-1', current_date - 3, 1000, 900, current_date - 2, $2)`, [ids.organizacao, importacaoDoMundo]);
  await db.query(
    `insert into public.marketplace_repasses (organizacao_id, canal, data_repasse, linha_id, pedidos, esperado_centavos, recebido_centavos, casado_por)
     values ($1, 'shopee', current_date - 5, $2, 1, 500, 500, $3)`, [ids.organizacao, linhaCasada, ids.dono]);
  // Uma conta a pagar aberta em cada loja (L8a), na categoria "Outras" da lista inicial (gravadas pelo banco: só alvo).
  alvo.categoriaPagar = (await db.query<{ id: string }>("select id from public.contas_pagar_categorias where organizacao_id = $1 and nome = 'Outras'", [ids.organizacao])).rows[0]?.id ?? "";
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    alvo[`contaPagar${lado}`] = (await db.query<{ id: string }>(
      `insert into public.contas_a_pagar (organizacao_id, unidade_id, categoria_id, descricao, valor_centavos, vencimento, grupo_id, forma, chave, criada_por)
       values ($1, $2, $3, 'Conta do mundo', 100, current_date + 10, gen_random_uuid(), 'unica', $4, $5) returning id`,
      [ids.organizacao, loja, alvo.categoriaPagar, `mundo:contapagar:${lado}`, ids.dono])).rows[0]?.id ?? "";
    // Um documento da conta (FIN-004b), gravado pelo banco: só alvo.
    alvo[`anexoConta${lado}`] = (await db.query<{ id: string }>(
      `insert into public.conta_pagar_anexos (organizacao_id, unidade_id, conta_id, tipo, caminho, formato, bytes, sha256, enviado_por)
       values ($1, $2, $3, 'boleto', $4, 'pdf', 1000, $5, $6) returning id`,
      [ids.organizacao, loja, alvo[`contaPagar${lado}`], `${ids.organizacao}/${alvo[`contaPagar${lado}`]}/00000000-0000-4000-a000-00000000005${lado === "A" ? 1 : 2}.pdf`, "a".repeat(64), ids.dono])).rows[0]?.id ?? "";
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
  // Um fornecedor e um pedido de compra aberto em cada loja (INV-009a; gravados pelo banco: só alvo, sem linhas).
  alvo.fornecedor = (await db.query<{ id: string }>(
    "insert into public.fornecedores (organizacao_id, nome, criado_por) values ($1, 'Fornecedor do mundo', $2) returning id", [ids.organizacao, ids.dono])).rows[0]?.id ?? "";
  for (const [lado, loja] of [["A", ids.lojaA], ["B", ids.lojaB]] as const) {
    alvo[`pedido${lado}`] = (await db.query<{ id: string }>(
      "insert into public.pedidos_compra (organizacao_id, unidade_id, fornecedor_id, chave, conteudo, total_unidades, criado_por) values ($1, $2, $3, $4, 'mundo', 1, $5) returning id",
      [ids.organizacao, loja, alvo.fornecedor, `mundo:pedido:${lado}`, ids.dono])).rows[0]?.id ?? "";
  }
  // Uma prévia e uma importação aplicada da rede A (gravadas pelo banco: só alvo, sem linhas).
  for (const [chave, situacao] of [["importacaoPrevia", "previa"], ["importacaoAplicada", "aplicada"]] as const) {
    alvo[chave] = (await db.query<{ id: string }>(
      "insert into public.importacoes (organizacao_id, arquivo_nome, arquivo_sha256, mapeamento, situacao, criado_por) values ($1, $2, $3, '{}'::jsonb, $4, $5) returning id",
      [ids.organizacao, `mundo-${situacao}.csv`, (situacao === "previa" ? "b" : "c").repeat(64), situacao, ids.administrador])).rows[0]?.id ?? "";
  }
  // Uma prévia e uma carga aplicada do estoque inicial da rede A (REIN-b; gravadas direto: só alvo, sem linhas).
  for (const [chave, situacao, loja] of [["cargaPrevia", "previa", ids.lojaA], ["cargaAplicada", "aplicada", ids.lojaB]] as const) {
    alvo[chave] = (await db.query<{ id: string }>(
      "insert into public.estoque_cargas (organizacao_id, unidade_id, arquivo_nome, arquivo_sha256, corte, mapeamento, situacao, criado_por) values ($1, $2, $3, $4, now() - interval '1 day', '{}'::jsonb, $5, $6) returning id",
      [ids.organizacao, loja, `mundo-carga-${situacao}.csv`, (situacao === "previa" ? "d" : "e").repeat(64), situacao, ids.administrador])).rows[0]?.id ?? "";
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
  // Reservas do site (ONLINE-b) nas lojas A e B: a capa vai para o site só para isso; o aparelho segue fora dele.
  await db.query("update public.produtos set publicar_online = true where id = $1", [cat.produtoCapa]);
  for (const [nome, loja, telefone] of [["reservaSiteA", ids.lojaA, "41999990001"], ["reservaSiteB", ids.lojaB, "41999990002"]] as const) {
    const codigo = (await db.query<{ v: { codigo: string } }>("select public.loja_reservar($1, $2, $3, 'Cliente do mundo', $4, $5) as v",
      [ids.organizacao, cat.capa, loja, telefone, `mundo:${nome}`])).rows[0]?.v.codigo;
    alvo[nome] = (await db.query<{ id: string }>("select id from public.loja_reservas where codigo = $1", [codigo])).rows[0]?.id ?? "";
  }
  // Pedidos do site (ONLINE-d) nas lojas A e B, com outros WhatsApp: a capa já está no site.
  for (const [nome, loja, telefone] of [["pedidoSiteA", ids.lojaA, "41999990003"], ["pedidoSiteB", ids.lojaB, "41999990004"]] as const) {
    const codigo = (await db.query<{ v: { codigo: string } }>("select public.loja_pedir($1, $2, $3::jsonb, 'Cliente do mundo', $4, $5) as v",
      [ids.organizacao, loja, JSON.stringify([{ variante: cat.capa }]), telefone, `mundo:${nome}`])).rows[0]?.v.codigo;
    alvo[nome] = (await db.query<{ id: string }>("select id from public.loja_pedidos where codigo = $1", [codigo])).rows[0]?.id ?? "";
  }
  // Avisos no celular (PWA-b): o celular do vendedorAB, alvo de quem tenta desligá-lo.
  alvo.celularA = "https://push.exemplo.invalid/mundo/vendedorAB";
  await db.query("insert into privado.avisos_inscricoes (usuario_id, endpoint, p256dh, auth) values ($1, $2, $3, $4)",
    [ids.vendedorAB, alvo.celularA, `B${"A".repeat(86)}`, "x".repeat(22)]);
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
    expect(expostas).toHaveLength(240);
  });

  it("visitante anônimo executa só a vitrine, a reserva e o pedido da loja online (ONLINE-a, ONLINE-b e ONLINE-d), a leitura leve do banco da página /saude (SAUDE-a), a fila dos avisos, que pede o segredo (PWA-b), o relato dos erros do site, que pede o mesmo segredo (QUAL-006a), e o pagamento pelo site: saber se está ligado, pedir para pagar o pedido (com o código e o WhatsApp) e o aviso da Asaas, que pede o token (PAY-014a); no privado, a conferência da foto do site e um gatilho, que não roda sozinho", async () => {
    const { rows } = await db.query<{ f: string; gatilho: boolean }>(`
      select p.oid::regprocedure::text as f, p.prorettype = 'trigger'::regtype as gatilho from pg_proc p
      where p.pronamespace in ('public'::regnamespace, 'privado'::regnamespace) and has_function_privilege('anon', p.oid, 'EXECUTE')`);
    expect(rows.sort((a, b) => a.f.localeCompare(b.f))).toEqual([
      { f: "avisos_a_enviar(text,integer)", gatilho: false }, { f: "avisos_resultado(text,jsonb)", gatilho: false },
      { f: "erros_do_servidor_relatar(text,jsonb)", gatilho: false },
      { f: "loja_pagamento_disponivel()", gatilho: false }, { f: "loja_pagamento_pedir(uuid,text,text)", gatilho: false },
      { f: "loja_pedido_consultar(uuid,text,text)", gatilho: false }, { f: "loja_pedir(uuid,uuid,jsonb,text,text,text,jsonb)", gatilho: false },
      { f: "loja_produto(uuid,uuid)", gatilho: false }, { f: "loja_reservar(uuid,uuid,uuid,text,text,text,jsonb)", gatilho: false }, { f: "loja_vitrine(uuid,text,uuid,integer)", gatilho: false },
      { f: "pagamento_aviso_receber(text,jsonb)", gatilho: false },
      { f: "privado.auditoria_completar_organizacao()", gatilho: true }, { f: "privado.foto_na_vitrine(text)", gatilho: false },
      { f: "saude_do_banco(text)", gatilho: false },
    ]);
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
        if (caso.publica) {
          if (antes !== depois) falhas.push(`${descricao} (o banco mudou)`);
          if (novasNaAuditoria.length > 0) falhas.push(`${descricao} (auditoria registrou ${novasNaAuditoria.join(", ")})`);
          if (r.codigo !== null && !CODIGOS_DE_RECUSA.has(r.codigo) && !caso.outrosCodigosDeRecusa?.includes(r.codigo)) falhas.push(`${descricao} (falhou por outro motivo)`);
          if (r.codigo === null && !(await caso.publica(r.linhas))) falhas.push(`${descricao} (trouxe o que não é do site)`);
          continue;
        }
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

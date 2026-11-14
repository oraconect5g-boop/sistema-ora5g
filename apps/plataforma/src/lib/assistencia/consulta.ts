// Leituras da assistência (lote L12a): a lista das OS pela regra de leitura do banco (RLS), as contagens do topo e a
// OS com a trilha e as fotos. Falha de leitura nunca vira zero nem lista vazia: cada leitura devolve o próprio estado.
import type { obterSessao } from "../acesso/sessao";
import type { Leitura } from "../leitura-do-banco";
import { ehLocal, ehServico, ehSituacao, type Local, type PecaDoOrcamento, type ServicoDaOs, type SituacaoDaOs } from "./regras";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const SEM_TABELA = new Set(["PGRST205", "42P01", "PGRST202", "42883"]);
const SEM_COLUNA = new Set(["42703", "PGRST204"]);
export const POR_PAGINA = 50;

// L12c: "prontas" = conserto concluído e o aparelho de volta na loja, esperando a cobrança no PDV e a entrega.
export const VISOES = { abertas: "Abertas", na_loja: "Na loja", prontas: "Prontas para entregar", fora: "Com o técnico", encerradas: "Encerradas" } as const;
export type Visao = keyof typeof VISOES;
export const ehVisao = (v: unknown): v is Visao => typeof v === "string" && Object.hasOwn(VISOES, v);
const FORA: Local[] = ["a_caminho_do_tecnico", "com_tecnico", "a_caminho_da_loja"];

export type OsDaLista = {
  id: string; numero: number; unidadeId: string; clienteNome: string; aparelho: string; imei: string | null; numeroSerie: string | null;
  local: Local; situacao: SituacaoDaOs; prazo: string | null; abertaEm: string; atualizadaEm: string;
};
const COLUNAS_DA_LISTA = "id, numero, unidade_id, cliente_nome, aparelho, imei, numero_serie, local, situacao, prazo, aberta_em, atualizada_em";
type LinhaDaLista = { id: string; numero: number; unidade_id: string; cliente_nome: string; aparelho: string; imei: string | null; numero_serie: string | null;
  local: string; situacao: string; prazo: string | null; aberta_em: string; atualizada_em: string };

function daLista(l: LinhaDaLista): OsDaLista | null {
  if (!ehLocal(l.local) || !ehSituacao(l.situacao)) return null;
  return { id: l.id, numero: l.numero, unidadeId: l.unidade_id, clienteNome: l.cliente_nome, aparelho: l.aparelho, imei: l.imei, numeroSerie: l.numero_serie,
    local: l.local, situacao: l.situacao, prazo: l.prazo, abertaEm: l.aberta_em, atualizadaEm: l.atualizada_em };
}

/** Uma página da lista da visão escolhida, com o total contado no banco (as abertas da mais antiga para a mais nova). */
export async function listarOrdens(supabase: Cliente, visao: Visao, pagina: number): Promise<Leitura<{ ordens: OsDaLista[]; total: number }>> {
  let consulta = supabase.from("ordens_servico").select(COLUNAS_DA_LISTA, { count: "exact" });
  if (visao === "encerradas") consulta = consulta.neq("situacao", "aberta");
  else consulta = consulta.eq("situacao", "aberta");
  if (visao === "na_loja") consulta = consulta.eq("local", "loja");
  if (visao === "prontas") consulta = consulta.eq("local", "loja").eq("servico", "concluido");
  if (visao === "fora") consulta = consulta.in("local", FORA);
  const ordenada = visao === "encerradas"
    ? consulta.order("encerrada_em", { ascending: false }).order("id")
    : consulta.order("aberta_em", { ascending: true }).order("id");
  const r = await ordenada.range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA - 1);
  if (r.error) {
    if (SEM_TABELA.has(r.error.code) || (visao === "prontas" && SEM_COLUNA.has(r.error.code))) return { estado: "indisponivel" };
    console.error("assistência: falha ao listar as ordens de serviço", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  const ordens = (r.data as LinhaDaLista[]).map(daLista);
  if (ordens.some((o) => o === null) || r.count === null) return { estado: "falha" };
  return { estado: "ok", dados: { ordens: ordens as OsDaLista[], total: r.count } };
}

/** As contagens do topo (na loja, prontas, com o técnico, atrasadas). Sem número do banco, fica nulo: nunca zero. */
export async function contarOrdens(supabase: Cliente, hoje: string): Promise<{ naLoja: number; fora: number; atrasadas: number; prontas: number | null } | null> {
  const base = () => supabase.from("ordens_servico").select("id", { count: "exact", head: true }).eq("situacao", "aberta");
  const [naLoja, fora, atrasadas, prontas] = await Promise.all([
    base().eq("local", "loja"), base().in("local", FORA), base().lt("prazo", hoje), base().eq("local", "loja").eq("servico", "concluido"),
  ]);
  if (naLoja.error || fora.error || atrasadas.error || naLoja.count === null || fora.count === null || atrasadas.count === null) return null;
  // As prontas dependem do andamento do serviço (L12b): sem ele, só esse número fica nulo.
  return { naLoja: naLoja.count, fora: fora.count, atrasadas: atrasadas.count, prontas: prontas.error ? null : prontas.count };
}

// ---------------------------------------------------------------------------------------------
// A OS com a trilha e as fotos
// ---------------------------------------------------------------------------------------------
export type OrdemDeServico = {
  id: string; numero: number; organizacao_id: string; unidade_id: string; cliente_id: string; cliente_nome: string; contato_mascarado: string;
  aparelho: string; imei: string | null; numero_serie: string | null; defeito: string; estado_entrada: string; acessorios: string[]; acessorios_obs: string | null;
  prazo: string | null; local: Local; situacao: SituacaoDaOs; assistencia_id: string | null; aberta_por: string; aberta_em: string; atualizada_em: string;
  encerrada_em: string | null; motivo_encerramento: string | null;
};
export type EventoDaOs = { id: number; tipo: string; local_de: string | null; local_para: string | null; observacao: string | null; em_nome_do_tecnico: boolean; usuario_id: string; ocorrido_em: string };
export type FotoDaOs = { id: string; caminho: string; url: string | null; enviada_em: string };
export type OrcamentoDaOs = {
  id: string; numero: number; diagnostico: string; pecas: PecaDoOrcamento[]; mao_de_obra_centavos: number; pecas_centavos: number; total_centavos: number;
  prazo_dias: number | null; situacao: "aguardando_cliente" | "aprovado" | "recusado" | "substituido"; em_nome_do_tecnico: boolean; observacao: string | null;
  registrado_por: string; registrado_em: string; resposta_canal: string | null; resposta_observacao: string | null; respondido_por: string | null; respondido_em: string | null;
};
/** A venda que cobrou o conserto (L12c). O número vem da venda, quando quem vê pode lê-la, ou da trilha da OS. */
export type CobrancaDaOs = { vendaId: string | null; cobradaEm: string | null; vendaNumero: number | null; vendaVisivel: boolean };
export type LeituraDaOs =
  | { estado: "ok"; os: OrdemDeServico; eventos: EventoDaOs[]; fotos: FotoDaOs[]; nomes: Record<string, string>;
      /** L12b: nulo quando o banco ainda não tem o orçamento (migration orcamento_da_os): a tela esconde o cartão, sem inventar. */
      servico: ServicoDaOs | null; orcamentos: OrcamentoDaOs[] | null;
      /** L12c: nulo quando o banco ainda não tem a cobrança (migration entrega_da_os): a tela esconde o cartão, sem inventar. */
      cobranca: CobrancaDaOs | null }
  | { estado: "nao_encontrada" } | { estado: "indisponivel" } | { estado: "falha" };

const COLUNAS_DA_OS = "id, numero, organizacao_id, unidade_id, cliente_id, cliente_nome, contato_mascarado, aparelho, imei, numero_serie, defeito, estado_entrada, "
  + "acessorios, acessorios_obs, prazo, local, situacao, assistencia_id, aberta_por, aberta_em, atualizada_em, encerrada_em, motivo_encerramento";

export async function lerOrdem(supabase: Cliente, id: string): Promise<LeituraDaOs> {
  const os = await supabase.from("ordens_servico").select(COLUNAS_DA_OS).eq("id", id).maybeSingle();
  if (os.error) {
    if (SEM_TABELA.has(os.error.code)) return { estado: "indisponivel" };
    console.error("assistência: falha ao ler a ordem de serviço", { codigo: os.error.code || null });
    return { estado: "falha" };
  }
  if (!os.data) return { estado: "nao_encontrada" };
  const linha = os.data as unknown as OrdemDeServico;
  if (!ehLocal(linha.local) || !ehSituacao(linha.situacao)) return { estado: "falha" };
  const [eventos, fotos, servico, orcamentos, cobranca] = await Promise.all([
    supabase.from("os_eventos").select("id, tipo, local_de, local_para, observacao, em_nome_do_tecnico, usuario_id, ocorrido_em").eq("os_id", id).order("id"),
    supabase.from("os_fotos").select("id, caminho, enviada_em").eq("os_id", id).order("enviada_em").order("id"),
    // L12b, lidos à parte: num banco sem o orçamento, a coluna e a tabela faltam e a OS continua aparecendo.
    supabase.from("ordens_servico").select("servico").eq("id", id).maybeSingle(),
    supabase.from("os_orcamentos").select("id, numero, diagnostico, pecas, mao_de_obra_centavos, pecas_centavos, total_centavos, prazo_dias, situacao, em_nome_do_tecnico, "
      + "observacao, registrado_por, registrado_em, resposta_canal, resposta_observacao, respondido_por, respondido_em").eq("os_id", id).order("numero", { ascending: false }),
    // L12c, lida à parte do mesmo jeito: num banco sem a cobrança, a OS continua aparecendo.
    supabase.from("ordens_servico").select("venda_id, cobrada_em").eq("id", id).maybeSingle(),
  ]);
  if (eventos.error || fotos.error) {
    console.error("assistência: falha ao ler a trilha ou as fotos", { codigo: eventos.error?.code ?? fotos.error?.code ?? null });
    return { estado: "falha" };
  }
  const caminhos = fotos.data.map((f) => f.caminho);
  const assinadas = caminhos.length ? await supabase.storage.from("os").createSignedUrls(caminhos, 600) : { data: [], error: null };
  const urlDe = (caminho: string) => (assinadas.error ? null : assinadas.data?.find((a) => a.path === caminho && !a.error)?.signedUrl ?? null);
  const daServico = servico.error ? null : (servico.data as { servico?: unknown } | null)?.servico;
  const listaDeOrcamentos = orcamentos.error ? null : (orcamentos.data as unknown as OrcamentoDaOs[]);
  if ((servico.error && !SEM_COLUNA.has(servico.error.code)) || (orcamentos.error && !SEM_TABELA.has(orcamentos.error.code))) {
    console.error("assistência: falha ao ler o orçamento", { codigo: servico.error?.code ?? orcamentos.error?.code ?? null });
    return { estado: "falha" };
  }
  if (cobranca.error && !SEM_COLUNA.has(cobranca.error.code)) {
    console.error("assistência: falha ao ler a cobrança", { codigo: cobranca.error.code || null });
    return { estado: "falha" };
  }
  const daCobranca = cobranca.error ? null : (cobranca.data as { venda_id: string | null; cobrada_em: string | null } | null);
  let vendaNumero: number | null = null;
  let vendaVisivel = false;
  if (daCobranca?.venda_id) {
    const venda = await supabase.from("vendas").select("numero").eq("id", daCobranca.venda_id).maybeSingle();
    if (!venda.error && venda.data) {
      vendaNumero = venda.data.numero;
      vendaVisivel = true;
    } else {
      // Quem não lê a venda (o vendedor que não cobrou) vê o número pela trilha da OS.
      const cobrada = [...eventos.data].reverse().find((e) => e.tipo === "cobrada");
      const numero = /nº (\d+)/.exec(cobrada?.observacao ?? "")?.[1];
      vendaNumero = numero ? Number(numero) : null;
    }
  }
  const pessoas = [...new Set([linha.aberta_por, ...eventos.data.map((e) => e.usuario_id), ...(listaDeOrcamentos ?? []).flatMap((o) => [o.registrado_por, o.respondido_por]).filter((x): x is string => Boolean(x))])];
  const perfis = await supabase.from("perfis_usuario").select("id, nome").in("id", pessoas);
  const nomes: Record<string, string> = {};
  for (const p of perfis.data ?? []) nomes[p.id] = p.nome;
  return {
    estado: "ok", os: linha, eventos: eventos.data as EventoDaOs[],
    fotos: fotos.data.map((f) => ({ id: f.id, caminho: f.caminho, url: urlDe(f.caminho), enviada_em: f.enviada_em })), nomes,
    servico: ehServico(daServico) ? daServico : null, orcamentos: listaDeOrcamentos,
    cobranca: daCobranca ? { vendaId: daCobranca.venda_id, cobradaEm: daCobranca.cobrada_em, vendaNumero, vendaVisivel } : null,
  };
}

/** As assistências ativas da rede (para escolher para onde o aparelho vai). Nulo: banco sem a leitura ou falha. */
export async function assistenciasDaRede(supabase: Cliente): Promise<{ id: string; nome: string }[] | null> {
  const r = await supabase.rpc("os_assistencias");
  if (r.error || !Array.isArray(r.data)) return null;
  return (r.data as { id?: unknown; nome?: unknown }[]).filter((a): a is { id: string; nome: string } => typeof a.id === "string" && typeof a.nome === "string");
}

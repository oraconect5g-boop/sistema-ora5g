// Saúde da operação (lote Q1: ORA-QUAL-006 em parte): as filas que esperam alguém, cada uma com quantas e desde quando
// está a mais antiga, lidas pelo RLS de quem abre (o dono vê a rede; o gerente, a loja dele) e só para quem decide
// aquela fila (a mesma regra do Início). Uma consulta por fila: a contagem exata e a primeira linha pela data. Fila que
// o banco ainda não tem (tabela ausente) some; outra falha aparece como falha da fila (nunca zero). Só leitura.
import type { obterSessao } from "../acesso/sessao";
import { tabelaAusente } from "../caixa/saidas";
import { hojeEmSaoPaulo } from "../contas-a-pagar/regras";
import { MEIOS_CONCILIAVEIS } from "../financeiro/painel";
import type { NomeDoIconeDaPendencia } from "../inicio/icones-das-pendencias";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
// A coluna da data vem de cada fila (texto), então a linha chega sem tipo: só a data é lida, com cuidado.
type Resposta = { data: unknown; count: number | null; error: { code?: string } | null };

export type Fila = { chave: string; rotulo: string; detalhe: string; href: string; icone: NomeDoIconeDaPendencia; quantidade: number; desde: string | null };
export type LeituraDaFila = ({ estado: "ok" } & Fila) | { estado: "falha"; chave: string; rotulo: string; href: string; icone: NomeDoIconeDaPendencia };

type Definicao = {
  chave: string; rotulo: string; detalhe: string; href: string; icone: NomeDoIconeDaPendencia; coluna: string;
  permitida: (p: ReadonlySet<string>) => boolean;
  consulta: (s: Cliente, coluna: string, hoje: string) => PromiseLike<Resposta>;
};

const conta = { count: "exact" } as const;
const gestao = (p: ReadonlySet<string>) => p.has("venda.ver_unidade") || p.has("venda.ver_todas");

/** As filas, na ordem da tela (do balcão para o escritório). */
export const FILAS: readonly Definicao[] = [
  { chave: "descontos", rotulo: "Descontos para aprovar", detalhe: "pedidos dos vendedores", href: "/aprovacoes", icone: "desconto", coluna: "solicitado_em",
    permitida: (p) => p.has("desconto.aprovar"),
    consulta: (s, c) => s.from("aprovacoes_desconto").select(c, conta).eq("situacao", "pendente").order(c).limit(1) },
  { chave: "notas", rotulo: "Notas na fila", detalhe: "esperando aprovação ou o registro da chave", href: "/notas", icone: "nota", coluna: "venda_concluida_em",
    permitida: (p) => p.has("nota.aprovar"),
    consulta: (s, c) => s.from("notas_pedidos").select(c, conta).in("situacao", ["aguardando_aprovacao", "correcao_solicitada", "aprovada"]).order(c).limit(1) },
  { chave: "whatsapp", rotulo: "Notas a enviar pelo WhatsApp", detalhe: "na fila do envio, sem resposta do WhatsApp", href: "/notas", icone: "envio_whatsapp", coluna: "pedido_em",
    permitida: (p) => p.has("nota.aprovar"),
    consulta: (s, c) => s.from("whatsapp_envios").select(c, conta).in("situacao", ["na_fila", "enviando", "desconhecido"]).order(c).limit(1) },
  { chave: "connect", rotulo: "Ora Connect em andamento", detalhe: "ativações, portabilidades e recargas sem desfecho", href: "/connect", icone: "operadora", coluna: "criado_em",
    permitida: (p) => p.has("connect.gerir"),
    consulta: (s, c) => s.from("connect_operacoes").select(c, conta).in("situacao", ["registrada", "enviando", "aguardando_operadora", "resultado_desconhecido"]).order(c).limit(1) },
  { chave: "conciliacao", rotulo: "Pagamentos a conciliar", detalhe: "Pix e cartão ainda sem o extrato conferido", href: "/pagamentos/conciliacao", icone: "pagamento_a_conciliar", coluna: "criado_em",
    permitida: (p) => p.has("pagamento.conciliar"),
    consulta: (s, c) => s.from("venda_pagamentos").select(c, conta).in("meio", [...MEIOS_CONCILIAVEIS]).eq("situacao", "confirmado").is("conciliado_em", null).order(c).limit(1) },
  { chave: "caixas", rotulo: "Caixas para conferir", detalhe: "fechados, à espera de outra pessoa", href: "/caixa", icone: "caixa", coluna: "fechado_em",
    permitida: (p) => p.has("caixa.conferir"),
    consulta: (s, c) => s.from("caixas").select(c, conta).eq("situacao", "fechado").order(c).limit(1) },
  { chave: "saidas", rotulo: "Saídas do caixa", detalhe: "dinheiro da gaveta a autorizar", href: "/caixa#saidas", icone: "saida_do_caixa", coluna: "pedida_em",
    permitida: (p) => p.has("caixa.conferir"),
    consulta: (s, c) => s.from("caixa_saidas").select(c, conta).eq("situacao", "pendente").order(c).limit(1) },
  { chave: "estornos", rotulo: "Estornos a confirmar", detalhe: "cartão, Pix ou financeira de venda desfeita", href: "/vendas?situacao=canceladas&periodo=30", icone: "estorno", coluna: "solicitado_em",
    permitida: gestao,
    consulta: (s, c) => s.from("estornos_externos").select(c, conta).eq("situacao", "pendente").order(c).limit(1) },
  { chave: "retornos", rotulo: "Itens a conferir", detalhe: "voltaram de venda cancelada", href: "/vendas?situacao=canceladas&periodo=30", icone: "retorno", coluna: "solicitado_em",
    permitida: gestao,
    consulta: (s, c) => s.from("venda_retornos").select(c, conta).eq("situacao", "pendente").order(c).limit(1) },
  { chave: "transferencias", rotulo: "Transferências em aberto", detalhe: "pedidas e ainda não recebidas", href: "/transferencias", icone: "transferencia", coluna: "solicitado_em",
    permitida: (p) => p.has("estoque.consultar") && gestao(p),
    consulta: (s, c) => s.from("transferencias").select(c, conta).in("situacao", ["solicitada", "separada", "enviada"]).order(c).limit(1) },
  { chave: "os_atrasadas", rotulo: "OS atrasadas", detalhe: "passaram do prazo combinado com o cliente", href: "/assistencia", icone: "os_atrasada", coluna: "prazo",
    permitida: (p) => p.has("os.gerir"),
    consulta: (s, c, hoje) => s.from("ordens_servico").select(c, conta).eq("situacao", "aberta").lt("prazo", hoje).order(c).limit(1) },
  { chave: "os_prontas", rotulo: "OS prontas sem cobrança", detalhe: "conserto feito, aparelho na loja", href: "/assistencia?ver=prontas", icone: "os_pronta", coluna: "atualizada_em",
    permitida: (p) => p.has("os.gerir"),
    consulta: (s, c) => s.from("ordens_servico").select(c, conta).eq("situacao", "aberta").eq("local", "loja").eq("servico", "concluido").order(c).limit(1) },
  { chave: "contas", rotulo: "Contas a pagar vencidas", detalhe: "em aberto depois do vencimento", href: "/contas-a-pagar", icone: "conta_a_pagar", coluna: "vencimento",
    permitida: (p) => p.has("conta_pagar.gerir"),
    consulta: (s, c, hoje) => s.from("contas_a_pagar").select(c, conta).eq("situacao", "aberta").lt("vencimento", hoje).order(c).limit(1) },
  { chave: "bonus", rotulo: "Bônus para aprovar", detalhe: "fechamentos enviados pela gerência", href: "/metas/fechamento", icone: "bonus", coluna: "enviado_em",
    permitida: (p) => p.has("bonus.aprovar"),
    consulta: (s, c) => s.from("bonus_fechamentos").select(c, conta).eq("situacao", "enviado").order(c).limit(1) },
  { chave: "importacoes", rotulo: "Importações em prévia", detalhe: "planilhas conferidas e não aplicadas nem descartadas", href: "/produtos/importar", icone: "importacao", coluna: "criado_em",
    permitida: (p) => p.has("catalogo.gerir"),
    consulta: (s, c) => s.from("importacoes").select(c, conta).eq("situacao", "previa").order(c).limit(1) },
];

/** Lê as filas que a pessoa decide, em paralelo. Fila sem a tabela no banco: fora; outra falha: falha da fila. */
export async function lerFilas(supabase: Cliente, permissoes: ReadonlySet<string>, hoje: string = hojeEmSaoPaulo()): Promise<LeituraDaFila[]> {
  const minhas = FILAS.filter((f) => f.permitida(permissoes));
  const respostas = await Promise.all(minhas.map((f) => Promise.resolve(f.consulta(supabase, f.coluna, hoje))));
  return minhas.flatMap((f, i): LeituraDaFila[] => {
    const r = respostas[i] as Resposta;
    const base = { chave: f.chave, rotulo: f.rotulo, href: f.href, icone: f.icone };
    if (r.error) {
      if (tabelaAusente(r.error) || ["42703", "PGRST204"].includes(r.error.code ?? "")) return [];
      console.error("operação: falha ao ler a fila", { fila: f.chave, codigo: r.error.code ?? null });
      return [{ estado: "falha", ...base }];
    }
    if (r.count === null) return [];
    const primeira: unknown = Array.isArray(r.data) ? r.data[0] : undefined;
    const valor = primeira && typeof primeira === "object" ? (primeira as Record<string, unknown>)[f.coluna] : undefined;
    return [{ estado: "ok", ...base, detalhe: f.detalhe, quantidade: r.count, desde: r.count > 0 && typeof valor === "string" ? valor : null }];
  });
}

const diaEmSaoPaulo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
/** Há quantos dias está a mais antiga: data pura (vencimento, prazo) ou data e hora (no dia de São Paulo); hoje é zero. */
export function diasDesde(desde: string, hoje: string): number {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : diaEmSaoPaulo.format(new Date(desde));
  return Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dia}T12:00:00Z`)) / 86_400_000));
}

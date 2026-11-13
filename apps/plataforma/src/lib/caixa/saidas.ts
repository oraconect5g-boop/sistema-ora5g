// Saída autorizada do caixa (lote L7c: ORA-PAY-005; decisão do proprietário de 13/11: autoriza o gerente
// ou o dono). Leitura dos pedidos, dos formulários e as mensagens. A regra está no banco
// (packages/banco/src/caixa-saida.test.ts); aqui só se evita ir até ele com o que já se sabe errado. A
// leitura dos pedidos é à parte do resto do caixa: num banco ainda sem a migration (tabela ausente), o
// caixa funciona como antes e os quadros das saídas dizem que a função não está disponível.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { centavosDoBanco } from "../dinheiro";
import type { Leitura } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export const SITUACOES_DA_SAIDA = {
  pendente: { rotulo: "aguardando autorização", tom: "aviso" },
  autorizada: { rotulo: "autorizada", tom: "sucesso" },
  negada: { rotulo: "negada", tom: "perigo" },
  cancelada: { rotulo: "cancelada", tom: "neutro" },
} as const;
export type SituacaoDaSaida = keyof typeof SITUACOES_DA_SAIDA;

export type SaidaDoCaixa = {
  id: string; caixaId: string; valor: number; motivo: string; pedidaPor: string; pedidaEm: string;
  situacao: SituacaoDaSaida; motivoDecisao: string | null; decididaEm: string | null;
};

/** Tabela que o banco ainda não tem (migration do L7c não aplicada): PGRST205 do PostgREST ou 42P01 do PostgreSQL. */
export const tabelaAusente = (erro: { code?: string } | null | undefined) => erro?.code === "PGRST205" || erro?.code === "42P01";

const COLUNAS = "id, caixa_id, valor_centavos, motivo, pedida_por, pedida_em, situacao, motivo_decisao, decidida_em";

function converter(l: Record<string, unknown>): SaidaDoCaixa | null {
  const situacao = l.situacao;
  if (!ehUuid(l.id) || !ehUuid(l.caixa_id) || !ehUuid(l.pedida_por) || typeof l.motivo !== "string" || typeof l.pedida_em !== "string") return null;
  if (typeof situacao !== "string" || !Object.hasOwn(SITUACOES_DA_SAIDA, situacao)) return null;
  return {
    id: l.id, caixaId: l.caixa_id, valor: centavosDoBanco(l.valor_centavos), motivo: l.motivo, pedidaPor: l.pedida_por, pedidaEm: l.pedida_em,
    situacao: situacao as SituacaoDaSaida, motivoDecisao: typeof l.motivo_decisao === "string" ? l.motivo_decisao : null,
    decididaEm: typeof l.decidida_em === "string" ? l.decidida_em : null,
  };
}

/** Os pedidos de um caixa (o meu, aberto) ou os pendentes da loja (para quem autoriza). Falha nunca vira lista vazia. */
export async function lerSaidas(supabase: Cliente, filtro: { caixa: string } | { pendentesDaLoja: string }): Promise<Leitura<SaidaDoCaixa[]>> {
  const consulta = supabase.from("caixa_saidas").select(COLUNAS);
  const r = "caixa" in filtro
    ? await consulta.eq("caixa_id", filtro.caixa).order("pedida_em", { ascending: false }).limit(20)
    : await consulta.eq("unidade_id", filtro.pendentesDaLoja).eq("situacao", "pendente").order("pedida_em").limit(50);
  if (r.error) {
    if (tabelaAusente(r.error)) return { estado: "indisponivel" };
    console.error("caixa: falha ao ler os pedidos de saída", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    const saidas = (r.data as Record<string, unknown>[]).map(converter);
    if (saidas.some((s) => s === null)) throw new Error("forma");
    return { estado: "ok", dados: saidas as SaidaDoCaixa[] };
  } catch {
    console.error("caixa: pedido de saída em forma inesperada");
    return { estado: "falha" };
  }
}

/** Nome de quem pediu (o RLS dá o nome das pessoas que quem lê gere). null: não deu para ler agora. */
export async function lerNomes(supabase: Cliente, ids: readonly string[]): Promise<Map<string, string> | null> {
  if (ids.length === 0) return new Map();
  const r = await supabase.from("perfis_usuario").select("id, nome").in("id", [...new Set(ids)]);
  if (r.error) {
    console.error("caixa: falha ao ler os nomes de quem pediu saída", { codigo: r.error.code || null });
    return null;
  }
  return new Map(r.data.map((p) => [p.id, p.nome] as const));
}

/** "13/11, 14:05" no fuso de São Paulo. */
export const horaDoPedido = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export const OK_DA_SAIDA = {
  pedida: "Pedido de saída enviado: o gerente ou o dono autoriza. Retire o dinheiro da gaveta só depois de autorizado.",
  autorizada: "Saída autorizada: o valor já saiu do caixa de quem pediu.",
  negada: "Saída negada; o motivo fica registrado.",
  cancelada: "Pedido de saída cancelado.",
} as const;
export type OkDaSaida = keyof typeof OK_DA_SAIDA;

export const ERROS_DA_SAIDA = {
  dados: "Confira os dados digitados.",
  valor: "Valor inválido: em reais com vírgula, maior que zero.",
  motivo: "Informe o motivo da saída (de 3 a 200 letras); ele fica na auditoria.",
  acima: "A saída passa do dinheiro que há no caixa.",
  sem_caixa: "Abra o seu caixa nesta loja antes.",
  permissao: "Sem permissão para mexer em caixa nesta loja.",
  propria: "Quem pediu a saída não autoriza a própria saída: outra pessoa (gerente ou dono) autoriza.",
  decidida: "Este pedido já foi decidido.",
  fechado: "O caixa já foi fechado: negue o pedido ou peça de novo num caixa aberto.",
  motivo_negar: "Diga o motivo de negar a saída (de 3 a 200 letras).",
  nao_encontrado: "Pedido não encontrado (ou não é desta loja).",
  indisponivel: "A saída autorizada ainda não está disponível neste ambiente.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDaSaida = keyof typeof ERROS_DA_SAIDA;

/** Do erro do banco para a mensagem. Função ausente (migration não aplicada) diz isso; o resto que não se reconhece é falha. */
export function erroDaSaida(erro: { code?: string; message?: string } | null | undefined): ErroDaSaida {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "23514") return "acima";
  if (codigo === "OR008") return "sem_caixa";
  if (codigo === "P0002") return "nao_encontrado";
  if (codigo === "OR004") return "dados";
  if (codigo === "PGRST202" || codigo === "42883") return "indisponivel";
  if (codigo === "42501") return m.includes("própria") ? "propria" : "permissao";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDaSaida][] = [
    ["motivo de negar", "motivo_negar"], ["motivo da saída", "motivo"], ["já decidido", "decidida"], ["já foi fechado", "fechado"], ["valor inválido", "valor"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

type Formulario = { get: (nome: string) => unknown };
const texto = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
const motivoValido = (motivo: string) => motivo.length >= 3 && motivo.length <= 200;

/** O pedido de saída: valor em reais (maior que zero) e motivo. */
export function lerPedidoDeSaida(dados: Formulario): { ok: true; valor: number; motivo: string } | { ok: false; erro: ErroDaSaida } {
  let valor: number;
  try {
    valor = lerReais(texto(dados.get("valor")));
  } catch {
    return { ok: false, erro: "valor" };
  }
  if (!Number.isSafeInteger(valor) || valor <= 0) return { ok: false, erro: "valor" };
  const motivo = texto(dados.get("motivo"));
  if (!motivoValido(motivo)) return { ok: false, erro: "motivo" };
  return { ok: true, valor, motivo };
}

/** Autorizar ou negar: negar pede motivo; ao autorizar, o motivo é opcional (vai como observação). */
export function lerDecisaoDeSaida(dados: Formulario): { ok: true; saida: string; autorizar: boolean; motivo: string | null } | { ok: false; erro: ErroDaSaida } {
  const saida = dados.get("saida");
  const decisao = dados.get("decisao");
  if (!ehUuid(saida) || (decisao !== "autorizar" && decisao !== "negar")) return { ok: false, erro: "dados" };
  const motivo = texto(dados.get("motivo"));
  if (decisao === "negar" && !motivoValido(motivo)) return { ok: false, erro: "motivo_negar" };
  if (decisao === "autorizar" && motivo !== "" && !motivoValido(motivo)) return { ok: false, erro: "dados" };
  return { ok: true, saida, autorizar: decisao === "autorizar", motivo: motivo || null };
}

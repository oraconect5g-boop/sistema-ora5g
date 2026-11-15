// Pagamentos por maquininha (lote REPORT-005b: ORA-REPORT-005, o terminal de cada pagamento no relatório por meio).
// Leitura estrita de public.pagamentos_por_terminal, que roda com as permissões de quem chama (o RLS decide o recorte)
// e soma tudo no banco (packages/banco/src/pagamentos-por-terminal.test.ts). Sem a função no banco (migration ainda
// não aplicada), nulo: o bloco não aparece. Outra falha é falha (nunca zero).
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ehObjeto, inteiro as n, lista, texto as t, type Leitura } from "../leitura-do-banco";
import { RespostaInesperada, type Janela } from "./painel";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];

export type PagamentosDoTerminal = {
  terminal: string; unidade: string; provedor: "picpay" | "pagbank"; identificador: string; apelido: string; ativo: boolean;
  quantidade: number; valor: number; conciliados: number; conciliado: number; liquido: number; estornados: number; estornado: number;
};

const falha = (campo: string): never => { throw new RespostaInesperada(campo); };

export function lerPagamentosPorTerminal(dado: unknown): PagamentosDoTerminal[] {
  if (!ehObjeto(dado)) return falha("pagamentos_por_terminal");
  return lista(dado, "terminais").map((l): PagamentosDoTerminal => {
    const terminal = t(l, "terminal");
    const unidade = t(l, "unidade");
    const provedor = t(l, "provedor");
    if (!ehUuid(terminal) || !ehUuid(unidade) || (provedor !== "picpay" && provedor !== "pagbank") || typeof l.ativo !== "boolean") falha("terminal");
    const x = {
      terminal, unidade, provedor: provedor as "picpay" | "pagbank", identificador: t(l, "identificador"), apelido: t(l, "apelido"), ativo: l.ativo as boolean,
      quantidade: n(l, "quantidade"), valor: n(l, "valor"), conciliados: n(l, "conciliados"), conciliado: n(l, "conciliado"), liquido: n(l, "liquido"),
      estornados: n(l, "estornados"), estornado: n(l, "estornado"),
    };
    // A conta fecha: conciliado nunca passa do confirmado; os números não são negativos.
    if ([x.quantidade, x.valor, x.conciliados, x.conciliado, x.liquido, x.estornados, x.estornado].some((v) => v < 0)
        || x.conciliados > x.quantidade || x.conciliado > x.valor) falha("conta");
    return x;
  });
}

const SEM_FUNCAO = new Set(["PGRST202", "42883"]);

export async function lerPagamentosPorMaquininha(supabase: Cliente, janela: Janela, unidade: string | null): Promise<Leitura<PagamentosDoTerminal[]> | null> {
  const r = await supabase.rpc("pagamentos_por_terminal", { p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(), ...(unidade ? { p_unidade: unidade } : {}) });
  if (r.error) {
    if (SEM_FUNCAO.has(r.error.code)) return null;
    console.error("financeiro: falha ao ler os pagamentos por maquininha", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerPagamentosPorTerminal(r.data) };
  } catch (e) {
    console.error("financeiro: resposta inesperada dos pagamentos por maquininha", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

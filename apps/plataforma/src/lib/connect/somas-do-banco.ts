// AUD-f (auditoria de e7f55b2), item 3: as somas da produção da Ora Connect por vendedor e por loja, feitas no banco
// (public.connect_somas_por, security invoker: as mesmas regras de leitura de connect_operacoes). As telas somavam só as
// operações que cabiam numa leitura (até 1.000 pela API), e o total saía parcial como se fosse completo. Falha nunca vira
// zero: a tela mostra que não conseguiu somar.
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada, type Janela } from "../financeiro/painel";
import { ehObjeto, inteiro, type Leitura } from "../leitura-do-banco";
import { totalConfirmadas, type Somas } from "./relatorio";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export type LinhaDasSomas = { vendedor_id: string; unidade_id: string; somas: Somas };

function lerLinha(l: unknown): LinhaDasSomas {
  if (!ehObjeto(l) || typeof l.vendedor_id !== "string" || typeof l.unidade_id !== "string") throw new RespostaInesperada("connect_somas_por");
  return {
    vendedor_id: l.vendedor_id, unidade_id: l.unidade_id,
    somas: {
      operacoes: inteiro(l, "operacoes"),
      confirmadas: { ativacao: inteiro(l, "ativacoes"), recarga: inteiro(l, "recargas"), portabilidade: inteiro(l, "portabilidades") },
      emAndamento: inteiro(l, "em_andamento"), semResultado: inteiro(l, "sem_resultado"), naoFeitas: inteiro(l, "nao_feitas"),
      valorDeFace: inteiro(l, "valor_de_face_centavos"), recebido: inteiro(l, "recebido_centavos"),
    },
  };
}

/** As somas do período por vendedor e loja: de uma loja (ou de tudo o que a pessoa vê, com `unidade` nula) e, se pedido, de um vendedor. */
export async function consultarSomas(supabase: Cliente, janela: Janela, filtro: { unidade: string | null; vendedor: string | null }): Promise<Leitura<LinhaDasSomas[]>> {
  const r = await supabase.rpc("connect_somas_por", {
    p_inicio: janela.inicio.toISOString(), p_fim: janela.fim.toISOString(),
    ...(filtro.unidade ? { p_unidade: filtro.unidade } : {}), ...(filtro.vendedor ? { p_vendedor: filtro.vendedor } : {}),
  });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("connect: falha ao consultar connect_somas_por", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    if (!Array.isArray(r.data)) throw new RespostaInesperada("connect_somas_por");
    return { estado: "ok", dados: r.data.map(lerLinha) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("connect: resposta inesperada de connect_somas_por");
    return { estado: "falha" };
  }
}

const vazias = (): Somas => ({ operacoes: 0, confirmadas: { ativacao: 0, recarga: 0, portabilidade: 0 }, emAndamento: 0, semResultado: 0, naoFeitas: 0, valorDeFace: 0, recebido: 0 });
function juntar(a: Somas, b: Somas): Somas {
  return {
    operacoes: a.operacoes + b.operacoes,
    confirmadas: { ativacao: a.confirmadas.ativacao + b.confirmadas.ativacao, recarga: a.confirmadas.recarga + b.confirmadas.recarga,
      portabilidade: a.confirmadas.portabilidade + b.confirmadas.portabilidade },
    emAndamento: a.emAndamento + b.emAndamento, semResultado: a.semResultado + b.semResultado, naoFeitas: a.naoFeitas + b.naoFeitas,
    valorDeFace: a.valorDeFace + b.valorDeFace, recebido: a.recebido + b.recebido,
  };
}

/** O total do período (todas as linhas). */
export const totalDasSomas = (linhas: readonly LinhaDasSomas[]) => linhas.reduce((t, l) => juntar(t, l.somas), vazias());

/** Por vendedor ou por loja, da maior produção confirmada para a menor (o nome desempata), como o somasPor do relatório. */
export function somasDasLinhas(linhas: readonly LinhaDasSomas[], chave: "vendedor_id" | "unidade_id", nome: (id: string) => string) {
  const grupos = new Map<string, Somas>();
  for (const l of linhas) grupos.set(l[chave], juntar(grupos.get(l[chave]) ?? vazias(), l.somas));
  return [...grupos.entries()]
    .map(([id, s]) => ({ id, nome: nome(id), ...s }))
    .sort((a, b) => totalConfirmadas(b) - totalConfirmadas(a) || a.nome.localeCompare(b.nome, "pt-BR"));
}

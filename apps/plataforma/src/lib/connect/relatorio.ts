// O relatório do vendedor e da loja da Ora Connect (lote CONNECT-k; a D-060 do proprietário, 25/11): as operações do período
// (ativação, recarga e portabilidade), com a situação, o plano, o valor de face e o que a loja recebeu, somadas por vendedor e
// por loja. Regras puras: quem vê o quê é a RLS de connect_operacoes (o vendedor, as dele; quem gere a Ora Connect, as da
// loja), e a produção oficial (a que conta para meta e comissão) continua sendo a de connect_producao (só as confirmadas).
import { NOMES_DAS_OPERACOES, SITUACOES_OPERACAO, type TipoOperacao } from "@ora5g/dominio/nogle";

export type OperacaoDoRelatorio = {
  id: string;
  numero: number;
  tipo: string;
  situacao: string;
  vendedor_id: string;
  unidade_id: string;
  plano_nome: string | null;
  valor_face_centavos: number | null;
  recebido_na_loja_centavos: number | null;
  linha: string | null;
  criado_em: string;
};

/** As que já não mudam sem a gerência: confirmadas, recusadas, negadas, não recebidas e canceladas. */
const ANDAMENTO = new Set(["registrada", "enviando", "aguardando_operadora"]);
const SEM_RESULTADO = new Set(["resultado_desconhecido", "erro_operadora"]);
const NAO_FEITAS = new Set(["recusada", "negada", "nao_recebida", "cancelada"]);

export type Somas = {
  operacoes: number;
  confirmadas: Record<TipoOperacao, number>;
  emAndamento: number;
  semResultado: number;
  naoFeitas: number;
  /** Valor de face das ativações e recargas confirmadas (o plano; não é receita da Ora). */
  valorDeFace: number;
  /** O que a loja recebeu no caixa pelas confirmadas (o serviço pago no PDV). */
  recebido: number;
};

const vazias = (): Somas => ({
  operacoes: 0, confirmadas: { ativacao: 0, recarga: 0, portabilidade: 0 }, emAndamento: 0, semResultado: 0, naoFeitas: 0, valorDeFace: 0, recebido: 0,
});
const ehTipo = (t: string): t is TipoOperacao => t === "ativacao" || t === "recarga" || t === "portabilidade";

function somar(s: Somas, o: OperacaoDoRelatorio): Somas {
  s.operacoes += 1;
  if (o.situacao === "confirmada" && ehTipo(o.tipo)) {
    s.confirmadas[o.tipo] += 1;
    if (o.tipo !== "portabilidade") s.valorDeFace += o.valor_face_centavos ?? 0;
    s.recebido += o.recebido_na_loja_centavos ?? 0;
  } else if (ANDAMENTO.has(o.situacao)) s.emAndamento += 1;
  else if (SEM_RESULTADO.has(o.situacao)) s.semResultado += 1;
  else if (NAO_FEITAS.has(o.situacao)) s.naoFeitas += 1;
  return s;
}

/** As somas do período inteiro. */
export const somasDoRelatorio = (operacoes: readonly OperacaoDoRelatorio[]) => operacoes.reduce(somar, vazias());

/** As somas por vendedor ou por loja, da maior produção confirmada para a menor (o nome desempata). */
export function somasPor(operacoes: readonly OperacaoDoRelatorio[], chave: "vendedor_id" | "unidade_id", nome: (id: string) => string) {
  const grupos = new Map<string, Somas>();
  for (const o of operacoes) grupos.set(o[chave], somar(grupos.get(o[chave]) ?? vazias(), o));
  return [...grupos.entries()]
    .map(([id, s]) => ({ id, nome: nome(id), ...s }))
    .sort((a, b) => totalConfirmadas(b) - totalConfirmadas(a) || a.nome.localeCompare(b.nome, "pt-BR"));
}
export const totalConfirmadas = (s: Pick<Somas, "confirmadas">) => s.confirmadas.ativacao + s.confirmadas.recarga + s.confirmadas.portabilidade;

export const nomeDaSituacao = (s: string) => (Object.hasOwn(SITUACOES_OPERACAO, s) ? SITUACOES_OPERACAO[s as keyof typeof SITUACOES_OPERACAO].nome : s);
export const nomeDoTipo = (t: string) => (ehTipo(t) ? NOMES_DAS_OPERACOES[t] : t);

/** As colunas e as linhas da planilha (CSV) das operações, com os valores em reais. */
export const COLUNAS_DO_CSV = ["Data", "Nº", "Operação", "Situação", "Vendedor", "Loja", "Plano", "Linha", "Valor de face (R$)", "Recebido na loja (R$)"];
export function linhasDoCsv(operacoes: readonly OperacaoDoRelatorio[], vendedor: (id: string) => string, loja: (id: string) => string, quando: (iso: string) => string) {
  const reais = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
  return operacoes.map((o) => [quando(o.criado_em), String(o.numero), nomeDoTipo(o.tipo), nomeDaSituacao(o.situacao), vendedor(o.vendedor_id), loja(o.unidade_id),
    o.plano_nome ?? "", o.linha ?? "", reais(o.valor_face_centavos), reais(o.recebido_na_loja_centavos)]);
}

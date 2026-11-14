// Valores a receber das financeiras (lote L7b: ORA-PAY-003 e ORA-PAY-011, em parte). Leitura estrita de
// public.financeiras_a_receber, a leitura do formulário do repasse e as mensagens. A regra está no banco
// (packages/banco/src/financeiras-a-receber.test.ts); aqui só se evita ir até ele com o que já se sabe errado.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { ValorForaDoLimite } from "../dinheiro";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo, lista, texto as t, type Leitura, type Linha } from "../leitura-do-banco";

export const FINANCEIRAS = { payjoy: "PayJoy", aiva: "Aiva" } as const;
export type Financeira = keyof typeof FINANCEIRAS;
const ehFinanceira = (v: unknown): v is Financeira => typeof v === "string" && Object.hasOwn(FINANCEIRAS, v);

export type ContaDaFinanceira = {
  id: string; vendaId: string; vendaNumero: number; concluidaEm: string; devedor: Financeira; valor: number;
  situacao: "aberta" | "recebida"; dias: number; recebidoEm: string | null; valorRecebido: number | null; referencia: string | null;
  /** A venda foi cancelada (correção #83). Nulo: banco sem a correção, que não diz. */
  vendaCancelada: boolean | null;
};
export type ResumoDaFinanceira = { devedor: Financeira; abertas: number; valorAberto: number; maisAntigaDias: number | null; recebidas: number; valorRecebido: number; taxaObservada: number };
export type FinanceirasAReceber = { porDevedor: ResumoDaFinanceira[]; contas: ContaDaFinanceira[] };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
function devedor(l: Linha): Financeira {
  const d = l.devedor;
  if (!ehFinanceira(d)) throw new RespostaInesperada("devedor");
  return d;
}

/** Converte a resposta de public.financeiras_a_receber. Conta que não fecha é falha, não número. */
export function lerFinanceirasAReceber(dado: unknown): FinanceirasAReceber {
  if (!ehObjeto(dado)) throw new RespostaInesperada("financeiras_a_receber");
  const porDevedor = lista(dado, "por_devedor").map((l) => {
    const r = {
      devedor: devedor(l), abertas: n(l, "abertas"), valorAberto: n(l, "valor_aberto"), maisAntigaDias: inteiroOuNulo(l, "mais_antiga_dias"),
      recebidas: n(l, "recebidas"), valorRecebido: n(l, "valor_recebido"), taxaObservada: n(l, "taxa_observada"),
    };
    if (r.abertas < 0 || r.valorAberto < 0 || r.recebidas < 0 || r.valorRecebido < 0 || r.taxaObservada < 0 || (r.abertas > 0) !== (r.maisAntigaDias !== null)) {
      throw new RespostaInesperada("por_devedor");
    }
    return r;
  });
  const contas = lista(dado, "contas").map((l): ContaDaFinanceira => {
    const situacao = l.situacao;
    if (situacao !== "aberta" && situacao !== "recebida") throw new RespostaInesperada("situacao");
    const id = t(l, "id");
    const vendaId = t(l, "venda_id");
    if (!ehUuid(id) || !ehUuid(vendaId)) throw new RespostaInesperada("id");
    const recebidoEm = l.recebido_em === null ? null : t(l, "recebido_em");
    const valorRecebido = inteiroOuNulo(l, "valor_recebido");
    const referencia = l.referencia === null ? null : t(l, "referencia");
    const valor = n(l, "valor");
    // Recebida tem os três dados do repasse; aberta, nenhum. O recebido não passa do valor a receber.
    const completos = recebidoEm !== null && valorRecebido !== null && referencia !== null;
    const vazios = recebidoEm === null && valorRecebido === null && referencia === null;
    if ((situacao === "recebida" ? !completos : !vazios) || (recebidoEm !== null && !DIA.test(recebidoEm)) || (valorRecebido !== null && (valorRecebido < 0 || valorRecebido > valor))) {
      throw new RespostaInesperada("recebimento");
    }
    let vendaCancelada: boolean | null = null;
    if ("venda_cancelada" in l) {
      if (typeof l.venda_cancelada !== "boolean") throw new RespostaInesperada("venda_cancelada");
      vendaCancelada = l.venda_cancelada;
    }
    return { id, vendaId, vendaNumero: n(l, "venda_numero"), concluidaEm: t(l, "concluida_em"), devedor: devedor(l), valor, situacao, dias: n(l, "dias"), recebidoEm, valorRecebido, referencia, vendaCancelada };
  });
  return { porDevedor, contas };
}

/** Faixa de idade de uma conta aberta, para o selo da tela (sem prazo contratual verificado, só os dias desde a venda). */
export function idadeDaConta(dias: number): { rotulo: string; tom: "neutro" | "info" | "aviso" } {
  if (dias <= 7) return { rotulo: dias === 0 ? "vendida hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`, tom: "neutro" };
  if (dias <= 30) return { rotulo: `há ${dias} dias`, tom: "info" };
  return { rotulo: `há ${dias} dias`, tom: "aviso" };
}

export const ERROS_DAS_FINANCEIRAS = {
  dados: "Confira os dados digitados.",
  referencia: "Informe a referência do repasse (de 3 a 80 letras): código, lote ou linha do extrato.",
  recebido: "Valor recebido entre zero e o valor a receber.",
  data: "A data do repasse vai do dia da venda até hoje.",
  ja_recebido: "Recebimento já registrado: desfaça antes de mudar.",
  cancelada: "Conta cancelada com a venda: não há o que receber.",
  venda_cancelada: "Venda cancelada: não há o que receber da financeira.",
  so_registrado: "Só se corrige um repasse já registrado.",
  motivo: "Informe o motivo (de 3 a 200 letras); ele fica na auditoria.",
  nao_encontrada: "Conta não encontrada (ou não é desta loja).",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDasFinanceiras = keyof typeof ERROS_DAS_FINANCEIRAS;

export function erroDasFinanceiras(erro: { code?: string; message?: string } | null | undefined): ErroDasFinanceiras {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "P0002" || codigo === "42501") return "nao_encontrada";
  if (codigo === "OR030") return "ja_recebido";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDasFinanceiras][] = [
    ["referência", "referencia"], ["valor recebido", "recebido"], ["data do repasse", "data"], ["venda cancelada", "venda_cancelada"],
    ["cancelada", "cancelada"], ["só se corrige", "so_registrado"], ["motivo", "motivo"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

type Formulario = { get: (nome: string) => unknown };
const textoDo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/** O repasse de uma conta: a referência, o valor que caiu (reais) e a data. */
export function lerRepasse(dados: Formulario): { ok: true; conta: string; referencia: string; recebido: number; data: string } | { ok: false; erro: ErroDasFinanceiras } {
  const conta = dados.get("conta");
  if (!ehUuid(conta)) return { ok: false, erro: "dados" };
  const referencia = textoDo(dados.get("referencia"));
  if (referencia.length < 3 || referencia.length > 80) return { ok: false, erro: "referencia" };
  let recebido: number;
  try {
    recebido = lerReais(textoDo(dados.get("recebido")));
  } catch {
    return { ok: false, erro: "recebido" };
  }
  if (!Number.isSafeInteger(recebido) || recebido < 0) return { ok: false, erro: "recebido" };
  const data = textoDo(dados.get("data"));
  if (!DIA.test(data) || Number.isNaN(new Date(`${data}T12:00:00Z`).getTime())) return { ok: false, erro: "data" };
  return { ok: true, conta, referencia, recebido, data };
}

// ---------------------------------------------------------------------------------------------
// Consulta: devolve o próprio estado; banco sem a função é "indisponível", nunca zero
// ---------------------------------------------------------------------------------------------
type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export async function consultarFinanceiras(supabase: Cliente): Promise<Leitura<FinanceirasAReceber>> {
  const r = await supabase.rpc("financeiras_a_receber");
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    console.error("pagamentos: falha ao consultar financeiras_a_receber", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerFinanceirasAReceber(r.data) };
  } catch (erro) {
    if (!(erro instanceof RespostaInesperada) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error("pagamentos: resposta inesperada de financeiras_a_receber");
    return { estado: "falha" };
  }
}

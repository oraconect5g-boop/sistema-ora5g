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
  situacao: "aberta" | "recebida" | "cancelada"; dias: number; recebidoEm: string | null; valorRecebido: number | null; referencia: string | null;
  /** A venda foi cancelada (correção #83). Nulo: banco sem a correção, que não diz. */
  vendaCancelada: boolean | null;
  saldo?: number;
  parcial?: number;
  finalRegistrado?: boolean;
  finalId?: string | null;
  repassesParciais?: { id: string; valor: number; data: string; referencia: string }[];
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
    if (situacao !== "aberta" && situacao !== "recebida" && situacao !== "cancelada") throw new RespostaInesperada("situacao");
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
    let repasses: Pick<ContaDaFinanceira, "saldo" | "parcial" | "finalRegistrado" | "finalId" | "repassesParciais"> = {};
    if ("saldo" in l) {
      const saldo = n(l, "saldo");
      const parcial = n(l, "parcial");
      const finalRegistrado = l.final_registrado;
      const finalId = l.final_id;
      const repassesParciais = lista(l, "repasses_parciais").map((r) => {
        const id = t(r, "id");
        const valor = n(r, "valor");
        const data = t(r, "data");
        if (!ehUuid(id) || valor <= 0 || !DIA.test(data)) throw new RespostaInesperada("repasses_parciais");
        return { id, valor, data, referencia: t(r, "referencia") };
      });
      if (parcial < 0 || parcial >= valor || saldo !== (situacao === "aberta" ? valor - parcial : 0)
          || typeof finalRegistrado !== "boolean" || (finalRegistrado ? !ehUuid(finalId) || situacao !== "recebida" || (valorRecebido ?? 0) <= parcial : finalId != null)
          || repassesParciais.reduce((s, r) => s + r.valor, 0) !== parcial) throw new RespostaInesperada("repasses_parciais");
      repasses = { saldo, parcial, finalRegistrado, finalId: ehUuid(finalId) ? finalId : null, repassesParciais };
    }
    if (situacao === "cancelada" && (!(repasses.parcial && repasses.parcial > 0) || vendaCancelada !== true)) throw new RespostaInesperada("situacao");
    return { ...repasses, id, vendaId, vendaNumero: n(l, "venda_numero"), concluidaEm: t(l, "concluida_em"), devedor: devedor(l), valor, situacao, dias: n(l, "dias"), recebidoEm, valorRecebido, referencia, vendaCancelada };
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
  recebido: "Confira o valor recebido em relação ao saldo.",
  limite_parcial: "O valor completa o saldo. Registre uma liquidação final com tarifa zero.",
  tarifa: "Na liquidação final, some o valor recebido e a tarifa comprovada. A soma precisa ser igual ao saldo em aberto.",
  data_final: "A data da liquidação final não pode ser anterior a um repasse parcial registrado.",
  conciliacao_anterior: "Esta tela precisa estar na versão que distingue repasse parcial de liquidação final. Nenhum repasse foi gravado.",
  parcial_liquidada: "Desfaça a liquidação final antes de desfazer um repasse parcial.",
  correcao_final: "Para corrigir a liquidação, desfaça e registre de novo com a taxa confirmada.",
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
  if (FUNCAO_AUSENTE.has(codigo)) return "conciliacao_anterior";
  if (codigo === "OR030") {
    if (m.includes("desfaça primeiro")) return "parcial_liquidada";
    if (m.includes("para corrigir")) return "correcao_final";
    return "ja_recebido";
  }
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDasFinanceiras][] = [
    ["completa o saldo", "limite_parcial"], ["data do repasse final", "data_final"], ["tarifa", "tarifa"],
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

/** Novo registro sempre distingue parcial de final e nunca deduz a taxa por diferença. */
export function lerNovoRepasse(dados: Formulario) {
  const repasse = lerRepasse(dados);
  if (!repasse.ok) return repasse;
  const chave = dados.get("chave");
  const tipo = dados.get("tipo");
  if (!ehUuid(chave) || (tipo !== "parcial" && tipo !== "final")) return { ok: false, erro: "dados" } as const;
  if (repasse.recebido <= 0) return { ok: false, erro: "recebido" } as const;
  const informada = textoDo(dados.get("tarifa"));
  if (tipo === "parcial") {
    if (informada) return { ok: false, erro: "tarifa" } as const;
    return { ...repasse, chave, tarifa: null };
  }
  if (!informada) return { ok: false, erro: "tarifa" } as const;
  try {
    return { ...repasse, chave, tarifa: lerReais(informada) };
  } catch {
    return { ok: false, erro: "tarifa" } as const;
  }
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

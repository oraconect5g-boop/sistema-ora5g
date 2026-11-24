// O depósito agrupado da maquininha conferido com o extrato do banco (lote FIN-006a: ORA-FIN-006; ADR-016, adendo de 24/11).
// A leitura de public.maquininha_depositos_painel, os formulários e as mensagens; o banco confere tudo de novo e aqui não
// há acesso a dados.
//   * O depósito é o conjunto dos pagamentos da mesma maquininha com o dinheiro para o mesmo dia (a data gravada na
//     conciliação pelo extrato da maquininha); o esperado é a soma do líquido deles.
//   * Casar é dizer qual linha de crédito do extrato do banco da rede é o depósito; quando o valor difere, o motivo é
//     obrigatório. Só quem concilia pela rede inteira (o dono).
import { ehUuid } from "../acesso/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { contagem, ehObjeto, inteiro as n, lista, objeto, texto as t, textoOuNulo, type Linha } from "../leitura-do-banco";

/** As maquininhas que depositam agrupado, com os meios de cada uma (os mesmos de privado.meios_da_maquininha). */
export const MAQUININHAS = {
  picpay: { nome: "PicPay", meios: "Pix e cartão na maquininha PicPay" },
  pagbank: { nome: "PagBank", meios: "cartão na maquininha PagSeguro" },
} as const;
export type Maquininha = keyof typeof MAQUININHAS;
const ehMaquininha = (v: unknown): v is Maquininha => typeof v === "string" && Object.hasOwn(MAQUININHAS, v);

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (l: Linha, campo: string) => {
  const v = t(l, campo).slice(0, 10);
  if (!DIA.test(v)) throw new RespostaInesperada(campo);
  return v;
};
const uuid = (l: Linha, campo: string) => {
  const v = t(l, campo);
  if (!ehUuid(v)) throw new RespostaInesperada(campo);
  return v;
};

export type LinhaDoBanco = { linha: string; extrato: number; data: string; valor: number; descricao: string | null };
export type DepositoCasado = { linha: string; extrato: number; data: string; recebido: number; esperadoAoCasar: number; pagamentosAoCasar: number; motivo: string | null };
export type Deposito = {
  maquininha: Maquininha;
  /** O dia do dinheiro (a data da liquidação gravada na conciliação). */
  dataLiquidacao: string;
  pagamentos: number;
  /** A soma do líquido dos pagamentos: o que devia cair no banco. */
  esperado: number;
  /** A soma do valor das vendas desses pagamentos (antes das taxas). */
  bruto: number;
  casado: DepositoCasado | null;
  sugestoes: LinhaDoBanco[];
};
export type PainelDosDepositos = { depositos: Deposito[]; semConciliacao: { pagamentos: number; valor: number } };

/** Converte a resposta de public.maquininha_depositos_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerPainelDosDepositos(dado: unknown): PainelDosDepositos {
  if (!ehObjeto(dado)) throw new RespostaInesperada("maquininha_depositos_painel");
  const depositos = lista(dado, "depositos").map((d): Deposito => {
    const maquininha = d.provedor;
    if (!ehMaquininha(maquininha)) throw new RespostaInesperada("provedor");
    const c = d.casado;
    if (c !== null && !ehObjeto(c)) throw new RespostaInesperada("casado");
    const deposito: Deposito = {
      maquininha, dataLiquidacao: dia(d, "data_liquidacao"), pagamentos: contagem(d, "pagamentos"), esperado: n(d, "esperado"), bruto: n(d, "bruto"),
      casado: c === null ? null : {
        linha: uuid(c, "linha"), extrato: contagem(c, "extrato"), data: dia(c, "data"), recebido: n(c, "recebido"),
        esperadoAoCasar: n(c, "esperado_ao_casar"), pagamentosAoCasar: contagem(c, "pagamentos_ao_casar"), motivo: textoOuNulo(c, "motivo"),
      },
      sugestoes: lista(d, "sugestoes").map((s) => ({
        linha: uuid(s, "linha"), extrato: contagem(s, "extrato"), data: dia(s, "data"), valor: n(s, "valor"), descricao: textoOuNulo(s, "descricao"),
      })),
    };
    // O líquido não passa do bruto, e o depósito tem ao menos um pagamento; a linha sugerida é sempre um crédito.
    if (deposito.pagamentos < 1 || deposito.esperado < 0 || deposito.esperado > deposito.bruto || deposito.sugestoes.some((s) => s.valor <= 0)) {
      throw new RespostaInesperada("maquininha_depositos_painel");
    }
    return deposito;
  });
  const sem = objeto(dado, "sem_conciliacao");
  return { depositos, semConciliacao: { pagamentos: contagem(sem, "pagamentos"), valor: n(sem, "valor") } };
}

/** A diferença do casado: o recebido menos o esperado de agora (a conciliação pode ter mudado depois de casar). */
export const diferencaDoDeposito = (d: Deposito) => (d.casado ? d.casado.recebido - d.esperado : null);
/** Os pagamentos mudaram depois de casar (uma conciliação desfeita ou nova para o mesmo dia). */
export const mudouDepoisDeCasar = (d: Deposito) => d.casado !== null && (d.casado.esperadoAoCasar !== d.esperado || d.casado.pagamentosAoCasar !== d.pagamentos);

// ---------------------------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------------------------
export const OK_DOS_DEPOSITOS = {
  casado: "Depósito casado com a linha do extrato do banco.",
  casado_com_diferenca: "Depósito casado, com a diferença e o motivo registrados.",
  ja_casado: "Este depósito já estava casado com esta linha: nada foi gravado de novo.",
  desfeito: "Depósito desfeito: a linha voltou a ficar livre.",
  sem_mudanca: "Nada mudou: o depósito já não estava casado.",
} as const;
export type OkDosDepositos = keyof typeof OK_DOS_DEPOSITOS;

export const ERROS_DOS_DEPOSITOS = {
  permissao: "Os depósitos das maquininhas são de quem concilia pela rede inteira (o dono).",
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras): a diferença ou o desfazer ficam registrados.",
  diferenca: "O valor da linha não é o esperado do depósito: diga o motivo da diferença.",
  linha: "Escolha uma linha de crédito do extrato do banco da rede.",
  ocupado: "Esta linha já é de outro depósito, ou este depósito já tem linha: desfaça antes.",
  linha_em_uso: "Esta linha do extrato já tem outro uso (conciliada, repasse, estorno ou fora da conta): desfaça no extrato antes.",
  sem_pagamentos: "Nenhum pagamento desta maquininha com o dinheiro para este dia: concilie antes pelo extrato da maquininha.",
  falha: "Não foi possível agora. Tente de novo em instantes.",
} as const;
export type ErroDosDepositos = keyof typeof ERROS_DOS_DEPOSITOS;

/** A recusa do banco na mensagem da tela (o texto do banco não vai para a tela). */
export function erroDosDepositos(erro: { code?: string; message?: string } | null | undefined): ErroDosDepositos {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "OR045") return "ocupado";
  if (codigo === "OR046") return "linha_em_uso";
  if (codigo === "P0002") return m.includes("linha") ? "linha" : "sem_pagamentos";
  if (codigo !== "22023") return "falha";
  if (m.includes("diferença")) return "diferenca";
  if (m.includes("motivo")) return "motivo";
  if (m.includes("linha")) return "linha";
  return "dados";
}

// ---------------------------------------------------------------------------------------------
// Os formulários
// ---------------------------------------------------------------------------------------------
type Campos = { get(nome: string): unknown };
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDosDepositos };
const limpo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function lerDeposito(campos: Campos): Resultado<{ maquininha: Maquininha; data: string }> {
  const maquininha = campos.get("maquininha");
  const data = limpo(campos.get("data_liquidacao"));
  if (!ehMaquininha(maquininha) || !DIA.test(data)) return { ok: false, erro: "dados" };
  return { ok: true, dados: { maquininha, data } };
}

/** Casar: o depósito, a linha e o motivo (opcional aqui; o banco pede quando o valor difere). */
export function validarCasarDeposito(campos: Campos): Resultado<{ maquininha: Maquininha; data: string; linha: string; motivo: string | null }> {
  const r = lerDeposito(campos);
  if (!r.ok) return r;
  const linha = campos.get("linha");
  if (!ehUuid(linha)) return { ok: false, erro: "linha" };
  const motivo = limpo(campos.get("motivo")) || null;
  if (motivo !== null && (motivo.length < 3 || motivo.length > 200)) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { ...r.dados, linha, motivo } };
}

/** Desfazer: o depósito e o motivo, sempre. */
export function validarDesfazerDeposito(campos: Campos): Resultado<{ maquininha: Maquininha; data: string; motivo: string }> {
  const r = lerDeposito(campos);
  if (!r.ok) return r;
  const motivo = limpo(campos.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { ...r.dados, motivo } };
}

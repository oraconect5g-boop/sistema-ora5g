// Os repasses dos marketplaces casados com o extrato do banco (lote REPASSE-a: ORA-MKTPL-005 e ORA-MKTPL-008). A leitura
// de public.marketplace_repasses_painel, os formulários e as mensagens; o banco confere tudo de novo e aqui não há acesso
// a dados.
//   * O repasse é o conjunto dos pedidos do mesmo canal com a mesma data de repasse; o esperado é a soma do líquido deles
//     (o do arquivo ou o estimado, como no painel do MKTPL-a).
//   * Casar é dizer qual linha de crédito do extrato do banco é o repasse; quando o valor difere, o motivo é obrigatório.
import { ehUuid } from "../acesso/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { contagem, ehObjeto, inteiro as n, lista, texto as t, textoOuNulo, type Linha } from "../leitura-do-banco";
import { CANAIS_DOS_MARKETPLACES } from "./leitura";

export type CanalDoRepasse = keyof typeof CANAIS_DOS_MARKETPLACES;
const ehCanal = (v: unknown): v is CanalDoRepasse => typeof v === "string" && Object.hasOwn(CANAIS_DOS_MARKETPLACES, v);
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

export type LinhaDoExtrato = { linha: string; extrato: number; data: string; valor: number; descricao: string | null };
export type Casado = { linha: string; extrato: number; data: string; recebido: number; esperadoAoCasar: number; pedidosAoCasar: number; motivo: string | null };
export type Repasse = {
  canal: CanalDoRepasse;
  dataRepasse: string;
  pedidos: number;
  esperado: number;
  /** Os pedidos sem o líquido no arquivo: o esperado deles é o bruto menos o resto. */
  estimados: number;
  casado: Casado | null;
  sugestoes: LinhaDoExtrato[];
};
export type PainelDosRepasses = { repasses: Repasse[]; semDataDeRepasse: number };

/** Converte a resposta de public.marketplace_repasses_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerPainelDosRepasses(dado: unknown): PainelDosRepasses {
  if (!ehObjeto(dado)) throw new RespostaInesperada("marketplace_repasses_painel");
  const repasses = lista(dado, "repasses").map((r): Repasse => {
    const canal = r.canal;
    if (!ehCanal(canal)) throw new RespostaInesperada("canal");
    const c = r.casado;
    if (c !== null && !ehObjeto(c)) throw new RespostaInesperada("casado");
    return {
      canal, dataRepasse: dia(r, "data_repasse"), pedidos: contagem(r, "pedidos"), esperado: n(r, "esperado"), estimados: contagem(r, "estimados"),
      casado: c === null ? null : {
        linha: uuid(c, "linha"), extrato: contagem(c, "extrato"), data: dia(c, "data"), recebido: n(c, "recebido"),
        esperadoAoCasar: n(c, "esperado_ao_casar"), pedidosAoCasar: contagem(c, "pedidos_ao_casar"), motivo: textoOuNulo(c, "motivo"),
      },
      sugestoes: lista(r, "sugestoes").map((s) => ({
        linha: uuid(s, "linha"), extrato: contagem(s, "extrato"), data: dia(s, "data"), valor: n(s, "valor"), descricao: textoOuNulo(s, "descricao"),
      })),
    };
  });
  return { repasses, semDataDeRepasse: contagem(dado, "sem_data_de_repasse") };
}

/** A diferença do casado: o recebido menos o esperado de agora (os pedidos podem ter mudado depois de casar). */
export const diferencaDoRepasse = (r: Repasse) => (r.casado ? r.casado.recebido - r.esperado : null);
/** Os pedidos mudaram depois de casar (um arquivo novo trouxe outro líquido ou outro pedido para a mesma data). */
export const mudouDepoisDeCasar = (r: Repasse) => r.casado !== null && (r.casado.esperadoAoCasar !== r.esperado || r.casado.pedidosAoCasar !== r.pedidos);

// ---------------------------------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------------------------------
export const OK_DOS_REPASSES = {
  casado: "Repasse casado com a linha do extrato.",
  casado_com_diferenca: "Repasse casado, com a diferença e o motivo registrados.",
  ja_casado: "Este repasse já estava casado com esta linha: nada foi gravado de novo.",
  desfeito: "Repasse desfeito: a linha voltou a ficar livre.",
  sem_mudanca: "Nada mudou: o repasse já não estava casado.",
} as const;
export type OkDosRepasses = keyof typeof OK_DOS_REPASSES;

export const ERROS_DOS_REPASSES = {
  permissao: "Só quem vê o resultado e concilia pela rede (o dono) casa o repasse com o extrato.",
  dados: "Dados inválidos: confira os campos.",
  motivo: "Informe o motivo (de 3 a 200 letras): a diferença ou o desfazer ficam registrados.",
  diferenca: "O valor da linha não é o esperado do repasse: diga o motivo da diferença.",
  linha: "Escolha uma linha de crédito do extrato do banco da rede.",
  ocupado: "Esta linha já é de outro repasse, ou este repasse já tem linha: desfaça antes.",
  linha_em_uso: "Esta linha do extrato já tem outro uso (conciliada com uma venda ou fora da conta): desfaça no extrato antes.",
  sem_pedidos: "Nenhum pedido deste canal com esta data de repasse.",
  falha: "Não foi possível agora. Tente de novo em instantes.",
} as const;
export type ErroDosRepasses = keyof typeof ERROS_DOS_REPASSES;

/** A recusa do banco na mensagem da tela (o texto do banco não vai para a tela). */
export function erroDosRepasses(erro: { code?: string; message?: string } | null | undefined): ErroDosRepasses {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "OR045") return "ocupado";
  // AUD-c (F21-02): a linha do extrato tem um uso só; a conciliada com uma venda ou fora da conta não recebe repasse.
  if (codigo === "OR046") return "linha_em_uso";
  if (codigo === "P0002") return m.includes("linha") ? "linha" : "sem_pedidos";
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
type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: ErroDosRepasses };
const limpo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

function lerRepasse(campos: Campos): Resultado<{ canal: CanalDoRepasse; data: string }> {
  const canal = campos.get("canal");
  const data = limpo(campos.get("data_repasse"));
  if (!ehCanal(canal) || !DIA.test(data)) return { ok: false, erro: "dados" };
  return { ok: true, dados: { canal, data } };
}

/** Casar: o repasse, a linha e o motivo (opcional aqui; o banco pede quando o valor difere). */
export function validarCasar(campos: Campos): Resultado<{ canal: CanalDoRepasse; data: string; linha: string; motivo: string | null }> {
  const r = lerRepasse(campos);
  if (!r.ok) return r;
  const linha = campos.get("linha");
  if (!ehUuid(linha)) return { ok: false, erro: "linha" };
  const motivo = limpo(campos.get("motivo")) || null;
  if (motivo !== null && (motivo.length < 3 || motivo.length > 200)) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { ...r.dados, linha, motivo } };
}

/** Desfazer: o repasse e o motivo, sempre. */
export function validarDesfazer(campos: Campos): Resultado<{ canal: CanalDoRepasse; data: string; motivo: string }> {
  const r = lerRepasse(campos);
  if (!r.ok) return r;
  const motivo = limpo(campos.get("motivo"));
  if (motivo.length < 3 || motivo.length > 200) return { ok: false, erro: "motivo" };
  return { ok: true, dados: { ...r.dados, motivo } };
}

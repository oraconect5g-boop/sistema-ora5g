// O estoque de chips da Nogle na tela (lote CONNECT-d; ORA-INV-011), SÓ LEITURA. O servidor (o worker) lê a Nogle a cada
// 30 minutos, das 7h às 22h, e grava no banco (connect_pdvs, connect_chips_nogle, connect_leituras_nogle); a tela lê o banco
// pela RLS. O servidor web não fala com a Nogle nem vê credencial; nada aqui transfere, ativa ou reserva chip.

export type PdvDaTela = {
  pdv_id: number;
  nome: string;
  cidade: string | null;
  uf: string | null;
  estoque_minimo: number | null;
  unidade_id: string | null;
  ativo: boolean;
  estoque_lido_em: string | null;
  fisicos: number;
  esims: number;
};
export type ChipDaTela = { iccid: string; pdv_id: number | null; tipo: string; repassado_em: string | null; lido_em: string };
/** Um chip disponível no estoque de uma loja ligada que não está no PDV dela na Nogle (CONNECT-f; connect_chips_divergentes). */
export type DivergenciaDaTela = { unidade_id: string; iccid: string; onde_na_nogle: string };
/** O máximo que a função do banco devolve; a tela mostra os primeiros. */
export const MAXIMO_DAS_DIVERGENCIAS = 500;
export type LeituraDaTela = {
  numero: number;
  lida_em: string;
  pdvs: number;
  pdvs_lidos: number;
  mvno_fisicos: number | null;
  mvno_esims: number | null;
  falhas: number;
};

export const NOME_DO_TIPO: Record<string, string> = { fisico: "Físico", esim: "eSIM" };

export const ERROS_DOS_CHIPS = {
  ja_ligada: "Essa loja já está ligada a outro PDV da Nogle: desligue aquele antes.",
  so_loja_fisica: "Só uma loja física da rede se liga a um PDV da Nogle.",
  sem_permissao: "Ligar o PDV à loja é de quem gere a Ora Connect na rede (o dono) ou as integrações (o administrador).",
  dados: "Confira o PDV e a loja escolhidos.",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDosChips = keyof typeof ERROS_DOS_CHIPS;
export const ehErroDosChips = (v: unknown): v is ErroDosChips => typeof v === "string" && Object.hasOwn(ERROS_DOS_CHIPS, v);

/** O erro do banco na ligação (connect_ligar_pdv): OR051 = a loja já tem PDV; 22023 = não é loja física da rede. */
export function erroDosChips(erro: { code?: string } | null | undefined): ErroDosChips {
  const codigo = erro?.code;
  if (codigo === "OR051") return "ja_ligada";
  if (codigo === "22023") return "so_loja_fisica";
  if (codigo === "42501") return "sem_permissao";
  return "falha";
}

const minutosDoDia = (d: Date) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(d).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * A última leitura está em dia? Das 7h15 às 22h15 (Brasília), a leitura de 30 em 30 minutos deixa no máximo 45 minutos de
 * idade; fora desse horário, vale a última da noite (até 10 horas).
 */
export function situacaoDaLeitura(lidaEm: string | null | undefined, agora: Date): "sem_leitura" | "em_dia" | "atrasada" {
  if (!lidaEm) return "sem_leitura";
  const idade = (agora.getTime() - new Date(lidaEm).getTime()) / 60_000;
  const m = minutosDoDia(agora);
  const noHorario = m >= 7 * 60 + 15 && m <= 22 * 60 + 15;
  return idade <= (noHorario ? 45 : 10 * 60) ? "em_dia" : "atrasada";
}

/** "8955 1701 1033 5507 792": o ICCID em blocos de 4, para conferir no chip. */
export const iccidEmBlocos = (iccid: string) => iccid.replace(/(\d{4})(?=\d)/g, "$1 ");

/** A busca pelo ICCID: só os dígitos, de 4 a 20 (o fim do número basta). */
export function buscaDeIccid(valor: string | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 4 && digitos.length <= 20 ? digitos : null;
}

/** Abaixo do estoque mínimo que a própria Nogle tem para o PDV (o "estoque mínimo de chips" do cadastro dela). */
export const abaixoDoMinimo = (p: Pick<PdvDaTela, "estoque_minimo" | "fisicos" | "esims">) =>
  p.estoque_minimo !== null && p.estoque_minimo > 0 && p.fisicos + p.esims < p.estoque_minimo;

/** Os PDVs ligados a uma loja (pelo nome da loja) e os outros (os ativos primeiro, pelo nome na Nogle). */
export function separarPdvs<T extends PdvDaTela>(pdvs: readonly T[], nomeDaLoja: (unidade: string) => string | undefined) {
  const comLoja = pdvs.filter((p) => p.unidade_id !== null)
    .map((p) => ({ ...p, loja: nomeDaLoja(p.unidade_id as string) ?? "Loja" }))
    .sort((a, b) => a.loja.localeCompare(b.loja, "pt-BR"));
  const outros = pdvs.filter((p) => p.unidade_id === null)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { comLoja, outros };
}

/** A soma dos chips de uma lista de PDVs. */
export const somar = (pdvs: readonly Pick<PdvDaTela, "fisicos" | "esims">[]) =>
  pdvs.reduce((t, p) => ({ fisicos: t.fisicos + p.fisicos, esims: t.esims + p.esims }), { fisicos: 0, esims: 0 });

// -----------------------------------------------------------------------------------------------------------------------
// A transferência de chips pela Nogle (lote CONNECT-e): só o dono pede (o banco confere); o servidor envia uma vez e confirma
// pelo estoque do PDV de destino. A tela não chama a Nogle.
// -----------------------------------------------------------------------------------------------------------------------
export type TipoDeTransferencia = "esim" | "unidade" | "lote";
export type TransferenciaDaTela = {
  id: string;
  numero: number;
  tipo: string;
  pdv_id: number;
  iccid: string | null;
  iccid_final: string | null;
  quantidade: number;
  motivo: string | null;
  situacao: string;
  pedida_em: string;
  concluida_em: string | null;
  mensagem: string | null;
  resultado: unknown;
};

export const NOMES_DOS_TIPOS_DE_TRANSFERENCIA: Record<TipoDeTransferencia, string> = {
  esim: "eSIM por quantidade", unidade: "Um chip físico (pelo ICCID)", lote: "Lote de chips físicos (do primeiro ao último ICCID)",
};
export const ehTipoDeTransferencia = (v: unknown): v is TipoDeTransferencia => v === "esim" || v === "unidade" || v === "lote";

export const SITUACOES_DA_TRANSFERENCIA: Record<string, { rotulo: string; tom: "info" | "sucesso" | "aviso" | "perigo" | "neutro" }> = {
  registrada: { rotulo: "Na fila", tom: "info" },
  enviando: { rotulo: "Enviando", tom: "info" },
  confirmada: { rotulo: "Confirmada", tom: "sucesso" },
  parcial: { rotulo: "Em parte", tom: "aviso" },
  recusada: { rotulo: "Recusada pela Nogle", tom: "perigo" },
  resultado_desconhecido: { rotulo: "Resultado desconhecido", tom: "perigo" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
};

export const ERROS_DA_TRANSFERENCIA = {
  sem_estoque: "Não há chips livres bastantes no estoque geral da Ora na última leitura (ou o chip já está num PDV).",
  em_andamento: "Algum desses chips já está num pedido em andamento.",
  ja_saiu: "Esse pedido já saiu para a Nogle: não dá mais para cancelar.",
  chave: "Esse pedido já foi feito com outro conteúdo. Recarregue a tela.",
  sem_permissao: "Só o dono pede ou cancela uma transferência de chips.",
  dados: "Confira o tipo, o destino e os chips do pedido.",
  motivo: "Informe o motivo do cancelamento (pelo menos 3 letras).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaTransferencia = keyof typeof ERROS_DA_TRANSFERENCIA;
export const ehErroDaTransferencia = (v: unknown): v is ErroDaTransferencia => typeof v === "string" && Object.hasOwn(ERROS_DA_TRANSFERENCIA, v);

/** O erro do banco no pedido ou no cancelamento (connect_transferir_chips, connect_cancelar_transferencia). */
export function erroDaTransferencia(erro: { code?: string } | null | undefined): ErroDaTransferencia {
  const codigo = erro?.code;
  if (codigo === "OR052") return "sem_estoque";
  if (codigo === "OR053") return "em_andamento";
  if (codigo === "OR054") return "ja_saiu";
  if (codigo === "OR004") return "chave";
  if (codigo === "42501") return "sem_permissao";
  if (codigo === "22023") return "dados";
  return "falha";
}

export type PedidoDeTransferencia = {
  tipo: TipoDeTransferencia; pdv: number; iccid: string | null; iccidFinal: string | null; quantidade: number | null; motivo: string | null; chave: string;
};
type Formulario = { get: (nome: string) => unknown };
const textoDo = (dados: Formulario, nome: string) => {
  const v = dados.get(nome);
  return typeof v === "string" ? v.trim() : "";
};

/**
 * O pedido do formulário: o tipo, o PDV de destino e, conforme o tipo, a quantidade (eSIM), o ICCID (um chip) ou o primeiro
 * e o último ICCID (lote). Os campos do outro tipo são ignorados (o formulário mostra todos). O banco confere de novo.
 */
export function lerPedidoDeTransferencia(dados: Formulario): { ok: true; pedido: PedidoDeTransferencia } | { ok: false; erro: ErroDaTransferencia } {
  const tipo = textoDo(dados, "tipo");
  const pdv = textoDo(dados, "pdv");
  const chave = textoDo(dados, "chave");
  const motivo = textoDo(dados, "motivo").slice(0, 200) || null;
  if (!ehTipoDeTransferencia(tipo) || !/^[1-9]\d{0,8}$/.test(pdv) || !/^[0-9a-f-]{36}$/.test(chave)) return { ok: false, erro: "dados" };
  const digitos = (nome: string) => textoDo(dados, nome).replace(/\D/g, "") || null;
  const iccidValido = (i: string | null): i is string => i !== null && /^89\d{17,18}$/.test(i);
  if (tipo === "esim") {
    const quantidade = textoDo(dados, "quantidade");
    if (!/^\d{1,3}$/.test(quantidade) || Number(quantidade) < 1 || Number(quantidade) > 500) return { ok: false, erro: "dados" };
    return { ok: true, pedido: { tipo, pdv: Number(pdv), iccid: null, iccidFinal: null, quantidade: Number(quantidade), motivo, chave } };
  }
  const iccid = digitos("iccid");
  if (!iccidValido(iccid)) return { ok: false, erro: "dados" };
  if (tipo === "unidade") return { ok: true, pedido: { tipo, pdv: Number(pdv), iccid, iccidFinal: null, quantidade: null, motivo, chave } };
  const iccidFinal = digitos("iccid_final");
  if (!iccidValido(iccidFinal) || iccidFinal.length !== iccid.length || iccidFinal < iccid) return { ok: false, erro: "dados" };
  return { ok: true, pedido: { tipo, pdv: Number(pdv), iccid, iccidFinal, quantidade: null, motivo, chave } };
}

/** Os ICCIDs que chegaram, guardados no resultado do envio (só o fim de cada um, para a lista). */
export function chipsQueChegaram(resultado: unknown): string[] {
  const novos = resultado && typeof resultado === "object" ? (resultado as { novos?: unknown }).novos : undefined;
  return Array.isArray(novos) ? novos.filter((n): n is string => typeof n === "string") : [];
}

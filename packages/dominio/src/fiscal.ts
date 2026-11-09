// Fila fiscal (ADR-006): regras públicas da chave de acesso e o contrato do emissor. Nada aqui
// define tributação, modelo de nota ou prazo (isso é do contador); nada emite nota.
// Arquivo sem importações: o worker roda com o Node direto (sem empacotador).

/** Modelos conhecidos pelo código da chave de acesso (posições 21–22). Outro código aparece como está. */
export const MODELOS_DE_NOTA: Readonly<Record<string, string>> = { "55": "NF-e", "65": "NFC-e", "62": "NFCom" };

/** Dígito verificador da chave de acesso: módulo 11, pesos 2 a 9 da direita para a esquerda. */
export function digitoDaChave(base43: string): number {
  if (!/^\d{43}$/.test(base43)) throw new Error("a base da chave tem 43 dígitos");
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function chaveDeAcessoValida(texto: string): boolean {
  const chave = texto.replace(/\D/g, "");
  return /^\d{44}$/.test(chave) && digitoDaChave(chave.slice(0, 43)) === Number(chave[43]);
}

export type PartesDaChave = { uf: string; anoMes: string; cnpj: string; modelo: string; nomeDoModelo: string; serie: number; numero: number };

/** Partes da chave (padrão nacional): UF, ano/mês, CNPJ do emitente, modelo, série e número. */
export function partesDaChave(texto: string): PartesDaChave | null {
  const chave = texto.replace(/\D/g, "");
  if (!chaveDeAcessoValida(chave)) return null;
  const modelo = chave.slice(20, 22);
  return {
    uf: chave.slice(0, 2), anoMes: chave.slice(2, 6), cnpj: chave.slice(6, 20), modelo,
    nomeDoModelo: MODELOS_DE_NOTA[modelo] ?? `modelo ${modelo}`, serie: Number(chave.slice(22, 25)), numero: Number(chave.slice(25, 34)),
  };
}

/** Chave em grupos de 4, como aparece no DANFE. */
export const chaveEmGrupos = (texto: string) => texto.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");

export const SITUACOES_DA_NOTA = {
  aguardando_aprovacao: "Aguardando aprovação",
  correcao_solicitada: "Correção pedida",
  aprovada: "Aprovada: emitir",
  emitida: "Emitida",
  cancelada: "Cancelada",
} as const;
export type SituacaoDaNota = keyof typeof SITUACOES_DA_NOTA;

/** Minutos desde a venda e se passou do prazo de alerta que a organização registrou (sem prazo: nunca atrasada). */
export function tempoNaFila(vendaConcluidaEm: string | Date, agora: Date, alertaMinutos: number | null) {
  const minutos = Math.max(0, Math.floor((agora.getTime() - new Date(vendaConcluidaEm).getTime()) / 60_000));
  return { minutos, atrasada: alertaMinutos !== null && minutos >= alertaMinutos };
}

// -----------------------------------------------------------------------------
// Contrato do emissor fiscal (A4). Sem emissor contratado e homologado com o contador, a única
// implementação é a bloqueada: nenhuma nota sai do sistema.
// -----------------------------------------------------------------------------
export type PedidoDeEmissao = { pedidoId: string; vendaId: string; unidadeCnpj: string; destinatarioDocumento: string | null };
export type ResultadoDaEmissao =
  | { situacao: "autorizada"; chaveDeAcesso: string; protocolo: string }
  | { situacao: "rejeitada"; motivo: string }
  | { situacao: "desconhecida"; motivo: string }
  | { situacao: "bloqueada"; motivo: string };

export interface EmissorFiscal {
  emitir(pedido: PedidoDeEmissao): Promise<ResultadoDaEmissao>;
  consultar(pedidoId: string): Promise<ResultadoDaEmissao>;
}

export const EMISSOR_BLOQUEADO: EmissorFiscal = {
  emitir: () => Promise.resolve({ situacao: "bloqueada", motivo: "Emissor fiscal não contratado nem homologado com o contador (A4)." }),
  consultar: () => Promise.resolve({ situacao: "bloqueada", motivo: "Emissor fiscal não contratado nem homologado com o contador (A4)." }),
};

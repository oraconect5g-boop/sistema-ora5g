// AUD-f (auditoria de e7f55b2), item 5: a ativação paga pela Asaas, SÓ os estados e as regras (nada aqui move dinheiro). O
// cliente paga a cobrança da Asaas; a Ora paga a Nogle (a "saída") com o saldo da conta; a linha só conta com a prova oficial.
// Quatro coisas diferentes que não se confundem:
//   1. o cliente pagou (CONFIRMED na Asaas: o pagamento feito, o saldo ainda NÃO disponível; no cartão, cerca de 30 dias);
//   2. o saldo está disponível (RECEIVED: o dinheiro no saldo da conta);
//   3. a saída à Nogle confirmada (a transação do Pix da Ora para a Nogle, conferida pelo id);
//   4. a linha ativa (o ICCID ativo, com o número: a prova oficial da Nogle).
// A saída é uma por ativação, reservada no saldo antes (duas lojas não gastam o mesmo saldo), enviada UMA vez; sem resposta,
// nunca se reenvia: só se reconcilia pela chave do pedido. Sem contrato comprovado do código EMV da Nogle para a solicitação
// exata (hoje a Nogle devolve um LINK https, e o QR que o sistema desenha é desse link, não um Pix), a quitação pela Asaas fica
// DESLIGADA (QUITACAO_DESLIGADA) e as opções seguem as de hoje: a quitação gerencial ou a carteira da Ora pré-paga na Nogle.

export type EtapaDaQuitacao =
  | "aguardando_cliente" | "cliente_pagou" | "saldo_disponivel" | "saida_reservada" | "saida_sem_resposta" | "saida_confirmada" | "linha_ativa"
  | "conferencia" | "estornada" | "cancelada";

export type Quitacao = {
  ativacao: string;
  loja: string;
  plano: string;
  valor_centavos: number;
  etapa: EtapaDaQuitacao;
  /** O que impede a saída sem mudar a etapa (o estorno pedido, a contestação aberta). */
  bloqueio: string | null;
  /** O motivo da conferência ou da última recusa (para a gerência). */
  motivo: string | null;
  /** A chave da saída (o mesmo pedido de pagamento, para reconciliar) e o id da transação, quando houver. */
  saida: { chave: string; transacao: string | null } | null;
  chip: "reservado" | "liberado" | "ativado";
  /** Os eventos já aplicados (o mesmo evento repetido não muda nada). */
  eventos: string[];
};

export type EventoDaQuitacao =
  /** A situação do pagamento do cliente na Asaas (da reconsulta, nunca só do aviso). */
  | { tipo: "asaas"; id: string; status: string; valor_centavos: number }
  /** A prova da linha (a consulta oficial do ICCID). */
  | { tipo: "linha"; id: string; ativa: boolean }
  /** O tempo desde a saída confirmada sem a linha ativa. */
  | { tipo: "prazo"; id: string; horas_sem_linha: number };

const ANTES_DA_SAIDA: readonly EtapaDaQuitacao[] = ["aguardando_cliente", "cliente_pagou", "saldo_disponivel", "saida_reservada"];
const ordem: Record<EtapaDaQuitacao, number> = {
  aguardando_cliente: 0, cliente_pagou: 1, saldo_disponivel: 2, saida_reservada: 3, saida_sem_resposta: 4, saida_confirmada: 5, linha_ativa: 6,
  conferencia: 7, estornada: 7, cancelada: 7,
};

export function novaQuitacao(d: { ativacao: string; loja: string; plano: string; valor_centavos: number }): Quitacao {
  if (!Number.isSafeInteger(d.valor_centavos) || d.valor_centavos <= 0) throw new RangeError("valor da quitação");
  return { ...d, etapa: "aguardando_cliente", bloqueio: null, motivo: null, saida: null, chip: "reservado", eventos: [] };
}

const conferir = (q: Quitacao, motivo: string): Quitacao => ({ ...q, etapa: "conferencia", motivo });

/** Aplica um evento. Repetido (o mesmo id) ou fora de ordem (o que voltaria a etapa para trás): nada muda. */
export function aplicarEvento(q: Quitacao, e: EventoDaQuitacao): Quitacao {
  if (q.eventos.includes(e.id)) return q;
  const feito = (novo: Quitacao): Quitacao => ({ ...novo, eventos: [...q.eventos, e.id] });
  if (e.tipo === "asaas") {
    const antes = ANTES_DA_SAIDA.includes(q.etapa);
    if (e.valor_centavos !== q.valor_centavos) return feito(conferir(q, "o valor pago na Asaas é outro"));
    if (e.status === "REFUNDED") {
      // O dinheiro voltou ao cliente: antes da saída, a ativação não segue (o chip volta); depois, a Ora pagou a Nogle e devolveu.
      return feito(antes ? { ...q, etapa: "estornada", bloqueio: null, chip: "liberado", saida: null, motivo: "estornado ao cliente antes de pagar a Nogle" }
        : conferir(q, "estorno ao cliente depois da saída à Nogle: confira com a Nogle"));
    }
    if (e.status === "REFUND_REQUESTED" || e.status === "REFUND_IN_PROGRESS") {
      return feito(antes ? { ...q, bloqueio: "estorno pedido ou em andamento: não pague a Nogle" } : conferir(q, "estorno pedido depois da saída à Nogle"));
    }
    if (e.status === "CHARGEBACK_REQUESTED" || e.status === "CHARGEBACK_DISPUTE" || e.status === "AWAITING_CHARGEBACK_REVERSAL") {
      return feito(antes ? { ...q, bloqueio: "contestação (chargeback) aberta: não pague a Nogle" } : conferir(q, "contestação depois da saída à Nogle"));
    }
    if (e.status === "CONFIRMED" && ordem[q.etapa] < ordem.cliente_pagou) return feito({ ...q, etapa: "cliente_pagou" });
    if (e.status === "RECEIVED" && ordem[q.etapa] < ordem.saldo_disponivel) return feito({ ...q, etapa: "saldo_disponivel" });
    return feito(q);
  }
  if (e.tipo === "linha") {
    if (!e.ativa) return feito(q);
    if (q.etapa === "saida_confirmada") return feito({ ...q, etapa: "linha_ativa", chip: "ativado", motivo: null });
    // A linha ativa sem a saída confirmada: alguém pagou a Nogle por outro caminho, ou a saída sem resposta chegou.
    return q.etapa === "linha_ativa" ? feito(q) : feito(conferir(q, "linha ativa sem a saída à Nogle confirmada: confira o pagamento"));
  }
  if (q.etapa === "saida_confirmada" && e.horas_sem_linha >= 24) return feito(conferir(q, "Nogle paga há 24 horas e a linha ainda não está ativa"));
  return feito(q);
}

/**
 * O valor que volta para o saldo livre quando a quitação reservada deixa de seguir antes de enviar (estornada ou em conferência
 * por um evento): quem aplica o evento devolve a reserva com isto.
 */
export const reservaQueVolta = (antes: Quitacao, depois: Quitacao) => (antes.etapa === "saida_reservada" && depois.etapa !== "saida_reservada" ? antes.valor_centavos : 0);

/** O saldo da conta da Asaas que todas as lojas usam: o disponível e o já reservado para saídas. */
export type SaldoDaConta = { disponivel_centavos: number; reservado_centavos: number };
export type RecusaDaReserva = "etapa" | "bloqueada" | "saldo_insuficiente";

/**
 * Reserva o valor da saída no saldo da conta: só com o saldo do cliente disponível (RECEIVED, não CONFIRMED), sem bloqueio e
 * com o saldo livre bastando (o reservado pelas outras ativações, de qualquer loja, já conta). Uma reserva por ativação.
 */
export function reservarSaida(q: Quitacao, saldo: SaldoDaConta, chave: string): { ok: true; quitacao: Quitacao; saldo: SaldoDaConta } | { ok: false; recusa: RecusaDaReserva } {
  if (q.etapa !== "saldo_disponivel") return { ok: false, recusa: "etapa" };
  if (q.bloqueio) return { ok: false, recusa: "bloqueada" };
  if (saldo.disponivel_centavos - saldo.reservado_centavos < q.valor_centavos) return { ok: false, recusa: "saldo_insuficiente" };
  return {
    ok: true, quitacao: { ...q, etapa: "saida_reservada", saida: { chave, transacao: null }, motivo: null },
    saldo: { ...saldo, reservado_centavos: saldo.reservado_centavos + q.valor_centavos },
  };
}

// -----------------------------------------------------------------------------
// O Pix da Nogle: o código EMV (BR Code) conferido antes de pagar. O QR do sistema é o desenho de um LINK https: não paga.
// -----------------------------------------------------------------------------

/** CRC16-CCITT (o do BR Code: polinômio 0x1021, início 0xFFFF), em 4 dígitos hexadecimais maiúsculos. */
export function crcDoBrCode(texto: string): string {
  let crc = 0xffff;
  for (const caractere of new TextEncoder().encode(texto)) {
    crc ^= caractere << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
/** Os campos de um nível do BR Code (o id de 2 dígitos, o tamanho de 2 dígitos e o valor); fora da forma, nada. */
function campos(texto: string): Map<string, string> | null {
  const m = new Map<string, string>();
  for (let i = 0; i < texto.length;) {
    const id = texto.slice(i, i + 2);
    const tamanho = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(texto.slice(i + 2, i + 4)) || i + 4 + tamanho > texto.length) return null;
    m.set(id, texto.slice(i + 4, i + 4 + tamanho));
    i += 4 + tamanho;
  }
  return m;
}
export type BrCode = { chave: string; nome: string; valor_centavos: number | null };
/** O BR Code lido: a chave Pix de quem recebe, o nome dele e o valor (quando o código traz). Fora da forma ou com o CRC errado: nada. */
export function lerBrCode(emv: string): BrCode | null {
  const t = emv.trim();
  if (!/^000201/.test(t) || t.length < 30 || t.length > 512 || /[\u0000-\u001f\u007f]/.test(t)) return null;
  if (t.slice(-8, -4) !== "6304" || crcDoBrCode(t.slice(0, -4)) !== t.slice(-4).toUpperCase()) return null;
  const nivel = campos(t);
  const conta = nivel?.get("26");
  const dentro = conta ? campos(conta) : null;
  const chave = dentro?.get("00")?.toUpperCase() === "BR.GOV.BCB.PIX" ? dentro.get("01") : undefined;
  const nome = nivel?.get("59");
  const valor = nivel?.get("54");
  if (!chave || !nome) return null;
  if (valor !== undefined && !/^\d{1,10}(\.\d{1,2})?$/.test(valor)) return null;
  return { chave, nome, valor_centavos: valor === undefined ? null : Math.round(Number(valor) * 100) };
}

export type RegrasDaSaida = {
  /** A chave Pix e o nome da Nogle (de contrato): o favorecido que o código tem de trazer. */
  favorecido: { chave: string; nome: string };
  /** O teto de uma saída e a tarifa máxima aceita pela Asaas para pagar o QR (de contrato com a Asaas). */
  limite_por_saida_centavos: number;
  tarifa_maxima_centavos: number;
};
export type RecusaDoCodigo = "link_nao_e_pix" | "codigo_invalido" | "outro_favorecido" | "outro_valor" | "acima_do_limite" | "tarifa_alta";

/** Confere o código antes de pagar: um Pix (não o link), do favorecido da Nogle, do valor da ativação, dentro do limite e da tarifa. */
export function conferirCodigoDaNogle(q: Quitacao, codigo: string, regras: RegrasDaSaida, tarifa_centavos: number): { ok: true } | { ok: false; recusa: RecusaDoCodigo } {
  if (/^https?:\/\//i.test(codigo.trim())) return { ok: false, recusa: "link_nao_e_pix" };
  const br = lerBrCode(codigo);
  if (!br) return { ok: false, recusa: "codigo_invalido" };
  if (br.chave !== regras.favorecido.chave || br.nome.trim().toUpperCase() !== regras.favorecido.nome.trim().toUpperCase()) return { ok: false, recusa: "outro_favorecido" };
  if (br.valor_centavos !== q.valor_centavos) return { ok: false, recusa: "outro_valor" };
  if (q.valor_centavos > regras.limite_por_saida_centavos) return { ok: false, recusa: "acima_do_limite" };
  if (tarifa_centavos > regras.tarifa_maxima_centavos) return { ok: false, recusa: "tarifa_alta" };
  return { ok: true };
}

// -----------------------------------------------------------------------------
// O adaptador da saída (pagar o Pix da Nogle com a conta da Ora). DESLIGADO por padrão; o simulador é para os testes.
// -----------------------------------------------------------------------------

export type ResultadoDaSaida = { resultado: "confirmada"; transacao: string } | { resultado: "recusada"; motivo: string } | { resultado: "sem_resposta" };
export type ConsultaDaSaida = { resultado: "confirmada"; transacao: string } | { resultado: "nao_encontrada" } | { resultado: "falha" };
export interface SaidaPorPix {
  /** Paga o código, UMA vez, com a chave do pedido (a mesma chave nunca debita duas vezes). */
  pagar(pedido: { chave: string; codigo: string; valor_centavos: number }): Promise<ResultadoDaSaida>;
  /** A transação pela chave do pedido (para reconciliar a saída sem resposta). */
  consultar(chave: string): Promise<ConsultaDaSaida>;
}
export const SAIDA_DESLIGADA: SaidaPorPix = {
  pagar: async () => ({ resultado: "recusada", motivo: "quitação pela Asaas desligada: sem contrato do código EMV da Nogle para a solicitação" }),
  consultar: async () => ({ resultado: "falha" }),
};

/** Envia a saída reservada, UMA vez. Recusada (nada saiu): a reserva volta. Sem resposta: espera a reconciliação, nunca reenvia. */
export async function enviarSaida(q: Quitacao, saldo: SaldoDaConta, codigo: string, saida: SaidaPorPix): Promise<{ quitacao: Quitacao; saldo: SaldoDaConta }> {
  if (q.etapa !== "saida_reservada" || !q.saida || q.bloqueio) return { quitacao: q, saldo };
  const r = await saida.pagar({ chave: q.saida.chave, codigo, valor_centavos: q.valor_centavos });
  if (r.resultado === "confirmada") {
    return { quitacao: { ...q, etapa: "saida_confirmada", saida: { ...q.saida, transacao: r.transacao } }, saldo: debitar(saldo, q.valor_centavos) };
  }
  if (r.resultado === "recusada") {
    return { quitacao: { ...q, etapa: "saldo_disponivel", saida: null, motivo: r.motivo }, saldo: { ...saldo, reservado_centavos: saldo.reservado_centavos - q.valor_centavos } };
  }
  return { quitacao: { ...q, etapa: "saida_sem_resposta", motivo: "a saída foi enviada e não voltou resposta: só reconciliar, nunca reenviar" }, saldo };
}
const debitar = (s: SaldoDaConta, valor: number): SaldoDaConta => ({ disponivel_centavos: s.disponivel_centavos - valor, reservado_centavos: s.reservado_centavos - valor });

/** Reconcilia a saída sem resposta pela chave: confirmada, segue; não encontrada, a gerência confere (não se reenvia sozinho). */
export async function reconciliarSaida(q: Quitacao, saldo: SaldoDaConta, saida: SaidaPorPix): Promise<{ quitacao: Quitacao; saldo: SaldoDaConta }> {
  if (q.etapa !== "saida_sem_resposta" || !q.saida) return { quitacao: q, saldo };
  const r = await saida.consultar(q.saida.chave);
  if (r.resultado === "confirmada") {
    return { quitacao: { ...q, etapa: "saida_confirmada", saida: { ...q.saida, transacao: r.transacao }, motivo: null }, saldo: debitar(saldo, q.valor_centavos) };
  }
  if (r.resultado === "nao_encontrada") return { quitacao: conferir(q, "a saída sem resposta não aparece na conta: a gerência confere antes de pagar de novo"), saldo };
  return { quitacao: q, saldo };
}

/** Cancelar a ativação: só antes de o cliente pagar (o chip volta). Depois, o caminho é o estorno na Asaas. */
export function cancelarQuitacao(q: Quitacao): { ok: true; quitacao: Quitacao } | { ok: false; motivo: string } {
  if (q.etapa !== "aguardando_cliente") return { ok: false, motivo: "o cliente já pagou: o caminho é o estorno na Asaas" };
  return { ok: true, quitacao: { ...q, etapa: "cancelada", chip: "liberado", motivo: "cancelada antes do pagamento" } };
}

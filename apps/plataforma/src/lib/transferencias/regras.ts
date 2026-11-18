// Regras puras das telas de transferência (ADR-007, #60). O banco decide tudo de novo; aqui só se
// lê o formulário e se escolhe a mensagem (só por código de catálogo: o endereço não injeta texto).

export const SITUACOES_DA_TRANSFERENCIA = {
  solicitada: "Pedida",
  separada: "Separada na origem",
  enviada: "Em trânsito",
  recebida: "Recebida",
  recebida_com_divergencia: "Recebida com divergência",
  recusada: "Recusada",
  cancelada: "Cancelada",
} as const;
export type SituacaoDaTransferencia = keyof typeof SITUACOES_DA_TRANSFERENCIA;
export const nomeDaSituacao = (s: string) =>
  Object.hasOwn(SITUACOES_DA_TRANSFERENCIA, s) ? SITUACOES_DA_TRANSFERENCIA[s as SituacaoDaTransferencia] : s;

/**
 * O que cada passo faz no estoque (TRF-b, 18/11; achado F10 da auditoria do Codex de 17/11 e a decisão D-049, pendente).
 * O contrato não muda: pedir não reserva; separar reserva na origem (sai do disponível, o físico fica); enviar baixa o
 * físico da origem uma vez (em trânsito); receber põe no físico do destino. A tela só diz isso em cada transferência.
 */
export const EFEITO_NO_ESTOQUE: Record<SituacaoDaTransferencia, string> = {
  solicitada: "Pedida: o estoque da origem ainda não mudou (o pedido não reserva; decisão D-049 do proprietário).",
  separada: "Separada: reservada na origem. Saiu do disponível; o físico continua lá até o envio.",
  enviada: "Em trânsito: saiu do físico da origem. Entra no destino quando a loja receber e conferir.",
  recebida: "Recebida: entrou no físico do destino.",
  recebida_com_divergencia: "Recebida com divergência: entrou no destino só o que chegou; a diferença fica registrada.",
  recusada: "Recusada: nada mudou no estoque.",
  cancelada: "Cancelada: a reserva, se havia, voltou ao disponível da origem.",
};
export const efeitoNoEstoque = (s: string) => (Object.hasOwn(EFEITO_NO_ESTOQUE, s) ? EFEITO_NO_ESTOQUE[s as SituacaoDaTransferencia] : null);

export type SaldoDaLoja = { fisico: number; reservado: number; disponivel: number };
/** O saldo de uma loja e uma variação, lido de estoque_saldos (o que a pessoa vê pela RLS); forma estranha é nula. */
export function saldoDaLoja(linhas: readonly { unidade_id: string; variante_id: string; quantidade: unknown; reservado: unknown }[], unidade: string, variante: string): SaldoDaLoja | null {
  const l = linhas.find((x) => x.unidade_id === unidade && x.variante_id === variante);
  if (!l) return null;
  const q = Number(l.quantidade);
  const r = Number(l.reservado);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) return null;
  return { fisico: q, reservado: r, disponivel: q - r };
}

export const ERROS_DA_TRANSFERENCIA = {
  sem_permissao: "Seu papel não faz este passo nesta loja (separar e enviar: origem; receber: destino; sair de DEFEITOS: só quem ajusta estoque).",
  nao_encontrada: "Transferência não encontrada nesta loja.",
  sem_saldo: "Não há disponível suficiente na origem.",
  indisponivel: "Esse IMEI/ICCID não está disponível (reservado, vendido ou em trânsito).",
  outra_loja: "Esse IMEI/ICCID não é deste produto nesta loja.",
  repetida: "Este passo já foi feito de outro jeito. Recarregue a tela.",
  dados: "Confira os dados: quantidade, IMEI/ICCID (um por linha) e a explicação quando faltar item.",
  motivo: "Informe o motivo (fica na auditoria).",
  falha: "Não foi possível concluir agora. Tente de novo em instantes.",
} as const;
export type ErroDaTransferencia = keyof typeof ERROS_DA_TRANSFERENCIA;
const DO_BANCO: Record<string, ErroDaTransferencia> = {
  "42501": "sem_permissao", P0002: "nao_encontrada", OR001: "sem_saldo", OR002: "indisponivel", OR003: "outra_loja", OR004: "repetida", "22023": "dados",
};
export function erroDaTransferencia(erro: { code?: string } | null | undefined): ErroDaTransferencia {
  const codigo = erro?.code;
  return codigo && Object.hasOwn(DO_BANCO, codigo) ? (DO_BANCO[codigo] as ErroDaTransferencia) : "falha";
}

/** IMEI/ICCID lidos na conferência: um por linha (ou separados por vírgula/espaço), só dígitos, sem repetir. */
export function lerIdentificadores(texto: unknown): string[] | null {
  if (typeof texto !== "string") return [];
  const partes = texto.split(/[\s,;]+/).map((p) => p.replace(/\D/g, "")).filter(Boolean);
  if (partes.some((p) => !/^\d{14,20}$/.test(p))) return null;
  return [...new Set(partes)].slice(0, 100);
}

/** Quantidade inteira de 1 a 9999 (0 só onde a tela permite, na contagem do recebimento). */
export function lerQuantidade(texto: unknown, minimo = 1): number | null {
  if (typeof texto !== "string" || !/^\d{1,4}$/.test(texto.trim())) return null;
  const n = Number(texto.trim());
  return n >= minimo && n <= 9999 ? n : null;
}

// ---------------------------------------------------------------------------------------------
// A remessa (lote TRF-a; ORA-INV-007, #60): vários produtos pedidos de uma vez entre as mesmas duas lojas. As linhas
// viajam no endereço da tela de montar ("variante:quantidade", separadas por vírgula), sem rascunho no banco; o banco
// confere tudo de novo no pedido.
// ---------------------------------------------------------------------------------------------
export const MAXIMO_DE_LINHAS_DA_REMESSA = 30;
export type LinhaDaRemessa = { variante: string; quantidade: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** As linhas do endereço: só variante válida e quantidade de 1 a 9999; a variante repetida fica com a primeira. */
export function lerLinhasDaRemessa(texto: unknown): LinhaDaRemessa[] {
  if (typeof texto !== "string" || !texto) return [];
  const vistas = new Set<string>();
  const linhas: LinhaDaRemessa[] = [];
  for (const parte of texto.split(",").slice(0, MAXIMO_DE_LINHAS_DA_REMESSA * 2)) {
    const [variante = "", quantidade = ""] = parte.split(":");
    const n = lerQuantidade(quantidade);
    if (!UUID.test(variante) || n === null || vistas.has(variante)) continue;
    vistas.add(variante);
    linhas.push({ variante, quantidade: n });
  }
  return linhas.slice(0, MAXIMO_DE_LINHAS_DA_REMESSA);
}
export const escreverLinhasDaRemessa = (linhas: readonly LinhaDaRemessa[]) => linhas.map((l) => `${l.variante}:${l.quantidade}`).join(",");
/** Acrescenta o produto (uma unidade) se ainda não está e se cabe; senão, devolve as mesmas linhas. */
export function comALinha(linhas: readonly LinhaDaRemessa[], variante: string): LinhaDaRemessa[] {
  if (!UUID.test(variante) || linhas.some((l) => l.variante === variante) || linhas.length >= MAXIMO_DE_LINHAS_DA_REMESSA) return [...linhas];
  return [...linhas, { variante, quantidade: 1 }];
}
export const semALinha = (linhas: readonly LinhaDaRemessa[], variante: string) => linhas.filter((l) => l.variante !== variante);

/** As linhas do formulário do pedido: os pares variante e quantidade, na ordem; qualquer valor inválido recusa tudo. */
export function linhasDoFormulario(variantes: readonly unknown[], quantidades: readonly unknown[]): LinhaDaRemessa[] | null {
  if (variantes.length === 0 || variantes.length !== quantidades.length || variantes.length > MAXIMO_DE_LINHAS_DA_REMESSA) return null;
  const linhas: LinhaDaRemessa[] = [];
  for (let i = 0; i < variantes.length; i++) {
    const variante = variantes[i];
    const quantidade = lerQuantidade(quantidades[i]);
    if (typeof variante !== "string" || !UUID.test(variante) || quantidade === null || linhas.some((l) => l.variante === variante)) return null;
    linhas.push({ variante, quantidade });
  }
  return linhas;
}

// O Pix pela Asaas no caixa (lote PAY-015a; a D-062): ler o que o banco devolve (public.caixa_pix_da_venda), os rótulos de
// cada situação e as somas do pago e do que espera. Regras puras: o banco decide tudo (quem pede, o valor, a confirmação),
// e só a consulta do worker na Asaas confirma o pago.

export const SITUACOES_DO_PIX = {
  criando: { rotulo: "Gerando o QR Code", tom: "info" },
  aguardando: { rotulo: "Esperando o pagamento", tom: "info" },
  pago: { rotulo: "Pago", tom: "sucesso" },
  cancelando: { rotulo: "Cancelando", tom: "neutro" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
  vencido: { rotulo: "Venceu sem pagamento", tom: "aviso" },
  falhou: { rotulo: "Não foi possível gerar", tom: "perigo" },
  estornado: { rotulo: "Estornado", tom: "aviso" },
} as const satisfies Record<string, { rotulo: string; tom: "info" | "sucesso" | "aviso" | "perigo" | "neutro" }>;
export type SituacaoDoPix = keyof typeof SITUACOES_DO_PIX;
const ehSituacao = (v: unknown): v is SituacaoDoPix => typeof v === "string" && Object.hasOwn(SITUACOES_DO_PIX, v);

export type PixDoCaixa = {
  id: string;
  numero: number;
  valor_centavos: number;
  situacao: SituacaoDoPix;
  /** O copia e cola e a imagem (PNG em base64) só enquanto o QR espera o pagamento. */
  copia_e_cola: string | null;
  imagem: string | null;
  expira_em: string | null;
  pago_em: string | null;
  ultima_falha: string | null;
  divergencia: string | null;
};
/** `venda`: a venda aberta que o banco leu (sem pedir uma, a mais nova da pessoa na loja, a mesma da tela do PDV). */
export type PixDaVenda = { ligado: boolean; venda: string | null; pix: PixDoCaixa[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const textoOuNulo = (v: unknown, maximo: number) => (typeof v === "string" && v.length > 0 && v.length <= maximo ? v : null);

/** O que o banco devolveu, conferido campo a campo (fora da forma: fica de fora; a imagem só em base64). */
export function lerPixDaVenda(dados: unknown): PixDaVenda {
  const o = dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
  const lista = Array.isArray(o.pix) ? o.pix : [];
  const pix = lista.flatMap((x): PixDoCaixa[] => {
    const p = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const valor = typeof p.valor_centavos === "number" ? p.valor_centavos : Number(p.valor_centavos);
    if (typeof p.id !== "string" || !UUID.test(p.id) || !ehSituacao(p.situacao) || !Number.isSafeInteger(valor) || valor <= 0) return [];
    const imagem = textoOuNulo(p.imagem, 60_000);
    return [{
      id: p.id, numero: typeof p.numero === "number" ? p.numero : Number(p.numero) || 0, valor_centavos: valor, situacao: p.situacao,
      copia_e_cola: textoOuNulo(p.copia_e_cola, 600), imagem: imagem && /^[A-Za-z0-9+/=]+$/.test(imagem) ? imagem : null,
      expira_em: textoOuNulo(p.expira_em, 40), pago_em: textoOuNulo(p.pago_em, 40), ultima_falha: textoOuNulo(p.ultima_falha, 120),
      divergencia: textoOuNulo(p.divergencia, 120),
    }];
  });
  return { ligado: o.ligado === true, venda: typeof o.venda === "string" && UUID.test(o.venda) ? o.venda : null, pix };
}

/** O QR que ainda segura a conclusão (o banco recusa concluir com ele): gerando, esperando ou cancelando. */
export const pixEspera = (p: Pick<PixDoCaixa, "situacao">) => p.situacao === "criando" || p.situacao === "aguardando" || p.situacao === "cancelando";

/** Quanto já foi pago no Pix (entra sozinho na conclusão) e quanto está pedido e ainda espera. */
export function somasDoPix(pix: readonly Pick<PixDoCaixa, "situacao" | "valor_centavos">[]): { pago: number; esperando: number } {
  return {
    pago: pix.filter((p) => p.situacao === "pago").reduce((s, p) => s + p.valor_centavos, 0),
    esperando: pix.filter((p) => p.situacao === "criando" || p.situacao === "aguardando").reduce((s, p) => s + p.valor_centavos, 0),
  };
}

/** A hora (Brasília) em que o QR vence ou foi pago: "14:30". */
export const horaDe = (iso: string | null) =>
  iso && !Number.isNaN(Date.parse(iso)) ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null;

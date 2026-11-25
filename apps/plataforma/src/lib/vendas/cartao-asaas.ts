// O cartão pela Asaas no caixa (lote PAY-015b; a D-062): ler o que o banco devolve (public.caixa_cartao_da_venda), os rótulos
// de cada situação e as somas do pago e do que espera. Regras puras: o banco decide tudo (quem pede, o valor, a confirmação),
// e só a consulta do worker na Asaas confirma o pago. Do cartão, a tela só vê os 4 últimos dígitos e a bandeira.

export const SITUACOES_DO_CARTAO = {
  criando: { rotulo: "Gerando o link", tom: "info" },
  aguardando: { rotulo: "Esperando o pagamento", tom: "info" },
  pago: { rotulo: "Pago", tom: "sucesso" },
  cancelando: { rotulo: "Cancelando", tom: "neutro" },
  cancelado: { rotulo: "Cancelado", tom: "neutro" },
  vencido: { rotulo: "Venceu sem pagamento", tom: "aviso" },
  falhou: { rotulo: "Não foi possível gerar", tom: "perigo" },
  estornado: { rotulo: "Estornado", tom: "aviso" },
} as const satisfies Record<string, { rotulo: string; tom: "info" | "sucesso" | "aviso" | "perigo" | "neutro" }>;
export type SituacaoDoCartao = keyof typeof SITUACOES_DO_CARTAO;
const ehSituacao = (v: unknown): v is SituacaoDoCartao => typeof v === "string" && Object.hasOwn(SITUACOES_DO_CARTAO, v);

export type CartaoDoCaixa = {
  id: string;
  numero: number;
  valor_centavos: number;
  situacao: SituacaoDoCartao;
  /** O link da Asaas (só https), só enquanto espera o pagamento: a tela mostra o QR Code dele. */
  link_url: string | null;
  expira_em: string | null;
  pago_em: string | null;
  cartao_final: string | null;
  cartao_bandeira: string | null;
  ultima_falha: string | null;
  divergencia: string | null;
};
/** `venda`: a venda aberta que o banco leu (sem pedir uma, a mais nova da pessoa na loja, a mesma da tela do PDV). */
export type CartaoDaVenda = { ligado: boolean; venda: string | null; cartoes: CartaoDoCaixa[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const textoOuNulo = (v: unknown, maximo: number) => (typeof v === "string" && v.length > 0 && v.length <= maximo ? v : null);
const LINK_SEGURO = /^https:\/\/[^\s"'<>\\]+$/;

/** O que o banco devolveu, conferido campo a campo (fora da forma: fica de fora; o link só https, sem espaço nem aspas). */
export function lerCartaoDaVenda(dados: unknown): CartaoDaVenda {
  const o = dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
  const lista = Array.isArray(o.cartoes) ? o.cartoes : [];
  const cartoes = lista.flatMap((x): CartaoDoCaixa[] => {
    const c = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const valor = typeof c.valor_centavos === "number" ? c.valor_centavos : Number(c.valor_centavos);
    if (typeof c.id !== "string" || !UUID.test(c.id) || !ehSituacao(c.situacao) || !Number.isSafeInteger(valor) || valor <= 0) return [];
    const link = textoOuNulo(c.link_url, 500);
    const final = textoOuNulo(c.cartao_final, 4);
    const bandeira = textoOuNulo(c.cartao_bandeira, 20);
    return [{
      id: c.id, numero: typeof c.numero === "number" ? c.numero : Number(c.numero) || 0, valor_centavos: valor, situacao: c.situacao,
      link_url: link && LINK_SEGURO.test(link) ? link : null, expira_em: textoOuNulo(c.expira_em, 40), pago_em: textoOuNulo(c.pago_em, 40),
      cartao_final: final && /^\d{4}$/.test(final) ? final : null, cartao_bandeira: bandeira && /^[A-Z]{2,20}$/.test(bandeira) ? bandeira : null,
      ultima_falha: textoOuNulo(c.ultima_falha, 120), divergencia: textoOuNulo(c.divergencia, 120),
    }];
  });
  return { ligado: o.ligado === true, venda: typeof o.venda === "string" && UUID.test(o.venda) ? o.venda : null, cartoes };
}

/** O link que ainda segura a conclusão (o banco recusa concluir com ele): gerando, esperando ou cancelando. */
export const cartaoEspera = (c: Pick<CartaoDoCaixa, "situacao">) => c.situacao === "criando" || c.situacao === "aguardando" || c.situacao === "cancelando";

/** Quanto já foi pago no cartão (entra sozinho na conclusão) e quanto está pedido e ainda espera. */
export function somasDoCartao(cartoes: readonly Pick<CartaoDoCaixa, "situacao" | "valor_centavos">[]): { pago: number; esperando: number } {
  return {
    pago: cartoes.filter((c) => c.situacao === "pago").reduce((s, c) => s + c.valor_centavos, 0),
    esperando: cartoes.filter((c) => c.situacao === "criando" || c.situacao === "aguardando").reduce((s, c) => s + c.valor_centavos, 0),
  };
}

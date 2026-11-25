// A assinatura no cartão pela Asaas na ficha do cliente (lote PAY-015c; a D-062: "espaço para cadastrar os cartões, caso a
// pessoa queira adicionar recorrência", com o cartão guardado na Asaas). Regras puras: ler o que o banco devolve
// (public.assinaturas_do_cliente), os rótulos e o formulário. O banco decide quem pode e confere tudo de novo; do cartão, a
// tela só vê a bandeira e os 4 últimos dígitos.
import { lerValor } from "../vendas/regras";

export const CICLOS = {
  WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal", BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUALLY: "Semestral", YEARLY: "Anual",
} as const;
export type Ciclo = keyof typeof CICLOS;
const ehCiclo = (v: unknown): v is Ciclo => typeof v === "string" && Object.hasOwn(CICLOS, v);

type Tom = "info" | "sucesso" | "aviso" | "perigo" | "neutro";
export const SITUACOES_DA_ASSINATURA = {
  criando: { rotulo: "Gerando o link", tom: "info" },
  aguardando_cartao: { rotulo: "Esperando o cartão", tom: "info" },
  ativa: { rotulo: "Ativa", tom: "sucesso" },
  pausada: { rotulo: "Pausada na Asaas", tom: "aviso" },
  encerrada: { rotulo: "Encerrada", tom: "neutro" },
  cancelando: { rotulo: "Cancelando", tom: "neutro" },
  cancelada: { rotulo: "Cancelada", tom: "neutro" },
  sem_cartao: { rotulo: "O cartão não foi cadastrado", tom: "aviso" },
  falhou: { rotulo: "Não foi possível gerar", tom: "perigo" },
} as const satisfies Record<string, { rotulo: string; tom: Tom }>;
export type SituacaoDaAssinatura = keyof typeof SITUACOES_DA_ASSINATURA;
const ehSituacao = (v: unknown): v is SituacaoDaAssinatura => typeof v === "string" && Object.hasOwn(SITUACOES_DA_ASSINATURA, v);

export const SITUACOES_DA_COBRANCA = {
  pago: { rotulo: "Paga", tom: "sucesso" },
  pendente: { rotulo: "Pendente", tom: "info" },
  vencido: { rotulo: "Vencida", tom: "perigo" },
  estornado: { rotulo: "Estornada", tom: "aviso" },
  desconhecida: { rotulo: "Outra situação", tom: "neutro" },
} as const satisfies Record<string, { rotulo: string; tom: Tom }>;
type SituacaoDaCobranca = keyof typeof SITUACOES_DA_COBRANCA;
const ehSituacaoDaCobranca = (v: unknown): v is SituacaoDaCobranca => typeof v === "string" && Object.hasOwn(SITUACOES_DA_COBRANCA, v);

export type CobrancaDaAssinatura = { valor_centavos: number; situacao: SituacaoDaCobranca; vencimento: string | null; pago_em: string | null };
export type AssinaturaDoCliente = {
  id: string; numero: number; descricao: string; valor_centavos: number; ciclo: Ciclo; linha: string | null; situacao: SituacaoDaAssinatura;
  /** O link recorrente da Asaas (só https), só enquanto espera o cartão: a tela mostra o QR Code dele. */
  link_url: string | null; link_expira_em: string | null; cartao_final: string | null; cartao_bandeira: string | null; proxima_cobranca: string | null;
  ultima_falha: string | null; divergencia: string | null; pode_cancelar: boolean; cobrancas: CobrancaDaAssinatura[];
};
export type AssinaturasDoCliente = { ligado: boolean; podeCriar: boolean; assinaturas: AssinaturaDoCliente[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const LINK_SEGURO = /^https:\/\/[^\s"'<>\\]+$/;
const textoOuNulo = (v: unknown, maximo: number) => (typeof v === "string" && v.length > 0 && v.length <= maximo ? v : null);
const numero = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** O que o banco devolveu, conferido campo a campo (o fora da forma fica de fora). */
export function lerAssinaturasDoCliente(dados: unknown): AssinaturasDoCliente {
  const o = dados && typeof dados === "object" ? (dados as Record<string, unknown>) : {};
  const lista = Array.isArray(o.assinaturas) ? o.assinaturas : [];
  const assinaturas = lista.flatMap((x): AssinaturaDoCliente[] => {
    const a = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
    const valor = numero(a.valor_centavos);
    const descricao = textoOuNulo(a.descricao, 60);
    if (typeof a.id !== "string" || !UUID.test(a.id) || !ehSituacao(a.situacao) || !ehCiclo(a.ciclo) || !descricao || !Number.isSafeInteger(valor) || valor <= 0) return [];
    const link = textoOuNulo(a.link_url, 500);
    const final = textoOuNulo(a.cartao_final, 4);
    const bandeira = textoOuNulo(a.cartao_bandeira, 20);
    const proxima = textoOuNulo(a.proxima_cobranca, 10);
    const cobrancas = (Array.isArray(a.cobrancas) ? a.cobrancas : []).flatMap((y): CobrancaDaAssinatura[] => {
      const c = y && typeof y === "object" ? (y as Record<string, unknown>) : {};
      const v = numero(c.valor_centavos);
      if (!ehSituacaoDaCobranca(c.situacao) || !Number.isSafeInteger(v) || v < 0) return [];
      const vencimento = textoOuNulo(c.vencimento, 10);
      const pago = textoOuNulo(c.pago_em, 10);
      return [{ valor_centavos: v, situacao: c.situacao, vencimento: vencimento && DIA.test(vencimento) ? vencimento : null, pago_em: pago && DIA.test(pago) ? pago : null }];
    }).slice(0, 6);
    return [{
      id: a.id, numero: Number.isSafeInteger(numero(a.numero)) ? numero(a.numero) : 0, descricao, valor_centavos: valor, ciclo: a.ciclo,
      linha: typeof a.linha === "string" && /^\d{10,11}$/.test(a.linha) ? a.linha : null, situacao: a.situacao,
      link_url: link && LINK_SEGURO.test(link) ? link : null, link_expira_em: textoOuNulo(a.link_expira_em, 40),
      cartao_final: final && /^\d{4}$/.test(final) ? final : null, cartao_bandeira: bandeira && /^[A-Z]{2,20}$/.test(bandeira) ? bandeira : null,
      proxima_cobranca: proxima && DIA.test(proxima) ? proxima : null, ultima_falha: textoOuNulo(a.ultima_falha, 120), divergencia: textoOuNulo(a.divergencia, 120),
      pode_cancelar: a.pode_cancelar === true, cobrancas,
    }];
  });
  return { ligado: o.ligado === true, podeCriar: o.pode_criar === true, assinaturas };
}

type Formulario = { get: (nome: string) => unknown };
export type PedidoDeAssinatura = { descricao: string; valor_centavos: number; ciclo: Ciclo; linha: string | null };

/** O formulário da assinatura: a descrição (3 a 60, sem < e >), o valor (R$ 1,00 a R$ 100.000,00), o ciclo e a linha (opcional). */
export function lerPedidoDeAssinatura(dados: Formulario): PedidoDeAssinatura | null {
  const descricao = typeof dados.get("descricao") === "string" ? (dados.get("descricao") as string).trim() : "";
  const valor = lerValor(dados.get("valor"));
  const ciclo = dados.get("ciclo");
  const linhaDigitada = typeof dados.get("linha") === "string" ? (dados.get("linha") as string).replace(/\D/g, "") : "";
  if (descricao.length < 3 || descricao.length > 60 || /[<>]/.test(descricao)) return null;
  if (valor === null || valor < 100 || valor > 10_000_000 || !ehCiclo(ciclo)) return null;
  if (linhaDigitada && !/^[1-9]{2}9?\d{8}$/.test(linhaDigitada)) return null;
  return { descricao, valor_centavos: valor, ciclo, linha: linhaDigitada || null };
}

/** A data (AAAA-MM-DD) em DD/MM/AAAA, sem fuso (é um dia do calendário). */
export const diaDe = (dia: string | null) => (dia && DIA.test(dia) ? dia.split("-").reverse().join("/") : null);

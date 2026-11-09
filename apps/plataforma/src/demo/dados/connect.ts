import { gerador, semente } from "./aleatorio";
import { CHIPS_POR_LOJA, iccidDeTeste } from "./catalogo";

// ⚠️ Ora Connect FICTÍCIA, no formato da documentação oficial da API NOGLE (Nogle). Planos, valores, linhas,
// clientes, saldos e pedidos são inventados; os reais virão de GET /planos, /linhas/detalhes etc. quando a
// integração for liberada (tipo de chave P9 + credenciais). Operadoras e motivos seguem os exemplos da documentação.

export type PlanoConnect = { id: number; plano: string; valor: number; ligacoes: string; sms: string; detalhamento: string; internetPadrao: string; campanha: boolean };

export const PLANOS_CONNECT: readonly PlanoConnect[] = [
  { id: 101, plano: "4 GB", valor: 2_990, ligacoes: "ligações ilimitadas", sms: "100 SMS", detalhamento: "3 GB + 1 GB", internetPadrao: "3 GB", campanha: false },
  { id: 102, plano: "7 GB", valor: 4_490, ligacoes: "ligações ilimitadas", sms: "100 SMS", detalhamento: "6 GB + 1 GB", internetPadrao: "6 GB", campanha: false },
  { id: 103, plano: "12 GB", valor: 5_490, ligacoes: "ligações ilimitadas", sms: "100 SMS", detalhamento: "10 GB + 2 GB", internetPadrao: "10 GB", campanha: false },
  { id: 104, plano: "20 GB", valor: 6_990, ligacoes: "ligações ilimitadas", sms: "100 SMS", detalhamento: "17 GB + 3 GB", internetPadrao: "17 GB", campanha: false },
  { id: 201, plano: "Pague 8 Leve 12", valor: 4_490, ligacoes: "ligações ilimitadas", sms: "100 SMS", detalhamento: "8 GB + 4 GB", internetPadrao: "8 GB", campanha: true },
];

/** id_plano documentado para compra de APENAS CHIP (POST /compra/solicitar). */
export const PLANO_APENAS_CHIP = 88_888;

export const DDDS_PR = [41, 42, 43, 44, 45, 46] as const;

/** Exemplo de resposta de GET /portabilidade/operadorasDisponiveis na documentação. */
export const OPERADORAS_DOADORAS = [
  { id: 41, descricao: "CLARO" }, { id: 47, descricao: "NEXTEL" }, { id: 48, descricao: "OI" },
  { id: 51, descricao: "SURF TELECOM" }, { id: 52, descricao: "TIM" }, { id: 54, descricao: "VIVO" },
] as const;

export type LinhaConnect = {
  numero: string;
  apelido: string;
  iccid: string;
  titular: string;
  documento: string;
  status: "ATIVO" | "CANCELADO";
  motivoCancelamento?: string;
  plano: string;
  tipoLinha: "PRÉ PAGO" | "CONTROLE INTELIGENTE";
  dataAtivacao: number;
  fimPlanoEmDias: number;
  esim: boolean;
  portin: boolean;
  bloqueada: boolean;
  recargaAutomatica: string | null;
  saldo: { dadosMb: number; minutos: number; sms: number };
  consumoMbPorDia: readonly number[];
  historico: readonly { diasAtras: number; plano: string; valor: number; forma: string }[];
  cobrancasAbertas: readonly { diasAtras: number; valor: number; forma: string }[];
  loja: string;
};

const consumo = (chave: string, media: number) => {
  const g = gerador(semente(chave));
  return Array.from({ length: 30 }, (_, i) => Math.max(0, Math.round(media * (0.3 + g.proximo() * 1.4) * (i % 7 === 5 || i % 7 === 6 ? 1.3 : 1))));
};

export const LINHAS_CONNECT: readonly LinhaConnect[] = [
  { numero: "41900000101", apelido: "Pessoal", iccid: iccidDeTeste(3001), titular: "Mariana S. (fictícia)", documento: "00000000191", status: "ATIVO", plano: "7 GB", tipoLinha: "PRÉ PAGO", dataAtivacao: 210, fimPlanoEmDias: 12, esim: false, portin: false, bloqueada: false, recargaAutomatica: "7 GB", saldo: { dadosMb: 2_395, minutos: 9_999, sms: 60 }, consumoMbPorDia: consumo("l101", 160), historico: [{ diasAtras: 18, plano: "7 GB", valor: 4_490, forma: "SALDO" }, { diasAtras: 48, plano: "7 GB", valor: 4_490, forma: "LINK" }], cobrancasAbertas: [], loja: "santa-candida" },
  { numero: "41900000202", apelido: "Trabalho", iccid: iccidDeTeste(3002), titular: "Carlos L. (fictício)", documento: "00000000272", status: "ATIVO", plano: "12 GB", tipoLinha: "CONTROLE INTELIGENTE", dataAtivacao: 95, fimPlanoEmDias: 3, esim: true, portin: true, bloqueada: false, recargaAutomatica: null, saldo: { dadosMb: 640, minutos: 9_999, sms: 12 }, consumoMbPorDia: consumo("l202", 340), historico: [{ diasAtras: 27, plano: "12 GB", valor: 5_490, forma: "PIX" }], cobrancasAbertas: [{ diasAtras: 1, valor: 5_490, forma: "LINK" }], loja: "santa-candida" },
  { numero: "41900000303", apelido: "Filho", iccid: iccidDeTeste(3003), titular: "Fernanda R. (fictícia)", documento: "00000000353", status: "ATIVO", plano: "4 GB", tipoLinha: "PRÉ PAGO", dataAtivacao: 40, fimPlanoEmDias: -5, esim: false, portin: false, bloqueada: true, recargaAutomatica: null, saldo: { dadosMb: 0, minutos: 0, sms: 0 }, consumoMbPorDia: consumo("l303", 90), historico: [{ diasAtras: 35, plano: "4 GB", valor: 2_990, forma: "LINK" }], cobrancasAbertas: [], loja: "loja-03" },
  { numero: "41900000404", apelido: "Loja", iccid: iccidDeTeste(3004), titular: "Paulo T. (fictício)", documento: "00000000434", status: "CANCELADO", motivoCancelamento: "PORTOUT", plano: "7 GB", tipoLinha: "PRÉ PAGO", dataAtivacao: 400, fimPlanoEmDias: -60, esim: false, portin: false, bloqueada: false, recargaAutomatica: null, saldo: { dadosMb: 0, minutos: 0, sms: 0 }, consumoMbPorDia: Array.from({ length: 30 }, () => 0), historico: [], cobrancasAbertas: [], loja: "loja-07" },
];

/** Chips com situação conhecida para a validação de ICCID (POST /ativacao/validaIccid). */
export const ICCID_EM_PROCESSAMENTO = iccidDeTeste(3901);
export const ICCID_COM_ERRO = iccidDeTeste(3902);

export function codigoDoIccid(iccid: string): 88 | 11 | 33 | 22 | 99 {
  const limpo = iccid.replace(/\D/g, "");
  if (!/^8955\d{15}$/.test(limpo)) return 99;
  if (limpo === ICCID_EM_PROCESSAMENTO) return 33;
  if (limpo === ICCID_COM_ERRO) return 22;
  if (LINHAS_CONNECT.some((l) => l.iccid === limpo && l.status === "ATIVO")) return 11;
  if (Object.values(CHIPS_POR_LOJA).flat().includes(limpo) || ESTOQUE_VIRGEM.some((c) => c.iccid === limpo)) return 88;
  return 99;
}

/** Estoque de chips virgens na Nogle (GET /linhas/estoque), físicos e eSIM. */
export const ESTOQUE_VIRGEM = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: String(7001 + i), iccid: iccidDeTeste(4001 + i), tipo: "físico" as const })),
  ...Array.from({ length: 4 }, (_, i) => ({ id: String(7101 + i), iccid: iccidDeTeste(4101 + i), tipo: "eSIM" as const })),
];

/** Lojas da Ora cadastradas como PDV na Nogle (GET /pdv/listar) e estoque de cada uma (GET /pdv/estoque). */
export const PDVS_CONTEL = [
  { idPdv: 3968, loja: "santa-candida", usuarios: 4, estoqueMinimo: 10, esim: 15 },
  { idPdv: 3969, loja: "loja-03", usuarios: 3, estoqueMinimo: 8, esim: 5 },
  { idPdv: 3970, loja: "loja-07", usuarios: 2, estoqueMinimo: 8, esim: 0 },
];

export const CARTEIRA_CONTEL = {
  saldo: 185_000,
  extrato: [
    { diasAtras: 0, tipo: "SAÍDA", descricao: "Ativação 7 GB · chip •••• 0011", valor: 3_590 },
    { diasAtras: 0, tipo: "SAÍDA", descricao: "Recarga 7 GB · (41) 9 ••••-0101", valor: 3_590 },
    { diasAtras: 1, tipo: "SAÍDA", descricao: "Recarga 12 GB · (41) 9 ••••-0202", valor: 4_390 },
    { diasAtras: 2, tipo: "ENTRADA", descricao: "Depósito de saldo na Nogle", valor: 150_000 },
    { diasAtras: 4, tipo: "SAÍDA", descricao: "Compra de 3 chips com entrega", valor: 3_470 },
  ],
};

export const RECARGAS_PROGRAMADAS = [
  { linha: "41900000101", cliente: "Mariana S. (fictícia)", plano: "7 GB", valor: 4_490, renovacaoEmDias: 12, cadastradaPor: "Ana Souza" },
  { linha: "41900000505", cliente: "Roberto C. (fictício)", plano: "12 GB", valor: 5_490, renovacaoEmDias: 5, cadastradaPor: "Marcos Lima" },
];

export const PORTABILIDADES = [
  { linha: "41900000202", doador: "41999990001", operadora: "TIM", status: "Sucesso" as const, cadastroDiasAtras: 95 },
  { linha: "41900000606", doador: "41999990002", operadora: "VIVO", status: "Portabilidade em andamento" as const, cadastroDiasAtras: 2 },
  { linha: "41900000707", doador: "41999990003", operadora: "CLARO", status: "Aguardando confirmação" as const, cadastroDiasAtras: 0 },
  { linha: "41900000808", doador: "41999990004", operadora: "OI", status: "Portabilidade negada" as const, cadastroDiasAtras: 6 },
];

export const COMPRAS_CHIP = [
  { id: 9172, cliente: "Aline M. (fictícia)", quantidade: 1, plano: "7 GB", rastreio: [{ diasAtras: 3, status: "PEDIDO PAGO" }, { diasAtras: 2, status: "POSTADO" }, { diasAtras: 1, status: "EM ROTA" }] },
  { id: 9180, cliente: "Jorge P. (fictício)", quantidade: 2, plano: "Apenas chip", rastreio: [{ diasAtras: 0, status: "AGUARDANDO PAGAMENTO" }] },
];

/** Valores de exemplo da documentação (GET /logistica). */
export const LOGISTICA = { frete: 490, chip: 1_000 };

/** Categorias do exemplo de GET /faq/categorias (as perguntas e respostas vêm da Nogle). */
export const FAQ_CATEGORIAS = [{ id: 6, descricao: "Atendimento" }, { id: 7, descricao: "Portabilidade" }];

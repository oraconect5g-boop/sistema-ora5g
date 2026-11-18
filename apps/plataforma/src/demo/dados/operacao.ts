import { MEIOS, pb, type MeioPagamento } from "@ora5g/dominio";

import { gerador, semente } from "./aleatorio";
import { imeiDeTeste } from "./catalogo";
import { LOJAS } from "./organizacao";
import { contaNoFaturamento, VENDAS_HOJE, type VendaDemo } from "./vendas";

// ⚠️ Operação FICTÍCIA derivada das vendas do dia (aprovações, Ora Connect, caixa, notas),
// mais ordens de serviço, clientes, conversas e auditoria inventados.

// ---------- Aprovações (derivadas das vendas pendentes) ----------

export type Aprovacao = {
  id: string;
  tipo: "desconto" | "nota" | "cancelamento";
  venda: VendaDemo;
};

export const APROVACOES: readonly Aprovacao[] = VENDAS_HOJE.flatMap((v): Aprovacao[] => {
  if (v.situacao === "aguardando_aprovacao") return [{ id: `desconto-${v.numero}`, tipo: "desconto", venda: v }];
  if (v.situacao === "cancelamento_solicitado") return [{ id: `cancelamento-${v.numero}`, tipo: "cancelamento", venda: v }];
  if (v.nota === "solicitada") return [{ id: `nota-${v.numero}`, tipo: "nota", venda: v }];
  return [];
});

/** Taxa do meio de pagamento da venda, usada na margem que sobra (exemplo). */
export const TAXA_DO_MEIO: Readonly<Record<MeioPagamento, number>> = {
  dinheiro: 0,
  pix_direto: 0,
  pix_picpay: pb(0),
  cartao_picpay: pb(8.5),
  cartao_pagseguro: pb(7.9),
  link_pagamento: pb(4.5),
  payjoy: pb(0),
  aiva: pb(0),
  vale_troca: 0,
};

// ---------- Ora Connect (derivado dos itens telecom das vendas) ----------

export type OperacaoConnect = {
  id: string;
  hora: string;
  loja: string;
  vendedor: string;
  tipo: "Chip" | "Ativação" | "Portabilidade" | "Recarga";
  linha: string;
  valor: number;
  situacao: "Confirmada pela operadora" | "Aguardando operadora" | "Falhou — reconsultar antes de reenviar";
};

export const OPERACOES_CONNECT: readonly OperacaoConnect[] = VENDAS_HOJE.filter(contaNoFaturamento).flatMap((v, i) =>
  v.itens
    .filter((it) => it.tipo === "chip" || it.tipo === "ativacao" || it.tipo === "portabilidade" || it.tipo === "recarga")
    .map((it, j): OperacaoConnect => ({
      id: `${v.numero}-${j}`,
      hora: v.hora,
      loja: v.loja,
      vendedor: v.vendedor,
      tipo: it.tipo === "chip" ? "Chip" : it.tipo === "ativacao" ? "Ativação" : it.tipo === "portabilidade" ? "Portabilidade" : "Recarga",
      linha: `(41) 9 ••••-${String(1000 + ((i * 37 + j * 11) % 9000)).slice(-4)}`,
      valor: it.precoUnitario * it.quantidade,
      situacao: it.tipo === "chip" || it.situacaoTelecom === "confirmada"
        ? "Confirmada pela operadora"
        : it.situacaoTelecom === "falhou" ? "Falhou — reconsultar antes de reenviar" : "Aguardando operadora",
    })),
);

// ---------- Assistência técnica (OS) ----------

export const ETAPAS_OS = ["Recebido na loja", "Comprovante ao cliente", "Enviado ao técnico", "Orçamento", "Aprovado pelo cliente", "Pronto e devolvido", "Cliente avisado", "Entregue e pago"] as const;

export type OrdemServico = {
  numero: string;
  loja: string;
  cliente: string;
  aparelho: string;
  imei: string;
  defeito: string;
  etapa: number;
  valor: number;
  dias: number;
  abertaPor: string;
  tecnico: string;
};

export const ORDENS_SERVICO: readonly OrdemServico[] = [
  { numero: "OS-1046", loja: "santa-candida", cliente: "Cliente balcão", aparelho: "Galaxy A15", imei: imeiDeTeste(9101), defeito: "Não carrega", etapa: 0, valor: 0, dias: 0, abertaPor: "ana", tecnico: "teo" },
  { numero: "OS-1045", loja: "loja-03", cliente: "Letícia V.", aparelho: "iPhone 11", imei: imeiDeTeste(9102), defeito: "Troca de bateria", etapa: 2, valor: 0, dias: 1, abertaPor: "v04", tecnico: "teo" },
  { numero: "OS-1044", loja: "santa-candida", cliente: "Cliente balcão", aparelho: "Moto G54", imei: imeiDeTeste(9103), defeito: "Limpeza do conector", etapa: 1, valor: 6_000, dias: 0, abertaPor: "lucas", tecnico: "teo" },
  { numero: "OS-1043", loja: "santa-candida", cliente: "Mariana S.", aparelho: "iPhone 12", imei: imeiDeTeste(9104), defeito: "Bateria", etapa: 5, valor: 29_000, dias: 1, abertaPor: "ana", tecnico: "teo" },
  { numero: "OS-1042", loja: "santa-candida", cliente: "Carlos L.", aparelho: "Galaxy A34", imei: imeiDeTeste(9105), defeito: "Tela trincada", etapa: 3, valor: 38_000, dias: 2, abertaPor: "rafael", tecnico: "teo" },
  { numero: "OS-1041", loja: "loja-07", cliente: "Paulo T.", aparelho: "Redmi Note 12", imei: imeiDeTeste(9106), defeito: "Alto-falante", etapa: 4, valor: 15_000, dias: 3, abertaPor: "v14", tecnico: "teo" },
  { numero: "OS-1039", loja: "santa-candida", cliente: "Cliente balcão", aparelho: "Redmi 13C", imei: imeiDeTeste(9107), defeito: "Não liga", etapa: 3, valor: 0, dias: 6, abertaPor: "julia", tecnico: "teo" },
  { numero: "OS-1036", loja: "loja-05", cliente: "Simone A.", aparelho: "Moto E13", imei: imeiDeTeste(9108), defeito: "Conector de carga", etapa: 7, valor: 9_000, dias: 4, abertaPor: "v07", tecnico: "teo" },
];

// ---------- Caixa e financeiro ----------

/** Recebimentos do dia por meio de pagamento (o que a loja recebeu; financeiras ficam à parte). */
export function recebimentosPorMeio(vendas: readonly VendaDemo[]) {
  const mapa = new Map<MeioPagamento, number>();
  for (const v of vendas.filter(contaNoFaturamento)) {
    for (const p of v.pagamentos) {
      const recebido = MEIOS[p.meio].financeira ? (p.entrada ?? 0) : p.valor;
      mapa.set(p.meio, (mapa.get(p.meio) ?? 0) + recebido);
    }
  }
  return mapa;
}

export function financiadoPorFinanceira(vendas: readonly VendaDemo[]) {
  const lista = (["payjoy", "aiva"] as const).map((meio) => {
    const pagamentos = vendas.filter(contaNoFaturamento).flatMap((v) => v.pagamentos.filter((p) => p.meio === meio));
    return {
      meio,
      nome: MEIOS[meio].nome.replace("Financiamento ", ""),
      vendas: pagamentos.length,
      entradas: pagamentos.reduce((s, p) => s + (p.entrada ?? 0), 0),
      aReceber: pagamentos.reduce((s, p) => s + p.valor - (p.entrada ?? 0), 0),
    };
  });
  return lista;
}

/** Situação de conciliação por meio (PAY-003: autorizado, pago, liquidado, conciliado). */
export const CONCILIACAO: Readonly<Record<MeioPagamento, { situacao: string; tom: "sucesso" | "aviso" | "info" }>> = {
  dinheiro: { situacao: "Conferido no caixa", tom: "sucesso" },
  pix_direto: { situacao: "Conciliado com o extrato", tom: "sucesso" },
  pix_picpay: { situacao: "Liquidado · a conciliar", tom: "aviso" },
  cartao_picpay: { situacao: "Autorizado · liquida em D+1", tom: "info" },
  cartao_pagseguro: { situacao: "Autorizado · liquida em D+1", tom: "info" },
  link_pagamento: { situacao: "Pago · a conciliar", tom: "aviso" },
  payjoy: { situacao: "Entrada recebida · restante a receber", tom: "info" },
  aiva: { situacao: "Entrada recebida · restante a receber", tom: "info" },
  vale_troca: { situacao: "Crédito da loja (devolução)", tom: "info" },
};

/** Caixa físico da loja (dinheiro): abertura + vendas em dinheiro − sangrias = previsto; contado na conferência. */
export function caixaDaLoja(codigo: string, vendas: readonly VendaDemo[]) {
  const dinheiro = vendas.filter((v) => v.loja === codigo && contaNoFaturamento(v)).flatMap((v) => v.pagamentos).filter((p) => p.meio === "dinheiro").reduce((s, p) => s + p.valor, 0);
  const abertura = 20_000;
  const sangrias = dinheiro > 150_000 ? 100_000 : 0;
  const previsto = abertura + dinheiro - sangrias;
  const diferenca = codigo === "santa-candida" ? -2_000 : 0;
  return { abertura, dinheiro, sangrias, previsto, contado: previsto + diferenca, diferenca, conferidoPor: codigo === "santa-candida" ? "Marcos Lima" : null };
}

/** Contas a pagar e a receber (exemplos) e fluxo de caixa dos últimos 14 dias da rede. */
export type Conta = { descricao: string; tipo: "pagar" | "receber"; vencimento: number; valor: number; loja: string; situacao: "A vencer" | "Vencida" | "A receber" };

export const CONTAS: readonly Conta[] = [
  { descricao: "Fornecedor de aparelhos (boleto)", tipo: "pagar", vencimento: 2, valor: 4_820_000, loja: "rede", situacao: "A vencer" },
  { descricao: "Aluguel · Santa Cândida", tipo: "pagar", vencimento: 3, valor: 650_000, loja: "santa-candida", situacao: "A vencer" },
  { descricao: "Energia · Água Verde", tipo: "pagar", vencimento: -1, valor: 48_000, loja: "loja-03", situacao: "Vencida" },
  { descricao: "Repasse PayJoy (vendas da semana)", tipo: "receber", vencimento: 1, valor: 1_284_000, loja: "rede", situacao: "A receber" },
  { descricao: "Liquidação cartões PicPay", tipo: "receber", vencimento: 1, valor: 2_960_000, loja: "rede", situacao: "A receber" },
  { descricao: "Repasse Aiva (Flexphone)", tipo: "receber", vencimento: 6, valor: 412_000, loja: "rede", situacao: "A receber" },
];

export function fluxoDeCaixa(dias = 14) {
  const g = gerador(semente("fluxo-rede"));
  return Array.from({ length: dias }, (_, i) => {
    const entrada = 18_000_000 + g.entre(0, 9_000_000) + (i % 7 === 5 ? 6_000_000 : 0);
    const saida = 11_000_000 + g.entre(0, 7_000_000) + (i % 7 === 1 ? 9_000_000 : 0);
    return { entrada, saida };
  });
}

// ---------- Clientes e atendimento ----------

export const CLIENTES = [
  { id: "c1", nome: "Mariana S. (fictícia)", telefone: "(41) 9 0000-0001", cpf: "000.000.001-91", email: "mariana@exemplo.invalid", consentimentoWhatsapp: true, desde: "mar/2025", compras: [{ quando: "hoje", loja: "santa-candida", descricao: "Galaxy A55 + capa", valor: 227_800 }, { quando: "há 4 meses", loja: "santa-candida", descricao: "Película de vidro", valor: 3_990 }], os: ["OS-1043"] },
  { id: "c2", nome: "Carlos L. (fictício)", telefone: "(41) 9 0000-0002", cpf: "000.000.002-72", email: null, consentimentoWhatsapp: true, desde: "ago/2024", compras: [{ quando: "hoje", loja: "santa-candida", descricao: "Redmi Note 14 + película", valor: 153_890 }], os: ["OS-1042"] },
  { id: "c3", nome: "Fernanda R. (fictícia)", telefone: "(41) 9 0000-0003", cpf: "000.000.003-53", email: "fernanda@exemplo.invalid", consentimentoWhatsapp: false, desde: "nov/2026", compras: [], os: [] },
] as const;

export const ETAPAS_LEAD = ["Novo", "Em atendimento", "Negociação", "Ganho"] as const;

export const LEADS = [
  { nome: "Mariana S. (fictícia)", origem: "WhatsApp", interesse: "Smartphone até R$ 2.000", responsavel: "ana", etapa: "Ganho" },
  { nome: "Carlos L. (fictício)", origem: "Anúncio Meta (exemplo)", interesse: "Plano Ora Connect", responsavel: "lucas", etapa: "Em atendimento" },
  { nome: "Fernanda R. (fictícia)", origem: "Instagram", interesse: "Portabilidade", responsavel: "julia", etapa: "Negociação" },
  { nome: "Roberto C. (fictício)", origem: "Loja física", interesse: "iPhone 15", responsavel: "lucas", etapa: "Negociação" },
  { nome: "Aline M. (fictícia)", origem: "Site", interesse: "Galaxy A55 financiado", responsavel: "ana", etapa: "Novo" },
  { nome: "Jorge P. (fictício)", origem: "WhatsApp", interesse: "Conserto de tela", responsavel: "rafael", etapa: "Novo" },
] as const;

export const CONVERSAS = [
  {
    id: "cv1", cliente: "Mariana S. (fictícia)", canal: "WhatsApp", responsavel: "ana", naoLidas: 0, ultima: "Perfeito, passo aí às 15h!",
    mensagens: [
      { de: "cliente", texto: "Olá! Vocês têm o Galaxy A55 na loja?", hora: "09:12" },
      { de: "loja", texto: "Temos sim! Quer reservar para retirar hoje na Santa Cândida?", hora: "09:14" },
      { de: "cliente", texto: "Perfeito, passo aí às 15h!", hora: "09:15" },
    ],
  },
  {
    id: "cv2", cliente: "Aline M. (fictícia)", canal: "Site", responsavel: "ana", naoLidas: 2, ultima: "Dá para parcelar pela PayJoy?",
    mensagens: [
      { de: "cliente", texto: "Boa tarde! Vi o Galaxy A55 no site.", hora: "13:40" },
      { de: "cliente", texto: "Dá para parcelar pela PayJoy?", hora: "13:41" },
    ],
  },
  {
    id: "cv3", cliente: "Jorge P. (fictício)", canal: "WhatsApp", responsavel: "rafael", naoLidas: 1, ultima: "Quanto fica a troca da tela?",
    mensagens: [{ de: "cliente", texto: "Quanto fica a troca da tela de um Moto G54?", hora: "14:05" }],
  },
] as const;

/** Sugestão da IA SUPERVISIONADA por conversa: o vendedor decide se usa. A IA nunca dá desconto. */
export const SUGESTOES_IA: Readonly<Record<string, string>> = {
  cv1: "Confirmar a reserva e lembrar de trazer documento com foto.",
  cv2: "Sim! Na PayJoy você dá uma entrada e parcela o restante. Posso simular para você?",
  cv3: "Vou abrir uma ordem de serviço para o técnico fazer o orçamento sem compromisso.",
};

// ---------- Canais online ----------

// Os canais (DEMO-a, 18/11): o que já entra por arquivo na aplicação real (MKTPL-a, META-a, ONLINE-a/b) e o que falta
// para ligar cada um direto (contrato e autorização; ADR-018, ADR-017, ADR-020).
export const CANAIS = [
  { nome: "Loja online Ora 5G", situacao: "No ar: vitrine e reserva", precisa: ["Produtos publicados com foto e preço", "Provedor do pagamento online (E1)", "Frete e transportadora (P10)"] },
  { nome: "Mercado Livre", situacao: "Por arquivo", precisa: ["App no portal de desenvolvedores", "Autorização da conta de vendedor (conexão direta)"] },
  { nome: "TikTok Shop", situacao: "Por arquivo", precisa: ["App no Partner Center", "Autorização da loja (conexão direta)"] },
  { nome: "Shopee", situacao: "Por arquivo", precisa: ["Aprovação como parceiro na Open Platform (conexão direta)"] },
  { nome: "Meta Ads", situacao: "Por arquivo", precisa: ["Verificação da empresa na Meta", "Conexão com a conta de anúncios (D-022)"] },
  { nome: "WhatsApp oficial", situacao: "Não conectado", precisa: ["Número aprovado na API oficial da Meta", "Modelos de mensagem aprovados"] },
] as const;

// Os canais lado a lado num mês (DEMO-a): números FICTÍCIOS, no mesmo cálculo da tela real /relatorios/canais (ADR-019).
export const CANAIS_NO_MES = {
  lojas: { vendas: 312, vendido: 48_250_000, devolvidoECancelado: 1_150_000, taxas: 640_000, conciliado: 21_800_000, margem: 9_400_000, doSite: { vendas: 18, valor: 2_310_000 } },
  marketplaces: [
    { nome: "Mercado Livre", pedidos: 42, bruto: 3_180_000, taxas: 540_000, liquido: 2_640_000, lucro: 420_000, semCusto: 3 },
    { nome: "Shopee", pedidos: 15, bruto: 690_000, taxas: 118_000, liquido: 572_000, lucro: 96_000, semCusto: 0 },
  ],
  anuncios: { gasto: 450_000, vendas: 21, devolvidas: 1, receita: 2_740_000, devolvido: 129_900, clientesNovos: 14 },
} as const;

// ---------- Auditoria (amostra da trilha imutável) ----------

export const AUDITORIA = [
  { hora: "12:16", quem: "julia", papel: "vendedor", acao: "Pediu aprovação de desconto", alvo: "Venda da Júlia (Moto G85)", loja: "santa-candida", tipo: "venda" },
  { hora: "11:58", quem: "lucas", papel: "vendedor", acao: "Pediu aprovação de desconto", alvo: "Venda do Lucas (iPhone 15)", loja: "santa-candida", tipo: "venda" },
  { hora: "11:40", quem: "marcos", papel: "gerente", acao: "Aprovou desconto dentro da alçada", alvo: "Venda de acessórios", loja: "santa-candida", tipo: "aprovacao" },
  { hora: "11:02", quem: "ana", papel: "vendedor", acao: "Consultou cliente por telefone (busca exata)", alvo: "Cliente Mariana S.", loja: "santa-candida", tipo: "lgpd" },
  { hora: "10:31", quem: "ana", papel: "vendedor", acao: "Solicitou nota fiscal por e-mail", alvo: "Venda da Ana (Galaxy A55)", loja: "santa-candida", tipo: "fiscal" },
  { hora: "09:20", quem: "marcos", papel: "gerente", acao: "Abriu o caixa com R$ 200,00", alvo: "Caixa da loja", loja: "santa-candida", tipo: "caixa" },
  { hora: "09:05", quem: "ana", papel: "vendedor", acao: "Entrou e escolheu a loja Santa Cândida", alvo: "Sessão", loja: "santa-candida", tipo: "acesso" },
  { hora: "08:15", quem: "marcos", papel: "gerente", acao: "Enviou transferência TR-0042", alvo: "1 Moto G85 · 10 capas", loja: "loja-03", tipo: "estoque" },
  { hora: "08:02", quem: "admin", papel: "administrador", acao: "Bloqueou um usuário a pedido do dono", alvo: "Usuário da Loja 06", loja: "loja-06", tipo: "acesso" },
  { hora: "ontem 19:40", quem: "ricardo", papel: "dono", acao: "Alterou preço do Galaxy A55", alvo: "R$ 2.299,00 → R$ 2.199,00", loja: "rede", tipo: "preco" },
] as const;

// ---------- Importação (prévia do CSV da Rein) ----------

const imei7 = imeiDeTeste(7);
export const LINHAS_CSV_REIN = [
  { linha: 2, sku: "APA-0001", nome: "iPhone 15 128 GB", preco: "4.999,00", custo: "4.120,00", quantidade: "1", imei: imeiDeTeste(1) },
  { linha: 3, sku: "APA-0002", nome: "Galaxy A55 256 GB", preco: "2.199,00", custo: "1.680,00", quantidade: "1", imei: imeiDeTeste(3) },
  { linha: 4, sku: "APA-0002", nome: "Galaxy A55 256 GB", preco: "2.199,00", custo: "1.680,00", quantidade: "1", imei: imeiDeTeste(3) },
  { linha: 5, sku: "APA-0003", nome: "Moto G85 256 GB", preco: "1.799,00", custo: "", quantidade: "1", imei: imeiDeTeste(5) },
  { linha: 6, sku: "APA-0004", nome: "Redmi Note 14 128 GB", preco: "1.499,00", custo: "1.090,00", quantidade: "1", imei: imei7.slice(0, 14) + String((Number(imei7.at(-1)) + 1) % 10) },
  { linha: 7, sku: "ACE-0001", nome: "Capa de proteção", preco: "79,00", custo: "18,00", quantidade: "34", imei: "" },
  { linha: 8, sku: "ACE-0002", nome: "Película de vidro", preco: "39,90", custo: "6,00", quantidade: "58", imei: "" },
  { linha: 9, sku: "ACE-0003", nome: "Carregador 20 W", preco: "129,00", custo: "45,00", quantidade: "12", imei: "" },
] as const;

export const LOJAS_COM_CAIXA = LOJAS.map((l) => l.codigo);

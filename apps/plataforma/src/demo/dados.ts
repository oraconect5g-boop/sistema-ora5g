import { completarComDigitoVerificador, pb, type PoliticaDesconto } from "@ora5g/dominio";

// ⚠️ DADOS FICTÍCIOS DA DEMONSTRAÇÃO. Nomes, valores, IMEIs e CNPJs são inventados.
// Nunca copiar para o banco real (guia de design). Valores em centavos.

const imei = (n: number) => completarComDigitoVerificador(`3520990017${String(n).padStart(4, "0")}`);
const iccid = (n: number) => completarComDigitoVerificador(`8955100000${String(n).padStart(8, "0")}`);

export const LOJAS = [
  { codigo: "santa-candida", nome: "Santa Cândida", piloto: true, vendasHoje: 2_684_000, meta: 2_400_000, situacao: "Acima da meta" },
  ...Array.from({ length: 13 }, (_, i) => {
    const n = i + 2;
    const vendasHoje = 1_100_000 + ((n * 371_337) % 1_300_000);
    const meta = 1_800_000 + ((n * 97_531) % 600_000);
    return {
      codigo: `loja-${String(n).padStart(2, "0")}`,
      nome: `Loja ${String(n).padStart(2, "0")}`,
      piloto: false,
      vendasHoje,
      meta,
      situacao: vendasHoje >= meta ? "Acima da meta" : vendasHoje >= meta * 0.8 ? "Em progresso" : "Atenção",
    };
  }),
];

export const UNIDADES_ESPECIAIS = [
  { nome: "Loja Online", tipo: "Online", observacao: "Emite pela Santa Cândida até a decisão P10" },
  { nome: "Assistência (técnico central)", tipo: "Assistência", observacao: "Guarda aparelhos de clientes; não é estoque de venda" },
];

export const VENDEDORES = [
  { nome: "Ana", loja: "Santa Cândida", meta: 600_000, vendido: 569_000, aparelhos: 3, acessorios: 9, chips: 4, ativacoes: 3, portabilidades: 1, recargas: 7, assistencias: 1, diasNoMes: 5, lojasNoMes: ["Santa Cândida"] },
  { nome: "Lucas", loja: "Santa Cândida", meta: 600_000, vendido: 552_000, aparelhos: 2, acessorios: 12, chips: 6, ativacoes: 5, portabilidades: 2, recargas: 4, assistencias: 0, diasNoMes: 5, lojasNoMes: ["Santa Cândida", "Loja 03"] },
  { nome: "Júlia", loja: "Santa Cândida", meta: 500_000, vendido: 435_000, aparelhos: 2, acessorios: 5, chips: 2, ativacoes: 2, portabilidades: 0, recargas: 9, assistencias: 2, diasNoMes: 4, lojasNoMes: ["Santa Cândida"] },
  { nome: "Rafael", loja: "Santa Cândida", meta: 500_000, vendido: 530_000, aparelhos: 3, acessorios: 4, chips: 3, ativacoes: 1, portabilidades: 1, recargas: 2, assistencias: 1, diasNoMes: 3, lojasNoMes: ["Santa Cândida", "Loja 07"] },
];

export type ProdutoDemo = {
  sku: string;
  nome: string;
  tipo: "aparelho" | "acessorio" | "chip" | "recarga" | "ativacao";
  preco: number;
  custo: number;
  categoria: "Aparelhos" | "Acessórios" | "Ora Connect";
  codigoBarras?: string;
};

export const PRODUTOS: ProdutoDemo[] = [
  { sku: "APA-0001", nome: "iPhone 15 128 GB", tipo: "aparelho", preco: 499_900, custo: 412_000, categoria: "Aparelhos", codigoBarras: "0194253000017" },
  { sku: "APA-0002", nome: "Galaxy A55 256 GB", tipo: "aparelho", preco: 219_900, custo: 168_000, categoria: "Aparelhos", codigoBarras: "8806095000024" },
  { sku: "APA-0003", nome: "Moto G85 256 GB", tipo: "aparelho", preco: 179_900, custo: 131_000, categoria: "Aparelhos", codigoBarras: "0840023000031" },
  { sku: "APA-0004", nome: "Redmi Note 14 128 GB", tipo: "aparelho", preco: 149_900, custo: 109_000, categoria: "Aparelhos" },
  { sku: "ACE-0001", nome: "Capa de proteção", tipo: "acessorio", preco: 7_900, custo: 1_800, categoria: "Acessórios", codigoBarras: "7890000000011" },
  { sku: "ACE-0002", nome: "Película de vidro", tipo: "acessorio", preco: 3_990, custo: 600, categoria: "Acessórios" },
  { sku: "ACE-0003", nome: "Carregador 20 W", tipo: "acessorio", preco: 12_900, custo: 4_500, categoria: "Acessórios" },
  { sku: "ACE-0004", nome: "Cabo USB-C 1 m", tipo: "acessorio", preco: 4_990, custo: 1_200, categoria: "Acessórios" },
  { sku: "CON-0001", nome: "Chip Ora Connect", tipo: "chip", preco: 1_000, custo: 300, categoria: "Ora Connect" },
  { sku: "CON-0002", nome: "Ativação de linha Ora Connect", tipo: "ativacao", preco: 0, custo: 0, categoria: "Ora Connect" },
  { sku: "CON-0003", nome: "Recarga Ora Connect", tipo: "recarga", preco: 3_000, custo: 0, categoria: "Ora Connect" },
];

// Política de EXEMPLO: margem mínima e teto ainda serão definidos pelo proprietário (B6).
export const POLITICAS: Record<ProdutoDemo["categoria"], PoliticaDesconto> = {
  Aparelhos: { tetoCategoria: pb(10), margemMinima: pb(12) },
  Acessórios: { tetoCategoria: pb(10), margemMinima: pb(25) },
  "Ora Connect": { tetoCategoria: pb(0), margemMinima: pb(0) },
};

export type SituacaoUnidade = "Disponível" | "Reservado" | "Vendido" | "Em trânsito" | "Conferido";

export const UNIDADES_ESTOQUE: { imei: string; sku: string; loja: string; situacao: SituacaoUnidade; entrada: string }[] = [
  { imei: imei(1), sku: "APA-0001", loja: "Santa Cândida", situacao: "Disponível", entrada: "CSV da Rein (prévia)" },
  { imei: imei(2), sku: "APA-0001", loja: "Santa Cândida", situacao: "Reservado", entrada: "CSV da Rein (prévia)" },
  { imei: imei(3), sku: "APA-0002", loja: "Santa Cândida", situacao: "Disponível", entrada: "CSV da Rein (prévia)" },
  { imei: imei(4), sku: "APA-0002", loja: "Santa Cândida", situacao: "Conferido", entrada: "Contagem física" },
  { imei: imei(5), sku: "APA-0003", loja: "Santa Cândida", situacao: "Disponível", entrada: "CSV da Rein (prévia)" },
  { imei: imei(6), sku: "APA-0003", loja: "Loja 03", situacao: "Em trânsito", entrada: "Transferência para Santa Cândida" },
  { imei: imei(7), sku: "APA-0004", loja: "Santa Cândida", situacao: "Disponível", entrada: "CSV da Rein (prévia)" },
  { imei: imei(8), sku: "APA-0004", loja: "Loja 07", situacao: "Vendido", entrada: "CSV da Rein (prévia)" },
  { imei: imei(9), sku: "APA-0001", loja: "Loja 02", situacao: "Disponível", entrada: "CSV da Rein (prévia)" },
];

export const SALDOS_ACESSORIOS = [
  { sku: "ACE-0001", loja: "Santa Cândida", quantidade: 34 },
  { sku: "ACE-0002", loja: "Santa Cândida", quantidade: 58 },
  { sku: "ACE-0003", loja: "Santa Cândida", quantidade: 12 },
  { sku: "ACE-0004", loja: "Santa Cândida", quantidade: 3 },
  { sku: "CON-0001", loja: "Santa Cândida", quantidade: 126 },
];

export const CHIPS = Array.from({ length: 4 }, (_, i) => iccid(i + 1));

export const CLIENTES = [
  { nome: "Mariana S. (fictícia)", telefone: "(41) 9 0000-0001", email: "mariana@exemplo.invalid" },
  { nome: "Carlos L. (fictício)", telefone: "(41) 9 0000-0002", email: null },
];

export const APROVACOES = {
  descontos: [
    { venda: "PV-24869", vendedor: "Lucas", sku: "APA-0001", desconto: 49_990, meio: "Cartão na maquininha PicPay (crédito 10x)", taxaMeio: pb(8.5), minutos: 6, motivo: "Cliente trouxe orçamento de concorrente" },
    { venda: "PV-24873", vendedor: "Júlia", sku: "APA-0003", desconto: 12_000, meio: "Pix na maquininha PicPay", taxaMeio: pb(0), minutos: 2, motivo: "Combo com capa e película" },
  ],
  notas: [
    { venda: "PV-24871", vendedor: "Ana", valor: 239_900, contato: "E-mail", minutos: 18 },
    { venda: "PV-24872", vendedor: "Rafael", valor: 17_890, contato: "WhatsApp (cliente sem e-mail)", minutos: 47 },
  ],
  cancelamentos: [{ venda: "PV-24865", vendedor: "Júlia", valor: 7_900, motivo: "Cliente desistiu da capa; justificativa anexada" }],
};

export const OPERACOES_CONNECT = [
  { hora: "09:12", vendedor: "Ana", tipo: "Chip + ativação", linha: "(41) 9 ••••-0101", situacao: "Confirmada pela operadora" },
  { hora: "10:40", vendedor: "Lucas", tipo: "Portabilidade", linha: "(41) 9 ••••-0202", situacao: "Aguardando operadora" },
  { hora: "11:05", vendedor: "Ana", tipo: "Recarga R$ 30,00", linha: "(41) 9 ••••-0303", situacao: "Confirmada pela operadora" },
  { hora: "11:31", vendedor: "Júlia", tipo: "Ativação", linha: "(41) 9 ••••-0404", situacao: "Falhou — reconsultar antes de reenviar" },
];

export const ORDENS_SERVICO = [
  { numero: "OS-1042", cliente: "Carlos L. (fictício)", aparelho: "Galaxy A34", defeito: "Tela trincada", etapa: 4, valor: 38_000, dias: 2 },
  { numero: "OS-1043", cliente: "Mariana S. (fictícia)", aparelho: "iPhone 12", defeito: "Bateria", etapa: 6, valor: 29_000, dias: 1 },
  { numero: "OS-1044", cliente: "Cliente balcão (fictício)", aparelho: "Moto G54", defeito: "Limpeza do conector", etapa: 1, valor: 6_000, dias: 0 },
  { numero: "OS-1039", cliente: "Cliente balcão (fictício)", aparelho: "Redmi 13C", defeito: "Não liga", etapa: 3, valor: 0, dias: 6 },
];

export const ETAPAS_OS = ["Recebido na loja", "Comprovante ao cliente", "Enviado ao técnico", "Orçamento", "Aprovado pelo cliente", "Pronto e devolvido", "Cliente avisado", "Entregue e pago"];

export const RECEBIMENTOS = [
  { meio: "Pix na maquininha PicPay", detalhe: "Terminal POS-01", valor: 896_000, conciliado: false },
  { meio: "Cartão na maquininha PicPay", detalhe: "Crédito e débito", valor: 814_000, conciliado: false },
  { meio: "Cartão na maquininha PagSeguro", detalhe: "Crédito", valor: 248_000, conciliado: false },
  { meio: "Pix direto", detalhe: "Conta da loja", valor: 352_000, conciliado: true },
  { meio: "Dinheiro", detalhe: "Caixa físico", valor: 374_000, conciliado: true },
];

export const FINANCEIRAS = [
  { nome: "PayJoy", vendas: 2, entradas: 80_000, aReceber: 339_800 },
  { nome: "Aiva (Flexphone)", vendas: 1, entradas: 30_000, aReceber: 149_900 },
];

export const CANAIS = [
  { nome: "Loja online Ora 5G", situacao: "Planejada (mês 5)", precisa: "Decisão P10: CNPJ emissor, estoque e transportadora" },
  { nome: "Mercado Livre", situacao: "Não conectado", precisa: "Conta de vendedor e app no portal de desenvolvedores" },
  { nome: "TikTok Shop", situacao: "Não conectado", precisa: "App no Partner Center e autorização da loja" },
  { nome: "Shopee", situacao: "Depois do mês 6", precisa: "Aprovação como parceiro na Open Platform" },
  { nome: "Meta Ads", situacao: "Não conectado", precisa: "Verificação da empresa na Meta e token de usuário do sistema" },
  { nome: "WhatsApp oficial", situacao: "Não conectado", precisa: "Número aprovado na API oficial da Meta (sem APIs não oficiais)" },
];

export const LEADS = [
  { nome: "Mariana S. (fictícia)", origem: "WhatsApp", interesse: "Smartphone até R$ 2.000", responsavel: "Ana", etapa: "Novo" },
  { nome: "Carlos L. (fictício)", origem: "Anúncio Meta (exemplo)", interesse: "Plano Ora Connect", responsavel: "Lucas", etapa: "Em atendimento" },
  { nome: "Fernanda R. (fictícia)", origem: "Instagram", interesse: "Portabilidade", responsavel: "Júlia", etapa: "Negociação" },
];

// Prévia do importador: o formato real do CSV da Rein ainda não chegou (B3). A validação é feita pelas regras de negócio.
export const LINHAS_CSV_REIN = [
  { linha: 2, sku: "APA-0001", nome: "iPhone 15 128 GB", preco: "4.999,00", custo: "4.120,00", quantidade: "1", imei: imei(1) },
  { linha: 3, sku: "APA-0002", nome: "Galaxy A55 256 GB", preco: "2.199,00", custo: "1.680,00", quantidade: "1", imei: imei(3) },
  { linha: 4, sku: "APA-0002", nome: "Galaxy A55 256 GB", preco: "2.199,00", custo: "1.680,00", quantidade: "1", imei: imei(3) },
  { linha: 5, sku: "APA-0003", nome: "Moto G85 256 GB", preco: "1.799,00", custo: "", quantidade: "1", imei: imei(5) },
  { linha: 6, sku: "APA-0004", nome: "Redmi Note 14 128 GB", preco: "1.499,00", custo: "1.090,00", quantidade: "1", imei: imei(7).slice(0, 14) + String((Number(imei(7).at(-1)) + 1) % 10) },
  { linha: 7, sku: "ACE-0001", nome: "Capa de proteção", preco: "79,00", custo: "18,00", quantidade: "34", imei: "" },
];

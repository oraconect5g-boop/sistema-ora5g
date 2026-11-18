// DEMO-b (a orientação do proprietário de 18/11: "atualizar a demo dos fluxos novos com dados fictícios isolados"): os
// extratos da maquininha e do banco (EXT-a), a carga do estoque pelo relatório da Rein (REIN-b, REIN-c e AUD-b), a origem
// das reservas do site (MKT-a) e a conciliação da Ora Connect com os relatórios da Nogle (CONNECT-c). Tudo FICTÍCIO: nenhum
// número aqui é de loja, cliente, maquininha ou contrato de verdade, e nada daqui chega a uma tela real (isolamento.test.ts).

import type { AcaoDaLinha, Resolucao } from "../../lib/estoque/carga-regras";

// ---------- Extratos da maquininha e do banco (EXT-a) ----------

export type SituacaoDaLinhaDoExtrato = "a_conferir" | "conciliada" | "fora";
export type LinhaDoExtratoDemo = {
  id: string;
  data: string;
  descricao: string;
  /** NSU, código da transação ou E2E do Pix, já mascarado. */
  referencia: string;
  /** Centavos; o estorno e a tarifa são negativos. */
  bruto: number;
  taxa: number;
  liquido: number;
  /** Quando o dinheiro cai na conta. */
  repasse: string;
  /** A sugestão do sistema: o pagamento da venda que bate pela referência ou pelo valor, pela data e pelo meio. */
  sugestao: { venda: string; meio: string; valor: number; porReferencia: boolean } | null;
  situacao: SituacaoDaLinhaDoExtrato;
  motivo?: string;
};
export type ExtratoDemo = {
  id: string;
  numero: number;
  fonte: string;
  tipo: "maquininha" | "banco";
  loja: string;
  de: string;
  ate: string;
  linhas: readonly LinhaDoExtratoDemo[];
};

export const EXTRATOS_DEMO: readonly ExtratoDemo[] = [
  {
    id: "picpay-1711", numero: 12, fonte: "PicPay (relatório de vendas)", tipo: "maquininha", loja: "Santa Cândida", de: "2026-11-17", ate: "2026-11-17",
    linhas: [
      { id: "p1", data: "2026-11-17", descricao: "Crédito 3x · Visa", referencia: "NSU •••913", bruto: 219_900, taxa: 8_796, liquido: 211_104, repasse: "2026-12-17",
        sugestao: { venda: "PV-DEMO-1201", meio: "Cartão na maquininha PicPay", valor: 219_900, porReferencia: true }, situacao: "a_conferir" },
      { id: "p2", data: "2026-11-17", descricao: "Pix", referencia: "E2E •••7f3a", bruto: 7_900, taxa: 78, liquido: 7_822, repasse: "2026-11-17",
        sugestao: { venda: "PV-DEMO-1202", meio: "Pix na maquininha PicPay", valor: 7_900, porReferencia: false }, situacao: "a_conferir" },
      { id: "p3", data: "2026-11-17", descricao: "Débito · Mastercard", referencia: "NSU •••990", bruto: 15_990, taxa: 239, liquido: 15_751, repasse: "2026-11-18",
        sugestao: { venda: "PV-DEMO-1203", meio: "Cartão na maquininha PicPay", valor: 15_990, porReferencia: true }, situacao: "conciliada" },
      { id: "p4", data: "2026-11-17", descricao: "Estorno de venda", referencia: "NSU •••120", bruto: -4_990, taxa: 0, liquido: -4_990, repasse: "2026-11-18",
        sugestao: null, situacao: "a_conferir" },
      { id: "p5", data: "2026-11-17", descricao: "Crédito 1x · Elo", referencia: "NSU •••001", bruto: 12_000, taxa: 336, liquido: 11_664, repasse: "2026-12-17",
        sugestao: null, situacao: "a_conferir" },
    ],
  },
  {
    id: "banco-1611", numero: 11, fonte: "Banco (arquivo OFX)", tipo: "banco", loja: "Rede", de: "2026-11-16", ate: "2026-11-17",
    linhas: [
      { id: "b1", data: "2026-11-16", descricao: "Pix recebido", referencia: "E2E •••9c21", bruto: 45_000, taxa: 0, liquido: 45_000, repasse: "2026-11-16",
        sugestao: { venda: "PV-DEMO-1188", meio: "Pix direto", valor: 45_000, porReferencia: false }, situacao: "a_conferir" },
      { id: "b2", data: "2026-11-17", descricao: "Tarifa do pacote de serviços", referencia: "—", bruto: -3_900, taxa: 0, liquido: -3_900, repasse: "2026-11-17",
        sugestao: null, situacao: "fora", motivo: "Tarifa do banco, sem venda" },
      { id: "b3", data: "2026-11-17", descricao: "Repasse da maquininha", referencia: "—", bruto: 1_204_455, taxa: 0, liquido: 1_204_455, repasse: "2026-11-17",
        sugestao: null, situacao: "fora", motivo: "Repasse das vendas no cartão: cada venda se concilia pelo extrato da maquininha" },
    ],
  },
];

// ---------- Carga do estoque pelo relatório da Rein (REIN-b, REIN-c e AUD-b) ----------

export type LinhaDaCargaDemo = {
  ordem: number;
  codigo: string;
  nome: string;
  fisico: number;
  /** O disponível do relatório (o físico menos o que a Rein tem comprometido); nulo quando o arquivo não traz. */
  disponivel: number | null;
  acao: AcaoDaLinha;
  detalhe: string;
};
export type CargaDemo = {
  numero: number;
  loja: string;
  arquivo: string;
  corte: string;
  /** O rodapé do relatório que saiu sozinho porque a soma confere (AUD-b, rodapé comprovado). */
  rodape: string;
  linhas: readonly LinhaDaCargaDemo[];
};

export const CARGA_DEMO: CargaDemo = {
  numero: 7,
  loja: "Santa Cândida",
  arquivo: "relatorio-de-produtos-ficticio.xlsx",
  corte: "18/11/2026 08:00",
  rodape: "A última linha do arquivo era o total do relatório (a soma das quantidades confere) e ficou de fora sozinha.",
  linhas: [
    { ordem: 1, codigo: "ACE-0001", nome: "Capa de proteção", fisico: 12, disponivel: 12, acao: "entrar", detalhe: "entra 12" },
    { ordem: 2, codigo: "ACE-0002", nome: "Película de vidro", fisico: 30, disponivel: 30, acao: "entrar", detalhe: "entra 30" },
    { ordem: 3, codigo: "ACE-0004", nome: "Cabo USB-C 1 m", fisico: 5, disponivel: 3, acao: "conferir",
      detalhe: "o físico (5) é maior que o disponível (3): 2 podem estar comprometidos na Rein (reserva, venda ou transferência)" },
    { ordem: 4, codigo: "ACE-0005", nome: "Carregador turbo 25 W", fisico: 8, disponivel: 6, acao: "conferir",
      detalhe: "o físico (8) é maior que o disponível (6): 2 podem estar comprometidos na Rein" },
    { ordem: 5, codigo: "APA-0002", nome: "Galaxy A55 256 GB", fisico: 4, disponivel: 4, acao: "serializado",
      detalhe: "celular entra pelo IMEI, um a um, na conferência (nunca pela quantidade)" },
    { ordem: 6, codigo: "—", nome: "Fone Bluetooth (sem cadastro)", fisico: 3, disponivel: 3, acao: "sem_produto",
      detalhe: "o código não existe no catálogo da Ora: cadastre o produto e gere a prévia de novo" },
    { ordem: 7, codigo: "ACE-0003", nome: "Fone com fio", fisico: 0, disponivel: 0, acao: "nada", detalhe: "sem quantidade na loja" },
  ],
};

export type DecisaoDaCarga = { resolucao: Resolucao; motivo: string };

/**
 * O que entra de cada linha ao aplicar: a de "entrar" entra inteira; a decidida, pela decisão (o disponível, o físico conferido
 * ou nada); o resto, nada (o aparelho entra pelo IMEI, na conferência).
 */
export function unidadesQueEntram(carga: CargaDemo, decisoes: Readonly<Record<number, DecisaoDaCarga>>) {
  let unidades = 0;
  let linhas = 0;
  for (const l of carga.linhas) {
    const d = decisoes[l.ordem];
    const quanto = l.acao === "entrar" ? l.fisico
      : l.acao === "conferir" && d ? (d.resolucao === "fisico" ? l.fisico : d.resolucao === "disponivel" ? (l.disponivel ?? 0) : 0)
      : 0;
    if (quanto > 0) {
      unidades += quanto;
      linhas += 1;
    }
  }
  return { unidades, linhas };
}

// ---------- A origem das reservas do site (MKT-a) ----------

export type OrigemDasReservasDemo = {
  origem: string;
  campanha: string | null;
  reservas: number;
  atendidas: number;
  canceladas: number;
  vencidas: number;
  /** As vendas que vieram das reservas, já dentro da receita das lojas (não se somam de novo). */
  vendas: number;
  valor: number;
};

export const ORIGENS_DAS_RESERVAS_DEMO: readonly OrigemDasReservasDemo[] = [
  { origem: "Instagram", campanha: "Ofertas de novembro", reservas: 14, atendidas: 9, canceladas: 2, vencidas: 3, vendas: 8, valor: 1_759_200 },
  { origem: "Google", campanha: null, reservas: 9, atendidas: 6, canceladas: 1, vencidas: 2, vendas: 6, valor: 899_400 },
  { origem: "WhatsApp", campanha: "Lista de ofertas", reservas: 6, atendidas: 5, canceladas: 0, vencidas: 1, vendas: 5, valor: 512_500 },
  { origem: "Sem origem (direto)", campanha: null, reservas: 4, atendidas: 2, canceladas: 1, vencidas: 1, vendas: 2, valor: 159_800 },
];

// ---------- A conciliação da Ora Connect com os relatórios da Nogle (CONNECT-c) ----------

export type ResultadoQueNaoFecha = "valor_diferente" | "so_na_nogle" | "so_na_ora";
export type ConciliacaoNogleDemo = {
  relatorio: "ativacoes" | "recargas";
  de: string;
  ate: string;
  linhas: number;
  conferidas: number;
  valorDiferente: number;
  soNaNogle: number;
  soNaOra: number;
  naoFecham: readonly { resultado: ResultadoQueNaoFecha; dia: string; linha: string; iccid: string; detalhe: string }[];
};

export const CONCILIACOES_NOGLE_DEMO: readonly ConciliacaoNogleDemo[] = [
  {
    relatorio: "ativacoes", de: "2026-11-10", ate: "2026-11-16", linhas: 42, conferidas: 40, valorDiferente: 1, soNaNogle: 1, soNaOra: 1,
    naoFecham: [
      { resultado: "valor_diferente", dia: "2026-11-12", linha: "final 0101", iccid: "final 4471", detalhe: "plano Ora 20 GB: R$ 59,90 na Nogle; R$ 49,90 na Ora" },
      { resultado: "so_na_nogle", dia: "2026-11-14", linha: "final 0377", iccid: "final 8820", detalhe: "ativação que a Ora não registrou: confira na loja" },
      { resultado: "so_na_ora", dia: "2026-11-15", linha: "final 0912", iccid: "final 1093", detalhe: "confirmada na Ora e ausente do relatório da Nogle" },
    ],
  },
  {
    relatorio: "recargas", de: "2026-11-10", ate: "2026-11-16", linhas: 118, conferidas: 115, valorDiferente: 0, soNaNogle: 3, soNaOra: 0,
    naoFecham: [
      { resultado: "so_na_nogle", dia: "2026-11-11", linha: "final 0444", iccid: "—", detalhe: "pode ser a renovação feita pelo próprio cliente" },
      { resultado: "so_na_nogle", dia: "2026-11-13", linha: "final 0458", iccid: "—", detalhe: "pode ser a renovação feita pelo próprio cliente" },
      { resultado: "so_na_nogle", dia: "2026-11-16", linha: "final 0502", iccid: "—", detalhe: "pode ser a renovação feita pelo próprio cliente" },
    ],
  },
];

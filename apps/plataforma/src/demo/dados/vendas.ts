import { MEIOS, type MeioPagamento, type SituacaoTelecom, type TipoItem } from "@ora5g/dominio";

import { gerador, semente, type Gerador } from "./aleatorio";
import { iccidDeTeste, PRODUTOS, produto, VALORES_RECARGA, type ProdutoDemo } from "./catalogo";
import { LOJAS, VENDEDORES, type Loja, type Pessoa } from "./organizacao";

// ⚠️ Movimento FICTÍCIO do dia, gerado com semente fixa para que painéis, listas, metas e
// relatórios mostrem os MESMOS números. Nada aqui foi vendido de verdade.

export type SituacaoVenda = "concluida" | "aguardando_aprovacao" | "pagamento_pendente" | "cancelamento_solicitado" | "cancelada";
export type SituacaoNota = "emitida" | "solicitada" | "nao_solicitada";

export type ItemVendaDemo = {
  sku: string;
  nome: string;
  tipo: TipoItem;
  quantidade: number;
  precoUnitario: number;
  custoUnitario: number;
  desconto: number;
  iccid?: string;
  situacaoTelecom?: SituacaoTelecom;
};

export type PagamentoDemo = { meio: MeioPagamento; valor: number; entrada?: number };

export type VendaDemo = {
  numero: string;
  minutos: number;
  hora: string;
  loja: string;
  vendedor: string;
  cliente: string | null;
  itens: ItemVendaDemo[];
  pagamentos: PagamentoDemo[];
  total: number;
  custo: number;
  descontos: number;
  situacao: SituacaoVenda;
  nota: SituacaoNota;
  /** Pedidos pendentes (aprovação de desconto, nota ou cancelamento). */
  pedido?: { motivo: string; esperaMinutos: number };
};

export const NOMES_SITUACAO: Record<SituacaoVenda, string> = {
  concluida: "Concluída",
  aguardando_aprovacao: "Aguardando aprovação",
  pagamento_pendente: "Pagamento pendente",
  cancelamento_solicitado: "Cancelamento pedido",
  cancelada: "Cancelada",
};

export const NOMES_NOTA: Record<SituacaoNota, string> = {
  emitida: "Nota emitida",
  solicitada: "Nota aguardando aprovação",
  nao_solicitada: "Sem nota",
};

/** Taxas de EXEMPLO por meio (as reais virão dos contratos PicPay/PagSeguro e financeiras). */
export const TAXAS_EXEMPLO: Partial<Record<MeioPagamento, number>> = {
  cartao_picpay: 850,
  cartao_pagseguro: 790,
  link_pagamento: 450,
  pix_picpay: 0,
};

const CLIENTES_FICTICIOS = ["Mariana S.", "Carlos L.", "Fernanda R.", "Paulo T.", "Aline M.", "Roberto C.", "Simone A.", "Jorge P.", "Letícia V.", "Márcio B."];

const hora = (minutos: number) => `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;

const item = (p: ProdutoDemo, quantidade = 1, desconto = 0, extra: Partial<ItemVendaDemo> = {}): ItemVendaDemo => ({
  sku: p.sku, nome: p.nome, tipo: p.tipo, quantidade, precoUnitario: p.preco, custoUnitario: p.custo, desconto, ...extra,
});

const exigir = (sku: string) => {
  const p = produto(sku);
  if (!p) throw new RangeError(`produto ${sku} inexistente`);
  return p;
};

const APARELHOS = PRODUTOS.filter((p) => p.tipo === "aparelho");
const ACESSORIOS = PRODUTOS.filter((p) => p.tipo === "acessorio");

function montarItens(g: Gerador, indice: number): ItemVendaDemo[] {
  const itens: ItemVendaDemo[] = [];
  if (g.chance(0.4)) {
    const aparelho = g.chance(0.45) ? g.escolher(APARELHOS.slice(2)) : g.escolher(APARELHOS);
    const desconto = g.chance(0.3) ? Math.round((aparelho.preco * g.entre(2, 6)) / 100 / 1000) * 1000 : 0;
    itens.push(item(aparelho, 1, desconto));
    if (g.chance(0.7)) itens.push(item(exigir("ACE-0001")));
    if (g.chance(0.6)) itens.push(item(exigir("ACE-0002")));
    if (g.chance(0.2)) itens.push(item(exigir("ACE-0003")));
  } else if (g.chance(0.75)) {
    itens.push(item(g.escolher(ACESSORIOS), g.chance(0.2) ? 2 : 1));
    if (g.chance(0.35)) itens.push(item(g.escolher(ACESSORIOS)));
  }
  if (g.chance(0.28)) {
    itens.push(item(exigir("CON-0001"), 1, 0, { iccid: iccidDeTeste(5000 + indice) }));
    const portabilidade = g.chance(0.2);
    const sorteio = g.proximo();
    const situacao: SituacaoTelecom = portabilidade ? (sorteio < 0.5 ? "pendente" : "confirmada") : sorteio < 0.86 ? "confirmada" : sorteio < 0.95 ? "pendente" : "falhou";
    itens.push(item(exigir(portabilidade ? "CON-0004" : "CON-0002"), 1, 0, { situacaoTelecom: situacao }));
  }
  if (itens.length === 0 || g.chance(0.18)) {
    const recarga = exigir("CON-0003");
    const valor = g.escolher(VALORES_RECARGA);
    itens.push({ ...item(recarga), precoUnitario: valor, situacaoTelecom: "confirmada" });
  }
  return itens;
}

const totalDe = (itens: readonly ItemVendaDemo[]) => itens.reduce((s, i) => s + i.precoUnitario * i.quantidade - i.desconto, 0);
const custoDe = (itens: readonly ItemVendaDemo[]) => itens.reduce((s, i) => s + i.custoUnitario * i.quantidade, 0);

function montarPagamentos(g: Gerador, total: number, temAparelho: boolean): PagamentoDemo[] {
  if (total === 0) return [];
  if (temAparelho && g.chance(0.14)) {
    const meio: MeioPagamento = g.chance(0.7) ? "payjoy" : "aiva";
    return [{ meio, valor: total, entrada: Math.round((total * g.entre(20, 30)) / 100 / 100) * 100 }];
  }
  const sorteio = g.proximo();
  const principal: MeioPagamento = sorteio < 0.32 ? "pix_picpay" : sorteio < 0.58 ? "cartao_picpay" : sorteio < 0.74 ? "dinheiro" : sorteio < 0.85 ? "pix_direto" : sorteio < 0.95 ? "cartao_pagseguro" : "link_pagamento";
  if (total > 20_000 && g.chance(0.15)) {
    const parte = Math.round((total * g.entre(20, 50)) / 100 / 100) * 100;
    return [{ meio: "dinheiro", valor: parte }, { meio: principal === "dinheiro" ? "pix_picpay" : principal, valor: total - parte }];
  }
  return [{ meio: principal, valor: total }];
}

function vendedoresNoHorario(loja: string, minutos: number): Pessoa[] {
  return VENDEDORES.filter((v) => {
    const turno = v.turnos[loja];
    return v.status === "ativo" && turno !== undefined && minutos >= turno[0] && minutos < turno[1];
  });
}

/** Casos fixos que precisam existir na demonstração (fila de aprovação, notas e cancelamento). */
function casosFixos(): Omit<VendaDemo, "numero">[] {
  const iphone = exigir("APA-0001");
  const moto = exigir("APA-0003");
  const capa = exigir("ACE-0001");
  const galaxy = exigir("APA-0002");
  const redmi = exigir("APA-0004");
  const fixo = (dados: Omit<VendaDemo, "numero" | "hora" | "total" | "custo" | "descontos">): Omit<VendaDemo, "numero"> => ({
    ...dados, hora: hora(dados.minutos), total: totalDe(dados.itens), custo: custoDe(dados.itens), descontos: dados.itens.reduce((s, i) => s + i.desconto, 0),
  });
  return [
    fixo({ minutos: 11 * 60 + 52, loja: "santa-candida", vendedor: "lucas", cliente: "Roberto C.", itens: [item(iphone, 1, 49_990)], pagamentos: [{ meio: "cartao_picpay", valor: 449_910 }], situacao: "aguardando_aprovacao", nota: "nao_solicitada", pedido: { motivo: "Cliente trouxe orçamento de concorrente", esperaMinutos: 6 } }),
    fixo({ minutos: 12 * 60 + 14, loja: "santa-candida", vendedor: "julia", cliente: "Simone A.", itens: [item(moto, 1, 22_000), item(capa)], pagamentos: [{ meio: "pix_picpay", valor: 165_800 }], situacao: "aguardando_aprovacao", nota: "nao_solicitada", pedido: { motivo: "Combo com capa e película", esperaMinutos: 2 } }),
    fixo({ minutos: 10 * 60 + 31, loja: "santa-candida", vendedor: "ana", cliente: "Mariana S.", itens: [item(galaxy), item(capa)], pagamentos: [{ meio: "pix_picpay", valor: 227_800 }], situacao: "concluida", nota: "solicitada", pedido: { motivo: "Envio por e-mail", esperaMinutos: 18 } }),
    fixo({ minutos: 9 * 60 + 48, loja: "santa-candida", vendedor: "rafael", cliente: "Carlos L.", itens: [item(redmi), item(exigir("ACE-0002"))], pagamentos: [{ meio: "dinheiro", valor: 153_890 }], situacao: "concluida", nota: "solicitada", pedido: { motivo: "Envio por WhatsApp (cliente sem e-mail)", esperaMinutos: 47 } }),
    fixo({ minutos: 10 * 60 + 5, loja: "santa-candida", vendedor: "julia", cliente: null, itens: [item(capa)], pagamentos: [{ meio: "dinheiro", valor: 7_900 }], situacao: "cancelamento_solicitado", nota: "nao_solicitada", pedido: { motivo: "Cliente desistiu da capa; justificativa anexada", esperaMinutos: 25 } }),
    fixo({ minutos: 15 * 60 + 20, loja: "loja-05", vendedor: "v07", cliente: "Jorge P.", itens: [item(exigir("APA-0005"), 1, 38_000)], pagamentos: [{ meio: "cartao_pagseguro", valor: 311_900 }], situacao: "aguardando_aprovacao", nota: "nao_solicitada", pedido: { motivo: "Troca de aparelho usado como parte do pagamento", esperaMinutos: 11 } }),
    fixo({ minutos: 14 * 60 + 2, loja: "loja-02", vendedor: "v01", cliente: "Aline M.", itens: [item(galaxy)], pagamentos: [{ meio: "payjoy", valor: 219_900, entrada: 50_000 }], situacao: "concluida", nota: "solicitada", pedido: { motivo: "Envio por e-mail", esperaMinutos: 9 } }),
  ];
}

const FATOR_DO_DIA: Readonly<Record<string, number>> = { "santa-candida": 1.12, "loja-03": 0.94, "loja-04": 0.66, "loja-07": 1.08 };

function gerarVendasDaLoja(loja: Loja, ultimoIndice: { valor: number }): Omit<VendaDemo, "numero">[] {
  const g = gerador(semente(`vendas-hoje-${loja.codigo}`));
  const alvo = loja.metaDia * (FATOR_DO_DIA[loja.codigo] ?? 0.7 + g.proximo() * 0.5);
  const vendas: Omit<VendaDemo, "numero">[] = [];
  let soma = 0;
  let tentativas = 0;
  while (soma < alvo && vendas.length < 60 && tentativas++ < 500) {
    const minutos = g.entre(9 * 60 + 2, 19 * 60 + 55);
    const disponiveis = vendedoresNoHorario(loja.codigo, minutos);
    if (disponiveis.length === 0) continue;
    const itens = montarItens(g, ultimoIndice.valor++);
    const total = totalDe(itens);
    const temAparelho = itens.some((i) => i.tipo === "aparelho");
    const sorteio = g.proximo();
    const situacao: SituacaoVenda = sorteio < 0.04 ? "cancelada" : sorteio < 0.06 && total > 0 ? "pagamento_pendente" : "concluida";
    const venda: Omit<VendaDemo, "numero"> = {
      minutos,
      hora: hora(minutos),
      loja: loja.codigo,
      vendedor: g.escolher(disponiveis).id,
      cliente: g.chance(0.55) ? g.escolher(CLIENTES_FICTICIOS) : null,
      itens,
      pagamentos: situacao === "pagamento_pendente" ? [{ meio: "link_pagamento", valor: total }] : montarPagamentos(g, total, temAparelho),
      total,
      custo: custoDe(itens),
      descontos: itens.reduce((s, i) => s + i.desconto, 0),
      situacao,
      nota: temAparelho ? (g.chance(0.85) ? "emitida" : "nao_solicitada") : g.chance(0.4) ? "emitida" : "nao_solicitada",
    };
    vendas.push(venda);
    if (situacao !== "cancelada") soma += total;
  }
  return vendas;
}

export const VENDAS_HOJE: readonly VendaDemo[] = (() => {
  const indice = { valor: 0 };
  const todas = [...LOJAS.flatMap((l) => gerarVendasDaLoja(l, indice)), ...casosFixos()];
  todas.sort((a, b) => a.minutos - b.minutos || a.loja.localeCompare(b.loja));
  return todas.map((v, i) => ({ ...v, numero: `PV-${24_600 + i}` }));
})();

/** Vendas que contam no faturamento (canceladas e pendentes de aprovação/pagamento não contam). */
export const contaNoFaturamento = (v: VendaDemo) => v.situacao === "concluida" || v.situacao === "cancelamento_solicitado";

export type ResumoDia = { faturamento: number; vendas: number; telecom: number; custo: number; descontos: number };

/** Histórico dos últimos 30 dias por loja (índice 0 = há 30 dias; 29 = ontem). */
export function historicoDaLoja(codigo: string, hoje: Date): ResumoDia[] {
  const loja = LOJAS.find((l) => l.codigo === codigo);
  if (!loja) return [];
  const g = gerador(semente(`historico-${codigo}`));
  return Array.from({ length: 30 }, (_, i) => {
    const dias = 30 - i;
    const diaDaSemana = new Date(hoje.getTime() - dias * 86_400_000).getUTCDay();
    const fatorSemana = diaDaSemana === 0 ? 0.55 : diaDaSemana === 6 ? 1.18 : diaDaSemana === 5 ? 1.08 : 1;
    const tendencia = 0.8 + (i / 30) * 0.1;
    const faturamento = Math.round(loja.metaDia * fatorSemana * tendencia * (0.82 + g.proximo() * 0.32));
    const vendas = Math.max(4, Math.round(faturamento / (92_000 + g.entre(0, 22_000))));
    return {
      faturamento,
      vendas,
      telecom: Math.round(vendas * (0.7 + g.proximo() * 0.25)),
      custo: Math.round(faturamento * (0.72 + g.proximo() * 0.04)),
      descontos: Math.round(faturamento * (0.004 + g.proximo() * 0.005)),
    };
  });
}

// Valor de face da recarga não é receita da Ora (REV-030, #31; invariante 4 de packages/dominio).
const faceDeRecarga = (v: VendaDemo) =>
  v.itens.filter((i) => i.tipo === "recarga").reduce((s, i) => s + i.precoUnitario * i.quantidade - (i.desconto ?? 0), 0);
// Chip vendido conta; ativação, portabilidade e recarga só quando a operadora confirmou (REV-031, #32).
const contaComoTelecom = (i: VendaDemo["itens"][number]) =>
  i.tipo === "chip" || ((i.tipo === "ativacao" || i.tipo === "portabilidade" || i.tipo === "recarga") && i.situacaoTelecom === "confirmada");

export function resumoDeVendas(vendas: readonly VendaDemo[]): ResumoDia {
  const validas = vendas.filter(contaNoFaturamento);
  return {
    faturamento: validas.reduce((s, v) => s + v.total - faceDeRecarga(v), 0),
    vendas: validas.length,
    telecom: validas.reduce((s, v) => s + v.itens.filter(contaComoTelecom).length, 0),
    custo: validas.reduce((s, v) => s + v.custo, 0),
    descontos: validas.reduce((s, v) => s + v.descontos, 0),
  };
}

export const meioNome = (meio: MeioPagamento) => MEIOS[meio].nome;

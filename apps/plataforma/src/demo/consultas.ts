import { mascararIdentificador } from "@ora5g/dominio";

import {
  APROVACOES, caixaDaLoja, contaNoFaturamento, historicoDaLoja, LOJAS, nomeDaLoja, OPERACOES_CONNECT, ORDENS_SERVICO, PRODUTOS,
  resumoDeVendas, SALDOS_ACESSORIOS, UNIDADES_ESTOQUE, VENDAS_HOJE, VENDAVEL, VENDEDORES, type Pessoa, type ResumoDia, type VendaDemo,
} from "./dados";
import { REDE, vePorVendedor, type Perfil } from "./perfis";
import type { ContextoDemo } from "./sessao";

// O que cada perfil pode VER, decidido num lugar só (no servidor), antes de montar a tela.
// Regra pedida pelo proprietário e no ADR-002 §2.4: gerente, gestor e dono veem todos os
// vendedores (no seu escopo); o vendedor vê só os próprios números e o resumo da loja atual.

type Escopo = Pick<ContextoDemo, "perfil" | "pessoaId" | "loja">;

const naLoja = (escopo: Escopo, codigo: string) => escopo.loja === REDE || escopo.loja === codigo;

/** Vendas de hoje visíveis: vendedor → só as dele na loja atual; gestão → a loja (ou a rede). */
export function vendasVisiveis(escopo: Escopo): VendaDemo[] {
  if (escopo.perfil === "tecnico") return [];
  if (escopo.perfil === "vendedor") return VENDAS_HOJE.filter((v) => v.vendedor === escopo.pessoaId && v.loja === escopo.loja);
  return VENDAS_HOJE.filter((v) => naLoja(escopo, v.loja));
}

/** Resumo agregado da loja atual (o vendedor vê o total da loja, nunca as vendas dos colegas). */
export function resumoDaLoja(codigo: string) {
  const loja = LOJAS.find((l) => l.codigo === codigo);
  const resumo = resumoDeVendas(VENDAS_HOJE.filter((v) => v.loja === codigo));
  return { ...resumo, meta: loja?.metaDia ?? 0 };
}

export function lojasVisiveis(escopo: Escopo) {
  return escopo.loja === REDE ? LOJAS : LOJAS.filter((l) => l.codigo === escopo.loja);
}

/** Vendedores visíveis: o próprio (vendedor) ou todos os vinculados ao escopo (gestão). */
export function vendedoresVisiveis(escopo: Escopo): Pessoa[] {
  if (!vePorVendedor(escopo.perfil)) return VENDEDORES.filter((v) => v.id === escopo.pessoaId);
  return VENDEDORES.filter((v) => escopo.loja === REDE || v.lojas.includes(escopo.loja));
}

export type Desempenho = {
  pessoa: Pessoa;
  vendido: number;
  meta: number;
  vendas: number;
  margem: number;
  descontos: number;
  aparelhos: number;
  acessorios: number;
  chips: number;
  ativacoes: number;
  portabilidades: number;
  recargas: number;
  assistencias: number;
  porLoja: { loja: string; vendido: number; vendas: number }[];
};

/** Produção do dia de um vendedor (DEC-U46: cada fato conta uma vez; telecom só confirmada). */
export function desempenhoDe(pessoa: Pessoa, filtroLoja?: string): Desempenho {
  const vendas = VENDAS_HOJE.filter((v) => v.vendedor === pessoa.id && contaNoFaturamento(v) && (filtroLoja === undefined || filtroLoja === REDE || v.loja === filtroLoja));
  const itens = vendas.flatMap((v) => v.itens);
  const conta = (tipo: string, soConfirmada = false) =>
    itens.filter((i) => i.tipo === tipo && (!soConfirmada || i.situacaoTelecom === "confirmada")).reduce((s, i) => s + i.quantidade, 0);
  const lojas = [...new Set(vendas.map((v) => v.loja))];
  return {
    pessoa,
    vendido: vendas.reduce((s, v) => s + v.total, 0),
    meta: pessoa.metaDia,
    vendas: vendas.length,
    margem: vendas.reduce((s, v) => s + v.total - v.custo, 0),
    descontos: vendas.reduce((s, v) => s + v.descontos, 0),
    aparelhos: conta("aparelho"),
    acessorios: conta("acessorio"),
    chips: conta("chip"),
    ativacoes: conta("ativacao", true),
    portabilidades: conta("portabilidade", true),
    recargas: conta("recarga", true),
    assistencias: ORDENS_SERVICO.filter((os) => os.abertaPor === pessoa.id).length,
    porLoja: lojas.map((loja) => {
      const daLoja = vendas.filter((v) => v.loja === loja);
      return { loja, vendido: daLoja.reduce((s, v) => s + v.total, 0), vendas: daLoja.length };
    }),
  };
}

/** Soma diária (30 dias) das lojas do escopo. */
export function historicoDoEscopo(escopo: Escopo, hoje: Date): ResumoDia[] {
  const historicos = lojasVisiveis(escopo).map((l) => historicoDaLoja(l.codigo, hoje));
  return Array.from({ length: 30 }, (_, i) =>
    historicos.reduce<ResumoDia>(
      (s, h) => {
        const d = h[i];
        return d ? { faturamento: s.faturamento + d.faturamento, vendas: s.vendas + d.vendas, telecom: s.telecom + d.telecom, custo: s.custo + d.custo, descontos: s.descontos + d.descontos } : s;
      },
      { faturamento: 0, vendas: 0, telecom: 0, custo: 0, descontos: 0 },
    ),
  );
}

/** Vendas por hora (09h–19h) de um conjunto de vendas. */
export function vendasPorHora(vendas: readonly VendaDemo[]) {
  return Array.from({ length: 11 }, (_, i) => {
    const h = 9 + i;
    const daHora = vendas.filter((v) => contaNoFaturamento(v) && Math.floor(v.minutos / 60) === h);
    return { hora: `${String(h).padStart(2, "0")}h`, valor: daHora.reduce((s, v) => s + v.total, 0), quantidade: daHora.length };
  });
}

/** Mix por categoria (aparelhos, acessórios, Ora Connect) em valor. */
export function mixPorCategoria(vendas: readonly VendaDemo[]) {
  const soma = (tipos: string[]) =>
    vendas.filter(contaNoFaturamento).flatMap((v) => v.itens).filter((i) => tipos.includes(i.tipo)).reduce((s, i) => s + i.precoUnitario * i.quantidade - i.desconto, 0);
  return [
    { nome: "Aparelhos", valor: soma(["aparelho"]), serie: 1 as const },
    { nome: "Acessórios", valor: soma(["acessorio"]), serie: 2 as const },
    { nome: "Ora Connect (chips e recargas)", valor: soma(["chip", "recarga", "ativacao", "portabilidade"]), serie: 3 as const },
  ];
}

/** Aprovações visíveis: gerente da loja; dono da rede (ou loja). Ninguém aprova o próprio pedido. */
export function aprovacoesVisiveis(escopo: Escopo) {
  if (escopo.perfil !== "gerente" && escopo.perfil !== "dono") return [];
  // Quem pediu não entra na própria fila de aprovação (REV-034, #36), como no banco real.
  return APROVACOES.filter((a) => naLoja(escopo, a.venda.loja) && a.venda.vendedor !== escopo.pessoaId);
}

export function estoqueVisivel(escopo: Escopo) {
  return UNIDADES_ESTOQUE.filter((u) => naLoja(escopo, u.loja));
}

/** Consulta de outras lojas para o vendedor: só disponibilidade, sem custo e sem IMEI completo. */
export function disponibilidadeEmOutrasLojas(escopo: Escopo) {
  return LOJAS.filter((l) => l.codigo !== escopo.loja).map((l) => ({
    loja: l.nome,
    aparelhos: PRODUTOS.filter((p) => p.tipo === "aparelho").map((p) => ({
      sku: p.sku,
      quantidade: UNIDADES_ESTOQUE.filter((u) => u.loja === l.codigo && u.sku === p.sku && VENDAVEL.includes(u.situacao)).length,
    })),
  }));
}

export type Alerta = { id: string; titulo: string; detalhe: string; tom: "aviso" | "perigo" | "info"; href: string };

/** Alertas do escopo (REPORT-007): estoque mínimo, caixa divergente, nota pendente, OS parada, ativação falhou. */
export function alertasDoEscopo(escopo: Escopo): Alerta[] {
  const alertas: Alerta[] = [];
  const perfil: Perfil = escopo.perfil;
  const lojas = lojasVisiveis(escopo).map((l) => l.codigo);

  if (perfil === "gerente" || perfil === "dono") {
    const pendentes = aprovacoesVisiveis(escopo);
    const descontos = pendentes.filter((a) => a.tipo === "desconto").length;
    if (descontos > 0) alertas.push({ id: "descontos", titulo: `${descontos} ${descontos === 1 ? "desconto aguarda" : "descontos aguardam"} aprovação`, detalhe: "O vendedor está com o cliente esperando", tom: "aviso", href: "/demo/aprovacoes" });
    const notasAtrasadas = pendentes.filter((a) => a.tipo === "nota" && (a.venda.pedido?.esperaMinutos ?? 0) > 30);
    for (const a of notasAtrasadas) alertas.push({ id: `nota-${a.venda.numero}`, titulo: `Nota da venda ${a.venda.numero} parada há ${a.venda.pedido?.esperaMinutos} min`, detalhe: `${nomeDaLoja(a.venda.loja)} · confirmar o prazo com o contador`, tom: "perigo", href: "/demo/aprovacoes" });
  }

  if (perfil !== "tecnico" && perfil !== "administrador") {
    for (const codigo of lojas) {
      const caixa = caixaDaLoja(codigo, VENDAS_HOJE);
      if (caixa.diferenca !== 0 && perfil !== "vendedor") alertas.push({ id: `caixa-${codigo}`, titulo: `Caixa divergente em ${nomeDaLoja(codigo)}`, detalhe: "Diferença entre o previsto e o contado no fechamento", tom: "perigo", href: "/demo/financeiro" });
    }
  }

  if (perfil !== "tecnico") {
    const baixos = SALDOS_ACESSORIOS.filter((s) => lojas.includes(s.loja)).filter((s) => s.quantidade < (PRODUTOS.find((p) => p.sku === s.sku)?.estoqueMinimo ?? 0));
    for (const s of baixos.slice(0, 3)) {
      const nome = PRODUTOS.find((p) => p.sku === s.sku)?.nome ?? s.sku;
      alertas.push({ id: `estoque-${s.loja}-${s.sku}`, titulo: `${nome}: só ${s.quantidade} em ${nomeDaLoja(s.loja)}`, detalhe: "Abaixo do estoque mínimo", tom: "aviso", href: "/demo/estoque?aba=acessorios" });
    }
    if (baixos.length > 3) alertas.push({ id: "estoque-mais", titulo: `Mais ${baixos.length - 3} itens abaixo do mínimo`, detalhe: "Ver a aba de acessórios do estoque", tom: "aviso", href: "/demo/estoque?aba=acessorios" });
  }

  const falhas = OPERACOES_CONNECT.filter((o) => lojas.includes(o.loja) && o.situacao.startsWith("Falhou") && (perfil !== "vendedor" || o.vendedor === escopo.pessoaId));
  if (falhas.length > 0 && perfil !== "tecnico" && perfil !== "administrador") {
    alertas.push({ id: "connect", titulo: `${falhas.length} ${falhas.length === 1 ? "ativação falhou" : "ativações falharam"} na operadora`, detalhe: "Reconsultar antes de reenviar (nada é dado como confirmado sem resposta)", tom: "perigo", href: "/demo/connect" });
  }

  const osParadas = ORDENS_SERVICO.filter((os) => os.dias >= 5 && os.etapa < 7 && (perfil === "tecnico" || perfil === "dono" || perfil === "administrador" || lojas.includes(os.loja)));
  for (const os of osParadas) if (perfil !== "administrador") alertas.push({ id: `os-${os.numero}`, titulo: `${os.numero} parada há ${os.dias} dias`, detalhe: `${os.aparelho} · ${nomeDaLoja(os.loja)}`, tom: "aviso", href: "/demo/assistencia" });

  if (perfil === "vendedor") {
    const minhasNotas = VENDAS_HOJE.filter((v) => v.vendedor === escopo.pessoaId && v.nota === "solicitada");
    for (const v of minhasNotas) alertas.push({ id: `minha-nota-${v.numero}`, titulo: `Nota da venda ${v.numero} aguardando aprovação`, detalhe: "Você será avisada quando for emitida", tom: "info", href: "/demo/vendas" });
    const portabilidades = OPERACOES_CONNECT.filter((o) => o.vendedor === escopo.pessoaId && o.situacao === "Aguardando operadora");
    for (const o of portabilidades.slice(0, 2)) alertas.push({ id: `porta-${o.id}`, titulo: `${o.tipo} ${o.linha} aguardando a operadora`, detalhe: "Só conta na produção depois de confirmada", tom: "info", href: "/demo/connect" });
  }

  if (perfil === "administrador") {
    alertas.push({ id: "importacao", titulo: "Prévia do CSV da Rein com problemas", detalhe: "Corrigir as linhas antes de pedir a aprovação do dono", tom: "aviso", href: "/demo/importacao" });
    alertas.push({ id: "integracoes", titulo: "Integrações aguardando contratos", detalhe: "Nogle, emissor fiscal e WhatsApp oficial", tom: "info", href: "/demo/canais" });
  }
  return alertas;
}

export const imeiCurto = (imei: string) => mascararIdentificador(imei);

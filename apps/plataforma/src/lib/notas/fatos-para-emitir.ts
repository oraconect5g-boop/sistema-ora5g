// Os fatos da venda para emitir a nota no emissor externo, sem trocar de tela (NFE55-a, pedido do proprietário de
// 27/11/2026; revisão do mesmo dia: a primeira versão copiava os valores crus dos pagamentos).
//   * A TELA mostra a loja que emite e a venda pela MESMA leitura normalizada do comprovante (lib/vendas/comprovante.ts):
//     os pagamentos como foram gravados (o dinheiro entregue, a entrada do financiamento, o estorno marcado) e os totais
//     (com o troco, o a receber da financeira e o devolvido).
//   * O TEXTO PARA COPIAR leva só o que dá para afirmar: o emitente e o destinatário e, quando a venda é só de mercadorias,
//     sem devolução, estorno nem acréscimo, e os itens fecham com os totais gravados (a regra do concluir_venda), os itens
//     e os totais. Os pagamentos nunca vão no texto: a forma de pagamento na nota, o troco e o financiamento são do contador
//     e do emissor, e o texto manda conferir no comprovante. Nada de NCM, CFOP ou tributo (não estão no cadastro).
// Leitura estrita: forma inesperada é falha, nunca dado na tela.
import { formatarCnpj } from "@ora5g/dominio";

import { RespostaInesperada } from "../financeiro/painel";
import { brl } from "../formato";
import { ehObjeto } from "../leitura-do-banco";
import { textoDoPagamento, totaisDaVenda, type TotaisDaVenda } from "../vendas/comprovante";

export type ItemParaEmitir = { sku: string; descricao: string; tipo: string; quantidade: number; unitario: number; desconto: number; total: number };

/** Por que o texto para copiar não leva os itens e os valores (cada motivo diz o que conferir). */
export const MOTIVOS_SEM_DETALHE = {
  nao_concluida: "a venda não está concluída",
  devolucao: "a venda teve devolução",
  estorno: "a venda tem pagamento estornado ou estorno a confirmar",
  servico: "a venda tem serviço, ativação, portabilidade ou recarga (o documento desses itens, como a NFS-e ou a NFCom, é do contador)",
  acrescimo: "um cartão teve acréscimo de parcelamento na maquininha (se ele entra no valor da nota é do contador)",
  nao_fecha: "os itens não fecham com os totais gravados na venda",
} as const;
export type MotivoSemDetalhe = keyof typeof MOTIVOS_SEM_DETALHE;
/** As mercadorias (os mesmos tipos físicos do comprovante); o resto pode pedir outro documento fiscal. */
const MERCADORIAS = new Set(["aparelho", "acessorio", "chip"]);

export type FatosParaEmitir = {
  venda: { numero: number; concluidaEm: string | null };
  totais: TotaisDaVenda;
  itens: ItemParaEmitir[];
  /** As linhas dos pagamentos como o comprovante mostra: só na tela, nunca no texto para copiar. */
  pagamentos: string[];
  /** A loja do CNPJ da chave: a da venda ou, sem CNPJ, a emissora dela (a mesma regra do notas_registrar_emissao). */
  emitente: {
    nome: string; cnpj: string | null; porOutraLoja: boolean;
    inscricaoEstadual: string | null; inscricaoMunicipal: string | null; endereco: string | null;
  };
  /** Vazio: o texto leva os itens e os totais. Com motivo: não leva, e diz por quê. */
  semDetalhe: MotivoSemDetalhe[];
};

const inteiro = (v: unknown, campo: string): number => {
  const n = typeof v === "string" && /^-?\d+$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new RespostaInesperada(campo);
  return n;
};
const textoOuNulo = (v: unknown, campo: string): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new RespostaInesperada(campo);
  return v.trim() || null;
};
const lista = (v: unknown, campo: string): unknown[] => {
  if (!Array.isArray(v)) throw new RespostaInesperada(campo);
  return v;
};
const loja = (v: unknown, campo: string) => {
  if (!ehObjeto(v) || typeof v.nome !== "string") throw new RespostaInesperada(campo);
  return { nome: v.nome, cnpj: textoOuNulo(v.cnpj, "cnpj"), cidade: textoOuNulo(v.cidade, "cidade"), uf: textoOuNulo(v.uf, "uf"), emissora: textoOuNulo(v.unidade_emissora_id, "emissora") };
};

/** Um pagamento com a forma que o comprovante lê; os valores conferidos aqui (falha vira RespostaInesperada). */
function pagamento(x: unknown) {
  if (!ehObjeto(x) || typeof x.meio !== "string" || typeof x.situacao !== "string") throw new RespostaInesperada("pagamentos");
  const entradaDoFinanciamento = x.entrada_do_financiamento;
  if (entradaDoFinanciamento != null && typeof entradaDoFinanciamento !== "boolean") throw new RespostaInesperada("entrada_do_financiamento");
  const valores = { valor_centavos: inteiro(x.valor_centavos, "valor_centavos"), entrada_centavos: inteiro(x.entrada_centavos ?? 0, "entrada_centavos"),
    acrescimo_cliente_centavos: inteiro(x.acrescimo_cliente_centavos ?? 0, "acrescimo_cliente_centavos") };
  const linha = textoDoPagamento({
    meio: x.meio, situacao: x.situacao, ...valores, parcelas: x.parcelas == null ? null : inteiro(x.parcelas, "parcelas"),
    entrada_do_financiamento: entradaDoFinanciamento ?? null,
    comprovante: textoOuNulo(x.comprovante, "comprovante"), bandeira_cartao: textoOuNulo(x.bandeira_cartao, "bandeira_cartao"), modalidade_cartao: textoOuNulo(x.modalidade_cartao, "modalidade_cartao"),
  });
  return { linha, situacao: x.situacao, acrescimo: valores.acrescimo_cliente_centavos };
}

/**
 * Lê as partes que a tela busca: a venda, os itens (com o SKU e o nome das variantes), os pagamentos, se há devolução e
 * estorno, a loja da venda, a emissora dela (só quando a loja não tem CNPJ; nula se não estiver visível) e a configuração
 * vigente da que emite.
 */
export function lerFatosParaEmitir(partes: {
  venda: unknown; itens: unknown; variantes: unknown; pagamentos: unknown; devolucoes: unknown; estornos: unknown; loja: unknown; emissora: unknown; configuracao: unknown;
}): FatosParaEmitir {
  const v = partes.venda;
  if (!ehObjeto(v) || typeof v.situacao !== "string") throw new RespostaInesperada("venda");
  const totais = totaisDaVenda({
    subtotal_centavos: inteiro(v.subtotal_centavos ?? 0, "subtotal_centavos"), desconto_centavos: inteiro(v.desconto_centavos ?? 0, "desconto_centavos"),
    total_centavos: inteiro(v.total_centavos ?? 0, "total_centavos"), troco_centavos: inteiro(v.troco_centavos ?? 0, "troco_centavos"),
    a_receber_centavos: inteiro(v.a_receber_centavos ?? 0, "a_receber_centavos"), devolvido_centavos: inteiro(v.devolvido_centavos ?? 0, "devolvido_centavos"),
  });
  const variantes = new Map<string, { sku: string; nome: string }>();
  for (const x of lista(partes.variantes, "variantes")) {
    if (!ehObjeto(x) || typeof x.id !== "string" || typeof x.sku !== "string" || typeof x.nome !== "string") throw new RespostaInesperada("variantes");
    variantes.set(x.id, { sku: x.sku, nome: x.nome });
  }
  const itens = lista(partes.itens, "itens").map((x): ItemParaEmitir => {
    if (!ehObjeto(x) || typeof x.variante_id !== "string" || typeof x.tipo !== "string") throw new RespostaInesperada("itens");
    const produto = variantes.get(x.variante_id);
    if (!produto) throw new RespostaInesperada("itens");
    const quantidade = inteiro(x.quantidade, "quantidade");
    const unitario = inteiro(x.preco_unitario_centavos, "preco_unitario_centavos");
    const desconto = inteiro(x.desconto_centavos ?? 0, "desconto_centavos");
    return { sku: produto.sku, descricao: produto.nome, tipo: x.tipo, quantidade, unitario, desconto, total: quantidade * unitario - desconto };
  });
  const pagamentos = lista(partes.pagamentos, "pagamentos").map(pagamento);
  const devolucoes = lista(partes.devolucoes, "devolucoes");
  const estornos = lista(partes.estornos, "estornos");

  const semDetalhe: MotivoSemDetalhe[] = [];
  if (v.situacao !== "concluida") semDetalhe.push("nao_concluida");
  if (totais.devolvido > 0 || devolucoes.length > 0) semDetalhe.push("devolucao");
  if (pagamentos.some((p) => p.situacao !== "confirmado") || estornos.length > 0) semDetalhe.push("estorno");
  if (itens.some((i) => !MERCADORIAS.has(i.tipo))) semDetalhe.push("servico");
  if (pagamentos.some((p) => p.acrescimo > 0)) semDetalhe.push("acrescimo");
  // A regra do concluir_venda: subtotal = soma de preço × quantidade; descontos = soma dos descontos; total = a diferença.
  const bruto = itens.reduce((s, i) => s + i.quantidade * i.unitario, 0);
  const descontos = itens.reduce((s, i) => s + i.desconto, 0);
  if (itens.length === 0 || bruto !== totais.subtotal || descontos !== totais.desconto || totais.subtotal - totais.desconto !== totais.total) semDetalhe.push("nao_fecha");

  const daVenda = loja(partes.loja, "loja");
  const emissora = !daVenda.cnpj && daVenda.emissora && partes.emissora != null ? loja(partes.emissora, "emissora") : null;
  const quem = emissora ?? daVenda;
  const c = partes.configuracao == null ? null : partes.configuracao;
  if (c !== null && !ehObjeto(c)) throw new RespostaInesperada("configuracao");
  const cep = c ? textoOuNulo(c.cep, "cep") : null;
  const endereco = c && textoOuNulo(c.logradouro, "logradouro")
    ? [[textoOuNulo(c.logradouro, "logradouro"), textoOuNulo(c.numero, "numero")].filter(Boolean).join(", "), textoOuNulo(c.complemento, "complemento"),
      textoOuNulo(c.bairro, "bairro"), quem.cidade && quem.uf ? `${quem.cidade}/${quem.uf}` : null, cep ? `CEP ${cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : null].filter(Boolean).join(" · ")
    : null;
  return {
    venda: { numero: inteiro(v.numero, "numero"), concluidaEm: textoOuNulo(v.concluida_em, "concluida_em") },
    totais,
    itens,
    pagamentos: pagamentos.map((p) => p.linha),
    emitente: {
      nome: quem.nome, cnpj: quem.cnpj, porOutraLoja: !daVenda.cnpj && daVenda.emissora !== null,
      inscricaoEstadual: c ? textoOuNulo(c.inscricao_estadual, "inscricao_estadual") : null, inscricaoMunicipal: c ? textoOuNulo(c.inscricao_municipal, "inscricao_municipal") : null,
      endereco,
    },
    semDetalhe,
  };
}

const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** O CNPJ como a tela e o texto mostram, sem inventar: o cadastrado, o da emissora que não aparece aqui ou "não cadastrado". */
export function cnpjDoEmitente(e: FatosParaEmitir["emitente"]): string {
  if (e.cnpj) return formatarCnpj(e.cnpj);
  return e.porOutraLoja ? "o da loja emissora (não aparece para você: confira em Lojas)" : "não cadastrado (cadastre em Lojas antes de emitir)";
}

/** Por que o texto não leva os itens e os valores, numa frase. */
export const fraseSemDetalhe = (f: FatosParaEmitir) => f.semDetalhe.map((m) => MOTIVOS_SEM_DETALHE[m]).join("; ");

/**
 * O texto para copiar de uma vez para o emissor: o emitente e o destinatário; os itens e os totais só quando dá para
 * afirmá-los; e, sempre, que os pagamentos se conferem no comprovante (nenhum meio nem valor de pagamento vai no texto).
 */
export function textoParaCopiar(f: FatosParaEmitir, pedido: number, destinatario: { nome: string | null; documento: string | null; endereco: string | null }): string {
  const venda = `venda nº ${f.venda.numero}`;
  return [
    `Pedido de nota nº ${pedido} · ${venda}${f.venda.concluidaEm ? ` (${data(f.venda.concluidaEm)})` : ""}`,
    `Emitente: ${f.emitente.nome} · CNPJ ${cnpjDoEmitente(f.emitente)}${f.emitente.inscricaoEstadual ? ` · IE ${f.emitente.inscricaoEstadual}` : ""}`
      + `${f.emitente.inscricaoMunicipal ? ` · IM ${f.emitente.inscricaoMunicipal}` : ""}${f.emitente.endereco ? ` · ${f.emitente.endereco}` : ""}`,
    destinatario.documento
      ? `Destinatário: ${destinatario.nome ?? "—"} · ${destinatario.documento}${destinatario.endereco ? ` · ${destinatario.endereco}` : ""}`
      : `Destinatário: sem cliente identificado${destinatario.nome ? ` (nome informado: ${destinatario.nome})` : ""}`,
    ...(f.semDetalhe.length === 0
      ? [
        "Itens:",
        ...f.itens.map((i, n) => `${n + 1}. ${i.sku} · ${i.descricao} · ${i.quantidade} × ${brl(i.unitario)}${i.desconto ? ` − desconto ${brl(i.desconto)}` : ""} = ${brl(i.total)}`),
        `Subtotal ${brl(f.totais.subtotal)} · Descontos ${brl(f.totais.desconto)} · Total ${brl(f.totais.total)}`,
      ]
      : [`Itens e valores: não copiados, porque ${fraseSemDetalhe(f)}. Confira no comprovante da ${venda} e com o contador antes de emitir.`]),
    `Pagamentos: confira no comprovante da ${venda} (o troco, a entrada do financiamento e os estornos estão lá); a forma de pagamento na nota é do contador e do emissor.`,
    "NCM, CFOP e tributos: não estão no cadastro; o contador e o emissor definem.",
  ].join("\n");
}

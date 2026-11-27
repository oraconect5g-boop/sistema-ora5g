// Os fatos da venda para emitir a nota no emissor externo, sem trocar de tela para copiar (pedido do proprietário de
// 27/11/2026, a NF-e modelo 55 no fluxo interno; o modelo de cada operação é do contador, ADR-006): a loja que emite (o CNPJ
// e o que está configurado nela), os itens, os totais e os pagamentos, lidos da venda do pedido. Só o que está gravado: o
// cadastro não tem NCM, CFOP nem tributo, e eles NÃO são inventados aqui (o contador e o emissor definem). Leitura estrita:
// forma inesperada é falha, nunca dado na tela.
import { formatarCnpj, nomeDoPagamento, textoDasParcelas } from "@ora5g/dominio";

import { RespostaInesperada } from "../financeiro/painel";
import { brl } from "../formato";
import { ehObjeto } from "../leitura-do-banco";

export type ItemParaEmitir = { sku: string; descricao: string; quantidade: number; unitario: number; desconto: number; total: number };
export type PagamentoParaEmitir = { nome: string; valor: number };
export type FatosParaEmitir = {
  venda: { numero: number; concluidaEm: string | null; subtotal: number; desconto: number; total: number };
  itens: ItemParaEmitir[];
  pagamentos: PagamentoParaEmitir[];
  /** A loja do CNPJ da chave: a da venda ou, sem CNPJ, a emissora dela (a mesma regra do notas_registrar_emissao). */
  emitente: {
    nome: string; cnpj: string | null; porOutraLoja: boolean;
    inscricaoEstadual: string | null; inscricaoMunicipal: string | null; endereco: string | null;
  };
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

/**
 * Lê as partes que a tela busca: a venda, os itens (com o SKU e o nome das variantes), os pagamentos, a loja da venda,
 * a emissora dela (só quando a loja não tem CNPJ; nula se não estiver visível) e a configuração vigente da que emite.
 */
export function lerFatosParaEmitir(partes: {
  venda: unknown; itens: unknown; variantes: unknown; pagamentos: unknown; loja: unknown; emissora: unknown; configuracao: unknown;
}): FatosParaEmitir {
  const v = partes.venda;
  if (!ehObjeto(v)) throw new RespostaInesperada("venda");
  const variantes = new Map<string, { sku: string; nome: string }>();
  for (const x of lista(partes.variantes, "variantes")) {
    if (!ehObjeto(x) || typeof x.id !== "string" || typeof x.sku !== "string" || typeof x.nome !== "string") throw new RespostaInesperada("variantes");
    variantes.set(x.id, { sku: x.sku, nome: x.nome });
  }
  const itens = lista(partes.itens, "itens").map((x): ItemParaEmitir => {
    if (!ehObjeto(x) || typeof x.variante_id !== "string") throw new RespostaInesperada("itens");
    const produto = variantes.get(x.variante_id);
    if (!produto) throw new RespostaInesperada("itens");
    const quantidade = inteiro(x.quantidade, "quantidade");
    const unitario = inteiro(x.preco_unitario_centavos, "preco_unitario_centavos");
    const desconto = inteiro(x.desconto_centavos ?? 0, "desconto_centavos");
    return { sku: produto.sku, descricao: produto.nome, quantidade, unitario, desconto, total: quantidade * unitario - desconto };
  });
  const pagamentos = lista(partes.pagamentos, "pagamentos").map((x): PagamentoParaEmitir => {
    if (!ehObjeto(x) || typeof x.meio !== "string" || (x.entrada_do_financiamento != null && typeof x.entrada_do_financiamento !== "boolean")) throw new RespostaInesperada("pagamentos");
    const parcelas = x.parcelas === null || x.parcelas === undefined ? null : inteiro(x.parcelas, "parcelas");
    return { nome: `${nomeDoPagamento({ meio: x.meio, entradaDoFinanciamento: x.entrada_do_financiamento })}${textoDasParcelas(x.meio, parcelas)}`, valor: inteiro(x.valor_centavos, "valor_centavos") };
  });
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
    venda: {
      numero: inteiro(v.numero, "numero"), concluidaEm: textoOuNulo(v.concluida_em, "concluida_em"),
      subtotal: inteiro(v.subtotal_centavos ?? 0, "subtotal_centavos"), desconto: inteiro(v.desconto_centavos ?? 0, "desconto_centavos"), total: inteiro(v.total_centavos ?? 0, "total_centavos"),
    },
    itens,
    pagamentos,
    emitente: {
      nome: quem.nome, cnpj: quem.cnpj, porOutraLoja: !daVenda.cnpj && daVenda.emissora !== null,
      inscricaoEstadual: c ? textoOuNulo(c.inscricao_estadual, "inscricao_estadual") : null, inscricaoMunicipal: c ? textoOuNulo(c.inscricao_municipal, "inscricao_municipal") : null,
      endereco,
    },
  };
}

const data = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** O CNPJ como a tela e o texto mostram, sem inventar: o cadastrado, o da emissora que não aparece aqui ou "não cadastrado". */
export function cnpjDoEmitente(e: FatosParaEmitir["emitente"]): string {
  if (e.cnpj) return formatarCnpj(e.cnpj);
  return e.porOutraLoja ? "o da loja emissora (não aparece para você: confira em Lojas)" : "não cadastrado (cadastre em Lojas antes de emitir)";
}

/** O texto para copiar de uma vez para o emissor: o emitente, o destinatário, os itens, os totais e os pagamentos. */
export function textoParaCopiar(f: FatosParaEmitir, pedido: number, destinatario: { nome: string | null; documento: string | null; endereco: string | null }): string {
  return [
    `Pedido de nota nº ${pedido} · venda nº ${f.venda.numero}${f.venda.concluidaEm ? ` (${data(f.venda.concluidaEm)})` : ""}`,
    `Emitente: ${f.emitente.nome} · CNPJ ${cnpjDoEmitente(f.emitente)}${f.emitente.inscricaoEstadual ? ` · IE ${f.emitente.inscricaoEstadual}` : ""}`
      + `${f.emitente.inscricaoMunicipal ? ` · IM ${f.emitente.inscricaoMunicipal}` : ""}${f.emitente.endereco ? ` · ${f.emitente.endereco}` : ""}`,
    destinatario.documento
      ? `Destinatário: ${destinatario.nome ?? "—"} · ${destinatario.documento}${destinatario.endereco ? ` · ${destinatario.endereco}` : ""}`
      : `Destinatário: sem cliente identificado${destinatario.nome ? ` (nome informado: ${destinatario.nome})` : ""}`,
    "Itens:",
    ...f.itens.map((i, n) => `${n + 1}. ${i.sku} · ${i.descricao} · ${i.quantidade} × ${brl(i.unitario)}${i.desconto ? ` − desconto ${brl(i.desconto)}` : ""} = ${brl(i.total)}`),
    `Subtotal ${brl(f.venda.subtotal)} · Descontos ${brl(f.venda.desconto)} · Total ${brl(f.venda.total)}`,
    `Pagamentos: ${f.pagamentos.map((p) => `${p.nome} ${brl(p.valor)}`).join(" · ") || "—"}`,
    "NCM, CFOP e tributos: não estão no cadastro; o contador e o emissor definem.",
  ].join("\n");
}

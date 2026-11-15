// Pedidos de compra (lote INV-009a: ORA-INV-009): a leitura da lista e do pedido com a conferência (pelas funções
// public.pedidos_compra e public.pedido_compra, que conferem quem pede; o custo vem só para quem vê custo na loja), a
// leitura do formulário e as mensagens. A regra que vale é a do banco (packages/banco/src/pedido-de-compra.test.ts).
// Sem as funções no banco (migration não aplicada), a tela diz que ainda não está disponível; falha nunca vira zero.
import { lerReais } from "@ora5g/dominio";

import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { centavosDoBanco, ValorForaDoLimite } from "../dinheiro";
import type { Leitura } from "../leitura-do-banco";

type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);

export const SITUACOES_DO_PEDIDO = { aberto: "aberto", encerrado: "encerrado", cancelado: "cancelado" } as const;
export type SituacaoDoPedido = keyof typeof SITUACOES_DO_PEDIDO;
export const ehSituacaoDoPedido = (v: unknown): v is SituacaoDoPedido => typeof v === "string" && Object.hasOwn(SITUACOES_DO_PEDIDO, v);
/** O filtro da lista: os abertos (o padrão), os encerrados, os cancelados ou todos. */
export const FILTROS_DOS_PEDIDOS = { aberto: "Abertos", encerrado: "Encerrados", cancelado: "Cancelados", todos: "Todos" } as const;
export type FiltroDosPedidos = keyof typeof FILTROS_DOS_PEDIDOS;
export const filtroDosPedidos = (v: unknown): FiltroDosPedidos => (typeof v === "string" && Object.hasOwn(FILTROS_DOS_PEDIDOS, v) ? (v as FiltroDosPedidos) : "aberto");

export type PedidoDaLista = {
  id: string; numero: number; unidadeId: string; fornecedorId: string; fornecedor: string; documento: string | null; previstoPara: string | null;
  situacao: SituacaoDoPedido; criadoEm: string; encerradoEm: string | null; motivo: string | null;
  unidades: number; recebidas: number; entradas: number; totalPrevisto: number | null;
};
export type ItemDoPedido = {
  linha: number; varianteId: string; sku: string; nome: string; produto: string; quantidade: number; recebida: number;
  custoCombinado: number | null; custoDaNota: number | null;
};
export type PedidoDeCompra = Omit<PedidoDaLista, "unidades" | "recebidas" | "entradas" | "totalPrevisto"> & {
  observacao: string | null; veCusto: boolean; itens: ItemDoPedido[];
  foraDoPedido: { varianteId: string; sku: string; nome: string; recebida: number; custoDaNota: number | null }[];
  entradasLigadas: { id: string; numero: number; documento: string | null; registrada: boolean; criadaEm: string; unidades: number }[];
};

class Inesperado extends Error {}
const texto = (v: unknown) => { if (typeof v !== "string") throw new Inesperado("texto"); return v; };
const textoOuNulo = (v: unknown) => (v === null ? null : texto(v));
const inteiro = (v: unknown) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Inesperado("inteiro"); return v; };
const instante = (v: unknown) => { const t = texto(v); if (Number.isNaN(Date.parse(t))) throw new Inesperado("instante"); return t; };
const uuid = (v: unknown) => { if (!ehUuid(v)) throw new Inesperado("uuid"); return v; };
const dinheiroOuNulo = (v: unknown) => (v === null ? null : centavosDoBanco(v));
const situacao = (v: unknown): SituacaoDoPedido => { if (!ehSituacaoDoPedido(v)) throw new Inesperado("situacao"); return v; };
const dia = (v: unknown) => { const t = textoOuNulo(v); if (t !== null && !/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Inesperado("dia"); return t; };
type Objeto = Record<string, unknown>;
const lista = (v: unknown): Objeto[] => { if (!Array.isArray(v) || !v.every((x) => x && typeof x === "object")) throw new Inesperado("lista"); return v as Objeto[]; };

function cabecalho(l: Objeto) {
  return {
    id: uuid(l.id), numero: inteiro(l.numero), unidadeId: uuid(l.unidade_id), fornecedorId: uuid(l.fornecedor_id), fornecedor: texto(l.fornecedor), documento: textoOuNulo(l.documento),
    previstoPara: dia(l.previsto_para), situacao: situacao(l.situacao), criadoEm: instante(l.criado_em),
    encerradoEm: l.encerrado_em === null ? null : instante(l.encerrado_em), motivo: textoOuNulo(l.motivo_encerramento),
  };
}

async function ler<T>(chamada: PromiseLike<{ data: unknown; error: { code: string } | null }>, converter: (d: unknown) => T, rotulo: string): Promise<Leitura<T> | null | { estado: "nao_encontrado" }> {
  const r = await chamada;
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return null;
    if (r.error.code === "P0002") return { estado: "nao_encontrado" };
    console.error(`estoque: falha ao ler ${rotulo}`, { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: converter(r.data) };
  } catch (erro) {
    if (!(erro instanceof Inesperado) && !(erro instanceof ValorForaDoLimite)) throw erro;
    console.error(`estoque: ${rotulo} em forma inesperada`);
    return { estado: "falha" };
  }
}

/** A lista dos pedidos da loja (até 200, os mais novos); nulo: o banco ainda não tem os pedidos. */
export async function lerPedidos(supabase: Cliente, unidade: string, filtro: FiltroDosPedidos): Promise<Leitura<PedidoDaLista[]> | null> {
  const r = await ler(supabase.rpc("pedidos_compra", { p_unidade: unidade, ...(filtro === "todos" ? {} : { p_situacao: filtro }) }), (d) => lista(d).map((l) => ({
    ...cabecalho(l), unidades: inteiro(l.unidades), recebidas: inteiro(l.recebidas), entradas: inteiro(l.entradas), totalPrevisto: dinheiroOuNulo(l.total_previsto),
  })), "os pedidos de compra");
  return r && r.estado === "nao_encontrado" ? { estado: "falha" } : r;
}

/** O pedido com a conferência; "nao_encontrado": não existe ou não é de quem pede; nulo: o banco ainda não tem os pedidos. */
export async function lerPedido(supabase: Cliente, id: string): Promise<Leitura<PedidoDeCompra> | { estado: "nao_encontrado" } | null> {
  return ler(supabase.rpc("pedido_compra", { p_pedido: id }), (d) => {
    if (!d || typeof d !== "object") throw new Inesperado("pedido");
    const l = d as Objeto;
    if (typeof l.ve_custo !== "boolean") throw new Inesperado("ve_custo");
    return {
      ...cabecalho(l), observacao: textoOuNulo(l.observacao), veCusto: l.ve_custo,
      itens: lista(l.itens).map((i) => ({
        linha: inteiro(i.linha), varianteId: uuid(i.variante_id), sku: texto(i.sku), nome: texto(i.nome), produto: texto(i.produto),
        quantidade: inteiro(i.quantidade), recebida: inteiro(i.recebida), custoCombinado: dinheiroOuNulo(i.custo_combinado), custoDaNota: dinheiroOuNulo(i.custo_da_nota),
      })),
      foraDoPedido: lista(l.fora_do_pedido).map((i) => ({
        varianteId: uuid(i.variante_id), sku: texto(i.sku), nome: texto(i.nome), recebida: inteiro(i.recebida), custoDaNota: dinheiroOuNulo(i.custo_da_nota),
      })),
      entradasLigadas: lista(l.entradas).map((e) => {
        if (e.situacao !== "registrada" && e.situacao !== "estornada") throw new Inesperado("entrada");
        return { id: uuid(e.id), numero: inteiro(e.numero), documento: textoOuNulo(e.documento), registrada: e.situacao === "registrada", criadaEm: instante(e.criado_em), unidades: inteiro(e.unidades) };
      }),
    };
  }, "o pedido de compra");
}

/** O bloco "pedido de compra" da entrada aberta: o pedido ligado, ou os pedidos abertos da loja do mesmo fornecedor. */
export type PedidoDaEntrada =
  | { estado: "ok"; ligado: { id: string; numero: number; situacao: SituacaoDoPedido } | null; candidatos: Pick<PedidoDaLista, "id" | "numero" | "documento" | "previstoPara">[] }
  | { estado: "falha" };
const COLUNA_AUSENTE = new Set(["42703", "PGRST204"]);
/**
 * O pedido da entrada (a coluna entradas_estoque.pedido_id, lida direto) e, sem pedido ligado, os pedidos abertos da loja
 * do mesmo fornecedor. Nulo: o banco ainda não tem os pedidos (some); outra falha é falha.
 */
export async function lerPedidoDaEntrada(supabase: Cliente, entrada: string, unidade: string): Promise<PedidoDaEntrada | null> {
  const linha = await supabase.from("entradas_estoque").select("fornecedor_id, pedido_id").eq("id", entrada).maybeSingle();
  if (linha.error) {
    if (COLUNA_AUSENTE.has(linha.error.code)) return null;
    console.error("estoque: falha ao ler o pedido da entrada", { codigo: linha.error.code || null });
    return { estado: "falha" };
  }
  if (!linha.data) return null;
  const { fornecedor_id: fornecedor, pedido_id: pedido } = linha.data as { fornecedor_id: string | null; pedido_id: string | null };
  if (pedido) {
    const lido = await lerPedido(supabase, pedido);
    if (lido === null) return null;
    if (lido.estado !== "ok") return { estado: "falha" };
    return { estado: "ok", ligado: { id: lido.dados.id, numero: lido.dados.numero, situacao: lido.dados.situacao }, candidatos: [] };
  }
  const abertos = await lerPedidos(supabase, unidade, "aberto");
  if (abertos === null) return null;
  if (abertos.estado !== "ok") return { estado: "falha" };
  return {
    estado: "ok", ligado: null,
    candidatos: abertos.dados.filter((p) => p.fornecedorId === fornecedor).map((p) => ({ id: p.id, numero: p.numero, documento: p.documento, previstoPara: p.previstoPara })),
  };
}

/** A conferência de uma linha: quanto falta, quanto veio a mais e se o custo da nota é outro que o combinado. */
export function conferenciaDaLinha(i: Pick<ItemDoPedido, "quantidade" | "recebida" | "custoCombinado" | "custoDaNota">) {
  return {
    falta: Math.max(0, i.quantidade - i.recebida), aMais: Math.max(0, i.recebida - i.quantidade),
    custoDiferente: i.custoCombinado !== null && i.custoDaNota !== null && i.custoCombinado !== i.custoDaNota,
  };
}

export const OK_DOS_PEDIDOS = {
  criado: "Pedido de compra registrado. Quando a mercadoria chegar, registre a entrada e ligue ao pedido para conferir.",
  repetido: "Este pedido já estava registrado: nada foi duplicado.",
  cancelado: "Pedido cancelado (nada tinha sido recebido); o motivo ficou na auditoria.",
  encerrado: "Pedido encerrado com o que foi recebido; o motivo ficou na auditoria.",
  ja_encerrado: "Este pedido já estava encerrado.",
} as const;
export type OkDosPedidos = keyof typeof OK_DOS_PEDIDOS;

export const ERROS_DOS_PEDIDOS = {
  dados: "Confira os dados do pedido.",
  fornecedor: "Escolha um fornecedor ativo desta rede.",
  documento: "A referência do fornecedor tem até 60 letras.",
  previsto: "A previsão de entrega vai de hoje até um ano.",
  observacao: "A observação tem de 3 a 300 letras.",
  itens: "O pedido precisa de pelo menos um item (até 200), cada um uma vez.",
  quantidade: "Quantidade inválida: de 1 a 10.000 por item.",
  custo: "Custo inválido: em reais com vírgula, até R$ 1.000.000,00.",
  item: "Um dos itens não pode entrar no pedido (inativo, de outra rede ou sem estoque).",
  motivo: "Informe o motivo (de 3 a 300 letras); ele fica na auditoria.",
  repetida: "Este formulário já foi usado para outro pedido: abra um novo pedido.",
  permissao: "Os pedidos de compra são de quem recebe mercadoria na loja (o dono e a gerência).",
  nao_encontrado: "Pedido de compra não encontrado (ou não é da sua loja).",
  indisponivel: "Os pedidos de compra ainda não estão disponíveis neste ambiente.",
  falha: "Não deu para gravar agora. Tente de novo em instantes.",
} as const;
export type ErroDosPedidos = keyof typeof ERROS_DOS_PEDIDOS;

/** Do erro do banco para a mensagem (a do banco não vai para a tela). */
export function erroDoPedido(erro: { code?: string; message?: string } | null | undefined): ErroDosPedidos {
  const codigo = erro?.code ?? "";
  const m = (erro?.message ?? "").toLowerCase();
  if (codigo === "42501") return "permissao";
  if (codigo === "P0002") return "nao_encontrado";
  if (codigo === "OR004") return "repetida";
  if (codigo === "PGRST202" || codigo === "42883") return "indisponivel";
  if (codigo !== "22023") return "falha";
  const regras: [string, ErroDosPedidos][] = [
    // A referência antes do fornecedor (a mensagem dela também tem "fornecedor").
    ["referência do fornecedor", "documento"], ["fornecedor", "fornecedor"], ["previsão de entrega", "previsto"], ["observação", "observacao"],
    ["de 1 a 200 linhas", "itens"], ["já está em outra linha", "itens"], ["quantidade", "quantidade"], ["custo", "custo"],
    ["variação", "item"], ["produto está inativo", "item"], ["não tem estoque", "item"], ["motivo", "motivo"],
  ];
  return regras.find(([trecho]) => m.includes(trecho))?.[1] ?? "dados";
}

type Formulario = { get: (nome: string) => unknown };
const textoDo = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");
export type ItemDoFormulario = { variante: string; quantidade: number; custo?: number };
/** O formulário do pedido novo: a loja, o fornecedor, a referência, a previsão, a observação, a chave e os itens (JSON). */
export function lerFormularioDoPedido(dados: Formulario):
  | { ok: true; dados: { unidade: string; fornecedor: string; documento: string | null; previsto: string | null; observacao: string | null; chave: string; itens: ItemDoFormulario[] } }
  | { ok: false; erro: ErroDosPedidos } {
  const unidade = dados.get("unidade");
  const fornecedor = dados.get("fornecedor");
  const chave = textoDo(dados.get("chave"));
  if (!ehUuid(unidade) || chave.length < 8 || chave.length > 80) return { ok: false, erro: "dados" };
  if (!ehUuid(fornecedor)) return { ok: false, erro: "fornecedor" };
  const documento = textoDo(dados.get("documento"));
  if (documento.length > 60) return { ok: false, erro: "documento" };
  const previsto = textoDo(dados.get("previsto"));
  if (previsto !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(previsto)) return { ok: false, erro: "previsto" };
  const observacao = textoDo(dados.get("observacao"));
  if (observacao !== "" && (observacao.length < 3 || observacao.length > 300)) return { ok: false, erro: "observacao" };
  let brutos: unknown;
  try {
    brutos = JSON.parse(String(dados.get("itens") ?? ""));
  } catch {
    return { ok: false, erro: "itens" };
  }
  if (!Array.isArray(brutos) || brutos.length === 0 || brutos.length > 200) return { ok: false, erro: "itens" };
  const itens: ItemDoFormulario[] = [];
  const vistas = new Set<string>();
  for (const b of brutos as Objeto[]) {
    if (!b || typeof b !== "object" || !ehUuid(b.variante) || vistas.has(b.variante)) return { ok: false, erro: "itens" };
    vistas.add(b.variante);
    const quantidade = Number(textoDo(String(b.quantidade ?? "")));
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 10_000) return { ok: false, erro: "quantidade" };
    const custoTexto = textoDo(String(b.custo ?? ""));
    let custo: number | undefined;
    if (custoTexto !== "") {
      try {
        custo = lerReais(custoTexto);
      } catch {
        return { ok: false, erro: "custo" };
      }
      if (!Number.isSafeInteger(custo) || custo < 0 || custo > 100_000_000) return { ok: false, erro: "custo" };
    }
    itens.push(custo === undefined ? { variante: b.variante, quantidade } : { variante: b.variante, quantidade, custo });
  }
  return { ok: true, dados: { unidade, fornecedor, documento: documento || null, previsto: previsto || null, observacao: observacao || null, chave, itens } };
}

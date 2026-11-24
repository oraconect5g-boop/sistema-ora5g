"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  CARRINHO_VAZIO, codigoDoPedido, COOKIE_DO_CARRINHO, comOItem, erroDoPedido, escreverCarrinho, lerCarrinho, lerPedidoDoSite, semOItem,
  type ErroDoPedido, type PedidoDoSite,
} from "../../../lib/loja/carrinho";
import { COOKIE_DA_ORIGEM, lerOrigem } from "../../../lib/loja/origem";
import { criarLimitador, enderecoDeQuemPede, nomeDoFormulario, whatsappDoFormulario } from "../../../lib/loja/reserva";
import { ehUuidDaVitrine, organizacaoDaLoja } from "../../../lib/loja/vitrine";
import { clienteSupabaseServidor } from "../../../lib/supabase/servidor";

// O carrinho e o pedido do site (lote ONLINE-d: ORA-ONLINE-002; ADR-023). O carrinho fica num cookie sem dado pessoal; o
// pedido é a única ida ao banco (public.loja_pedir), que confere tudo de novo e reserva tudo de uma vez ou nada. Nada do
// que a pessoa digitou vai para log.

const DOIS_DIAS = 2 * 86_400;
async function gravarCarrinho(valor: ReturnType<typeof lerCarrinho>) {
  const pote = await cookies();
  if (valor.itens.length === 0) pote.delete(COOKIE_DO_CARRINHO);
  else pote.set(COOKIE_DO_CARRINHO, escreverCarrinho(valor), { path: "/loja", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: DOIS_DIAS });
}

export async function adicionarAoCarrinho(dados: FormData) {
  const produto = dados.get("produto");
  const variante = dados.get("variante");
  const loja = dados.get("loja");
  if (!ehUuidDaVitrine(produto) || !ehUuidDaVitrine(variante) || !ehUuidDaVitrine(loja)) redirect("/loja/carrinho?erro=item");
  const atual = lerCarrinho((await cookies()).get(COOKIE_DO_CARRINHO)?.value);
  const { carrinho, problema } = comOItem(atual, loja, { produto, variante }, dados.get("trocar") === "sim");
  if (problema === "outra_loja") redirect(`/loja/carrinho?erro=outra_loja&produto=${produto}&variante=${variante}&loja=${loja}`);
  if (problema === "cheio") redirect("/loja/carrinho?erro=cheio");
  await gravarCarrinho(carrinho);
  redirect("/loja/carrinho?ok=posto");
}

export async function tirarDoCarrinho(dados: FormData) {
  const indice = Number(dados.get("indice"));
  await gravarCarrinho(semOItem(lerCarrinho((await cookies()).get(COOKIE_DO_CARRINHO)?.value), indice));
  redirect("/loja/carrinho?ok=tirado");
}

/** O que a pessoa digitou volta com o erro, para o formulário não esvaziar. */
export type DigitadoNoPedido = { nome: string; whatsapp: string; aceite: boolean };
export type EstadoDoPedido =
  | { situacao: "vazio" }
  | { situacao: "erro"; erro: ErroDoPedido; digitado: DigitadoNoPedido }
  // O WhatsApp (só números) volta ao aparelho de quem pediu, para o Pix do pedido (PAY-014a); nunca vai para log.
  | { situacao: "pronto"; pedido: PedidoDoSite; whatsapp: string };

const digitado = (dados: FormData): DigitadoNoPedido => {
  const campo = (nome: string, maximo: number) => { const v = dados.get(nome); return typeof v === "string" ? v.slice(0, maximo) : ""; };
  return { nome: campo("nome", 80), whatsapp: campo("whatsapp", 20), aceite: dados.get("aceite") === "sim" };
};

// Até 5 pedidos ou consultas por hora por endereço de internet (na memória do servidor), além dos limites do banco.
const limitarPedidos = criarLimitador();
const limitarConsultas = criarLimitador(20);

export async function pedirNoSite(_anterior: EstadoDoPedido, dados: FormData): Promise<EstadoDoPedido> {
  const recusa = (erro: ErroDoPedido): EstadoDoPedido => ({ situacao: "erro", erro, digitado: digitado(dados) });
  const chave = dados.get("chave");
  if (typeof chave !== "string" || !/^[0-9a-f-]{36}$/.test(chave)) return recusa("falha");
  const carrinho = lerCarrinho((await cookies()).get(COOKIE_DO_CARRINHO)?.value);
  if (carrinho.itens.length === 0 || !carrinho.loja) return recusa("vazio");
  const nome = nomeDoFormulario(dados.get("nome"));
  const whatsapp = whatsappDoFormulario(dados.get("whatsapp"));
  if (!nome || !whatsapp) return recusa("dados");
  if (dados.get("aceite") !== "sim") return recusa("aceite");
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) return recusa("falha");
  if (!limitarPedidos(enderecoDeQuemPede(await headers()))) return recusa("limite_rede");
  // MKT-a: de onde o visitante chegou (o cookie que o proxy grava na loja online); sem o cookie, "direto".
  const origem = lerOrigem((await cookies()).get(COOKIE_DA_ORIGEM)?.value) ?? { origem: "direto" };
  const { data, error } = await supabase.rpc("loja_pedir", {
    p_organizacao: organizacao, p_unidade: carrinho.loja, p_itens: carrinho.itens.map((i) => ({ variante: i.variante })),
    p_nome: nome, p_whatsapp: whatsapp, p_chave: `pedido:${chave}`, p_origem: origem,
  });
  const pedido = error ? null : lerPedidoDoSite(data);
  if (!pedido) {
    const erro = erroDoPedido(error);
    if (erro === "falha") console.error("loja: falha ao pedir", { codigo: error?.code });
    return recusa(erro);
  }
  await gravarCarrinho(CARRINHO_VAZIO);
  return { situacao: "pronto", pedido, whatsapp };
}

export type EstadoDaConsulta =
  | { situacao: "vazio" }
  | { situacao: "nao_achado" | "dados" | "limite" | "falha"; codigo: string }
  | { situacao: "achado"; pedido: PedidoDoSite; whatsapp: string };

/** O visitante acompanha o pedido pelo código e pelo WhatsApp (os dois juntos; sem o par certo, "não achado"). */
export async function consultarPedido(_anterior: EstadoDaConsulta, dados: FormData): Promise<EstadoDaConsulta> {
  const codigoDigitado = typeof dados.get("codigo") === "string" ? String(dados.get("codigo")).slice(0, 10) : "";
  const codigo = codigoDoPedido(dados.get("codigo"));
  const whatsapp = whatsappDoFormulario(dados.get("whatsapp"));
  if (!codigo || !whatsapp) return { situacao: "dados", codigo: codigoDigitado };
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) return { situacao: "falha", codigo };
  if (!limitarConsultas(enderecoDeQuemPede(await headers()))) return { situacao: "limite", codigo };
  const { data, error } = await supabase.rpc("loja_pedido_consultar", { p_organizacao: organizacao, p_codigo: codigo, p_whatsapp: whatsapp });
  if (error) return { situacao: "falha", codigo };
  const pedido = lerPedidoDoSite(data);
  return pedido ? { situacao: "achado", pedido, whatsapp } : { situacao: "nao_achado", codigo };
}

export type ErroDoPagamento = "dados" | "limite" | "indisponivel" | "nao_pagavel" | "nao_achado" | "falha";
export type EstadoDoPagamento = { pedido: PedidoDoSite; whatsapp: string; erro: ErroDoPagamento | null };
// Pedir o Pix e ver de novo (a tela pergunta a cada poucos segundos enquanto o worker prepara): um limite à parte, maior
// que o das consultas, para a espera não gastar as consultas do "Meu pedido".
const limitarPagamentos = criarLimitador(120);

/**
 * O Pix do pedido (lote PAY-014a; ADR-025), com o mesmo par do "Meu pedido" (o código e o WhatsApp). "pagar": o banco anota
 * o pagamento a criar (public.loja_pagamento_pedir; o worker cria o link na Asaas); "ver": a visão do pedido de novo. O
 * site não fala com a Asaas.
 */
export async function acaoDoPagamento(anterior: EstadoDoPagamento, dados: FormData): Promise<EstadoDoPagamento> {
  const comErro = (erro: ErroDoPagamento): EstadoDoPagamento => ({ ...anterior, erro });
  const codigo = codigoDoPedido(dados.get("codigo"));
  const whatsapp = whatsappDoFormulario(dados.get("whatsapp"));
  if (!codigo || !whatsapp) return comErro("dados");
  const organizacao = organizacaoDaLoja();
  const supabase = organizacao ? await clienteSupabaseServidor() : null;
  if (!organizacao || !supabase) return comErro("falha");
  if (!limitarPagamentos(enderecoDeQuemPede(await headers()))) return comErro("limite");
  const argumentos = { p_organizacao: organizacao, p_codigo: codigo, p_whatsapp: whatsapp };
  const { data, error } = dados.get("acao") === "pagar"
    ? await supabase.rpc("loja_pagamento_pedir", argumentos)
    : await supabase.rpc("loja_pedido_consultar", argumentos);
  if (error) {
    const erro: ErroDoPagamento = error.code === "OR049" ? "indisponivel" : error.code === "OR050" ? "nao_pagavel" : "falha";
    if (erro === "falha") console.error("loja: falha no pagamento pelo site", { codigo: error.code ?? null });
    return comErro(erro);
  }
  const pedido = lerPedidoDoSite(data);
  return pedido ? { pedido, whatsapp, erro: null } : comErro("nao_achado");
}

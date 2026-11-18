import { randomUUID } from "node:crypto";

import { ArrowLeft, ClipboardPlus, ShoppingCart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, Cartao, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import { ehUuid } from "../../../lib/acesso/regras";
import { permite } from "../../../lib/acesso/molde";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import {
  ERROS_DOS_PEDIDOS, FILTROS_DOS_PEDIDOS, filtroDosPedidos, lerPedido, lerPedidos, OK_DOS_PEDIDOS, type FiltroDosPedidos,
} from "../../../lib/estoque/pedidos-de-compra";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../../lib/parametros";
import { DetalheDoPedido, ListaDePedidos } from "./ConteudoPedidos";
import { FormularioPedido } from "./FormularioPedido";

export const metadata: Metadata = { title: "Pedidos de compra" };
export const dynamic = "force-dynamic";

type Parametros = { ver?: ValorDeParametro; pedido?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; form?: ValorDeParametro };
const endereco = (f: FiltroDosPedidos) => (f === "aberto" ? "/estoque/pedidos" : `/estoque/pedidos?ver=${f}`);

// Pedidos de compra da loja (lote INV-009a: ORA-INV-009), para quem recebe mercadoria (estoque.receber: o dono e o
// gerente da loja do turno): registrar o pedido ao fornecedor, acompanhar o que chegou pelas entradas ligadas (a
// conferência com a nota) e encerrar. O sistema registra o pedido; não envia nada ao fornecedor.
export default async function PedidosDeCompra({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK_DOS_PEDIDOS, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DOS_PEDIDOS, parametros.erro);
  const filtro = filtroDosPedidos(textoDoParametro(parametros.ver));
  const pedidoDoEndereco = textoDoParametro(parametros.pedido);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const unidade = situacao.unidade_id as string;
  const pode = permite(sessao, "estoque.receber");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">{ERROS_DOS_PEDIDOS.permissao}</Aviso></MoldeReal>;

  const [lista, detalhe, fornecedores] = await Promise.all([
    lerPedidos(supabase, unidade, filtro),
    ehUuid(pedidoDoEndereco) ? lerPedido(supabase, pedidoDoEndereco) : Promise.resolve(null),
    supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  if (fornecedores.error) throw new FalhaDoServico("fornecedores");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <Link href="/estoque/entrada" className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-acao"><ArrowLeft aria-hidden className="size-4" /> Entrada de mercadoria</Link>
      <TituloPagina sobretitulo={situacao.unidade_nome} titulo="Pedidos de compra"
        subtitulo="O que a loja pediu ao fornecedor, para conferir com a nota quando a mercadoria chegar. O sistema registra o pedido; não envia nada ao fornecedor." />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK_DOS_PEDIDOS[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DOS_PEDIDOS[erro]}</Aviso>}
      {lista === null ? <Aviso tom="info" className="mt-4">{ERROS_DOS_PEDIDOS.indisponivel}</Aviso> : (
        <>
          {detalhe && (detalhe.estado === "ok" ? <DetalheDoPedido pedido={detalhe.dados} />
            : detalhe.estado === "nao_encontrado" ? <Aviso tom="aviso" className="mt-4">{ERROS_DOS_PEDIDOS.nao_encontrado}</Aviso>
            : <Aviso tom="perigo" className="mt-4">Não deu para ler o pedido agora. Tente de novo em instantes.</Aviso>)}
          <details className="mt-4 rounded-cartao border border-borda/80 bg-superficie p-4 shadow-cartao" open={textoDoParametro(parametros.form) === "novo"}>
            <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold"><ClipboardPlus aria-hidden className="size-4 text-acao" /> Novo pedido</summary>
            <div className="mt-3">
              {fornecedores.data.length === 0
                ? <p className="text-sm text-suave">Cadastre o fornecedor na <Link href="/estoque/entrada?form=fornecedor" className="font-semibold text-acao">entrada de mercadoria</Link> antes do primeiro pedido.</p>
                : <FormularioPedido unidade={unidade} chave={`pedido:${randomUUID()}`} fornecedores={fornecedores.data} hoje={hoje} />}
            </div>
          </details>
          <div className="mt-4">
            <FiltroSegmentado rotulo="Situação dos pedidos"
              opcoes={(Object.keys(FILTROS_DOS_PEDIDOS) as FiltroDosPedidos[]).map((f) => ({ href: endereco(f), rotulo: FILTROS_DOS_PEDIDOS[f], ativo: f === filtro }))} />
          </div>
          <Cartao className="mt-4" titulo={`Pedidos: ${FILTROS_DOS_PEDIDOS[filtro].toLowerCase()}`} subtitulo="Os 200 mais recentes da loja do turno" icone={ShoppingCart}>
            {lista.estado !== "ok" ? <p className="text-sm text-perigo">Não deu para ler os pedidos agora. Tente de novo em instantes.</p> : <ListaDePedidos pedidos={lista.dados} />}
          </Cartao>
        </>
      )}
    </MoldeReal>
  );
}

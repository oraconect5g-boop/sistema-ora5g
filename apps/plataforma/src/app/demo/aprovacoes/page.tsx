import { avaliarDesconto, MEIOS } from "@ora5g/dominio";
import { ClipboardCheck, FileText, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Indicador, TituloPagina } from "../../../componentes/ui";
import { aprovacoesVisiveis } from "../../../demo/consultas";
import { nomeDaLoja, nomeDaPessoa, POLITICAS, produto, TAXA_DO_MEIO } from "../../../demo/dados";
import { PERFIS, REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl, numero, percentualDePontosBase } from "../../../lib/formato";
import { FilaDeAprovacoes, type PedidoAprovacao } from "./Fila";

export const metadata: Metadata = { title: "Aprovações" };

export default async function Aprovacoes() {
  const contexto = await acessoDaPagina("aprovacoes");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Aprovações" />;

  const pedidos: PedidoAprovacao[] = aprovacoesVisiveis(contexto).map((a) => {
    const v = a.venda;
    const base = {
      id: a.id,
      tipo: a.tipo,
      numero: v.numero,
      loja: nomeDaLoja(v.loja),
      vendedor: nomeDaPessoa(v.vendedor),
      cliente: v.cliente ?? "Cliente não identificado",
      descricao: v.itens.map((i) => i.nome).join(" + "),
      total: brl(v.total),
      esperaMinutos: v.pedido?.esperaMinutos ?? 0,
      motivo: v.pedido?.motivo ?? "—",
    };
    const aparelho = v.itens.find((i) => i.desconto > 0);
    const p = aparelho ? produto(aparelho.sku) : undefined;
    const pagamento = v.pagamentos[0];
    if (a.tipo !== "desconto" || !aparelho || !p || !pagamento) return base;
    const avaliacao = avaliarDesconto({ preco: aparelho.precoUnitario, custo: aparelho.custoUnitario, taxaMeioPagamento: TAXA_DO_MEIO[pagamento.meio], politica: POLITICAS[p.categoria] }, aparelho.desconto);
    return {
      ...base,
      desconto: {
        pedido: `${brl(aparelho.desconto)} de ${brl(aparelho.precoUnitario)}`,
        precoOriginal: brl(aparelho.precoUnitario),
        meio: MEIOS[pagamento.meio].nome,
        limite: brl(avaliacao.maximoSemAprovacao),
        margem: percentualDePontosBase(avaliacao.margemResultante),
        abaixoDoCusto: avaliacao.situacao === "abaixo_do_custo",
      },
    };
  });

  const contar = (tipo: PedidoAprovacao["tipo"]) => pedidos.filter((p) => p.tipo === tipo).length;

  return (
    <>
      <TituloPagina
        sobretitulo={contexto.loja === REDE ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Aprovações"
        subtitulo="Descontos, notas e cancelamentos. Ninguém aprova o próprio pedido; tudo fica na auditoria."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Aguardando decisão" valor={numero(pedidos.length)} icone={ClipboardCheck} tom={pedidos.length > 0 ? "atencao" : "bom"} detalhe="Pedidos de hoje" />
        <Indicador rotulo="Descontos" valor={numero(contar("desconto"))} icone={ShieldCheck} detalhe="Acima do limite do vendedor" />
        <Indicador rotulo="Notas fiscais" valor={numero(contar("nota"))} icone={FileText} detalhe="Pedido pronto para o dono" />
        <Indicador rotulo="Cancelamentos" valor={numero(contar("cancelamento"))} icone={ClipboardCheck} detalhe="Com justificativa anexada" />
      </div>
      <FilaDeAprovacoes pedidos={pedidos} aprovador={PERFIS[contexto.perfil].pessoa} />
      <Aviso tom="aviso" className="mt-4">Aprovação interna não substitui a autorização fiscal da SEFAZ e não pode atrasar uma nota obrigatória por lei.</Aviso>
    </>
  );
}

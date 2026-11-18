"use client";

import { nomeDoPagamento, producaoDaVenda, textoDasParcelas, TIPOS_DE_ITEM, type ItemVenda, type Pagamento, type ResultadoPagamento } from "@ora5g/dominio";
import { CircleCheck, FileText, Mail, MessageCircle, Plus, Printer } from "lucide-react";
import { useState } from "react";

import { Aviso, Botao, Cartao, ListaDados } from "../../../componentes/ui";
import type { ProdutoDemo } from "../../../demo/dados";
import { brl } from "../../../lib/formato";
import type { Aprovacao, Cliente, DadosPdv, ItemCarrinho } from "./tipos";

/** Venda concluída (demonstração): comprovante, produção do vendedor e pedido de nota fiscal. */
export function Comprovante({ numero, dados, cliente, itens, totais, conferencia, pagamentos, aprovacao, aoNovaVenda }: {
  numero: string;
  dados: DadosPdv;
  cliente: Cliente | null;
  itens: readonly { venda: ItemVenda; item: ItemCarrinho; produto: ProdutoDemo }[];
  totais: { total: number; descontos: number; valorDeFaceRecargas: number };
  conferencia: ResultadoPagamento;
  pagamentos: readonly Pagamento[];
  aprovacao: Aprovacao | null;
  aoNovaVenda: () => void;
}) {
  const [nota, setNota] = useState<"email" | "whatsapp" | null>(null);
  const producao = producaoDaVenda(itens.map((i) => i.venda));
  const pendentesTelecom = itens.filter((i) => i.venda.situacaoTelecom === "pendente").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-[22px] border border-emerald-200 bg-gradient-to-br from-sucesso-clara to-white p-5 shadow-cartao sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-sucesso text-white"><CircleCheck aria-hidden className="size-6" /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight">Venda concluída na demonstração</h2>
            <p className="text-sm text-suave">{numero} · {dados.loja.nome} · {dados.vendedor}. Nada foi gravado; no sistema real o servidor confirma estoque, preço e pagamentos antes de concluir.</p>
          </div>
        </div>
      </section>

      <Cartao titulo="Comprovante" subtitulo={`Cliente: ${cliente?.nome ?? "não identificado"}`} acao={<Botao variante="secundario" tamanho="sm" className="nao-imprimir" onClick={() => window.print()}><Printer aria-hidden className="size-4" /> Imprimir</Botao>}>
        <ul className="divide-y divide-borda text-sm">
          {itens.map(({ venda, item, produto }) => (
            <li key={item.id} className="flex justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{venda.quantidade > 1 ? `${venda.quantidade}× ` : ""}{produto.nome}</span>
                {(venda.desconto ?? 0) > 0 && <span className="block text-xs text-suave">Desconto de {brl(venda.desconto ?? 0)}{aprovacao?.situacao === "aprovada" ? " (aprovado)" : ""}</span>}
                {venda.situacaoTelecom === "pendente" && <span className="block text-xs text-suave">Aguardando a operadora</span>}
              </span>
              <span className="numeros shrink-0">{brl(venda.precoUnitario * venda.quantidade - (venda.desconto ?? 0))}</span>
            </li>
          ))}
        </ul>
        <ListaDados className="mt-3 border-t border-borda pt-3" itens={[
          ...pagamentos.map((p) => [nomeDoPagamento(p), `${brl(Math.max(0, p.valor))}${textoDasParcelas(p.meio, p.parcelas)}`] as const),
          ["Recebido na loja", brl(conferencia.recebidoNaLoja)],
          ...(conferencia.aReceberDeFinanceiras > 0 ? [["A receber de financeiras", brl(conferencia.aReceberDeFinanceiras)] as const] : []),
          ...(conferencia.troco > 0 ? [["Troco", brl(conferencia.troco)] as const] : []),
          ["Total", <strong key="total" className="text-base">{brl(totais.total)}</strong>],
        ]} />
      </Cartao>

      <Cartao titulo={`Produção que entra para ${dados.vendedor.split(" ")[0]}`} subtitulo="Cada fato conta uma vez; ativação e portabilidade só depois da operadora">
        <ul className="grid grid-cols-3 gap-2 text-center text-sm sm:grid-cols-6">
          {(["aparelho", "acessorio", "chip", "ativacao", "portabilidade", "recarga"] as const).map((t) => (
            <li key={t} className="rounded-xl bg-fundo px-2 py-2.5"><p className="text-xl font-bold">{producao[t]}</p><p className="truncate text-xs text-suave">{TIPOS_DE_ITEM[t].nome}</p></li>
          ))}
        </ul>
        {pendentesTelecom > 0 && <p className="mt-2 text-xs text-suave">{pendentesTelecom} {pendentesTelecom === 1 ? "operação aguarda" : "operações aguardam"} a confirmação da operadora para contar.</p>}
      </Cartao>

      <Cartao titulo="Nota fiscal" subtitulo="O pedido chega pronto ao dono, que aprova em um toque" icone={FileText}>
        {nota ? (
          <Aviso tom="sucesso" titulo="Pedido de nota enviado">A nota vai por {nota === "email" ? `e-mail (${cliente?.email ?? ""})` : "WhatsApp"} depois de autorizada. Aprovação interna não substitui a autorização da SEFAZ.</Aviso>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Botao onClick={() => setNota("email")} disabled={!cliente?.email}><Mail aria-hidden className="size-4" /> Pedir nota por e-mail</Botao>
            <Botao variante="secundario" onClick={() => setNota("whatsapp")}><MessageCircle aria-hidden className="size-4" /> Pedir por WhatsApp</Botao>
            {!cliente?.email && <p className="w-full text-xs text-suave">Sem e-mail do cliente: a nota vai por WhatsApp.</p>}
          </div>
        )}
      </Cartao>

      <Botao tamanho="lg" className="nao-imprimir w-full" onClick={aoNovaVenda}><Plus aria-hidden className="size-5" /> Nova venda</Botao>
    </div>
  );
}

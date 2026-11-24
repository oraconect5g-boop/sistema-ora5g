"use client";

import { CheckCircle2, ExternalLink, LoaderCircle, QrCode } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { Aviso, Botao } from "../../../componentes/ui";
import { agora, brl } from "../../../lib/formato";
import { podePagarPeloSite, type PedidoDoSite } from "../../../lib/loja/carrinho";
import { acaoDoPagamento, type ErroDoPagamento, type EstadoDoPagamento } from "./acoes";

export const ERROS_DO_PAGAMENTO: Record<ErroDoPagamento, string> = {
  dados: "Não deu para conferir o pedido. Abra-o de novo em \"Meu pedido\".",
  limite: "Muitas tentativas seguidas deste aparelho. Espere um pouco e tente de novo.",
  indisponivel: "O pagamento pelo site não está disponível agora. Pague na loja, na retirada.",
  nao_pagavel: "Este pedido não pode mais ser pago pelo site: venceu, foi cancelado ou já foi retirado.",
  nao_achado: "Não achamos o pedido com este WhatsApp. Abra-o de novo em \"Meu pedido\".",
  falha: "Não deu para falar com o pagamento agora. Tente de novo em instantes.",
};
// Enquanto o Pix é preparado (o worker cria o link na Asaas), a tela pergunta de novo a cada 4 segundos, até 15 vezes
// (1 minuto); depois, fica o botão.
export const INTERVALO_DA_ESPERA = 4_000;
export const VEZES_DA_ESPERA = 15;
const semAssinatura = () => () => undefined;
const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

type Props = {
  pedido: PedidoDoSite;
  /** O WhatsApp do pedido (só números), de quem acabou de pedir ou de consultar; sem ele, só o texto. */
  whatsapp: string | null;
  erro: ErroDoPagamento | null;
  enviar: (dados: FormData) => void;
  enviando: boolean;
};

/**
 * O pedido com o Pix (lote PAY-014a; ADR-025): guarda a visão do pedido que a ação do Pix devolve e a entrega a quem
 * desenha o pedido, com o bloco do Pix pronto. Assim a tela inteira acompanha o pagamento (pago, vale até, total).
 */
export function ComOPix({ pedido, whatsapp, children }: {
  pedido: PedidoDoSite; whatsapp: string | null; children: (pedido: PedidoDoSite, pix: ReactNode) => ReactNode;
}) {
  const [estado, enviar, enviando] = useActionState<EstadoDoPagamento, FormData>(acaoDoPagamento, { pedido, whatsapp: whatsapp ?? "", erro: null });
  return children(estado.pedido,
    <PagamentoDoPedido pedido={estado.pedido} whatsapp={whatsapp === null ? null : estado.whatsapp} erro={estado.erro} enviar={enviar} enviando={enviando} />);
}

/** O Pix do pedido do site (lote PAY-014a; ADR-025): pedir, esperar o link, pagar na página da Asaas e ver a confirmação. */
export function PagamentoDoPedido({ pedido, whatsapp, erro, enviar, enviando }: Props) {
  const pg = pedido.pagamento;
  // Antes de o React assumir a página (a hidratação), os botões ficam desligados: o envio sem o React recarregaria a
  // página, e o pedido aberto (que veio de outra ação, a do "Meu pedido" ou a de reservar) se perderia. O Pix precisa do
  // React de qualquer jeito (a espera pelo link e a conferência).
  const hidratado = useSyncExternalStore(semAssinatura, () => true, () => false);
  const [vezes, setVezes] = useState(0);
  const esperando = pg.situacao === "criando" && whatsapp !== null;
  useEffect(() => {
    if (!esperando || enviando || vezes >= VEZES_DA_ESPERA) return;
    const espera = setTimeout(() => {
      setVezes((v) => v + 1);
      const dados = new FormData();
      dados.set("codigo", pedido.codigo);
      dados.set("whatsapp", whatsapp as string);
      dados.set("acao", "ver");
      startTransition(() => enviar(dados));
    }, INTERVALO_DA_ESPERA);
    return () => clearTimeout(espera);
  }, [esperando, enviando, vezes, pedido, whatsapp, enviar]);

  const campos = (acao: "pagar" | "ver") => (
    <>
      <input type="hidden" name="codigo" value={pedido.codigo} />
      <input type="hidden" name="whatsapp" value={whatsapp ?? ""} />
      <input type="hidden" name="acao" value={acao} />
    </>
  );
  const verDeNovo = (rotulo: string) => whatsapp !== null && (
    <form action={enviar}>{campos("ver")}<Botao type="submit" variante="secundario" className="w-full" disabled={enviando || !hidratado}>{enviando ? "Conferindo..." : rotulo}</Botao></form>
  );

  let corpo: React.ReactNode = null;
  if (pg.situacao === "pago") {
    corpo = (
      <div className="rounded-cartao bg-sucesso/10 p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-sucesso"><CheckCircle2 aria-hidden className="size-5" /> Pago pelo site</p>
        <p className="mt-1">{`${brl(pg.valor_centavos ?? pedido.total_centavos)} pagos com Pix${pg.pago_em ? ` em ${quando(pg.pago_em)}` : ""}. Na loja, mostre o código e retire.`}</p>
      </div>
    );
  } else if (pg.situacao === "aguardando" && pg.link) {
    corpo = (
      <div className="space-y-2">
        <a href={pg.link} target="_blank" rel="noopener noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-botao bg-acao px-4 font-semibold text-white">
          <QrCode aria-hidden className="size-5" />{`Pagar ${brl(pg.valor_centavos ?? pedido.total_centavos)} com Pix`}<ExternalLink aria-hidden className="size-4" />
        </a>
        <p className="text-xs text-suave">Abre a página de pagamento da Asaas, com o QR Code e o Pix copia e cola. Pagou? Volte aqui: a confirmação aparece em instantes.</p>
        {verDeNovo("Já paguei: conferir")}
      </div>
    );
  } else if (pg.situacao === "criando") {
    corpo = (
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium"><LoaderCircle aria-hidden className="size-4 animate-spin" /> Preparando o Pix...</p>
        {vezes >= VEZES_DA_ESPERA && verDeNovo("Ver de novo")}
      </div>
    );
  } else if (pg.situacao === "estornado") {
    corpo = <p className="text-sm">O pagamento pelo site foi devolvido (estornado).</p>;
  } else if (pg.situacao !== null) {
    // Falhou, cancelado ou o link desativado: o Pix deste pedido não vale; o pedido segue na loja.
    corpo = pedido.situacao === "reservado" && <p className="text-sm">{pg.situacao === "falhou" ? "Não deu para preparar o Pix deste pedido." : "O Pix deste pedido não vale mais."} Pague na loja, na retirada.</p>;
  } else if (whatsapp !== null && podePagarPeloSite(pedido, agora().getTime())) {
    corpo = (
      <form action={enviar} className="space-y-2">
        {campos("pagar")}
        <Botao type="submit" className="w-full" disabled={enviando || !hidratado}>{enviando ? "Preparando..." : `Pagar agora com Pix (${brl(pedido.total_centavos)})`}</Botao>
        <p className="text-xs text-suave">Ou pague na loja, na retirada.</p>
      </form>
    );
  } else if (pedido.situacao === "reservado") {
    corpo = <p className="text-xs text-suave">O pagamento é feito na loja, na retirada.</p>;
  }
  return (
    <div className="space-y-2" aria-live="polite">
      {erro && <Aviso tom={erro === "nao_pagavel" || erro === "indisponivel" ? "aviso" : "perigo"}>{ERROS_DO_PAGAMENTO[erro]}</Aviso>}
      {corpo}
    </div>
  );
}

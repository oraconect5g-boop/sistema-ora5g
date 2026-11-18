"use client";

import { useActionState } from "react";

import { Aviso, Botao } from "../../../componentes/ui";
import { consultarPedido, type EstadoDaConsulta } from "../carrinho/acoes";
import { PedidoDoSiteNaTela } from "../carrinho/FormularioDoPedido";

const campo = "mt-1 min-h-12 w-full rounded-botao border border-borda bg-white px-3.5 text-[15px] outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const MENSAGENS: Record<Exclude<EstadoDaConsulta["situacao"], "vazio" | "achado">, string> = {
  nao_achado: "Nenhum pedido com este código e este WhatsApp. Confira os dois.",
  dados: "Confira o código (6 letras e números) e o WhatsApp com DDD (11 números).",
  limite: "Muitas consultas seguidas deste aparelho. Tente de novo mais tarde.",
  falha: "Não deu para consultar agora. Tente de novo em instantes.",
};

/** O visitante acompanha o pedido do site: o código e o WhatsApp do pedido, juntos (ONLINE-d). */
export function ConsultaDoPedido() {
  const [estado, consultar, consultando] = useActionState<EstadoDaConsulta, FormData>(consultarPedido, { situacao: "vazio" });
  if (estado.situacao === "achado") return <PedidoDoSiteNaTela pedido={estado.pedido} feito={false} />;
  return (
    <form action={consultar} className="space-y-4 rounded-cartao border border-borda bg-white p-5">
      {estado.situacao !== "vazio" && <Aviso tom={estado.situacao === "nao_achado" ? "aviso" : "perigo"}>{MENSAGENS[estado.situacao]}</Aviso>}
      <label className="block text-sm font-medium">Código do pedido
        <input name="codigo" required maxLength={10} autoComplete="off" autoCapitalize="characters" defaultValue={estado.situacao !== "vazio" ? estado.codigo : undefined} className={`${campo} numeros uppercase tracking-[0.2em]`} />
      </label>
      <label className="block text-sm font-medium">WhatsApp do pedido, com DDD
        <input name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="(41) 99999-0000" maxLength={20} className={campo} />
      </label>
      <Botao type="submit" className="w-full" disabled={consultando}>{consultando ? "Consultando..." : "Ver o pedido"}</Botao>
    </form>
  );
}

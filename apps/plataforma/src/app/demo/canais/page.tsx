import { CircleDashed, Globe, Megaphone, MessageCircle, ShoppingBag, Store } from "lucide-react";
import type { Metadata } from "next";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { CANAIS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";

export const metadata: Metadata = { title: "Canais online" };

const ICONES = { "Loja online Ora 5G": Store, "Mercado Livre": ShoppingBag, "TikTok Shop": ShoppingBag, Shopee: ShoppingBag, "Meta Ads": Megaphone, "WhatsApp oficial": MessageCircle } as const;

export default async function Canais() {
  const contexto = await acessoDaPagina("canais");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Canais online" />;
  const planejados = CANAIS.filter((c) => !c.situacao.startsWith("Não")).length;
  return (
    <>
      <TituloPagina titulo="Canais online e campanhas" subtitulo="Mesmo catálogo, preço e estoque do PDV; um canal nunca vende o IMEI reservado em outro" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Canais conectados" valor={`0 de ${CANAIS.length}`} icone={Globe} detalhe="Aguardando contas e contratos" tom="atencao" />
        <Indicador rotulo="Planejados" valor={String(planejados)} icone={CircleDashed} detalhe="Loja online (mês 5) e Shopee" />
        <Indicador rotulo="Vendas online hoje" valor="—" icone={ShoppingBag} detalhe="Sem número inventado" />
        <Indicador rotulo="Custo por lead" valor="—" icone={Megaphone} detalhe="Só com a Meta conectada" />
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CANAIS.map((c) => {
          const IconeCanal = ICONES[c.nome as keyof typeof ICONES] ?? Globe;
          return (
            <li key={c.nome}>
              <Cartao icone={IconeCanal} titulo={c.nome} acao={<Selo tom={c.situacao.startsWith("Não") ? "neutro" : "info"} ponto>{c.situacao}</Selo>} className="h-full">
                <p className="text-xs font-semibold uppercase tracking-wide text-suave">Para conectar</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {c.precisa.map((item) => <li key={item} className="flex items-start gap-2"><CircleDashed aria-hidden className="mt-0.5 size-4 shrink-0 text-suave" /> {item}</li>)}
                </ul>
              </Cartao>
            </li>
          );
        })}
      </ul>
      <Aviso className="mt-4" titulo="Nenhum número inventado">Métricas de anúncios (custo por lead, ROAS) só aparecem quando a conta Meta estiver conectada com autorização. Até lá, esta tela mostra o que falta para ligar cada canal.</Aviso>
    </>
  );
}

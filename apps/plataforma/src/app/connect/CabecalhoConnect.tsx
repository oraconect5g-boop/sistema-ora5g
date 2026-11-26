import { Signal } from "lucide-react";
import type { ReactNode } from "react";

import { BotaoLink, FiltroSegmentado, TituloPagina } from "../../componentes/ui";
import type { AbaConnect } from "../../integracoes/nogle/catalogo";
import { permite } from "../../lib/acesso/molde";
import type { obterSessao } from "../../lib/acesso/sessao";
import { AbaAtualAVista } from "./AbaAtualAVista";

// Lote CONNECT-m (25/11/2026; o pedido do proprietário: "as telas do ora connect da demo, que estavam muito boas"): o
// cabeçalho comum da Ora Connect, como na demonstração: o título, o "Vender chip" e as funções em abas no topo. Cada aba é
// uma tela real; cada pessoa vê só as abas do seu papel (a tela e o banco conferem de novo). As abas são as mesmas do catálogo
// das funções da Nogle (integracoes/nogle/catalogo.ts): cada função oficial aparece numa delas.

type Sessao = Awaited<ReturnType<typeof obterSessao>>;
export type PermissoesDaConnect = { opera: boolean; gere: boolean; integra: boolean };
export const permissoesDaConnect = (sessao: Pick<Sessao, "molde">): PermissoesDaConnect => ({
  opera: permite(sessao, "connect.operar"), gere: permite(sessao, "connect.gerir"), integra: permite(sessao, "integracoes.gerir"),
});

export const ABAS_DA_CONNECT = {
  operacoes: { rotulo: "Operações do dia", href: "/connect", ve: () => true },
  ativar: { rotulo: "Ativar chip", href: "/connect/ativar", ve: (p: PermissoesDaConnect) => p.opera },
  linha: { rotulo: "Consultar linha", href: "/connect/linha", ve: (p: PermissoesDaConnect) => p.opera || p.gere },
  recarga: { rotulo: "Recarga", href: "/connect/recarga", ve: (p: PermissoesDaConnect) => p.opera },
  portabilidade: { rotulo: "Portabilidade", href: "/connect/portabilidade", ve: (p: PermissoesDaConnect) => p.opera || p.gere },
  atendimento: { rotulo: "Bloqueio e atendimento", href: "/connect/acoes-na-nogle", ve: (p: PermissoesDaConnect) => p.gere },
  chips: { rotulo: "Chips e entrega", href: "/connect/chips", ve: (p: PermissoesDaConnect) => p.opera || p.gere || p.integra },
  carteira: { rotulo: "Carteira e relatórios", href: "/connect/carteira", ve: (p: PermissoesDaConnect) => p.opera || p.gere },
  integracao: { rotulo: "Integração Nogle", href: "/connect/integracao", ve: (p: PermissoesDaConnect) => p.gere || p.integra },
} as const satisfies Record<AbaConnect, { rotulo: string; href: string; ve: (p: PermissoesDaConnect) => boolean }>;
export type AbaDaConnect = keyof typeof ABAS_DA_CONNECT;
const ROTULO_DAS_ABAS = "Funções da Ora Connect";
/** A mesma largura em todas as abas (trocar de aba não mexe no topo). */
export const LARGURA_DA_CONNECT = "max-w-6xl";

/** As abas que a pessoa vê, na ordem da demonstração. */
export const abasVisiveis = (p: PermissoesDaConnect) => (Object.keys(ABAS_DA_CONNECT) as AbaDaConnect[]).filter((a) => ABAS_DA_CONNECT[a].ve(p));

/**
 * O topo de todas as abas: "Ora Connect", o "Vender chip", as abas e, nas abas com um assunto só, o título e a explicação
 * dele (como os cartões da demonstração). Na impressão (o relatório), as abas e os botões ficam de fora.
 */
export function CabecalhoConnect({ sessao, aba, acao, titulo, subtitulo }: {
  sessao: Pick<Sessao, "molde" | "situacao">;
  aba: AbaDaConnect;
  acao?: ReactNode;
  titulo?: string;
  subtitulo?: ReactNode;
}) {
  const p = permissoesDaConnect(sessao);
  const abas = abasVisiveis(p);
  // O chip é vendido no Vender (o caixa), com a busca já pronta: só para quem opera a Ora Connect e registra vendas.
  const vende = p.opera && permite(sessao, "venda.registrar");
  return (
    <>
      <TituloPagina
        sobretitulo={sessao.situacao.unidade_nome}
        titulo="Ora Connect"
        subtitulo="Chips, ativações, recargas, portabilidade e atendimento da operadora, pela Nogle"
        acao={(acao || vende) ? (
          <div className="nao-imprimir flex flex-wrap items-center gap-2">
            {acao}
            {vende && <BotaoLink href="/vender?q=chip"><Signal aria-hidden className="size-4" /> Vender chip</BotaoLink>}
          </div>
        ) : undefined}
      />
      {abas.length > 1 && (
        <div className="nao-imprimir">
          <FiltroSegmentado rotulo={ROTULO_DAS_ABAS} opcoes={abas.map((a) => ({ href: ABAS_DA_CONNECT[a].href, rotulo: ABAS_DA_CONNECT[a].rotulo, ativo: a === aba }))} />
          <AbaAtualAVista rotulo={ROTULO_DAS_ABAS} />
        </div>
      )}
      {titulo && (
        <div className="mt-5">
          <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-sm text-suave">{subtitulo}</p>}
        </div>
      )}
    </>
  );
}

import { Signal } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, BotaoLink, FiltroSegmentado, TituloPagina } from "../../../componentes/ui";
import {
  CARTEIRA_CONTEL, CHIPS_POR_LOJA, CLIENTES, COMPRAS_CHIP, DDDS_PR, ESTOQUE_VIRGEM, FAQ_CATEGORIAS, LINHAS_CONNECT, LOGISTICA, nomeDaLoja,
  nomeDaPessoa, OPERADORAS_DOADORAS, PDVS_CONTEL, PLANOS_CONNECT, PORTABILIDADES, RECARGAS_PROGRAMADAS,
} from "../../../demo/dados";
import { REDE, type Perfil } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import type { AbaConnect } from "../../../integracoes/nogle/catalogo";
import { agora } from "../../../lib/formato";
import { AtendimentoConnect } from "./_abas/AtendimentoConnect";
import { AtivarChip } from "./_abas/AtivarChip";
import { Carteira } from "./_abas/Carteira";
import { ChipsConnect } from "./_abas/ChipsConnect";
import { ConsultarLinha } from "./_abas/ConsultarLinha";
import { Integracao } from "./_abas/Integracao";
import { FILTROS_OPERACOES, Operacoes, operacoesVisiveis, type FiltroOperacoes } from "./_abas/Operacoes";
import { PortabilidadeConnect } from "./_abas/PortabilidadeConnect";
import { RecargaConnect } from "./_abas/RecargaConnect";

export const metadata: Metadata = { title: "Ora Connect" };

const LOJA = ["vendedor", "gerente", "dono"] as const satisfies readonly Perfil[];

// Abas da Ora Connect e quem vê cada uma (proposta alinhada ao ADR-002; o servidor decide no sistema real).
const ABAS: Record<AbaConnect, { rotulo: string; perfis: readonly Perfil[] }> = {
  operacoes: { rotulo: "Operações do dia", perfis: [...LOJA, "administrador"] },
  ativar: { rotulo: "Ativar chip", perfis: LOJA },
  linha: { rotulo: "Consultar linha", perfis: LOJA },
  recarga: { rotulo: "Recarga", perfis: LOJA },
  portabilidade: { rotulo: "Portabilidade", perfis: LOJA },
  atendimento: { rotulo: "Bloqueio e atendimento", perfis: LOJA },
  chips: { rotulo: "Chips e entrega", perfis: LOJA },
  carteira: { rotulo: "Carteira e relatórios", perfis: ["dono"] },
  integracao: { rotulo: "Integração Nogle", perfis: ["dono", "administrador"] },
};

export default async function OraConnect({ searchParams }: { searchParams: Promise<{ aba?: string; filtro?: string }> }) {
  const contexto = await acessoDaPagina("connect");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Ora Connect" />;
  const parametros = await searchParams;
  const permitidas = (Object.keys(ABAS) as AbaConnect[]).filter((a) => ABAS[a].perfis.includes(contexto.perfil));
  const aba: AbaConnect = permitidas.find((a) => a === parametros.aba) ?? "operacoes";
  const filtro: FiltroOperacoes = Object.hasOwn(FILTROS_OPERACOES, parametros.filtro ?? "") ? (parametros.filtro as FiltroOperacoes) : "todas";
  const instante = agora();
  const loja = contexto.loja === REDE ? "santa-candida" : contexto.loja;
  const gestao = contexto.perfil === "gerente" || contexto.perfil === "dono";
  const operacoes = operacoesVisiveis(contexto);
  const pdv = PDVS_CONTEL.find((p) => p.loja === loja);

  return (
    <>
      <TituloPagina
        sobretitulo={contexto.loja === REDE ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Ora Connect"
        subtitulo="Chips, ativações, recargas, portabilidade e atendimento da operadora, no formato da API NOGLE (Nogle)"
        acao={
          <>
            {aba === "operacoes" && <ExportarCsv nomeArquivo="ora-connect" colunas={["Hora", "Loja", "Vendedor", "Operação", "Linha", "Valor (R$)", "Situação"]} linhas={operacoes.map((o) => [o.hora, nomeDaLoja(o.loja), nomeDaPessoa(o.vendedor), o.tipo, o.linha, (o.valor / 100).toFixed(2).replace(".", ","), o.situacao])} />}
            {contexto.perfil !== "administrador" && <BotaoLink href="/demo/vender?item=chip"><Signal aria-hidden className="size-4" /> Vender chip</BotaoLink>}
          </>
        }
      />

      <FiltroSegmentado rotulo="Funções da Ora Connect" opcoes={permitidas.map((a) => ({ href: a === "operacoes" ? "/demo/connect" : `/demo/connect?aba=${a}`, rotulo: ABAS[a].rotulo, ativo: a === aba }))} />

      <div className="mt-4">
        {aba === "operacoes" && <Operacoes contexto={contexto} filtro={filtro} />}
        {aba === "ativar" && (
          <AtivarChip planos={PLANOS_CONNECT} ddds={DDDS_PR} chipsDaLoja={CHIPS_POR_LOJA[loja] ?? []} saldoCarteira={CARTEIRA_CONTEL.saldo} loja={nomeDaLoja(loja)}
            clientes={CLIENTES.map((c) => ({ nome: c.nome, cpf: c.cpf.replace(/\D/g, "") }))} />
        )}
        {aba === "linha" && <ConsultarLinha linhas={LINHAS_CONNECT} agora={instante.getTime()} />}
        {aba === "recarga" && <RecargaConnect planos={PLANOS_CONNECT} linhas={LINHAS_CONNECT.filter((l) => l.status === "ATIVO").map((l) => l.numero)} programadas={RECARGAS_PROGRAMADAS} podeGerir={gestao} saldoCarteira={CARTEIRA_CONTEL.saldo} agora={instante.getTime()} />}
        {aba === "portabilidade" && <PortabilidadeConnect operadoras={OPERADORAS_DOADORAS} portabilidades={PORTABILIDADES} />}
        {aba === "atendimento" && <AtendimentoConnect podeBloquear={gestao} faq={FAQ_CATEGORIAS} />}
        {aba === "chips" && (
          <ChipsConnect loja={nomeDaLoja(loja)} fisicosDaLoja={CHIPS_POR_LOJA[loja] ?? []} esimDaLoja={pdv?.esim ?? 0} estoqueMinimo={pdv?.estoqueMinimo ?? 8}
            estoqueVirgem={ESTOQUE_VIRGEM} podeTransferir={gestao} compras={COMPRAS_CHIP} planos={PLANOS_CONNECT} logistica={LOGISTICA} />
        )}
        {aba === "carteira" && <Carteira operacoes={operacoes} agora={instante} />}
        {aba === "integracao" && <Integracao />}
      </div>

      {aba !== "integracao" && (
        <Aviso tom="aviso" className="mt-4" titulo="Integração Nogle ainda não ligada">
          A documentação oficial inteira foi lida (62 funções) e está no catálogo da aba Integração. Falta a Nogle informar o tipo da chave da Ora (decisão P9) e liberar credenciais e uma linha de teste. Até lá, as telas simulam as respostas no formato documentado e nada é enviado à operadora.
        </Aviso>
      )}
    </>
  );
}

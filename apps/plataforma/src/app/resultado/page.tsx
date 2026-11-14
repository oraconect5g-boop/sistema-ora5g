import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../componentes/ui";
import { obterSessao } from "../../lib/acesso/sessao";
import { mesDeHoje } from "../../lib/metas/painel";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { consultarResultado } from "../../lib/resultado/consulta";
import { filtroDoResultado, MESES_DA_SERIE, mesDoResultado } from "../../lib/resultado/regras";
import { ConteudoResultado } from "./ConteudoResultado";

export const metadata: Metadata = { title: "Resultado do mês" };
export const dynamic = "force-dynamic";

type Parametros = { mes?: ValorDeParametro; loja?: ValorDeParametro };

// Resultado do mês (lote L8b: ORA-FIN-002 e ORA-FIN-008), pelas decisões do proprietário de 13/11/2026:
// só o dono vê; a conta a pagar entra no mês do vencimento; as contas da rede são divididas entre as lojas
// pelo que cada uma vendeu. O banco soma tudo (public.resultado_do_mes) e recusa quem não é o dono; a tela
// só apresenta. Loja que o banco recusa (fora da rede de quem pede) cai na rede inteira.
export default async function Resultado({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const agora = new Date();
  const mesAtual = mesDeHoje(agora);
  const mes = mesDoResultado(textoDoParametro(parametros.mes), agora);
  let filtro = filtroDoResultado(textoDoParametro(parametros.loja));
  const sessao = await obterSessao({ exigirLoja: true });
  let leitura = await consultarResultado(sessao.supabase, mes, filtro.tipo === "loja" ? filtro.id : null, MESES_DA_SERIE);
  if (leitura.estado === "recusado" && filtro.tipo === "loja") {
    filtro = { tipo: "rede" };
    leitura = await consultarResultado(sessao.supabase, mes, null, MESES_DA_SERIE);
  }
  if (leitura.estado === "recusado") {
    return (
      <MoldeReal sessao={sessao}>
        <Aviso tom="aviso" className="mt-6" titulo="O resultado do mês é só do dono">
          Decisão do proprietário: o resultado junta vendas, custo e despesas de todas as lojas.
        </Aviso>
      </MoldeReal>
    );
  }
  const lojas = leitura.estado === "ok" ? leitura.dados.lojas : [];
  const onde = filtro.tipo === "rede" ? "Rede inteira" : (lojas.find((l) => l.id === filtro.id)?.nome ?? "Loja");

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <TituloPagina
        sobretitulo={onde}
        titulo="Resultado do mês"
        subtitulo="Quanto sobrou: as vendas menos devoluções, custo das mercadorias, taxas e contas. É o resultado gerencial com o que está lançado no sistema, não a contabilidade."
      />
      <ConteudoResultado leitura={leitura} mes={mes} mesAtual={mesAtual} filtro={filtro} />
    </MoldeReal>
  );
}

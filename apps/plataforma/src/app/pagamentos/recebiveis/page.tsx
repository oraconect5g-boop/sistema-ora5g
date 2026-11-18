import type { Metadata } from "next";

import { MoldeReal } from "../../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../../componentes/ui";
import { permite } from "../../../lib/acesso/molde";
import { obterSessao } from "../../../lib/acesso/sessao";
import { consultarRecebiveis, lerFiltro } from "../../../lib/pagamentos/recebiveis";
import type { ValorDeParametro } from "../../../lib/parametros";
import { ConteudoRecebiveis } from "./ConteudoRecebiveis";

export const metadata: Metadata = { title: "Recebíveis" };
export const dynamic = "force-dynamic";

// Recebíveis por loja e adquirente (lote L8e: ORA-FIN-005). O que as maquininhas, o Pix direto e as financeiras
// ainda devem a cada loja, com a idade desde a venda, o que caiu na conta nos últimos dias, com a diferença
// observada no extrato, e as pendências do financeiro. O dono vê a rede (ou uma loja); o gerente, a loja dele.
// Só leitura: o banco (public.recebiveis_painel) escolhe as lojas pela permissão de conciliar e soma tudo.
export default async function Recebiveis({ searchParams }: { searchParams: Promise<{ loja?: ValorDeParametro; dias?: ValorDeParametro }> }) {
  const filtro = lerFiltro(await searchParams);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const pode = permite(sessao, "pagamento.conciliar");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">Os recebíveis são de quem concilia os pagamentos da loja (dono e gerente).</Aviso></MoldeReal>;
  const leitura = await consultarRecebiveis(supabase, filtro);

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <TituloPagina
        sobretitulo="Financeiro"
        titulo="Recebíveis"
        subtitulo="O que as maquininhas, o Pix direto na conta e as financeiras ainda devem a cada loja e o que já caiu na conta. Sem contrato verificado das maquininhas e das financeiras, a idade é contada desde a venda e a diferença é a que o extrato mostrou, não a taxa contratada."
      />
      <ConteudoRecebiveis leitura={leitura} filtro={filtro} />
    </MoldeReal>
  );
}

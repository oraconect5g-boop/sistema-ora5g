import type { Metadata } from "next";

import { MoldeReal, permissoesDoMenu } from "../../componentes/MoldeReal";
import { Aviso } from "../../componentes/ui";
import { obterSessao } from "../../lib/acesso/sessao";
import { podeVerFinanceiro } from "../../lib/acesso/menu";
import { hojeEmSaoPaulo } from "../../lib/contas-a-pagar/regras";
import { lerFilas } from "../../lib/operacao/filas";
import { ConteudoDaOperacao } from "./ConteudoDaOperacao";

export const metadata: Metadata = { title: "Saúde da operação" };
export const dynamic = "force-dynamic";

// Saúde da operação (lote Q1: ORA-QUAL-006 em parte): o que espera alguém nas lojas que a pessoa acompanha, fila por
// fila, com quantos e há quanto tempo está o mais antigo. O dono vê a rede; o gerente, a loja dele (o RLS decide); cada
// fila só para quem decide sobre ela. Erros do sistema e tempo de resposta ainda não aparecem: dependem do
// monitoramento do servidor.
export default async function SaudeDaOperacao() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const permissoes = await permissoesDoMenu(supabase, situacao.unidade_id as string);
  if (!podeVerFinanceiro(permissoes)) {
    return <MoldeReal sessao={sessao} permissoes={permissoes}><Aviso tom="aviso" className="mt-6">A saúde da operação é do dono e da gerência.</Aviso></MoldeReal>;
  }
  const hoje = hojeEmSaoPaulo();
  const filas = await lerFilas(supabase, permissoes, hoje);
  return (
    <MoldeReal sessao={sessao} permissoes={permissoes} largura="max-w-5xl">
      <ConteudoDaOperacao filas={filas} hoje={hoje} />
    </MoldeReal>
  );
}

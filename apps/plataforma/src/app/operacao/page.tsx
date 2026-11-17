import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso } from "../../componentes/ui";
import { obterSessao } from "../../lib/acesso/sessao";
import { podeVerFinanceiro } from "../../lib/acesso/menu";
import { hojeEmSaoPaulo } from "../../lib/contas-a-pagar/regras";
import { agora } from "../../lib/formato";
import { lerAlertaDoEstoque } from "../../lib/inicio/alerta-do-estoque";
import { lerFilas } from "../../lib/operacao/filas";
import { lerRotinas } from "../../lib/operacao/rotinas";
import { ConteudoDaOperacao } from "./ConteudoDaOperacao";

export const metadata: Metadata = { title: "Saúde da operação" };
export const dynamic = "force-dynamic";

// Saúde da operação (lote Q1: ORA-QUAL-006 em parte): o que espera alguém nas lojas que a pessoa acompanha, fila por
// fila, com quantos e há quanto tempo está o mais antigo. O dono vê a rede; o gerente, a loja dele (o RLS decide); cada
// fila só para quem decide sobre ela. Desde o ROT-a (ADR-011), as rotinas automáticas do banco, com o aviso no topo
// quando uma falha ou atrasa. Desde o SAUDE-a (ADR-012), a venda sem o pedido da nota é fila, e o estoque abaixo do
// mínimo aparece à parte, como aviso: não é fila. Erros do sistema e tempo de resposta ainda não aparecem: dependem do
// monitoramento do servidor.
export default async function SaudeDaOperacao() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const { permissoes } = sessao.molde;
  if (!podeVerFinanceiro(permissoes)) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">A saúde da operação é do dono e da gerência.</Aviso></MoldeReal>;
  }
  const hoje = hojeEmSaoPaulo();
  const instante = agora().getTime();
  const [filas, rotinas, estoque] = await Promise.all([
    lerFilas(supabase, permissoes, hoje), lerRotinas(supabase),
    lerAlertaDoEstoque(supabase, { rede: true, unidade: sessao.situacao.unidade_id as string, permissoes }),
  ]);
  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <ConteudoDaOperacao filas={filas} hoje={hoje} rotinas={rotinas} agora={instante} estoque={estoque} />
    </MoldeReal>
  );
}

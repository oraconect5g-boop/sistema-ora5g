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
import { resumoDosErros } from "../../lib/saude/erros-do-servidor";
import { lerVigiaDosErros } from "../../lib/saude/vigia-dos-erros";
import { ConteudoDaOperacao } from "./ConteudoDaOperacao";

export const metadata: Metadata = { title: "Saúde da operação" };
export const dynamic = "force-dynamic";

// Saúde da operação (lote Q1: ORA-QUAL-006 em parte): o que espera alguém nas lojas que a pessoa acompanha, fila por
// fila, com quantos e há quanto tempo está o mais antigo. O dono vê a rede; o gerente, a loja dele (o RLS decide); cada
// fila só para quem decide sobre ela. Desde o ROT-a (ADR-011), as rotinas automáticas do banco, com o aviso no topo
// quando uma falha ou atrasa. Desde o SAUDE-a (ADR-012), a venda sem o pedido da nota é fila, e o estoque abaixo do
// mínimo aparece à parte, como aviso: não é fila. Desde o OBS-a, os erros do servidor (a lista do processo que serve o
// site), só para quem gere a rede: não são de uma loja. Desde o QUAL-006a, o aviso no celular deles (se o worker dos
// avisos está conferindo o site e quando saiu o último alerta), para quem o recebe. O tempo de resposta ainda não
// aparece: depende do monitoramento do servidor, a escolher.
export default async function SaudeDaOperacao() {
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase } = sessao;
  const { permissoes } = sessao.molde;
  if (!podeVerFinanceiro(permissoes)) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">A saúde da operação é do dono e da gerência.</Aviso></MoldeReal>;
  }
  const hoje = hojeEmSaoPaulo();
  const instante = agora().getTime();
  // Os erros do servidor são da rede inteira (o molde da rota, sem dado de loja): quem gere as lojas vê.
  const gereARede = permissoes.has("unidades.gerir");
  const erros = gereARede ? resumoDosErros(instante) : null;
  const [filas, rotinas, estoque, vigia] = await Promise.all([
    lerFilas(supabase, permissoes, hoje), lerRotinas(supabase),
    lerAlertaDoEstoque(supabase, { rede: true, unidade: sessao.situacao.unidade_id as string, permissoes }),
    gereARede ? lerVigiaDosErros(supabase) : null,
  ]);
  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <ConteudoDaOperacao filas={filas} hoje={hoje} rotinas={rotinas} agora={instante} estoque={estoque} erros={erros} vigia={vigia} />
    </MoldeReal>
  );
}

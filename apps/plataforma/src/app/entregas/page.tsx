import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso } from "../../componentes/ui";
import { obterSessao } from "../../lib/acesso/sessao";
import { ENTREGAS } from "../../lib/entregas/entregas";
import { VERSAO } from "../../lib/versao";
import { ConteudoDasEntregas } from "./ConteudoDasEntregas";

export const metadata: Metadata = { title: "Entregas do projeto" };
export const dynamic = "force-dynamic";

// Entregas do projeto (lote ENTREGAS-a; aceite A18 do adendo do Codex de 16/11/2026): o acompanhamento do dono, no
// celular, de cada lote (no ar, aceite pedido, resposta) e do placar dos 179 requisitos, com a versão que está no ar.
// Os dados saem do checkpoint do repositório (nada de banco nem de segredo); só o dono e o administrador veem.
export default async function Entregas() {
  const sessao = await obterSessao({ exigirLoja: true });
  if (!sessao.molde.permissoes.has("venda.ver_todas")) {
    return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">As entregas do projeto são do dono.</Aviso></MoldeReal>;
  }
  return (
    <MoldeReal sessao={sessao} largura="max-w-5xl">
      <ConteudoDasEntregas dados={ENTREGAS} versao={VERSAO} />
    </MoldeReal>
  );
}

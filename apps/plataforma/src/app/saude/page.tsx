import type { Metadata } from "next";

import { formatarHorario, obterEstadoSaude } from "../../saude/estado";

export const metadata: Metadata = { title: "Saúde do sistema | Ora 5G" };

// Precisa ser calculada a cada acesso: uma pagina estatica continuaria "no ar" com horario antigo.
export const dynamic = "force-dynamic";

export default function PaginaSaude() {
  const estado = obterEstadoSaude();

  return (
    <main>
      <h1>Sistema no ar</h1>
      <dl>
        <dt>Serviço</dt>
        <dd>{estado.servico}</dd>
        <dt>Versão</dt>
        <dd>{estado.versao}</dd>
        <dt>Verificado em</dt>
        <dd>
          <time dateTime={estado.verificadoEm}>{formatarHorario(estado.verificadoEm)}</time>
        </dd>
      </dl>
      <p>Esta página confere só o aplicativo. Banco de dados e integrações ainda não são verificados aqui.</p>
    </main>
  );
}

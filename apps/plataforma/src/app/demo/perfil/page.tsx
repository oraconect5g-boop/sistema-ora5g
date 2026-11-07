import { UserRound } from "lucide-react";

import { BotaoLink, Cartao, TituloPagina } from "../../../componentes/ui";
import { PERFIS, type Perfil } from "../../../demo/perfis";
import { perfilAtual } from "../../../demo/sessao";

export default async function EscolherPerfil() {
  const atual = await perfilAtual();
  return (
    <>
      <TituloPagina titulo="Escolha o perfil da demonstração" subtitulo="Cada perfil vê telas e permissões diferentes." />
      <div className="grid gap-4 sm:grid-cols-2">
        {(Object.keys(PERFIS) as Perfil[]).map((p) => (
          <Cartao key={p}>
            <div className="flex items-start gap-3">
              <UserRound aria-hidden className="mt-0.5 size-6 text-acao" />
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{PERFIS[p].nome}</h2>
                <p className="text-sm text-suave">{PERFIS[p].pessoa} · {PERFIS[p].escopo}</p>
                <BotaoLink href={`/demo/perfil/usar?p=${p}`} variante={p === atual ? "secundario" : "primario"} className="mt-3" prefetch={false}>
                  {p === atual ? "Perfil atual" : `Entrar como ${PERFIS[p].nome.toLowerCase()}`}
                </BotaoLink>
              </div>
            </div>
          </Cartao>
        ))}
      </div>
    </>
  );
}

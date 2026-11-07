import { Check, MapPin } from "lucide-react";
import type { Metadata } from "next";

import { Avatar, classeBotao, Selo, TituloPagina } from "../../../componentes/ui";
import { nomeDaLoja } from "../../../demo/dados";
import { ACESSO, LOJAS_DO_PERFIL, PAGINAS, PERFIS, REDE, type Perfil } from "../../../demo/perfis";
import { perfilAtual } from "../../../demo/sessao";

export const metadata: Metadata = { title: "Escolher perfil" };

export default async function EscolherPerfil() {
  const atual = await perfilAtual();
  return (
    <>
      <TituloPagina titulo="Escolha o perfil da demonstração" subtitulo="Cada perfil vê telas, números e permissões diferentes, como no sistema real." />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(PERFIS) as Perfil[]).map((p) => {
          const dados = PERFIS[p];
          const lojas = LOJAS_DO_PERFIL[p];
          const eAtual = p === atual;
          return (
            <li key={p} className={`flex flex-col rounded-[20px] border bg-white p-5 shadow-cartao ${eAtual ? "border-acao ring-2 ring-acao/20" : "border-borda"}`}>
              <div className="flex items-start gap-3">
                <Avatar nome={dados.pessoa} tamanho="size-11 text-sm" />
                <div className="min-w-0 flex-1">
                  <h2 className="flex items-center gap-2 font-semibold">{dados.nome}{eAtual && <Selo tom="marca">Atual</Selo>}</h2>
                  <p className="text-sm text-suave">{dados.pessoa}</p>
                </div>
              </div>
              <p className="mt-3 text-sm">{dados.descricao}</p>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-suave"><MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" /> {lojas.includes(REDE) ? "Rede inteira ou qualquer loja" : lojas.map(nomeDaLoja).join(" e ")}</p>
              <p className="mt-2 text-xs text-suave">{ACESSO[p].length} telas: {ACESSO[p].map((pg) => PAGINAS[pg].curto).join(", ")}</p>
              {/* Link comum: a troca de perfil recarrega a página inteira (menu, avisos e loja). */}
              <a href={`/demo/perfil/usar?p=${p}`} className={classeBotao(eAtual ? "secundario" : "primario", "md", "mt-4 w-full")}>
                {eAtual ? <><Check aria-hidden className="size-4" /> Perfil atual</> : `Entrar como ${dados.nome.toLowerCase()}`}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

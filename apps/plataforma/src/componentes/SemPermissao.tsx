import { ShieldAlert } from "lucide-react";

import { ACESSO, PAGINAS, PERFIS, type Perfil } from "../demo/perfis";
import { BotaoLink } from "./ui";

export function SemPermissao({ perfil, pagina }: { perfil: Perfil; pagina: string }) {
  const sugestoes = ACESSO[perfil].filter((p) => p !== "inicio").slice(0, 4);
  return (
    <div className="mx-auto max-w-lg rounded-[22px] border border-borda bg-white p-8 text-center shadow-cartao">
      <span className="mx-auto grid size-14 place-items-center rounded-full bg-aviso-clara text-aviso"><ShieldAlert aria-hidden className="size-7" /></span>
      <h1 className="mt-4 text-xl font-bold tracking-tight">Sem permissão</h1>
      <p className="mt-2 text-sm text-suave">
        O perfil <strong>{PERFIS[perfil].nome}</strong> não acessa <strong>{pagina}</strong> (matriz de permissões do ADR-002). No sistema real,
        o servidor e o banco também recusam, mesmo que alguém digite o endereço.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <BotaoLink href="/demo">Voltar ao início</BotaoLink>
        {sugestoes.map((p) => <BotaoLink key={p} href={PAGINAS[p].caminho} variante="secundario">{PAGINAS[p].titulo}</BotaoLink>)}
      </div>
    </div>
  );
}

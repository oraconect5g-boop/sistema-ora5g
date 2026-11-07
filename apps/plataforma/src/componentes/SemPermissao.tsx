import { ShieldAlert } from "lucide-react";

import { PERFIS, type Perfil } from "../demo/perfis";
import { BotaoLink } from "./ui";

export function SemPermissao({ perfil, pagina }: { perfil: Perfil; pagina: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-cartao border border-borda bg-white p-8 text-center shadow-sm">
      <ShieldAlert aria-hidden className="mx-auto size-10 text-aviso" />
      <h1 className="mt-3 text-xl font-bold">Sem permissão</h1>
      <p className="mt-2 text-sm text-suave">
        O perfil <strong>{PERFIS[perfil].nome}</strong> não acessa <strong>{pagina}</strong> (matriz do ADR-002). No sistema real,
        o banco também recusa a consulta, mesmo que alguém digite o endereço.
      </p>
      <BotaoLink href="/demo" className="mt-5">Voltar ao início</BotaoLink>
    </div>
  );
}

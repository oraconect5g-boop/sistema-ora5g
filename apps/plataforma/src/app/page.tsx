import { BotaoLink } from "../componentes/ui";

// Calculada a cada acesso: o ambiente (desenvolvimento, homologação, produção) vem do servidor.
export const dynamic = "force-dynamic";

export default function Inicio() {
  const demonstracao = process.env.APP_ENV !== "producao";
  return (
    <main className="flex min-h-dvh items-center justify-center bg-navegacao px-4 py-10 text-white">
      <div className="w-full max-w-md text-center">
        <p className="text-4xl font-extrabold tracking-tight">ora<span className="text-destaque">5G</span></p>
        <h1 className="mt-4 text-2xl font-bold">Plataforma de gestão integrada</h1>
        <p className="mt-2 text-slate-300">Vendas, estoque, clientes, financeiro e Ora Connect em um só lugar.</p>
        <div className="mt-8 flex flex-col gap-3">
          <BotaoLink href="/entrar">Entrar na plataforma</BotaoLink>
          {demonstracao && <BotaoLink href="/demo" variante="secundario">Ver demonstração (dados fictícios)</BotaoLink>}
        </div>
        <p className="mt-8 text-xs text-slate-400">Sistema em desenvolvimento · ambiente {process.env.APP_ENV ?? "não configurado"}</p>
      </div>
    </main>
  );
}

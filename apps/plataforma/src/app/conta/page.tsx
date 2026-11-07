import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Aviso, Botao, Cartao } from "../../componentes/ui";
import { clienteSupabaseServidor } from "../../lib/supabase/servidor";
import { sair } from "../entrar/acoes";

export const metadata: Metadata = { title: "Minha conta | Ora 5G" };
export const dynamic = "force-dynamic";

// Primeira tela real ligada ao banco: perfil e lojas vêm do Supabase, filtrados pelo RLS.
export default async function Conta() {
  const supabase = await clienteSupabaseServidor();
  if (!supabase) redirect("/entrar?erro=configuracao");
  const { data: usuario } = await supabase.auth.getUser();
  if (!usuario.user) redirect("/entrar");

  const [perfilResposta, unidadesResposta] = await Promise.all([
    supabase.from("perfis_usuario").select("nome, email, status").eq("id", usuario.user.id).maybeSingle(),
    supabase.from("unidades").select("id, nome, tipo").order("nome"),
  ]);

  // REV-014: falha do serviço não pode virar "sem perfil" ou "sem loja".
  if (perfilResposta.error || unidadesResposta.error) {
    console.error("conta: falha ao consultar o banco", {
      perfil: perfilResposta.error?.code ?? null,
      unidades: unidadesResposta.error?.code ?? null,
    });
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <Cartao titulo="Minha conta">
          <Aviso tom="perigo" titulo="Não foi possível carregar seus dados agora">Tente de novo em alguns instantes. Se continuar, avise o administrador.</Aviso>
        </Cartao>
      </main>
    );
  }
  const perfil = perfilResposta.data;
  const unidades = unidadesResposta.data;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Cartao titulo="Minha conta" subtitulo={usuario.user.email}>
        {perfil ? (
          <p className="text-sm">{perfil.nome} · {perfil.status}</p>
        ) : (
          <Aviso tom="aviso">Usuário sem perfil cadastrado na Ora. Peça ao administrador para criar o seu vínculo.</Aviso>
        )}
        <h2 className="mt-4 text-sm font-semibold">Lojas em que você pode entrar</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(unidades ?? []).map((u) => <li key={u.id}>{u.nome} <span className="text-suave">· {u.tipo}</span></li>)}
          {(unidades ?? []).length === 0 && <li className="text-suave">Nenhuma loja vinculada.</li>}
        </ul>
        <form action={sair} className="mt-6"><Botao type="submit" variante="secundario">Sair</Botao></form>
      </Cartao>
    </main>
  );
}

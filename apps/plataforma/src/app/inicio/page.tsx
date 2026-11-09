import { Boxes, Images, KeyRound, LogOut, ShoppingCart, Store, Users, Wallet } from "lucide-react";
import type { Metadata } from "next";

import { Marca } from "../../componentes/Marca";
import { Aviso, Botao, BotaoLink, Cartao } from "../../componentes/ui";
import { horaDoFimDoTurno } from "../../lib/acesso/regras";
import { FalhaDoServico, obterSessao } from "../../lib/acesso/sessao";
import { sair } from "../entrar/acoes";

export const metadata: Metadata = { title: "Início" };
export const dynamic = "force-dynamic";

// Início do sistema real: loja do turno e atalhos conforme a permissão (o banco confere de novo).
export default async function Inicio() {
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: true });
  const [perfil, gereEquipe] = await Promise.all([
    supabase.from("perfis_usuario").select("nome").eq("id", usuario.id).maybeSingle(),
    supabase.rpc("tem_permissao", { p_permissao: "usuarios.gerir" }),
  ]);
  if (perfil.error || gereEquipe.error) throw new FalhaDoServico("inicio");
  const fim = horaDoFimDoTurno(situacao.turno_termina_em);
  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Marca tamanho="text-2xl" />
      <Cartao titulo={`Olá, ${perfil.data?.nome ?? "bem-vindo"}`} subtitulo={fim ? `Turno até ${fim}` : undefined} className="mt-6">
        <p className="flex items-center gap-2 text-sm"><Store aria-hidden className="size-4 text-acao" /> Loja atual: <strong>{situacao.unidade_nome}</strong></p>
        <div className="mt-4 grid gap-2">
          <BotaoLink href="/escolher-loja" variante="secundario"><Store aria-hidden className="size-4" /> Trocar de loja</BotaoLink>
          <BotaoLink href="/vender"><ShoppingCart aria-hidden className="size-4" /> Vender</BotaoLink>
          <BotaoLink href="/caixa" variante="secundario"><Wallet aria-hidden className="size-4" /> Caixa</BotaoLink>
          <BotaoLink href="/estoque" variante="secundario"><Boxes aria-hidden className="size-4" /> Estoque e conferência</BotaoLink>
          <BotaoLink href="/catalogo" variante="secundario"><Images aria-hidden className="size-4" /> Catálogo e fotos</BotaoLink>
          {gereEquipe.data && <BotaoLink href="/equipe" variante="secundario"><Users aria-hidden className="size-4" /> Equipe e acessos</BotaoLink>}
          <BotaoLink href="/conta/senha" variante="secundario"><KeyRound aria-hidden className="size-4" /> Trocar minha senha</BotaoLink>
        </div>
        <Aviso tom="info" className="mt-4">Vendas, estoque e caixa reais entram aqui conforme cada módulo for liberado. A demonstração continua separada, com dados fictícios.</Aviso>
        <form action={sair} className="mt-4"><Botao type="submit" variante="fantasma"><LogOut aria-hidden className="size-4" /> Sair</Botao></form>
      </Cartao>
    </main>
  );
}

import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Marca } from "../../../componentes/Marca";
import { Aviso, Cartao, Selo } from "../../../componentes/ui";
import { celularesCadastrados } from "../../../lib/acesso/segundo-fator";
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { configuracaoSupabase } from "../../../lib/supabase/configuracao";
import { CadastrarCelular, ListaDeCelulares } from "./Celulares";

export const metadata: Metadata = { title: "Segurança da conta" };
export const dynamic = "force-dynamic";

// A verificação em duas etapas de cada pessoa (lote ORG-007a: ORA-ORG-007, "autenticação reforçada para perfis
// privilegiados"): ligar com o aplicativo autenticador do celular, cadastrar um celular de reserva e tirar. Quem liga
// passa a digitar o código depois da senha, e o banco não dá permissão nenhuma à sessão sem o código. Exigir de todo
// dono e administrador é a decisão D-046, num lote seguinte.
export default async function Seguranca() {
  const { supabase, usuario, situacao } = await obterSessao({ exigirLoja: false });
  // O banco exige o código só com a migration do segundo fator (a situação da sessão traz o campo): antes dela, ligar
  // a verificação no Supabase não protegeria nada, e a tela não oferece o cadastro.
  const exigidoPeloBanco = typeof situacao.segundo_fator_pendente === "boolean";
  const fatores = await supabase.auth.mfa.listFactors();
  if (fatores.error) throw new FalhaDoServico("mfa");
  const celulares = celularesCadastrados(fatores.data);
  const configuracao = configuracaoSupabase();
  const ligada = celulares.length > 0;
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <Marca tamanho="text-2xl" />
      <Cartao titulo="Segurança da conta" subtitulo={usuario.email} icone={ShieldCheck} className="mt-6"
        acao={<Selo tom={ligada ? "sucesso" : "neutro"} ponto>{ligada ? "verificação ligada" : "verificação desligada"}</Selo>}>
        <p className="text-sm">Com a <strong>verificação em duas etapas</strong>, depois da senha o sistema pede o código de 6 algarismos do aplicativo autenticador do seu celular. Quem descobrir a sua senha não entra sem o seu celular.</p>
        <p className="mt-2 text-sm text-suave">Recomendada para o dono, o administrador e quem mexe no caixa e no estoque.</p>
        {ligada && configuracao && <ListaDeCelulares supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} celulares={celulares} />}
        {configuracao && exigidoPeloBanco
          ? <CadastrarCelular supabaseUrl={configuracao.url} chavePublica={configuracao.chavePublica} primeiro={!ligada} />
          : <Aviso tom="aviso" className="mt-4">A verificação em duas etapas ainda não está disponível neste ambiente: chega com a atualização do banco.</Aviso>}
        <details className="mt-4 rounded-botao border border-borda px-3 py-2 text-sm">
          <summary className="cursor-pointer font-semibold text-acao">E se eu perder o celular?</summary>
          <p className="mt-2 text-suave">Com um celular de reserva cadastrado, entre com ele e tire o perdido daqui. Sem nenhum, procure o dono: a verificação só sai pela administração do Supabase, fora do sistema. Por isso, cadastre também um celular de reserva.</p>
        </details>
        <p className="mt-4 text-sm"><Link href="/conta" className="font-semibold text-acao hover:underline">Voltar para Minha conta</Link></p>
      </Cartao>
    </main>
  );
}

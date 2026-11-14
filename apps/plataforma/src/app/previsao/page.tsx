import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../componentes/ui";
import { obterSessao } from "../../lib/acesso/sessao";
import { textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { consultarPrevisao } from "../../lib/previsao/consulta";
import { horizonteDoEndereco } from "../../lib/previsao/regras";
import { filtroDoResultado } from "../../lib/resultado/regras";
import { ConteudoPrevisao } from "./ConteudoPrevisao";

export const metadata: Metadata = { title: "Previsão de caixa" };
export const dynamic = "force-dynamic";

type Parametros = { semanas?: ValorDeParametro; loja?: ValorDeParametro };

// Previsão de caixa (lote L8c: ORA-FIN-010), pelas decisões do proprietário de 13/11/2026: só o dono vê;
// a entrada é uma estimativa (a média das últimas 8 semanas), separada dos fatos; o saldo de partida é
// digitado na tela e fica no navegador. O banco devolve só fatos (public.previsao_de_caixa) e recusa quem
// não é o dono; loja que ele recusa cai na rede inteira.
export default async function Previsao({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const semanas = horizonteDoEndereco(textoDoParametro(parametros.semanas));
  let filtro = filtroDoResultado(textoDoParametro(parametros.loja));
  const sessao = await obterSessao({ exigirLoja: true });
  let leitura = await consultarPrevisao(sessao.supabase, semanas, filtro.tipo === "loja" ? filtro.id : null);
  if (leitura.estado === "recusado" && filtro.tipo === "loja") {
    filtro = { tipo: "rede" };
    leitura = await consultarPrevisao(sessao.supabase, semanas, null);
  }
  if (leitura.estado === "recusado") {
    return (
      <MoldeReal sessao={sessao}>
        <Aviso tom="aviso" className="mt-6" titulo="A previsão de caixa é só do dono">
          Decisão do proprietário: a previsão junta as contas a pagar e as vendas de todas as lojas.
        </Aviso>
      </MoldeReal>
    );
  }
  const lojas = leitura.estado === "ok" ? leitura.dados.lojas : [];
  const onde = filtro.tipo === "rede" ? "Rede inteira" : (lojas.find((l) => l.id === filtro.id)?.nome ?? "Loja");

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <TituloPagina
        sobretitulo={onde}
        titulo="Previsão de caixa"
        subtitulo="O que vence e o que deve entrar nas próximas semanas. As contas são fatos; a entrada é uma estimativa, que você simula para mais ou para menos."
      />
      <ConteudoPrevisao leitura={leitura} semanas={semanas} filtro={filtro} />
    </MoldeReal>
  );
}

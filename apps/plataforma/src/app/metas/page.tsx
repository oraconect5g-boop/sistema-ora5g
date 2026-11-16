import type { Metadata } from "next";

import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, FiltroSegmentado, TituloPagina } from "../../componentes/ui";
import { podeVerMetas } from "../../lib/acesso/menu";
import { obterSessao } from "../../lib/acesso/sessao";
import { consultarBonus, consultarFechamento } from "../../lib/bonus/consulta";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { consultarVendas, lojasQueVendem } from "../../lib/inicio/consulta";
import { endereco } from "../../lib/inicio/painel";
import { consultarEquipe, consultarMetas } from "../../lib/metas/consulta";
import {
  ehMedida, ERROS_DAS_METAS, faseDoMes, janelaDoMes, mesDeHoje, mesDoEndereco, nomeDoMes, OK_DAS_METAS, opcoesDeMes, ORDEM_DAS_MEDIDAS, type Medida,
} from "../../lib/metas/painel";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { BonusDaEquipe, MeuBonus } from "./ConteudoBonus";
import { MetasDaGestao, MinhasMetas } from "./ConteudoMetas";

export const metadata: Metadata = { title: "Metas e desempenho" };
export const dynamic = "force-dynamic";

type Parametros = { mes?: ValorDeParametro; loja?: ValorDeParametro; medida?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; alvo?: ValorDeParametro };

// Metas mensais (lote G4b; decisão do proprietário de 13/11/2026): a meta é do mês, com o ritmo
// esperado do dia; contam o valor vendido líquido, os aparelhos, os acessórios e o Ora Connect
// confirmado; têm meta a loja e cada vendedor. O dono define em todas as lojas e o gerente, na dele
// (metas.gerir); o gerente acompanha a loja (metas.ver_unidade) e o vendedor, as próprias
// (metas.ver_propria). Tudo somado no banco, com as regras de leitura de quem pede. Desde o L9a, o
// bônus por meta (decisão do proprietário de 13/11/2026, D-014): as faixas do dono e o bônus
// provisório de cada vendedor (a gestão) ou o próprio (o vendedor), com o extrato venda a venda.
export default async function Metas({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario, situacao: situacaoDaSessao } = sessao;
  const turno: LojaDoFiltro = { id: situacaoDaSessao.unidade_id as string, nome: situacaoDaSessao.unidade_nome ?? "Loja do turno" };
  const { permissoes } = sessao.molde;
  if (!podeVerMetas(permissoes)) {
    return (
      <MoldeReal sessao={sessao}>
        <TituloPagina titulo="Metas e desempenho" />
        <Aviso tom="aviso" titulo="Sem permissão">
          As metas são do dono, da gerência e de cada vendedor (as próprias). O banco também recusa, mesmo que alguém digite o endereço.
        </Aviso>
      </MoldeReal>
    );
  }

  const gestao = permissoes.has("metas.gerir") || permissoes.has("metas.ver_unidade");
  const agora = new Date();
  const hoje = mesDeHoje(agora);
  const mes = mesDoEndereco(textoDoParametro(parametros.mes), agora) ?? hoje;
  const fase = faseDoMes(mes, agora);
  // Quem vê a rede (o dono) escolhe a loja; os demais ficam na do turno. O banco confere de novo.
  const cadastro = gestao && permissoes.has("venda.ver_todas") ? await lojasQueVendem(supabase, "metas") : null;
  const pedida = textoDoParametro(parametros.loja);
  const loja = cadastro?.find((l) => l.id === pedida) ?? turno;
  const lojaNoEndereco = loja.id === turno.id ? null : loja.id;
  const medidaPedida = textoDoParametro(parametros.medida);
  const medida: Medida = ehMedida(medidaPedida) ? medidaPedida : "vendido_liquido";
  const mesNoEndereco = mes === hoje ? null : mes.slice(0, 7);
  // Endereço com os filtros; o padrão (este mês, a loja do turno, o vendido líquido) fica fora.
  const enderecoDe = (valores: { mes?: string | null; loja?: string | null; medida?: Medida }) => {
    const m = valores.medida ?? medida;
    return endereco("/metas", {
      mes: valores.mes === undefined ? mesNoEndereco : valores.mes,
      loja: valores.loja === undefined ? lojaNoEndereco : valores.loja,
      medida: m === "vendido_liquido" ? null : m,
    });
  };
  const aqui = enderecoDe({});

  const janela = gestao ? null : janelaDoMes(mes, agora);
  const [metas, equipe, ondeVendi, bonus, fechamento] = await Promise.all([
    consultarMetas(supabase, mes, loja.id),
    gestao ? consultarEquipe(supabase, mes, loja.id) : Promise.resolve(null),
    janela ? consultarVendas(supabase, janela, { unidade: null, vendedor: usuario.id }, false) : Promise.resolve(null),
    consultarBonus(supabase, mes, loja.id),
    // O fechamento (L9b) só existe para o mês que terminou: a gestão lê o da loja; o vendedor, a própria linha.
    fase === "passado" ? consultarFechamento(supabase, mes, loja.id, gestao ? undefined : usuario.id) : Promise.resolve(null),
  ]);
  // O extrato do vendedor (L9a): o mês e a loja escolhidos vão junto; o próprio vendedor não precisa dizer quem é.
  const enderecoDoExtrato = (vendedor: string | null) => endereco("/metas/extrato", { mes: mesNoEndereco, loja: lojaNoEndereco, vendedor });
  // O fechamento (L9b) é de quem confere ou aprova: no mês que terminou, o dele; nos outros, o do mês passado.
  const enderecoDoFechamento = permissoes.has("bonus.conferir") || permissoes.has("bonus.aprovar")
    ? endereco("/metas/fechamento", { mes: fase === "passado" ? mes.slice(0, 7) : null, loja: lojaNoEndereco }) : null;
  const ok = chaveDoCatalogo(OK_DAS_METAS, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DAS_METAS, parametros.erro);
  const alvo = textoDoParametro(parametros.alvo) ?? null;

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <TituloPagina
        sobretitulo={loja.nome}
        titulo={gestao ? "Metas e desempenho" : "Minhas metas"}
        subtitulo={gestao
          ? `As metas de ${nomeDoMes(mes)} da loja e de cada vendedor, com o ritmo esperado do dia e o realizado somado no banco.`
          : `As suas metas de ${nomeDoMes(mes)} nesta loja, com o ritmo esperado do dia. Só você e a gerência veem os seus números.`}
      />
      <div className="mb-4 flex flex-col gap-3">
        <FiltroSegmentado rotulo="Mês" opcoes={opcoesDeMes(mes, agora).map((o) => ({ href: enderecoDe({ mes: o.mes === hoje ? null : o.mes.slice(0, 7) }), rotulo: o.rotulo, ativo: o.mes === mes }))} />
        {cadastro && cadastro.length > 1 && (
          <FiltroSegmentado
            rotulo="Loja"
            opcoes={[turno, ...cadastro.filter((l) => l.id !== turno.id)].map((l) => ({ href: enderecoDe({ loja: l.id === turno.id ? null : l.id }), rotulo: l.nome, ativo: l.id === loja.id }))}
          />
        )}
      </div>
      {ok && <Aviso tom="sucesso" className="mb-4">{OK_DAS_METAS[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mb-4">{ERROS_DAS_METAS[erro]}</Aviso>}

      {gestao && equipe ? (
        <MetasDaGestao
          metas={metas} equipe={equipe} mes={mes} fase={fase} loja={loja} aqui={aqui} medida={medida}
          enderecoDaMedida={Object.fromEntries(ORDEM_DAS_MEDIDAS.map((m) => [m, `${enderecoDe({ medida: m })}#por-vendedor`])) as Record<Medida, string>}
          podeDefinir={permissoes.has("metas.gerir")} lojaNoEndereco={lojaNoEndereco} alvoEmFoco={erro ? alvo : null}
          bonus={(
            <BonusDaEquipe
              bonus={bonus} pessoas={equipe.estado === "ok" ? equipe.dados : []} mes={mes} fase={fase} aqui={aqui}
              enderecoDoExtrato={enderecoDoExtrato} podeDefinir={permissoes.has("bonus.definir")}
              enderecoDoFechamento={enderecoDoFechamento}
              fechamento={fechamento && {
                leitura: fechamento, endereco: endereco("/metas/fechamento", { mes: mes.slice(0, 7), loja: lojaNoEndereco }),
                podeConferir: permissoes.has("bonus.conferir"), podeAprovar: permissoes.has("bonus.aprovar"),
              }}
            />
          )}
        />
      ) : (
        <MinhasMetas
          metas={metas} mes={mes} fase={fase} loja={loja} aqui={aqui} eu={usuario.id} ondeVendi={ondeVendi}
          bonus={<MeuBonus bonus={bonus} eu={usuario.id} mes={mes} fase={fase} aqui={aqui} enderecoDoExtrato={enderecoDoExtrato(null)} fechamento={fechamento} />}
        />
      )}
    </MoldeReal>
  );
}

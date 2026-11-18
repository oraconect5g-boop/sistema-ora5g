import type { Metadata } from "next";

import { BaixarPlanilha } from "../../componentes/BaixarPlanilha";
import { BotaoImprimir, CarimboDaImpressao } from "../../componentes/BotaoImprimir";
import { MoldeReal } from "../../componentes/MoldeReal";
import { Aviso, TituloPagina } from "../../componentes/ui";
import { permite } from "../../lib/acesso/molde";
import { obterSessao } from "../../lib/acesso/sessao";
import { consultarCategorias, consultarContas, consultarFornecedores, consultarResumo, type ResumoDasContas } from "../../lib/contas-a-pagar/consulta";
import { lerDocumentos } from "../../lib/contas-a-pagar/documentos";
import { lerEntradaParaLancar, lerLigacoes } from "../../lib/contas-a-pagar/entradas";
import {
  ERROS_DAS_CONTAS, filtroDasContas, filtroNoEndereco, hojeEmSaoPaulo, OK_DAS_CONTAS, VISOES_DAS_CONTAS, visaoDasContas, type FiltroDasContas,
} from "../../lib/contas-a-pagar/regras";
import { geradoEm } from "../../lib/csv";
import type { Leitura } from "../../lib/leitura-do-banco";
import { chaveDoCatalogo, textoDoParametro, type ValorDeParametro } from "../../lib/parametros";
import { ConteudoContas } from "./ConteudoContas";

export const metadata: Metadata = { title: "Contas a pagar" };
export const dynamic = "force-dynamic";

type Parametros = { ver?: ValorDeParametro; loja?: ValorDeParametro; ok?: ValorDeParametro; erro?: ValorDeParametro; entrada?: ValorDeParametro };

// Contas a pagar da empresa (lote L8a: ORA-FIN-004), pelas decisões do proprietário de 13/11/2026: o dono
// lança e paga as contas da rede e de todas as lojas; o gerente, as da loja dele (conta_pagar.gerir).
// Categorias com a lista inicial que o dono ajusta; conta parcelada e conta que se repete todo mês. O
// sistema registra a conta e o pagamento feito no banco; não paga nada sozinho. Tudo passa pelas funções
// do banco, e os números são somados lá, com as regras de leitura de quem pede.
export default async function ContasAPagar({ searchParams }: { searchParams: Promise<Parametros> }) {
  const parametros = await searchParams;
  const ok = chaveDoCatalogo(OK_DAS_CONTAS, parametros.ok);
  const erro = chaveDoCatalogo(ERROS_DAS_CONTAS, parametros.erro);
  const visao = visaoDasContas(textoDoParametro(parametros.ver));
  const hoje = hojeEmSaoPaulo();
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, situacao } = sessao;
  const lojaDoTurno = { id: situacao.unidade_id as string, nome: situacao.unidade_nome ?? "Loja do turno" };
  const pode = permite(sessao, "conta_pagar.gerir");
  if (!pode) return <MoldeReal sessao={sessao}><Aviso tom="aviso" className="mt-6">As contas a pagar são do dono e da gerência da loja.</Aviso></MoldeReal>;

  // O filtro do endereço vale se o banco aceitar (a loja está no escopo de quem pede); senão, tudo o que a pessoa lê.
  let filtro: FiltroDasContas = filtroDasContas(textoDoParametro(parametros.loja));
  let primeiro = await consultarResumo(supabase, filtro);
  if (primeiro.estado === "recusado") {
    filtro = { tipo: "todas" };
    primeiro = await consultarResumo(supabase, filtro);
  }
  const resumo: Leitura<ResumoDasContas> = primeiro.estado === "recusado" ? { estado: "falha" } : primeiro;
  const entradaPedida = textoDoParametro(parametros.entrada);
  const [lista, categorias, fornecedores, entradaParaLancar] = await Promise.all([
    consultarContas(supabase, visao, filtro, hoje), consultarCategorias(supabase), consultarFornecedores(supabase),
    // FIN-004a: "Lançar a conta" a partir da entrada de mercadoria: o formulário já vem preenchido com ela.
    entradaPedida ? lerEntradaParaLancar(supabase, entradaPedida) : Promise.resolve(null),
  ]);
  // FIN-004a: a entrada de cada conta da lista e as compras recentes que ainda podem ser ligadas; FIN-004b: os documentos
  // de cada conta. Lidos à parte: sem a coluna ou a tabela, o bloco some.
  const idsDaLista = lista.estado === "ok" ? lista.dados.contas.map((c) => c.id) : null;
  const [ligacoes, documentos] = idsDaLista ? await Promise.all([lerLigacoes(supabase, idsDaLista), lerDocumentos(supabase, idsDaLista)]) : [null, null];
  const escopo = resumo.estado === "ok" ? resumo.dados.escopo : null;
  const onde = filtro.tipo === "rede" ? "Rede (central)" : filtro.tipo === "loja" ? (escopo?.lojas.find((l) => l.id === filtro.id)?.nome ?? lojaDoTurno.nome)
    : escopo?.rede ? "Rede e todas as lojas" : lojaDoTurno.nome;
  const loja = filtroNoEndereco(filtro);
  const planilha = `/contas-a-pagar/exportar?${new URLSearchParams({ ver: visao, ...(loja ? { loja } : {}) })}`;

  return (
    <MoldeReal sessao={sessao} largura="max-w-6xl">
      <TituloPagina
        sobretitulo={onde}
        titulo="Contas a pagar"
        subtitulo="O que a empresa tem a pagar, pelo vencimento: aluguel, luz, fornecedores. O sistema registra a conta e o pagamento feito no banco; não paga nada sozinho."
        acao={resumo.estado === "ok" ? (
          <div className="nao-imprimir flex flex-wrap gap-2">
            <BaixarPlanilha endereco={planilha} rotulo="Baixar planilha" />
            <BotaoImprimir />
          </div>
        ) : undefined}
      />
      <CarimboDaImpressao texto={`Ora 5G · contas a pagar (${VISOES_DAS_CONTAS[visao].toLowerCase()}) · ${onde} · impresso em ${geradoEm()}`} />
      {ok && <Aviso tom="sucesso" className="mt-4">{OK_DAS_CONTAS[ok]}</Aviso>}
      {erro && <Aviso tom="perigo" className="mt-4">{ERROS_DAS_CONTAS[erro]}</Aviso>}
      <ConteudoContas
        resumo={resumo} lista={lista} categorias={categorias} fornecedores={fornecedores} visao={visao} filtro={filtro} hoje={hoje} lojaDoTurno={lojaDoTurno}
        ligacoes={ligacoes} entradaParaLancar={entradaParaLancar} documentos={documentos}
      />
    </MoldeReal>
  );
}

import { Headphones, Pencil, Signal, Smartphone, Store, Target, TrendingUp, type LucideIcon } from "lucide-react";

import { BarrasHorizontais, Medidor, TabelaDoGrafico } from "../../componentes/graficos";
import { EstadoDoPainel, NOTA, NUMERO_PRINCIPAL, PainelDasLojas } from "../../componentes/paineis-de-vendas";
import { Aviso, Avatar, Cartao, Celula, classeBotao, EstadoVazio, FiltroSegmentado, Indicador, ListaDados, Selo, Tabela } from "../../componentes/ui";
import type { LojaDoFiltro } from "../../lib/financeiro/escopo";
import { brlCompacto, numero, percentual } from "../../lib/formato";
import type { VendasDoBanco } from "../../lib/inicio/painel";
import type { Leitura } from "../../lib/leitura-do-banco";
import {
  comUnidade, formatarMedida, linhasDaEquipe, MEDIDAS, nomeDoMes, ordemNoGrafico, ORDEM_DAS_MEDIDAS, progressoDoAlvo, REALIZADO_ZERO, resumoDasMetas,
  SITUACOES, valorNoCampo, type FaseDoMes, type LinhaDaEquipe, type Medida, type MetasDoAlvo, type MetasDoBanco, type PessoaDasMetas, type Progresso,
} from "../../lib/metas/painel";
import { definirMetas } from "./acoes";

// Metas mensais (lote G4b). Só apresentação: os números chegam lidos por lib/metas/consulta, com o
// estado da leitura (falha nunca vira zero). A gestão vê a loja e cada vendedor e, com metas.gerir,
// define; o vendedor vê as próprias metas e onde vendeu. O banco decide o que cada um recebe.

const ICONES: Record<Medida, LucideIcon> = { vendido_liquido: TrendingUp, aparelhos: Smartphone, acessorios: Headphones, connect: Signal };
const TOM_DO_INDICADOR = { sem_meta: "neutro", nao_comecou: "neutro", batida: "bom", no_ritmo: "bom", abaixo: "atencao", nao_batida: "ruim" } as const;
// O medidor segue a situação do ritmo, não um corte fixo de percentual.
const TOM_DO_MEDIDOR = { sem_meta: "neutro", nao_comecou: "neutro", batida: "sucesso", no_ritmo: "marca", abaixo: "aviso", nao_batida: "aviso" } as const;
const campo = "mt-1 min-h-11 w-full rounded-botao border border-borda bg-white px-3 text-sm outline-none focus:border-acao focus:ring-2 focus:ring-acao/20";
const rotulo = "block text-sm font-medium";

/** Valor curto para indicador e gráfico estreito: "R$ 85,2 mil", "47". O valor cheio fica nas tabelas. */
const compacto = (medida: Medida, valor: number) => (MEDIDAS[medida].dinheiro ? brlCompacto(valor) : numero(valor));
/** "42% de R$ 50 mil · No ritmo", ou "Meta não definida". */
function resumoDoProgresso(p: Progresso): string {
  if (p.meta === null) return SITUACOES.sem_meta.rotulo;
  return `${percentual(p.atingido ?? 0)} de ${compacto(p.medida, p.meta)} · ${SITUACOES[p.situacao].rotulo}`;
}
/** O que falta, em uma frase; nada sem meta. */
function oQueFalta(p: Progresso, fase: FaseDoMes): string | null {
  if (p.meta === null || p.falta === null) return null;
  if (p.falta === 0) return "Meta batida";
  if (fase === "passado") return `Faltaram ${comUnidade(p.medida, p.falta)}`;
  const dias = `${p.restam} ${p.restam === 1 ? "dia" : "dias"}${fase === "atual" ? ", contando hoje" : ""}`;
  return `Faltam ${comUnidade(p.medida, p.falta)}${p.porDia !== null ? ` · ${comUnidade(p.medida, p.porDia)} por dia (${dias})` : ""}`;
}

type Comum = {
  metas: Leitura<MetasDoBanco>;
  mes: string;
  fase: FaseDoMes;
  loja: LojaDoFiltro;
  /** Endereço desta tela, para tentar de novo. */
  aqui: string;
};

// ---------------------------------------------------------------------------------------------
// Gestão: a loja, cada vendedor e o formulário
// ---------------------------------------------------------------------------------------------
export function MetasDaGestao({ metas, equipe, mes, fase, loja, aqui, medida, enderecoDaMedida, podeDefinir, lojaNoEndereco, alvoEmFoco }: Comum & {
  equipe: Leitura<PessoaDasMetas[]>;
  medida: Medida;
  enderecoDaMedida: Record<Medida, string>;
  podeDefinir: boolean;
  /** A loja escolhida, quando não é a do turno (vai no formulário, para voltar ao mesmo lugar). */
  lojaNoEndereco: string | null;
  /** O alvo do formulário que voltou com erro: abre aberto. */
  alvoEmFoco: string | null;
}) {
  if (metas.estado !== "ok") {
    return <Cartao titulo={`Metas de ${nomeDoMes(mes)}`}><EstadoDoPainel estado={metas.estado} fonte="metas" tentarDeNovo={aqui} /></Cartao>;
  }
  const dados = metas.dados;
  const linhas = equipe.estado === "ok" ? linhasDaEquipe(dados, equipe.dados, fase) : null;
  return (
    <>
      <ResumoDaLoja dados={dados} fase={fase} />
      {linhas === null ? (
        <Cartao className="mt-4" titulo="Equipe no mês"><EstadoDoPainel estado={equipe.estado as "indisponivel" | "falha"} fonte="metas" tentarDeNovo={aqui} /></Cartao>
      ) : (
        <>
          <PorVendedor linhas={linhas} medida={medida} enderecoDaMedida={enderecoDaMedida} mes={mes} />
          <EquipeNoMes linhas={linhas} mes={mes} />
          {podeDefinir && (
            <DefinirMetas dados={dados} linhas={linhas} mes={mes} fase={fase} loja={loja} lojaNoEndereco={lojaNoEndereco} alvoEmFoco={alvoEmFoco} />
          )}
        </>
      )}
      <ComoConta />
    </>
  );
}

function ResumoDaLoja({ dados, fase }: { dados: MetasDoBanco; fase: FaseDoMes }) {
  if (!dados.loja) {
    return (
      <Aviso tom="neutro" titulo="O número da loja inteira fica fechado">
        O realizado da loja só aparece para quem vê as vendas da loja. As linhas de cada vendedor continuam abaixo.
      </Aviso>
    );
  }
  const lista = progressoDoAlvo(dados.loja, dados, fase);
  const comMeta = lista.filter((p) => p.meta !== null);
  const subtitulo = fase === "atual"
    ? `Barra: quanto de cada meta já foi feito. Traço: o ritmo esperado até hoje (${dados.diasDecorridos} de ${dados.diasNoMes} dias).`
    : fase === "passado" ? "Barra: quanto de cada meta foi feito no mês. Traço: a meta inteira." : "O mês ainda não começou: aqui ficam as metas já definidas.";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {lista.map((p) => (
          <Indicador key={p.medida} rotulo={MEDIDAS[p.medida].nome} icone={ICONES[p.medida]} valor={compacto(p.medida, p.realizado)} detalhe={resumoDoProgresso(p)} tom={TOM_DO_INDICADOR[p.situacao]} />
        ))}
      </div>
      <Cartao className="mt-4" titulo={`Ritmo da loja em ${nomeDoMes(dados.mes)}`} subtitulo={subtitulo} icone={Target}>
        {comMeta.length === 0 ? (
          <EstadoVazio titulo="Nenhuma meta da loja inteira para este mês" icone={Target}>
            A leitura está funcionando; só não há meta da loja definida. Sem meta, aparece &quot;meta não definida&quot;, nunca zero.
          </EstadoVazio>
        ) : fase === "futuro" ? (
          <ListaDados itens={comMeta.map((p) => [MEDIDAS[p.medida].nome, formatarMedida(p.medida, p.meta ?? 0)] as const)} />
        ) : (
          <>
            <BarrasHorizontais
              nomeSerie="Atingido" nomeMeta={fase === "atual" ? "Ritmo esperado hoje" : "Meta"} formatar={(v) => percentual(v / 100)}
              maximo={Math.max(100, ...comMeta.map((p) => (p.atingido ?? 0) * 100))}
              dados={comMeta.map((p) => ({
                rotulo: MEDIDAS[p.medida].curto, valor: (p.atingido ?? 0) * 100, meta: ((p.esperado ?? 0) / (p.meta ?? 1)) * 100,
                // No celular o detalhe some (os indicadores acima e a tabela têm os valores); o rótulo não corta.
                detalhe: <span className="hidden sm:inline">{`${compacto(p.medida, p.realizado)} de ${compacto(p.medida, p.meta ?? 0)}`}</span>,
              }))}
            />
            <TabelaDoGrafico
              colunas={["Medida", "Realizado", "Meta", "Atingido", fase === "atual" ? "Esperado até hoje" : "Esperado", "Situação"]}
              linhas={comMeta.map((p) => [
                MEDIDAS[p.medida].nome, formatarMedida(p.medida, p.realizado), formatarMedida(p.medida, p.meta ?? 0), percentual(p.atingido ?? 0),
                formatarMedida(p.medida, p.esperado ?? 0), SITUACOES[p.situacao].rotulo,
              ])}
            />
          </>
        )}
      </Cartao>
    </>
  );
}

function PorVendedor({ linhas, medida, enderecoDaMedida, mes }: { linhas: readonly LinhaDaEquipe[]; medida: Medida; enderecoDaMedida: Record<Medida, string>; mes: string }) {
  const grafico = ordemNoGrafico(linhas, medida);
  return (
    <Cartao id="por-vendedor" className="mt-4" titulo={`${MEDIDAS[medida].nome} por vendedor`} subtitulo={`Barra: o realizado de cada um em ${nomeDoMes(mes)}. Traço: a meta de cada um.`} icone={ICONES[medida]}>
      <FiltroSegmentado rotulo="Medida" opcoes={ORDEM_DAS_MEDIDAS.map((m) => ({ href: enderecoDaMedida[m], rotulo: MEDIDAS[m].curto, ativo: m === medida }))} />
      <div className="mt-4">
        {grafico.length === 0 ? (
          <EstadoVazio titulo="Ninguém com meta ou realizado nesta medida" icone={ICONES[medida]}>A leitura está funcionando; ninguém da loja tem meta nem fato nesta medida no mês.</EstadoVazio>
        ) : (
          <>
            <BarrasHorizontais
              nomeSerie={MEDIDAS[medida].curto} formatar={(v) => formatarMedida(medida, v)}
              dados={grafico.map((x) => ({
                rotulo: x.pessoa.nome, valor: x.progresso.realizado, meta: x.progresso.meta ?? undefined,
                detalhe: x.progresso.atingido !== null ? percentual(x.progresso.atingido) : "sem meta",
              }))}
            />
            <TabelaDoGrafico
              colunas={["Vendedor", "Realizado", "Meta", "Atingido", "Situação"]}
              linhas={grafico.map((x) => [
                x.pessoa.nome, formatarMedida(medida, x.progresso.realizado), x.progresso.meta !== null ? formatarMedida(medida, x.progresso.meta) : "—",
                x.progresso.atingido !== null ? percentual(x.progresso.atingido) : "—", SITUACOES[x.progresso.situacao].rotulo,
              ])}
            />
          </>
        )}
      </div>
    </Cartao>
  );
}

function EquipeNoMes({ linhas, mes }: { linhas: readonly LinhaDaEquipe[]; mes: string }) {
  return (
    <Cartao className="mt-4" titulo="Equipe no mês" subtitulo="O realizado de cada um nas quatro medidas, com a meta e quanto dela já foi feito" corpo="px-4 pb-2 pt-3 sm:px-5">
      {linhas.length === 0 ? (
        <EstadoVazio titulo="Ninguém na equipe da loja" icone={Store}>Quem vende na loja aparece aqui, mesmo antes da primeira venda do mês.</EstadoVazio>
      ) : (
        <Tabela colunas={["Vendedor", ...ORDEM_DAS_MEDIDAS.map((m) => MEDIDAS[m].curto)]} legenda={`Metas e realizado da equipe em ${nomeDoMes(mes)}`} minimo="min-w-[46rem]">
          {linhas.map((l) => (
            <tr key={l.pessoa.id}>
              <Celula>
                <span className="flex items-center gap-2.5">
                  <Avatar nome={l.pessoa.nome} tamanho="size-8 text-xs" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{l.pessoa.nome}</span>
                    {!l.pessoa.naEquipe && <span className="block text-xs text-suave">fora da equipe atual</span>}
                  </span>
                </span>
              </Celula>
              {l.progresso.map((p) => (
                <Celula key={p.medida} className="numeros">
                  <span className="block whitespace-nowrap font-semibold">{formatarMedida(p.medida, p.realizado)}</span>
                  <span className="block whitespace-nowrap text-xs text-suave">{p.meta !== null ? `de ${formatarMedida(p.medida, p.meta)} · ${percentual(p.atingido ?? 0)}` : "sem meta"}</span>
                </Celula>
              ))}
            </tr>
          ))}
        </Tabela>
      )}
    </Cartao>
  );
}

function DefinirMetas({ dados, linhas, mes, fase, loja, lojaNoEndereco, alvoEmFoco }: {
  dados: MetasDoBanco; linhas: readonly LinhaDaEquipe[]; mes: string; fase: FaseDoMes; loja: LojaDoFiltro; lojaNoEndereco: string | null; alvoEmFoco: string | null;
}) {
  const cartao = { id: "definir", className: "mt-4", titulo: `Definir as metas de ${nomeDoMes(mes)}`, subtitulo: "O dono define em todas as lojas; o gerente, na loja dele. Deixe vazio para ficar sem meta. Mudar ou retirar pede o motivo, que fica no histórico." };
  if (fase === "passado") {
    return <Cartao {...cartao}><Aviso tom="neutro" titulo="O mês que já terminou não muda">As metas ficam como valiam no mês. Para planejar, escolha este mês ou o próximo.</Aviso></Cartao>;
  }
  // A meta da loja inteira só é editável quando a leitura trouxe a loja: campo vazio por falta de
  // leitura viraria "retirar".
  const alvos: { alvo: string; nome: string; metas: MetasDoAlvo; naEquipe: boolean }[] = [
    ...(dados.loja ? [{ alvo: "loja", nome: `Loja inteira (${loja.nome})`, metas: dados.loja.metas, naEquipe: true }] : []),
    ...linhas.filter((l) => l.pessoa.naEquipe || Object.keys(l.metas).length > 0).map((l) => ({ alvo: l.pessoa.id, nome: l.pessoa.nome, metas: l.metas, naEquipe: l.pessoa.naEquipe })),
  ];
  return (
    <Cartao {...cartao}>
      <div className="grid gap-2">
        {alvos.map((a) => (
          <details key={a.alvo} className="rounded-xl border border-borda px-3 py-1" open={alvoEmFoco === a.alvo}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-1 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{a.nome}</span>
                <span className="block text-suave">{resumoDasMetas(a.metas)}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-acao"><Pencil aria-hidden className="size-4" /> Editar</span>
            </summary>
            {!a.naEquipe && <p className={`mt-1 ${NOTA}`}>Fora da equipe atual da loja: dá para retirar a meta, não para dar meta nova.</p>}
            <form action={definirMetas} className="mt-2 grid gap-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
              <input type="hidden" name="unidade" value={loja.id} />
              <input type="hidden" name="alvo" value={a.alvo} />
              <input type="hidden" name="mes" value={mes} />
              {lojaNoEndereco && <input type="hidden" name="loja" value={lojaNoEndereco} />}
              {ORDEM_DAS_MEDIDAS.map((m) => (
                <label key={m} className={rotulo}>
                  {MEDIDAS[m].campo}
                  <input
                    name={`meta_${m}`} defaultValue={valorNoCampo(m, a.metas[m])} inputMode={MEDIDAS[m].dinheiro ? "decimal" : "numeric"}
                    placeholder={MEDIDAS[m].dinheiro ? "Ex.: 50.000,00" : "Ex.: 20"} autoComplete="off" className={campo}
                  />
                </label>
              ))}
              <label className={`${rotulo} sm:col-span-2 lg:col-span-3`}>
                Motivo (para mudar ou retirar)
                <input name="motivo" maxLength={300} placeholder="Ex.: campanha de fim de ano" autoComplete="off" className={campo} />
              </label>
              <div className="flex items-end">
                <button type="submit" className={classeBotao("primario", "md", "w-full")}>Salvar</button>
              </div>
            </form>
          </details>
        ))}
      </div>
    </Cartao>
  );
}

function ComoConta() {
  return (
    <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
      <Cartao titulo="Como cada medida conta" subtitulo="Regra de contagem 1, igual para a loja e para cada vendedor; cada fato no mês dele (horário de São Paulo)">
        <ul className="space-y-2 text-sm">
          {ORDEM_DAS_MEDIDAS.map((m) => (
            <li key={m}><span className="font-semibold">{MEDIDAS[m].nome}:</span> <span className="text-suave">{MEDIDAS[m].conta}</span></li>
          ))}
        </ul>
      </Cartao>
      <Aviso titulo="Comissão e bônus em definição">
        As regras de comissão e de bonificação ainda serão decididas pelos donos (decisão pendente D-014). Até lá, a meta mostra o ritmo e o atingimento, sem valor a receber.
      </Aviso>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Vendedor: as próprias metas e onde vendeu
// ---------------------------------------------------------------------------------------------
export function MinhasMetas({ metas, mes, fase, loja, aqui, eu, ondeVendi }: Comum & {
  eu: string;
  /** As próprias vendas do mês, por loja; nula no mês que ainda não começou. */
  ondeVendi: Leitura<VendasDoBanco> | null;
}) {
  return (
    <>
      {metas.estado !== "ok" ? (
        <Cartao titulo={`Metas de ${nomeDoMes(mes)}`}><EstadoDoPainel estado={metas.estado} fonte="metas" tentarDeNovo={aqui} /></Cartao>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {progressoDoAlvo(metas.dados.vendedores.find((v) => v.vendedorId === eu) ?? { metas: {}, realizado: REALIZADO_ZERO }, metas.dados, fase).map((p) => (
            <MinhaMeta key={p.medida} p={p} fase={fase} dados={metas.dados} />
          ))}
        </div>
      )}
      <div className="mt-4">
        {ondeVendi === null ? (
          <Cartao titulo="Onde vendi" subtitulo="As suas vendas, por loja em que foram feitas">
            <EstadoVazio titulo="O mês ainda não começou" icone={Store}>Quando o mês começar, as suas vendas aparecem aqui, por loja.</EstadoVazio>
          </Cartao>
        ) : (
          <PainelDasLojas vendas={ondeVendi} cadastro={[]} turno={loja} aqui={aqui} enderecoDaLoja={() => aqui} doVendedor />
        )}
      </div>
      <Aviso className="mt-4" titulo={`As metas são por loja: estas são da ${loja.nome}`}>
        Se você vende em mais de uma loja, troque a loja do turno para ver as metas de lá. As vendas de todas as lojas aparecem em &quot;Onde vendi&quot;.
      </Aviso>
      <ComoConta />
    </>
  );
}

function MinhaMeta({ p, fase, dados }: { p: Progresso; fase: FaseDoMes; dados: MetasDoBanco }) {
  const situacao = SITUACOES[p.situacao];
  const falta = oQueFalta(p, fase);
  return (
    <Cartao titulo={MEDIDAS[p.medida].nome} icone={ICONES[p.medida]} acao={<Selo tom={situacao.tom} ponto>{situacao.rotulo}</Selo>}>
      {p.meta === null ? (
        <>
          <p className={NUMERO_PRINCIPAL}>{formatarMedida(p.medida, p.realizado)}</p>
          <p className={NOTA}>no mês · nenhuma meta definida para você nesta medida</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          <Medidor percentual={(p.atingido ?? 0) * 100} rotulo={MEDIDAS[p.medida].nome} detalhe="atingido" tom={TOM_DO_MEDIDOR[p.situacao]} />
          <div className="min-w-0 flex-[1_1_11rem] text-sm">
            <p className="numeros text-2xl font-bold tracking-tight">{formatarMedida(p.medida, p.realizado)}</p>
            <p className="text-suave">de {formatarMedida(p.medida, p.meta)}</p>
            {fase === "atual" && (
              <p className="mt-2">Esperado até hoje: <strong className="numeros">{formatarMedida(p.medida, p.esperado ?? 0)}</strong> {`(${dados.diasDecorridos} de ${dados.diasNoMes} dias)`}</p>
            )}
            {falta && <p className="mt-1 font-medium">{falta}</p>}
          </div>
        </div>
      )}
    </Cartao>
  );
}

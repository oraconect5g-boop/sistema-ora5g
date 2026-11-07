import { mascararIdentificador } from "@ora5g/dominio";
import { ArrowRightLeft, ClipboardCheck, History, Package, PackageCheck, Truck } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { BarrasHorizontais, TabelaDoGrafico } from "../../../componentes/graficos";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Celula, EstadoVazio, FiltroSegmentado, FormBusca, Indicador, Progresso, Selo, Tabela, TituloPagina, type Tom } from "../../../componentes/ui";
import { disponibilidadeEmOutrasLojas, estoqueVisivel, lojasVisiveis } from "../../../demo/consultas";
import { movimentosDoImei, nomeDaLoja, nomeDoProduto, PRODUTOS, SALDOS_ACESSORIOS, TRANSFERENCIAS, VENDAVEL, type SituacaoUnidade } from "../../../demo/dados";
import { podeVerCusto, REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl, numero } from "../../../lib/formato";

export const metadata: Metadata = { title: "Estoque e IMEI" };

const TOM: Record<SituacaoUnidade, Tom> = { Disponível: "sucesso", Conferido: "sucesso", Reservado: "aviso", Vendido: "neutro", "Em trânsito": "info" };
const ABAS = { aparelhos: "Aparelhos (IMEI)", acessorios: "Acessórios e chips", transferencias: "Transferências", conferencia: "Conferência" } as const;
type Aba = keyof typeof ABAS;
const SITUACOES: (SituacaoUnidade | "todas")[] = ["todas", "Disponível", "Conferido", "Reservado", "Em trânsito", "Vendido"];

export default async function Estoque({ searchParams }: { searchParams: Promise<{ aba?: string; situacao?: string; busca?: string }> }) {
  const contexto = await acessoDaPagina("estoque");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Estoque" />;
  const parametros = await searchParams;
  const aba: Aba = Object.hasOwn(ABAS, parametros.aba ?? "") ? (parametros.aba as Aba) : "aparelhos";
  const situacao = SITUACOES.find((s) => s === parametros.situacao) ?? "todas";
  const busca = (parametros.busca ?? "").trim().toLowerCase().slice(0, 40);
  const rede = contexto.loja === REDE;
  const verCusto = podeVerCusto(contexto.perfil);

  const unidades = estoqueVisivel(contexto);
  const lojas = lojasVisiveis(contexto).map((l) => l.codigo);
  const filtradas = unidades
    .filter((u) => situacao === "todas" || u.situacao === situacao)
    .filter((u) => !busca || `${nomeDoProduto(u.sku)} ${u.sku}`.toLowerCase().includes(busca) || (busca.replace(/\D/g, "").length >= 4 && u.imei.includes(busca.replace(/\D/g, ""))));
  const vendaveis = unidades.filter((u) => VENDAVEL.includes(u.situacao));
  const paradas = vendaveis.filter((u) => u.diasEmEstoque > 60);
  const valorEmEstoque = vendaveis.reduce((s, u) => s + (PRODUTOS.find((p) => p.sku === u.sku)?.custo ?? 0), 0);
  const saldos = SALDOS_ACESSORIOS.filter((s) => lojas.includes(s.loja));
  const transferencias = TRANSFERENCIAS.filter((t) => rede || t.origem === contexto.loja || t.destino === contexto.loja);

  const href = (mudanca: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const valores = { aba: aba === "aparelhos" ? undefined : aba, situacao: situacao === "todas" ? undefined : situacao, busca: busca || undefined, ...mudanca };
    for (const [k, v] of Object.entries(valores)) if (v) p.set(k, v);
    const texto = p.toString();
    return `/demo/estoque${texto ? `?${texto}` : ""}`;
  };

  const porModelo = PRODUTOS.filter((p) => p.tipo === "aparelho").map((p) => ({ rotulo: p.nome, valor: vendaveis.filter((u) => u.sku === p.sku).length, minimo: (p.estoqueMinimo ?? 0) * lojas.length }));

  return (
    <>
      <TituloPagina
        sobretitulo={rede ? "Todas as lojas" : nomeDaLoja(contexto.loja)}
        titulo="Estoque e rastreio por IMEI"
        subtitulo={contexto.perfil === "vendedor" ? "Sua loja da sessão; outras lojas só por consulta, sem custo" : "Cada aparelho é um IMEI; cada movimento fica num livro só de inserção"}
        acao={<ExportarCsv nomeArquivo="estoque-imei" colunas={["Produto", "SKU", "IMEI", "Loja", "Situação", "Dias em estoque"]} linhas={filtradas.map((u) => [nomeDoProduto(u.sku), u.sku, mascararIdentificador(u.imei), nomeDaLoja(u.loja), u.situacao, u.diasEmEstoque])} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Aparelhos para vender" valor={numero(vendaveis.length)} icone={Package} detalhe="Disponíveis ou conferidos" />
        <Indicador rotulo="Reservados em venda" valor={numero(unidades.filter((u) => u.situacao === "Reservado").length)} icone={PackageCheck} detalhe="Expiram se a venda não concluir" />
        <Indicador rotulo="Em trânsito" valor={numero(unidades.filter((u) => u.situacao === "Em trânsito").length)} icone={Truck} detalhe="Não podem ser vendidos" tom="atencao" />
        {verCusto
          ? <Indicador rotulo="Valor em estoque (custo)" valor={brl(valorEmEstoque)} icone={History} detalhe={`${paradas.length} parados há mais de 60 dias`} tom={paradas.length > 0 ? "atencao" : "bom"} />
          : <Indicador rotulo="Parados há mais de 60 dias" valor={numero(paradas.length)} icone={History} detalhe="Ofereça primeiro" tom={paradas.length > 0 ? "atencao" : "bom"} />}
      </div>

      <div className="mt-4">
        <FiltroSegmentado rotulo="Abas do estoque" opcoes={(Object.keys(ABAS) as Aba[]).map((a) => ({ href: href({ aba: a === "aparelhos" ? undefined : a, situacao: undefined, busca: undefined }), rotulo: ABAS[a], ativo: a === aba }))} />
      </div>

      {aba === "aparelhos" && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Cartao className="xl:col-span-2" corpo="p-0">
            <div className="flex flex-col gap-3 border-b border-borda p-4 sm:p-5">
              <FormBusca acao="/demo/estoque" valor={busca} rotulo="Buscar aparelho" dica="Modelo, SKU ou final do IMEI (4+ dígitos)" ocultos={{ situacao: situacao === "todas" ? undefined : situacao }} />
              <FiltroSegmentado rotulo="Situação" opcoes={SITUACOES.map((s) => ({ href: href({ situacao: s === "todas" ? undefined : s }), rotulo: s === "todas" ? "Todas" : s, ativo: s === situacao, contagem: (s === "todas" ? unidades : unidades.filter((u) => u.situacao === s)).length }))} />
            </div>
            {filtradas.length === 0 ? (
              <div className="p-5"><EstadoVazio titulo="Nenhum aparelho com esse filtro" icone={Package}>Limpe a busca ou escolha outra situação.</EstadoVazio></div>
            ) : (
              <ul className="divide-y divide-borda">
                {filtradas.slice(0, 80).map((u) => (
                  <li key={u.imei}>
                    <details className="group">
                      <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50/80 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_8rem] sm:px-5">
                        <span className="min-w-0 text-sm"><span className="block truncate font-medium">{nomeDoProduto(u.sku)}</span><span className="block text-xs text-suave">{u.sku} · {u.diasEmEstoque} dias em estoque</span></span>
                        <span className="numeros text-sm max-sm:order-3">IMEI {mascararIdentificador(u.imei)}</span>
                        <span className="truncate text-sm text-suave max-sm:hidden">{nomeDaLoja(u.loja)}</span>
                        <span className="justify-self-end sm:justify-self-start"><Selo tom={TOM[u.situacao]} ponto>{u.situacao}</Selo></span>
                      </summary>
                      <div className="bg-slate-50/70 px-4 py-3 sm:px-5">
                        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-suave"><History aria-hidden className="size-3.5" /> Histórico do IMEI · {nomeDaLoja(u.loja)}</p>
                        <ol className="relative space-y-2 border-l border-borda-forte pl-4">
                          {movimentosDoImei(u).map((m) => (
                            <li key={m.acao} className="text-sm"><span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-acao ring-2 ring-white" />{m.acao}<span className="block text-xs text-suave">{m.quando} · {m.quem}</span></li>
                          ))}
                        </ol>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          <div className="min-w-0 space-y-4">
            <Cartao titulo="Aparelhos por modelo" subtitulo="Para vender agora · traço = estoque mínimo">
              <BarrasHorizontais nomeSerie="Unidades" formatar={(v) => numero(v)} dados={porModelo.map((m) => ({ rotulo: m.rotulo, valor: m.valor, meta: m.minimo }))} />
              <TabelaDoGrafico colunas={["Modelo", "Unidades", "Mínimo"]} linhas={porModelo.map((m) => [m.rotulo, m.valor, m.minimo])} />
            </Cartao>
            <Aviso>Dois vendedores nunca reservam o mesmo IMEI: no sistema real a reserva é feita no banco, com bloqueio.</Aviso>
          </div>
        </div>
      )}

      {aba === "acessorios" && (
        <Cartao className="mt-4" titulo="Acessórios e chips (por quantidade)" subtitulo={rede ? "Todas as lojas" : nomeDaLoja(contexto.loja)}>
          <Tabela colunas={rede ? ["Produto", "Loja", "Saldo", "Mínimo"] : ["Produto", "SKU", "Saldo", "Mínimo"]} legenda="Saldos por quantidade" alinharDireita={[2, 3]}>
            {saldos.slice(0, 120).map((s) => {
              const produto = PRODUTOS.find((p) => p.sku === s.sku);
              const minimo = produto?.estoqueMinimo ?? 0;
              return (
                <tr key={`${s.loja}-${s.sku}`}>
                  <Celula>{produto?.nome ?? s.sku}</Celula>
                  <Celula className="text-suave">{rede ? nomeDaLoja(s.loja) : s.sku}</Celula>
                  <Celula className="numeros text-right">{s.quantidade < minimo ? <Selo tom="aviso" ponto>{s.quantidade} · abaixo do mínimo</Selo> : s.quantidade}</Celula>
                  <Celula className="numeros text-right text-suave">{minimo || "—"}</Celula>
                </tr>
              );
            })}
          </Tabela>
        </Cartao>
      )}

      {aba === "transferencias" && (
        <Cartao className="mt-4" titulo="Transferências entre lojas" subtitulo="O aparelho sai de uma loja e só entra na outra quando alguém confere o recebimento" icone={ArrowRightLeft}>
          {transferencias.length === 0 ? <EstadoVazio titulo="Nenhuma transferência desta loja" icone={Truck} /> : (
            <ul className="divide-y divide-borda">
              {transferencias.map((t) => (
                <li key={t.codigo} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <span className="min-w-0 text-sm">
                    <span className="block font-semibold">{t.codigo} · {nomeDaLoja(t.origem)} → {nomeDaLoja(t.destino)}</span>
                    <span className="block text-xs text-suave">{t.itens} · {t.criada} · {t.quem}</span>
                  </span>
                  <Selo tom={t.situacao === "Recebida" ? "sucesso" : t.situacao === "Em trânsito" ? "info" : "aviso"} ponto>{t.situacao}</Selo>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {aba === "conferencia" && (
        <Cartao className="mt-4" titulo="Conferência física (contagem)" subtitulo="Antes de a Ora assumir o estoque, cada IMEI importado precisa ser conferido na loja" icone={ClipboardCheck}>
          <ul className="space-y-4">
            {lojasVisiveis(contexto).slice(0, 14).map((l) => {
              const daLoja = unidades.filter((u) => u.loja === l.codigo && u.situacao !== "Vendido");
              const conferidos = daLoja.filter((u) => u.situacao === "Conferido").length + (l.piloto ? 3 : 0);
              const total = Math.max(daLoja.length, conferidos);
              return (
                <li key={l.codigo}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{l.nome}{l.piloto ? " (piloto)" : ""}</span><span className="numeros text-suave">{conferidos} de {total} IMEIs</span></div>
                  <Progresso valor={total > 0 ? (conferidos / total) * 100 : 0} rotulo={`Conferência de ${l.nome}`} />
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-suave">Ajuste de estoque e registro de perda: gerente e vendedor só solicitam; quem aprova é o dono (ADR-002).</p>
        </Cartao>
      )}

      {contexto.perfil === "vendedor" && aba === "aparelhos" && (
        <Cartao className="mt-4" titulo="Disponível em outras lojas" subtitulo="Consulta para indicar ao cliente: só quantidade, sem custo e sem IMEI">
          <Tabela colunas={["Loja", ...PRODUTOS.filter((p) => p.tipo === "aparelho").map((p) => p.nome)]} legenda="Aparelhos disponíveis em outras lojas" minimo="min-w-[52rem]">
            {disponibilidadeEmOutrasLojas(contexto).map((l) => (
              <tr key={l.loja}>
                <Celula className="font-medium">{l.loja}</Celula>
                {l.aparelhos.map((a) => <Celula key={a.sku} className={`numeros ${a.quantidade === 0 ? "text-suave" : ""}`}>{a.quantidade}</Celula>)}
              </tr>
            ))}
          </Tabela>
        </Cartao>
      )}
    </>
  );
}

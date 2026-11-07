import { History, Package, Smartphone, Tags } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, EstadoVazio, FiltroSegmentado, FormBusca, Indicador, Selo, TituloPagina } from "../../../componentes/ui";
import { estoqueVisivel, lojasVisiveis } from "../../../demo/consultas";
import { HISTORICO_PRECOS, PRODUTOS, SALDOS_ACESSORIOS, VENDAVEL, type Categoria } from "../../../demo/dados";
import { podeVerCusto } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { agora, brl, dataCurta, diasAntes, numero, percentual } from "../../../lib/formato";
import { PrecoEditavel } from "./PrecoEditavel";

export const metadata: Metadata = { title: "Produtos e preços" };

const CATEGORIAS: (Categoria | "todas")[] = ["todas", "Aparelhos", "Acessórios", "Ora Connect"];

export default async function Produtos({ searchParams }: { searchParams: Promise<{ categoria?: string; busca?: string }> }) {
  const contexto = await acessoDaPagina("produtos");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Produtos e preços" />;
  const parametros = await searchParams;
  const categoria = CATEGORIAS.find((c) => c === parametros.categoria) ?? "todas";
  const busca = (parametros.busca ?? "").trim().toLowerCase().slice(0, 40);
  const verCusto = podeVerCusto(contexto.perfil);
  const podeAlterar = contexto.perfil === "dono";
  const hoje = agora();
  const unidades = estoqueVisivel(contexto);
  const lojas = lojasVisiveis(contexto).map((l) => l.codigo);
  const estoqueDe = (sku: string, tipo: string) =>
    tipo === "aparelho" ? unidades.filter((u) => u.sku === sku && VENDAVEL.includes(u.situacao)).length : SALDOS_ACESSORIOS.filter((s) => s.sku === sku && lojas.includes(s.loja)).reduce((s, x) => s + x.quantidade, 0);

  const lista = PRODUTOS.filter((p) => categoria === "todas" || p.categoria === categoria).filter((p) => !busca || `${p.nome} ${p.marca} ${p.sku} ${p.codigoBarras ?? ""}`.toLowerCase().includes(busca));
  const comMargem = PRODUTOS.filter((p) => p.preco > 0);
  const margemMedia = comMargem.reduce((s, p) => s + (p.preco - p.custo) / p.preco, 0) / Math.max(1, comMargem.length);
  const href = (c: string) => {
    const p = new URLSearchParams();
    if (c !== "todas") p.set("categoria", c);
    if (busca) p.set("busca", busca);
    const t = p.toString();
    return `/demo/produtos${t ? `?${t}` : ""}`;
  };

  return (
    <>
      <TituloPagina
        titulo="Produtos e preços"
        subtitulo={`Catálogo central da rede. ${podeAlterar ? "Só o dono altera preço; cada mudança fica no histórico." : "Preço definido pelo dono; o vendedor só dá desconto dentro da regra."}`}
        acao={<ExportarCsv nomeArquivo="produtos" colunas={["SKU", "Produto", "Marca", "Categoria", "Preço (R$)", ...(verCusto ? ["Custo (R$)"] : []), "Estoque"]} linhas={lista.map((p) => [p.sku, p.nome, p.marca, p.categoria, (p.preco / 100).toFixed(2).replace(".", ","), ...(verCusto ? [(p.custo / 100).toFixed(2).replace(".", ",")] : []), estoqueDe(p.sku, p.tipo)])} />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Produtos no catálogo" valor={numero(PRODUTOS.length)} icone={Tags} detalhe="Importados do CSV da Rein (prévia)" />
        <Indicador rotulo="Aparelhos" valor={numero(PRODUTOS.filter((p) => p.tipo === "aparelho").length)} icone={Smartphone} detalhe="Vendidos um por IMEI" />
        <Indicador rotulo="Acessórios" valor={numero(PRODUTOS.filter((p) => p.tipo === "acessorio").length)} icone={Package} detalhe="Por quantidade" />
        {verCusto ? <Indicador rotulo="Margem média de tabela" valor={percentual(margemMedia)} icone={History} detalhe="Antes de descontos e taxas" /> : <Indicador rotulo="Serviços Ora Connect" valor={numero(PRODUTOS.filter((p) => p.categoria === "Ora Connect").length)} icone={History} />}
      </div>

      <Cartao className="mt-4" corpo="p-0">
        <div className="flex flex-col gap-3 border-b border-borda p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <FiltroSegmentado rotulo="Categoria" opcoes={CATEGORIAS.map((c) => ({ href: href(c), rotulo: c === "todas" ? "Todas" : c, ativo: c === categoria, contagem: c === "todas" ? PRODUTOS.length : PRODUTOS.filter((p) => p.categoria === c).length }))} />
          <FormBusca acao="/demo/produtos" valor={busca} rotulo="Buscar produto" dica="Nome, marca, SKU ou código de barras" ocultos={{ categoria: categoria === "todas" ? undefined : categoria }} />
        </div>
        {lista.length === 0 ? <div className="p-5"><EstadoVazio titulo="Nenhum produto encontrado" icone={Tags} /></div> : (
          <ul className="divide-y divide-borda">
            {lista.map((p) => {
              const historico = HISTORICO_PRECOS[p.sku] ?? [];
              const estoque = estoqueDe(p.sku, p.tipo);
              return (
                <li key={p.sku} className="px-4 py-3 sm:px-5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 lg:grid-cols-[minmax(0,1fr)_9rem_10rem_minmax(0,14rem)]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{p.nome}</p>
                      <p className="text-xs text-suave">{p.sku} · {p.marca} · {p.categoria}{p.codigoBarras ? ` · EAN ${p.codigoBarras}` : ""}</p>
                    </div>
                    <div className="text-sm max-lg:order-3">
                      {p.categoria === "Ora Connect" ? <span className="text-xs text-suave">Serviço</span> : <Selo tom={estoque === 0 ? "perigo" : estoque < (p.estoqueMinimo ?? 0) * lojas.length ? "aviso" : "sucesso"} ponto>{estoque} em estoque</Selo>}
                    </div>
                    <div className="text-xs text-suave max-lg:order-4 max-lg:text-right">
                      {verCusto && p.preco > 0 ? <>Custo {brl(p.custo)} · margem {percentual((p.preco - p.custo) / p.preco)}</> : p.tipo === "recarga" ? "Valor escolhido na venda" : ""}
                    </div>
                    <div className="text-right text-sm">
                      {p.tipo === "recarga" || p.preco === 0 ? <span className="text-suave">{p.tipo === "recarga" ? "R$ 15 a R$ 100" : "Sem cobrança"}</span> : <PrecoEditavel nome={p.nome} preco={p.preco} podeAlterar={podeAlterar} />}
                    </div>
                  </div>
                  {historico.length > 0 && (
                    <details className="mt-2">
                      <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-acao"><History aria-hidden className="size-3.5" /> Histórico de preço ({historico.length})</summary>
                      <ol className="mt-2 space-y-1 border-l-2 border-borda pl-3 text-xs">
                        {historico.map((h) => <li key={h.desde}><strong className="numeros">{brl(h.preco)}</strong> desde {dataCurta(diasAntes(hoje, h.desde))} · {h.quem} · {h.motivo}</li>)}
                      </ol>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
      <Aviso className="mt-4" titulo="De onde vêm os produtos">O catálogo inicial vem do CSV da Rein, só por arquivo (nunca pela API). Depois disso, a Ora administra produtos e preços aqui, com vigência e histórico.</Aviso>
    </>
  );
}

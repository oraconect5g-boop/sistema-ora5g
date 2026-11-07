import { Medal, Target, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { BarrasHorizontais, Medidor, TabelaDoGrafico } from "../../../componentes/graficos";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Avatar, Cartao, Celula, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { desempenhoDe, vendedoresVisiveis } from "../../../demo/consultas";
import { nomeDaLoja, pessoa } from "../../../demo/dados";
import { podeVerCusto, REDE, vePorVendedor } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl, brlCompacto, percentual } from "../../../lib/formato";

export const metadata: Metadata = { title: "Metas e desempenho" };

const CATEGORIAS = [["aparelhos", "Aparelhos"], ["acessorios", "Acessórios"], ["chips", "Chips"], ["ativacoes", "Ativações"], ["portabilidades", "Portab."], ["recargas", "Recargas"], ["assistencias", "OS"]] as const;

export default async function Metas() {
  const contexto = await acessoDaPagina("metas");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Metas" />;
  const gestao = vePorVendedor(contexto.perfil);
  const verMargem = podeVerCusto(contexto.perfil);

  if (!gestao) {
    const eu = pessoa(contexto.pessoaId);
    if (!eu) return null;
    const d = desempenhoDe(eu);
    const pct = d.meta > 0 ? (d.vendido / d.meta) * 100 : 0;
    return (
      <>
        <TituloPagina titulo="Minhas metas" subtitulo="Seus números de hoje em todas as lojas onde você trabalhou. O ranking com colegas aguarda a decisão dos donos (P3)." />
        <div className="grid gap-4 lg:grid-cols-3">
          <Cartao titulo="Meta do dia" icone={Target}>
            <div className="flex items-center gap-5">
              <Medidor percentual={pct} rotulo="Meta do dia" detalhe="atingido" />
              <div className="text-sm">
                <p className="text-2xl font-bold tracking-tight">{brl(d.vendido)}</p>
                <p className="text-suave">de {brl(d.meta)}</p>
                <p className="mt-2 font-medium">{d.vendido >= d.meta ? "Meta batida!" : `Faltam ${brl(d.meta - d.vendido)}`}</p>
              </div>
            </div>
          </Cartao>
          <Cartao titulo="Por loja hoje" subtitulo="Cada venda conta para a loja onde foi feita" className="lg:col-span-2">
            <BarrasHorizontais nomeSerie="Vendido" formatar={brl} dados={eu.lojas.map((l) => ({ rotulo: nomeDaLoja(l), valor: d.porLoja.find((x) => x.loja === l)?.vendido ?? 0, detalhe: `${d.porLoja.find((x) => x.loja === l)?.vendas ?? 0} vendas`, destaque: l === contexto.loja }))} />
          </Cartao>
        </div>
        <Cartao className="mt-4" titulo="Minha produção por categoria" subtitulo="Chips, ativações, portabilidades, recargas e assistências contam (telecom só confirmada)">
          <ul className="grid grid-cols-3 gap-2 text-center sm:grid-cols-7">
            {CATEGORIAS.map(([chave, rotulo]) => <li key={chave} className="rounded-xl bg-fundo px-2 py-3"><p className="text-2xl font-bold">{d[chave]}</p><p className="text-xs text-suave">{rotulo}</p></li>)}
          </ul>
        </Cartao>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Aviso titulo="Comissão e bônus em definição">As regras de comissão serão configuradas pelos donos, com histórico. Quando estiverem aprovadas, o extrato aparece aqui em tempo real.</Aviso>
          <Aviso tom="aviso" titulo="Decisão pendente (P3)">Vendedores verão o ranking com o nome dos colegas ou só a própria posição? Até a decisão, você vê só os seus números.</Aviso>
        </div>
      </>
    );
  }

  const equipe = vendedoresVisiveis(contexto).map((p) => desempenhoDe(p, contexto.loja)).sort((a, b) => (b.meta > 0 ? b.vendido / b.meta : 0) - (a.meta > 0 ? a.vendido / a.meta : 0));
  const total = equipe.reduce((s, d) => s + d.vendido, 0);
  const metaTotal = equipe.reduce((s, d) => s + d.meta, 0);
  const bateram = equipe.filter((d) => d.vendido >= d.meta).length;
  const destaque = equipe[0];
  const grafico = equipe.slice(0, 15);

  return (
    <>
      <TituloPagina
        sobretitulo={contexto.loja === REDE ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Metas e desempenho da equipe"
        subtitulo="Gestores veem todos os vendedores do seu escopo; o vendedor vê só os próprios números"
        acao={<ExportarCsv nomeArquivo="metas" colunas={["Vendedor", "Lojas", "Vendido (R$)", "Meta (R$)", "Atingido", ...CATEGORIAS.map((c) => c[1])]} linhas={equipe.map((d) => [d.pessoa.nome, d.pessoa.lojas.map(nomeDaLoja).join(" + "), (d.vendido / 100).toFixed(2).replace(".", ","), (d.meta / 100).toFixed(2).replace(".", ","), percentual(d.meta > 0 ? d.vendido / d.meta : 0), ...CATEGORIAS.map(([c]) => d[c])])} />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Vendido pela equipe" valor={brlCompacto(total)} icone={TrendingUp} detalhe={`Meta somada: ${brlCompacto(metaTotal)}`} />
        <Indicador rotulo="Atingimento" valor={percentual(metaTotal > 0 ? total / metaTotal : 0)} icone={Target} tom={total >= metaTotal ? "bom" : "atencao"} detalhe="Da meta do dia" />
        <Indicador rotulo="Bateram a meta" valor={`${bateram} de ${equipe.length}`} icone={Users} />
        <Indicador rotulo="Destaque do dia" valor={destaque ? destaque.pessoa.nome.split(" ")[0] ?? "—" : "—"} icone={Medal} detalhe={destaque ? `${percentual(destaque.meta > 0 ? destaque.vendido / destaque.meta : 0)} da meta` : undefined} tom="bom" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-5">
        <Cartao titulo="Atingimento por vendedor" subtitulo={`Vendido hoje · traço = meta${equipe.length > grafico.length ? ` · ${grafico.length} melhores de ${equipe.length}` : ""}`} className="xl:col-span-2">
          <BarrasHorizontais nomeSerie="Vendido" formatar={brl} dados={grafico.map((d) => ({ rotulo: d.pessoa.nome, valor: d.vendido, meta: d.meta, detalhe: percentual(d.meta > 0 ? d.vendido / d.meta : 0) }))} />
          <TabelaDoGrafico colunas={["Vendedor", "Vendido", "Meta", "Atingido"]} linhas={equipe.map((d) => [d.pessoa.nome, brl(d.vendido), brl(d.meta), percentual(d.meta > 0 ? d.vendido / d.meta : 0)])} />
        </Cartao>
        <Cartao titulo="Produção por categoria" subtitulo="Cada fato conta uma vez; telecom só depois da operadora" className="xl:col-span-3">
          <Tabela colunas={["Vendedor", "Meta", ...CATEGORIAS.map((c) => c[1]), ...(verMargem ? ["Margem"] : [])]} legenda="Produção por vendedor" minimo="min-w-[52rem]">
            {equipe.map((d) => {
              const pct = d.meta > 0 ? d.vendido / d.meta : 0;
              return (
                <tr key={d.pessoa.id}>
                  <Celula>
                    <span className="flex items-center gap-2.5">
                      <Avatar nome={d.pessoa.nome} tamanho="size-8 text-xs" />
                      <span className="min-w-0"><span className="block truncate font-semibold">{d.pessoa.nome}</span><span className="block truncate text-xs text-suave">{d.pessoa.lojas.map(nomeDaLoja).join(" + ")}</span></span>
                    </span>
                  </Celula>
                  <Celula><Selo tom={pct >= 1 ? "sucesso" : pct >= 0.8 ? "info" : "aviso"}>{percentual(pct)}</Selo></Celula>
                  {CATEGORIAS.map(([c]) => <Celula key={c} className="numeros text-center">{d[c]}</Celula>)}
                  {verMargem && <Celula className="numeros">{brl(d.margem)}</Celula>}
                </tr>
              );
            })}
          </Tabela>
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Aviso titulo="Comissões e bônus">Extrato em tempo real, metas diárias, bônus por margem saudável e conquistas. As regras serão configuráveis pelos donos, com histórico e aprovação do fechamento.</Aviso>
        <Aviso tom="aviso" titulo="Decisão pendente (P3)">Os vendedores verão o ranking com o nome dos colegas ou só a própria posição? Nesta demonstração, o vendedor vê só os próprios números.</Aviso>
      </div>
    </>
  );
}

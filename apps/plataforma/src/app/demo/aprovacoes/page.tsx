import { avaliarDesconto, formatarBRL } from "@ora5g/dominio";

import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Cartao, Selo, TituloPagina } from "../../../componentes/ui";
import { APROVACOES, POLITICAS, PRODUTOS } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";
import { Decisao } from "./Fila";

export default async function Aprovacoes() {
  const { perfil, permitido } = await acessoDaPagina("aprovacoes");
  if (!permitido) return <SemPermissao perfil={perfil} pagina="Aprovações" />;
  return (
    <>
      <TituloPagina titulo="Aprovações" subtitulo="Descontos, notas e cancelamentos. Ninguém aprova o próprio pedido." />
      <div className="space-y-4">
        <Cartao titulo="Descontos acima do limite" subtitulo="A margem que sobra é calculada pela regra de negócio, com a taxa do meio de pagamento">
          <ul className="divide-y divide-borda">
            {APROVACOES.descontos.map((d) => {
              const produto = PRODUTOS.find((p) => p.sku === d.sku)!;
              const a = avaliarDesconto({ preco: produto.preco, custo: produto.custo, taxaMeioPagamento: d.taxaMeio, politica: POLITICAS[produto.categoria] }, d.desconto);
              return (
                <li key={d.venda} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold">{d.venda} · {produto.nome} · {d.vendedor}</p>
                    <p className="text-suave">Pedido: {formatarBRL(d.desconto)} de {formatarBRL(produto.preco)} · {d.meio} · há {d.minutos} min</p>
                    <p className="text-suave">Motivo: {d.motivo}</p>
                    <p className="mt-1">Limite sem aprovação: {formatarBRL(a.maximoSemAprovacao)} · margem que sobra: <strong className={a.margemResultante < 0 ? "text-perigo" : ""}>{(a.margemResultante / 100).toFixed(1)}%</strong>{a.situacao === "abaixo_do_custo" && <span className="ml-2"><Selo tom="perigo">Abaixo do custo</Selo></span>}</p>
                  </div>
                  <Decisao id={d.venda} />
                </li>
              );
            })}
          </ul>
        </Cartao>
        <Cartao titulo="Notas fiscais a emitir" subtitulo="Pedido chega pronto; aprovar dispara a emissão e o envio automático (quando o emissor estiver contratado)">
          <ul className="divide-y divide-borda">
            {APROVACOES.notas.map((n) => (
              <li key={n.venda} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <p className="font-semibold">{n.venda} · {formatarBRL(n.valor)} · {n.vendedor}</p>
                  <p className="text-suave">Envio ao cliente: {n.contato}</p>
                  <p className="mt-1">Venda feita há <strong>{n.minutos} min</strong> {n.minutos > 30 && <Selo tom="perigo">Atrasada: confirmar prazo com o contador</Selo>}</p>
                </div>
                <Decisao id={n.venda} />
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Cancelamentos">
          <ul className="divide-y divide-borda">
            {APROVACOES.cancelamentos.map((c) => (
              <li key={c.venda} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm"><p className="font-semibold">{c.venda} · {formatarBRL(c.valor)} · {c.vendedor}</p><p className="text-suave">{c.motivo}</p></div>
                <Decisao id={c.venda} />
              </li>
            ))}
          </ul>
        </Cartao>
        <Aviso tom="aviso">Aprovação interna não substitui a autorização fiscal da SEFAZ, e não pode atrasar uma nota obrigatória por lei.</Aviso>
      </div>
    </>
  );
}

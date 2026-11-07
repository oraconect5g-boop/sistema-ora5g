import { ScrollText } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Avatar, Cartao, EstadoVazio, FiltroSegmentado, Selo, TituloPagina, type Tom } from "../../../componentes/ui";
import { AUDITORIA, nomeDaLoja, nomeDaPessoa, NOMES_PAPEIS, type Papel } from "../../../demo/dados";
import { REDE } from "../../../demo/perfis";
import { acessoDaPagina } from "../../../demo/sessao";

export const metadata: Metadata = { title: "Auditoria" };

const TIPOS = { todos: "Tudo", venda: "Vendas", aprovacao: "Aprovações", estoque: "Estoque", acesso: "Acesso", lgpd: "LGPD", fiscal: "Fiscal", preco: "Preços", caixa: "Caixa" } as const;
type TipoEvento = keyof typeof TIPOS;
const TOM: Record<string, Tom> = { venda: "info", aprovacao: "sucesso", estoque: "neutro", acesso: "marca", lgpd: "aviso", fiscal: "info", preco: "perigo", caixa: "neutro" };

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const contexto = await acessoDaPagina("auditoria");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Auditoria" />;
  const { tipo: pedido } = await searchParams;
  const tipo: TipoEvento = Object.hasOwn(TIPOS, pedido ?? "") ? (pedido as TipoEvento) : "todos";
  const doEscopo = AUDITORIA.filter((e) => contexto.loja === REDE || e.loja === contexto.loja || e.loja === "rede");
  const eventos = doEscopo.filter((e) => tipo === "todos" || e.tipo === tipo);

  return (
    <>
      <TituloPagina
        sobretitulo={contexto.loja === REDE ? "Rede inteira" : nomeDaLoja(contexto.loja)}
        titulo="Auditoria"
        subtitulo="Quem fez o quê, quando e onde. A trilha só recebe registros novos; ninguém apaga nem altera."
        acao={<ExportarCsv nomeArquivo="auditoria" colunas={["Quando", "Quem", "Papel", "Ação", "Alvo", "Loja"]} linhas={eventos.map((e) => [e.hora, nomeDaPessoa(e.quem), NOMES_PAPEIS[e.papel as Papel], e.acao, e.alvo, e.loja === "rede" ? "Rede" : nomeDaLoja(e.loja)])} />}
      />
      <FiltroSegmentado rotulo="Tipo de evento" opcoes={(Object.keys(TIPOS) as TipoEvento[]).map((t) => ({ href: t === "todos" ? "/demo/auditoria" : `/demo/auditoria?tipo=${t}`, rotulo: TIPOS[t], ativo: t === tipo, contagem: t === "todos" ? doEscopo.length : doEscopo.filter((e) => e.tipo === t).length }))} />
      <Cartao className="mt-4" icone={ScrollText} titulo="Linha do tempo" subtitulo="Amostra fictícia de hoje">
        {eventos.length === 0 ? <EstadoVazio titulo="Nenhum evento deste tipo" icone={ScrollText} /> : (
          <ol className="relative space-y-4 border-l-2 border-borda pl-6">
            {eventos.map((e) => (
              <li key={e.hora + e.acao} className="relative">
                <span aria-hidden className="absolute -left-[31px] top-1 grid size-4 place-items-center rounded-full bg-white ring-2 ring-acao"><span className="size-1.5 rounded-full bg-acao" /></span>
                <div className="flex flex-wrap items-center gap-2">
                  <Avatar nome={nomeDaPessoa(e.quem)} tamanho="size-7 text-[11px]" />
                  <p className="text-sm"><strong>{nomeDaPessoa(e.quem)}</strong> <span className="text-suave">({NOMES_PAPEIS[e.papel as Papel]})</span> · {e.acao}</p>
                </div>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-suave">{e.hora} · {e.alvo} · {e.loja === "rede" ? "Rede" : nomeDaLoja(e.loja)} <Selo tom={TOM[e.tipo] ?? "neutro"}>{TIPOS[e.tipo as TipoEvento] ?? e.tipo}</Selo></p>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
      <Aviso className="mt-4">No banco de desenvolvimento a auditoria já é só de inserção, com organização e loja em cada evento; consultas de cliente por CPF ou telefone também ficam registradas (LGPD).</Aviso>
    </>
  );
}

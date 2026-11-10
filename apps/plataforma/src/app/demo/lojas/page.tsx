import { Building2, ShieldCheck, Store, UserCheck, Users } from "lucide-react";
import type { Metadata } from "next";

import { ExportarCsv } from "../../../componentes/ExportarCsv";
import { SemPermissao } from "../../../componentes/SemPermissao";
import { Aviso, Avatar, Cartao, Celula, FiltroSegmentado, Indicador, Selo, Tabela, TituloPagina } from "../../../componentes/ui";
import { LOJAS, nomeDaLoja, NOMES_PAPEIS, PESSOAS, resumoDeVendas, UNIDADES_ESPECIAIS, VENDAS_HOJE, VENDEDORES, type Papel } from "../../../demo/dados";
import { acessoDaPagina } from "../../../demo/sessao";
import { brl, numero, percentual } from "../../../lib/formato";
import { AcaoUsuario } from "./AcaoUsuario";

export const metadata: Metadata = { title: "Lojas e usuários" };

// Matriz do ADR-002 §2.4 (resumo). ✅ permitido · 🏬 só na loja atual · 👤 só o próprio · ⏳ só solicita · ❌ negado
const MATRIZ: readonly (readonly [string, string, string, string, string, string])[] = [
  ["Registrar venda e pagamento", "✅", "❌", "🏬", "🏬", "❌"],
  ["Ver vendas", "✅ todas", "✅ leitura", "🏬", "👤 + resumo da loja", "❌"],
  ["Ver custo e margem", "✅", "✅", "🏬", "❌", "❌"],
  ["Aprovar desconto acima do limite", "✅", "❌", "🏬 na alçada", "❌", "❌"],
  ["Aprovar e emitir nota", "✅", "❌", "🏬", "❌", "❌"],
  ["Conferir caixa", "✅", "❌", "🏬", "❌", "❌"],
  ["Consultar estoque", "✅", "✅", "🏬", "🏬 + outras sem custo", "❌"],
  ["Ajustar estoque / registrar perda", "✅", "❌", "⏳", "⏳", "❌"],
  ["Importar CSV da Rein", "✅ aprova", "✅ executa", "❌", "❌", "❌"],
  ["Alterar preço", "✅", "❌", "❌", "❌", "❌"],
  ["Metas e comissões", "✅", "❌", "🏬 consulta", "👤 consulta", "❌"],
  ["Orçar e concluir OS", "❌", "❌", "❌", "❌", "✅ as dele"],
  ["Gerir usuários e vínculos", "✅", "✅", "❌", "❌", "❌"],
  ["Ver auditoria", "✅", "✅", "🏬", "❌", "❌"],
];

const PAPEIS: (Papel | "todos")[] = ["todos", "vendedor", "gerente", "dono", "administrador", "tecnico"];

export default async function Lojas({ searchParams }: { searchParams: Promise<{ papel?: string }> }) {
  const contexto = await acessoDaPagina("lojas");
  if (!contexto.permitido) return <SemPermissao perfil={contexto.perfil} pagina="Lojas e usuários" />;
  const { papel: pedido } = await searchParams;
  const papel = PAPEIS.find((p) => p === pedido) ?? "todos";
  const pessoas = PESSOAS.filter((p) => papel === "todos" || p.papel === papel);
  const variasLojas = VENDEDORES.filter((v) => v.lojas.length > 1).length;
  const bloqueados = PESSOAS.filter((p) => p.status === "bloqueado").length;

  return (
    <>
      <TituloPagina
        titulo="Lojas e usuários"
        subtitulo="Empresa com CNPJ raiz e uma filial por loja. Um vendedor pode ter vínculo com várias lojas e escolhe em qual está na sessão."
        acao={<ExportarCsv nomeArquivo="usuarios" colunas={["Nome", "Papel", "Lojas", "Situação"]} linhas={pessoas.map((p) => [p.nome, NOMES_PAPEIS[p.papel], p.papel === "dono" || p.papel === "administrador" ? "Rede inteira" : p.lojas.map(nomeDaLoja).join(" + "), p.status === "ativo" ? "Ativo" : "Bloqueado"])} />}
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Indicador rotulo="Unidades" valor={`${LOJAS.length} + ${UNIDADES_ESPECIAIS.length}`} icone={Building2} detalhe="Lojas + online, assistência e DEFEITOS" />
        <Indicador rotulo="Usuários" valor={numero(PESSOAS.length)} icone={Users} detalhe={`${bloqueados} bloqueado${bloqueados === 1 ? "" : "s"}`} />
        <Indicador rotulo="Em mais de uma loja" valor={numero(variasLojas)} icone={UserCheck} detalhe="Escolhem a loja ao entrar" />
        <Indicador rotulo="Papéis" valor="5" icone={ShieldCheck} detalhe="Dono, admin, gerente, vendedor, técnico" />
      </div>

      <Cartao className="mt-4" titulo="Unidades" subtitulo="Nomes das lojas 02 a 14 aguardam a lista oficial" icone={Store}>
        <Tabela colunas={["Unidade", "Bairro", "Vendedores", "Meta do dia", "Vendido hoje", "Situação"]} legenda="Unidades da rede" alinharDireita={[3, 4]} minimo="min-w-[44rem]">
          {LOJAS.map((l) => {
            const vendido = resumoDeVendas(VENDAS_HOJE.filter((v) => v.loja === l.codigo)).faturamento;
            const pct = vendido / l.metaDia;
            return (
              <tr key={l.codigo}>
                <Celula className="font-medium">{l.nome}{l.piloto && <Selo tom="info" className="ml-2">Piloto</Selo>}</Celula>
                <Celula className="text-suave">{l.bairro}</Celula>
                <Celula className="numeros">{VENDEDORES.filter((v) => v.lojas.includes(l.codigo)).length}</Celula>
                <Celula className="numeros text-right">{brl(l.metaDia)}</Celula>
                <Celula className="numeros text-right">{brl(vendido)}</Celula>
                <Celula><Selo tom={pct >= 1 ? "sucesso" : pct >= 0.8 ? "info" : "aviso"} ponto>{pct >= 1 ? "Acima da meta" : pct >= 0.8 ? "Em progresso" : "Atenção"} · {percentual(pct)}</Selo></Celula>
              </tr>
            );
          })}
          {UNIDADES_ESPECIAIS.map((u) => (
            <tr key={u.codigo}><Celula className="font-medium">{u.nome}</Celula><Celula className="text-suave">{u.tipo}</Celula><Celula className="text-suave">—</Celula><Celula className="text-right text-suave">—</Celula><Celula className="text-right text-suave">—</Celula><Celula className="text-xs text-suave">{u.observacao}</Celula></tr>
          ))}
        </Tabela>
      </Cartao>

      <Cartao className="mt-4" titulo="Usuários e vínculos" subtitulo="Bloquear tira o acesso na hora, em todas as lojas" icone={Users}>
        <FiltroSegmentado rotulo="Papel" opcoes={PAPEIS.map((p) => ({ href: p === "todos" ? "/demo/lojas" : `/demo/lojas?papel=${p}`, rotulo: p === "todos" ? "Todos" : NOMES_PAPEIS[p], ativo: p === papel, contagem: p === "todos" ? PESSOAS.length : PESSOAS.filter((x) => x.papel === p).length }))} />
        <ul className="mt-3 divide-y divide-borda">
          {pessoas.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 items-center gap-3">
                <Avatar nome={p.nome} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{p.nome}</span>
                  <span className="block truncate text-xs text-suave">{NOMES_PAPEIS[p.papel]} · {p.papel === "dono" || p.papel === "administrador" ? "Rede inteira" : p.lojas.map(nomeDaLoja).join(" + ")}{p.lojas.length > 1 && p.papel === "vendedor" ? " (várias lojas)" : ""}</span>
                </span>
              </span>
              <AcaoUsuario nome={p.nome} bloqueado={p.status === "bloqueado"} />
            </li>
          ))}
        </ul>
      </Cartao>

      <Cartao className="mt-4" titulo="Quem pode fazer o quê" subtitulo="Matriz de permissões do ADR-002 · ✅ permitido · 🏬 só na loja atual · 👤 só o próprio · ⏳ só solicita · ❌ negado" icone={ShieldCheck}>
        <Tabela colunas={["Ação", "Dono", "Administrador", "Gerente", "Vendedor", "Técnico"]} legenda="Matriz de permissões" minimo="min-w-[46rem]">
          {MATRIZ.map(([acao, ...valores]) => (
            <tr key={acao}>
              <Celula className="font-medium">{acao}</Celula>
              {valores.map((v, i) => <Celula key={i} className="whitespace-nowrap text-[13px]">{v}</Celula>)}
            </tr>
          ))}
        </Tabela>
      </Cartao>
      <Aviso className="mt-4" titulo="Já pronto no banco de desenvolvimento">Empresas, unidades com CNPJ validado, papéis, vínculos com vigência, escolha da loja na sessão e auditoria imutável, com testes automáticos de permissão. Ninguém aprova o próprio pedido, nem o dono.</Aviso>
    </>
  );
}

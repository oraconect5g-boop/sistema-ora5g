// Planilha da equipe e dos acessos (lote FIN-009d: ORA-FIN-009), no Excel ou em CSV: as mesmas pessoas da tela, uma
// linha por acesso ativo, e os convites em andamento, das redes em que quem pede é dono ou administrador. A permissão é
// a da tela (usuarios.gerir) e o banco confere cada linha de novo (RLS). Tudo em páginas abaixo do teto da API; uma
// leitura que falha, ou mais linhas que o limite, derruba o arquivo (equipe pela metade passaria por completa).
import { FalhaDoServico, obterSessao } from "../../../lib/acesso/sessao";
import { formatoPedido, geradoEm, parteDoNome } from "../../../lib/csv";
import { LIMITE_DA_PLANILHA_DA_EQUIPE as LIMITE, planilhaDaEquipe, SITUACOES_DO_CONVITE } from "../../../lib/equipe/planilha";
import { lerEmPaginas } from "../../../lib/leitura-completa";
import { respostaDaPlanilha } from "../../../lib/xlsx-servidor";

export const dynamic = "force-dynamic";

const texto = (mensagem: string, status: number) => new Response(mensagem, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sessao = await obterSessao({ exigirLoja: true });
  const { supabase, usuario } = sessao;
  const permitido = await supabase.rpc("tem_permissao", { p_permissao: "usuarios.gerir" });
  if (permitido.error) throw new FalhaDoServico("tem_permissao");
  if (!permitido.data) return texto("Sem permissão para exportar a equipe.", 403);

  // As redes em que quem pede é dono ou administrador (as mesmas da tela).
  const meus = await supabase.from("vinculos").select("organizacao_id, papel").eq("usuario_id", usuario.id).eq("escopo", "organizacao").is("fim", null);
  if (meus.error) throw new FalhaDoServico("vinculos");
  const organizacoes = [...new Set(meus.data.filter((v) => v.papel === "dono" || v.papel === "administrador").map((v) => v.organizacao_id))];
  if (organizacoes.length === 0) return texto("Sem permissão para exportar a equipe.", 403);

  const [redes, unidades, acessos, pessoas, convites] = await Promise.all([
    lerEmPaginas((de, ate) => supabase.from("organizacoes").select("id, nome").in("id", organizacoes).order("id").range(de, ate), LIMITE),
    lerEmPaginas((de, ate) => supabase.from("unidades").select("id, nome, status").in("organizacao_id", organizacoes).order("id").range(de, ate), LIMITE),
    lerEmPaginas((de, ate) => supabase.from("vinculos").select("id, usuario_id, organizacao_id, papel, unidade_id, inicio")
      .in("organizacao_id", organizacoes).is("fim", null).order("id").range(de, ate), LIMITE),
    lerEmPaginas((de, ate) => supabase.from("perfis_usuario").select("id, nome, email, status, ultimo_acesso_em").order("id").range(de, ate), LIMITE),
    lerEmPaginas((de, ate) => supabase.from("convites").select("id, organizacao_id, nome, email, papel, unidades, situacao, erro")
      .in("organizacao_id", organizacoes).in("situacao", Object.keys(SITUACOES_DO_CONVITE)).order("id").range(de, ate), LIMITE),
  ]);
  if (!redes.ok || !unidades.ok || !acessos.ok || !pessoas.ok || !convites.ok) throw new FalhaDoServico("equipe_exportar");
  if (redes.mais || unidades.mais || acessos.mais || pessoas.mais || convites.mais) throw new FalhaDoServico("equipe_exportar_limite");

  const unidade = new Map(unidades.linhas.map((u) => [u.id, u.status === "ativa" ? u.nome : `${u.nome} (inativa)`] as const));
  const secoes = planilhaDaEquipe({
    redes: redes.linhas,
    pessoas: pessoas.linhas.map((x) => ({ id: x.id, nome: x.nome, email: x.email, status: x.status, ultimoAcessoEm: x.ultimo_acesso_em })),
    acessos: acessos.linhas.map((a) => ({ usuarioId: a.usuario_id, organizacaoId: a.organizacao_id, papel: a.papel, unidadeId: a.unidade_id, inicio: a.inicio })),
    convites: convites.linhas.map((c) => ({ id: c.id, organizacaoId: c.organizacao_id, nome: c.nome, email: c.email, papel: c.papel, unidades: c.unidades, situacao: c.situacao, erro: c.erro })),
    loja: (id) => (id === null ? "rede inteira" : unidade.get(id) ?? "loja não encontrada"),
    gerado: geradoEm(),
  });
  const nome = redes.linhas.length === 1 ? redes.linhas[0]?.nome ?? "rede" : "redes";
  return respostaDaPlanilha(formatoPedido(url.searchParams.get("formato"), "xlsx"), `ora5g-equipe-e-acessos-${parteDoNome(nome)}`, "Equipe e acessos", secoes);
}

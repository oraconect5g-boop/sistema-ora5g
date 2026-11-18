// O molde da sessão (lote VEL-a: ORA-QUAL-010): a situação da sessão, as permissões que montam o menu, o nome e os
// vínculos de quem pede e as contagens dos emblemas, lidos do banco numa ida só (public.molde_da_sessao). Antes eram
// a situação, 30 perguntas de permissão, o perfil, os vínculos e duas contagens, cada uma num pedido.
// Aqui fica a leitura estrita da resposta: forma inesperada é erro (a tela mostra falha), nunca "sem acesso" nem zero.
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, contagem, ehObjeto, lista, objeto, textoOuNulo, type Linha } from "../leitura-do-banco";
import { PERMISSOES_DA_REDE, PERMISSOES_DO_MENU, type PermissaoDoMenu } from "./menu";
import { ehUuid, type SituacaoSessao } from "./regras";

/**
 * O que as telas e as ações perguntam além do menu, sempre na loja do turno ou na rede: o ranking e as próprias vendas
 * (Início), o custo dos produtos (a margem), e, desde o VEL-b (18/11), o que 46 arquivos perguntavam ao banco uma a uma
 * (as fotos do catálogo, o cadastro, a exportação e a mescla de clientes, as integrações do Ora Connect, a importação, o
 * recebimento, a conferência, o ajuste e a transferência do estoque, e a troca de preço). Vêm na mesma ida do molde.
 *
 * Perguntar na loja do turno ou sem loja dá a mesma resposta numa sessão: o vínculo de organização vale sem loja e em
 * qualquer loja dela; o de loja só vale na loja do turno (packages/banco/src/sessao-molde-e-pdv.test.ts, "na loja do
 * turno e sem loja"). A pergunta sobre OUTRA loja (a da venda, a do inventário) continua indo ao banco.
 */
export const PERMISSOES_ALEM_DO_MENU = [
  "ranking.ver", "venda.ver_propria", "custo.ver",
  "catalogo.fotos", "cliente.cadastrar", "cliente.exportar", "cliente.mesclar", "integracoes.gerir", "importacao.executar", "importacao.aprovar",
  "estoque.receber", "estoque.conferir", "estoque.ajustar", "estoque.transferir", "preco.alterar",
] as const;
/** Uma permissão que o molde traz: só estas podem ser lidas com `permite`, sem outra ida ao banco. */
export type PermissaoNoMolde = PermissaoDoMenu | (typeof PERMISSOES_ALEM_DO_MENU)[number];
/** Conferidas na loja do turno (o banco usa a loja da própria sessão). */
export const PERMISSOES_DA_LOJA_NO_MOLDE: string[] = [...PERMISSOES_DO_MENU.filter((p) => !PERMISSOES_DA_REDE.has(p)), ...PERMISSOES_ALEM_DO_MENU];
/** Conferidas para a rede inteira, sem loja. */
export const PERMISSOES_DA_REDE_NO_MOLDE: string[] = [...PERMISSOES_DA_REDE];

export type VinculoDoMolde = { papel: string; escopo: string; unidade_id: string | null };

export type MoldeDaSessao = {
  /** As permissões do menu (e as poucas além dele) que a pessoa tem agora, na loja do turno. Só experiência de uso: o banco confere de novo. */
  permissoes: ReadonlySet<string>;
  /** O nome de quem pede; nulo para quem o banco não deixa ler o próprio perfil (bloqueado). */
  nome: string | null;
  vinculos: readonly VinculoDoMolde[];
  /** O que espera a pessoa nesta loja (emblemas do menu); zero para quem não decide. */
  pendencias: { aprovacoes: number; notas: number };
};

function lerSituacao(l: Linha): SituacaoSessao {
  const unidade = textoOuNulo(l, "unidade_id");
  if (unidade !== null && !ehUuid(unidade)) throw new RespostaInesperada("unidade_id");
  const fim = textoOuNulo(l, "turno_termina_em");
  if (fim !== null && Number.isNaN(new Date(fim).getTime())) throw new RespostaInesperada("turno_termina_em");
  return {
    usuario_ativo: booleano(l, "usuario_ativo"),
    sessao_no_turno: booleano(l, "sessao_no_turno"),
    unidade_id: unidade,
    unidade_nome: textoOuNulo(l, "unidade_nome"),
    turno_termina_em: fim,
    segundo_fator_pendente: booleano(l, "segundo_fator_pendente"),
  };
}

/**
 * A pessoa tem a permissão na loja do turno (ou na rede, que dá a mesma resposta)? Lida do molde da sessão, que o banco
 * montou nesta tela ou nesta ação: sem outra ida. Só experiência de uso e porta de entrada: o banco confere de novo em
 * cada consulta (RLS) e em cada ação.
 */
export const permite = (sessao: { molde: MoldeDaSessao }, permissao: PermissaoNoMolde) => sessao.molde.permissoes.has(permissao);

/** Lê a resposta de public.molde_da_sessao. Lança RespostaInesperada quando a forma não é a combinada. */
export function lerMoldeDaSessao(dado: unknown): { situacao: SituacaoSessao; molde: MoldeDaSessao } {
  if (!ehObjeto(dado)) throw new RespostaInesperada("molde_da_sessao");
  const permissoes = dado["permissoes"];
  if (!Array.isArray(permissoes) || !permissoes.every((p): p is string => typeof p === "string" && p !== "")) throw new RespostaInesperada("permissoes");
  const pendencias = objeto(dado, "pendencias");
  return {
    situacao: lerSituacao(objeto(dado, "situacao")),
    molde: {
      permissoes: new Set(permissoes),
      nome: textoOuNulo(dado, "nome"),
      vinculos: lista(dado, "vinculos").map((v) => {
        const papel = v["papel"];
        const escopo = v["escopo"];
        if (typeof papel !== "string" || papel === "") throw new RespostaInesperada("vinculos.papel");
        if (typeof escopo !== "string" || escopo === "") throw new RespostaInesperada("vinculos.escopo");
        const unidade = textoOuNulo(v, "unidade_id");
        if (unidade !== null && !ehUuid(unidade)) throw new RespostaInesperada("vinculos.unidade_id");
        return { papel, escopo, unidade_id: unidade };
      }),
      pendencias: { aprovacoes: contagem(pendencias, "aprovacoes"), notas: contagem(pendencias, "notas") },
    },
  };
}

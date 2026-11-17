// O molde da sessão (lote VEL-a: ORA-QUAL-010): a situação da sessão, as permissões que montam o menu, o nome e os
// vínculos de quem pede e as contagens dos emblemas, lidos do banco numa ida só (public.molde_da_sessao). Antes eram
// a situação, 30 perguntas de permissão, o perfil, os vínculos e duas contagens, cada uma num pedido.
// Aqui fica a leitura estrita da resposta: forma inesperada é erro (a tela mostra falha), nunca "sem acesso" nem zero.
import { RespostaInesperada } from "../financeiro/painel";
import { booleano, contagem, ehObjeto, lista, objeto, textoOuNulo, type Linha } from "../leitura-do-banco";
import { PERMISSOES_DA_REDE, PERMISSOES_DO_MENU } from "./menu";
import { ehUuid, type SituacaoSessao } from "./regras";

/**
 * O que algumas telas perguntam além do menu, sempre na loja do turno: o ranking e as próprias vendas (Início) e o
 * custo dos produtos (a margem, no Início e nos Relatórios). Vêm na mesma ida; antes eram mais uma ida por tela.
 */
export const PERMISSOES_ALEM_DO_MENU = ["ranking.ver", "venda.ver_propria", "custo.ver"] as const;
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

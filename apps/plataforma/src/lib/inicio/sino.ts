// O sino do topo de todas as telas (G6, REPORT-007): a leitura estrita da resposta de /api/pendencias, o número do
// emblema e a lembrança de um minuto na aba, da pessoa e da loja (para não repetir a leitura a cada tela). Sem React: testado à parte.
import { ehNomeDoIconeDaPendencia, type NomeDoIconeDaPendencia } from "./icones-das-pendencias";

export type ItemDoSino = { rotulo: string; detalhe: string; href: string; icone: NomeDoIconeDaPendencia; quantidade: number; alerta: boolean };
export const VALIDADE_DO_SINO_MS = 60_000;
export const CHAVE_DO_SINO = "ora5g:sino";

/**
 * Converte a lista de pendências: só os itens com algo a fazer (quantidade acima de zero), na ordem do Início. Forma
 * inesperada (campo faltando, endereço de fora, número quebrado) é nulo: o sino diz que não leu, nunca mostra zero.
 */
export function lerItensDoSino(lista: unknown): ItemDoSino[] | null {
  if (!Array.isArray(lista)) return null;
  const itens: ItemDoSino[] = [];
  for (const p of lista) {
    if (typeof p !== "object" || p === null) return null;
    const { rotulo, detalhe, href, icone, quantidade, alerta } = p as Record<string, unknown>;
    if (typeof rotulo !== "string" || rotulo === "" || typeof detalhe !== "string" || typeof href !== "string" || !href.startsWith("/") || href.startsWith("//")
      || !ehNomeDoIconeDaPendencia(icone) || typeof quantidade !== "number" || !Number.isInteger(quantidade) || quantidade < 0 || typeof alerta !== "boolean") {
      return null;
    }
    if (quantidade > 0) itens.push({ rotulo, detalhe, href, icone, quantidade, alerta });
  }
  return itens;
}

/** A resposta da rota: as pendências da loja do turno que a tela mostra (outra loja é falha: o turno mudou no meio). */
export function lerRespostaDoSino(dado: unknown, unidade: string): ItemDoSino[] | null {
  if (typeof dado !== "object" || dado === null) return null;
  const { unidade: daResposta, pendencias } = dado as Record<string, unknown>;
  return daResposta === unidade ? lerItensDoSino(pendencias) : null;
}

/** O número do emblema: a soma do que espera; "99+" acima de 99; nada quando não há nada. */
export function emblemaDoSino(itens: readonly ItemDoSino[]): string | null {
  const total = itens.reduce((soma, i) => soma + i.quantidade, 0);
  if (total === 0) return null;
  return total > 99 ? "99+" : String(total);
}

/**
 * De quem é a lembrança: a pessoa e a loja do turno (#96). Outra pessoa na mesma aba (troca de usuário sem fechar a aba)
 * ou outra loja nunca lê a lembrança de antes; a tela de entrada apaga a lembrança (saída, sessão revogada ou vencida).
 */
export type DonoDaLembranca = { usuario: string; unidade: string };

/** A lembrança da aba: vale um minuto, só para a mesma pessoa e a mesma loja, e passa pela mesma leitura estrita. */
export function lembrancaDoSino(bruta: string | null, dono: DonoDaLembranca, agora: number): ItemDoSino[] | null {
  if (!bruta || !dono.usuario || !dono.unidade) return null;
  try {
    const { versao, usuario, unidade, em, itens } = JSON.parse(bruta) as Record<string, unknown>;
    if (versao !== 2 || usuario !== dono.usuario || unidade !== dono.unidade || typeof em !== "number" || em > agora || agora - em > VALIDADE_DO_SINO_MS) return null;
    return lerItensDoSino(itens);
  } catch {
    return null;
  }
}

export const lembrar = (dono: DonoDaLembranca, itens: readonly ItemDoSino[], agora: number) =>
  JSON.stringify({ versao: 2, usuario: dono.usuario, unidade: dono.unidade, em: agora, itens });

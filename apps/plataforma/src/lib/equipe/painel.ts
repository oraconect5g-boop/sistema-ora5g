// Equipe: pessoas por papel (lote G5: linha 7 da matriz, U1). Leitura estrita de public.equipe_por_papel
// e a ordem da tela. A contagem no banco está provada em packages/banco/src/equipe-por-papel.test.ts;
// aqui não há acesso a dados. Quem tem dois papéis conta em cada um; o total conta cada pessoa uma vez.
import { PAPEIS, ehPapel, type Papel } from "../acesso/regras";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, texto as t } from "../leitura-do-banco";

export type EquipePorPapel = {
  /** Pessoas com acesso vigente na rede, cada uma uma vez. */
  pessoas: number;
  bloqueadas: number;
  papeis: { papel: string; pessoas: number; bloqueadas: number }[];
};

/** Converte a resposta de public.equipe_por_papel. Conta que não fecha é falha, não número. */
export function lerEquipePorPapel(dado: unknown): EquipePorPapel {
  if (!ehObjeto(dado)) throw new RespostaInesperada("equipe_por_papel");
  const pessoas = n(dado, "pessoas");
  const bloqueadas = n(dado, "bloqueadas");
  if (pessoas < 0 || bloqueadas < 0 || bloqueadas > pessoas) throw new RespostaInesperada("pessoas");
  const papeis = lista(dado, "papeis").map((l) => {
    const p = { papel: t(l, "papel"), pessoas: n(l, "pessoas"), bloqueadas: n(l, "bloqueadas") };
    // Num papel não cabe mais gente que no total, nem bloqueada além das pessoas do papel.
    if (p.pessoas < 1 || p.pessoas > pessoas || p.bloqueadas < 0 || p.bloqueadas > p.pessoas || p.bloqueadas > bloqueadas) throw new RespostaInesperada("papel");
    return p;
  });
  if (new Set(papeis.map((p) => p.papel)).size !== papeis.length) throw new RespostaInesperada("papel repetido");
  // Toda pessoa do total tem pelo menos um papel.
  if (pessoas > papeis.reduce((soma, p) => soma + p.pessoas, 0)) throw new RespostaInesperada("total");
  return { pessoas, bloqueadas, papeis };
}

const ORDEM: readonly Papel[] = ["dono", "administrador", "gerente", "vendedor", "tecnico"];
const NO_PLURAL: Record<Papel, string> = { dono: "Donos", administrador: "Administradores", gerente: "Gerentes", vendedor: "Vendedores", tecnico: "Técnicos" };

/** Os papéis na ordem da tela: os conhecidos sempre (zero também é informação, como "nenhum gerente"), depois os novos que o banco trouxer. */
export function papeisDaTela(e: EquipePorPapel): { papel: string; nome: string; pessoas: number; bloqueadas: number }[] {
  const doBanco = new Map(e.papeis.map((p) => [p.papel, p] as const));
  const conhecidos = ORDEM.map((papel) => ({ papel, nome: NO_PLURAL[papel], pessoas: doBanco.get(papel)?.pessoas ?? 0, bloqueadas: doBanco.get(papel)?.bloqueadas ?? 0 }));
  const novos = e.papeis.filter((p) => !ehPapel(p.papel)).map((p) => ({ ...p, nome: p.papel }));
  return [...conhecidos, ...novos];
}

/** O nome de um papel no singular, para o texto ("Gerente"). */
export const nomeDoPapel = (papel: string) => (ehPapel(papel) ? PAPEIS[papel].nome : papel);

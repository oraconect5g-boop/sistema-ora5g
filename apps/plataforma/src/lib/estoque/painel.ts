// Painéis do estoque (lote G3): leitura de public.estoque_painel e as regras puras do que a tela
// mostra. Contrato: docs/alinhamento/MATRIZ_DEMO_REAL.md, linha 21 e seção 3.6 (E1 a E7); a soma no
// banco está provada em packages/banco/src/estoque-painel.test.ts. Aqui não há acesso a dados.
//
//   E1 físico, E2 reservado, E3 disponível (físico − reservado, só nos locais que vendem);
//   E4 chegando (transferência enviada e ainda não recebida, no destino);
//   E5 abaixo do mínimo (pares loja × variação, inclusive a loja sem saldo);
//   E6 parado há mais de 60 dias; E7 pendências de cada local.
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, lista, objeto, texto as t, textoOuNulo as tOuNulo, type Linha } from "../leitura-do-banco";

// ---------------------------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------------------------
const numeros = (l: Linha) => ({ fisico: n(l, "fisico"), reservado: n(l, "reservado"), disponivel: n(l, "disponivel"), abaixoDoMinimo: n(l, "abaixo_do_minimo"), parado: n(l, "parado"), chegando: n(l, "chegando") });
export type NumerosDoEstoque = ReturnType<typeof numeros>;

const PENDENCIAS = ["a_separar", "a_enviar", "a_receber", "inventarios_abertos", "retornos_a_conferir", "sem_conferencia_hoje"] as const;
export type Pendencia = (typeof PENDENCIAS)[number];

function local(l: Linha) {
  const vende = l.vende;
  if (typeof vende !== "boolean") throw new RespostaInesperada("vende");
  return {
    unidadeId: t(l, "unidade_id"), nome: t(l, "nome"), tipo: t(l, "tipo"), vende, ...numeros(l),
    pendencias: Object.fromEntries(PENDENCIAS.map((p) => [p, n(l, p)])) as Record<Pendencia, number>,
  };
}
export type LocalDoEstoque = ReturnType<typeof local>;

const modelo = (l: Linha) => ({
  produtoId: t(l, "produto_id"), produto: t(l, "produto"), tipo: t(l, "tipo"), categoria: tOuNulo(l, "categoria"), minimo: n(l, "minimo"), ...numeros(l),
});
export type ModeloDoEstoque = ReturnType<typeof modelo>;

export type EstoqueDoBanco = {
  totais: NumerosDoEstoque & { foraDaVenda: number };
  locais: LocalDoEstoque[];
  modelos: ModeloDoEstoque[];
  categorias: (NumerosDoEstoque & { categoria: string | null })[];
};

/** Converte a resposta de public.estoque_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerEstoque(dado: unknown): EstoqueDoBanco {
  if (!ehObjeto(dado)) throw new RespostaInesperada("estoque_painel");
  const totais = objeto(dado, "totais");
  const e = {
    totais: { ...numeros(totais), foraDaVenda: n(totais, "fora_da_venda") },
    locais: lista(dado, "locais").map(local),
    modelos: lista(dado, "modelos").map(modelo),
    categorias: lista(dado, "categorias").map((l) => ({ categoria: tOuNulo(l, "categoria"), ...numeros(l) })),
  };
  // O disponível é o físico menos o reservado em cada grão: conta que não fecha é falha de leitura.
  for (const x of [e.totais, ...e.modelos, ...e.categorias]) if (x.disponivel !== x.fisico - x.reservado) throw new RespostaInesperada("disponivel");
  return e;
}

// ---------------------------------------------------------------------------------------------
// Regras da tela
// ---------------------------------------------------------------------------------------------
/** Os modelos do gráfico: os de maior disponível, sem esconder os que estão abaixo do mínimo. */
export function modelosDoGrafico(modelos: readonly ModeloDoEstoque[], limite = 10): ModeloDoEstoque[] {
  const porDisponivel = [...modelos].sort((a, b) => b.disponivel - a.disponivel || a.produto.localeCompare(b.produto, "pt-BR"));
  const escolhidos = porDisponivel.slice(0, limite);
  const abaixoDeFora = porDisponivel.slice(limite).filter((m) => m.abaixoDoMinimo > 0);
  // Modelo abaixo do mínimo entra no lugar do último sem alerta, para o alerta nunca ficar fora do gráfico.
  for (const m of abaixoDeFora) {
    const trocar = escolhidos.map((x, i) => [x, i] as const).reverse().find(([x]) => x.abaixoDoMinimo === 0);
    if (!trocar) break;
    escolhidos.splice(trocar[1], 1);
    escolhidos.push(m);
  }
  return escolhidos.sort((a, b) => b.disponivel - a.disponivel || a.produto.localeCompare(b.produto, "pt-BR"));
}

/** Categorias da barra (partes do disponível): até cinco e o resto em "Outras", com a cor fixa por posição no cadastro de cores. */
export function categoriasDaBarra(categorias: EstoqueDoBanco["categorias"], limite = 5) {
  const comDisponivel = categorias.filter((c) => c.disponivel > 0).sort((a, b) => b.disponivel - a.disponivel);
  const nome = (c: { categoria: string | null }) => c.categoria ?? "Sem categoria";
  const primeiras = comDisponivel.slice(0, limite).map((c, i) => ({ nome: nome(c), valor: c.disponivel, serie: (i + 1) as 1 | 2 | 3 | 4 | 5 }));
  const resto = comDisponivel.slice(limite).reduce((s, c) => s + c.disponivel, 0);
  return resto > 0 ? [...primeiras, { nome: "Outras", valor: resto, serie: 6 as const }] : primeiras;
}

/** Cada pendência: o nome na lista, onde se resolve e como se conta ("1 transferência a separar"). */
export const NOMES_DAS_PENDENCIAS: Record<Pendencia, { rotulo: string; href: string; um: string; varios: string }> = {
  a_separar: { rotulo: "Transferências a separar", href: "/transferencias", um: "transferência a separar", varios: "transferências a separar" },
  a_enviar: { rotulo: "Transferências a enviar", href: "/transferencias", um: "transferência a enviar", varios: "transferências a enviar" },
  a_receber: { rotulo: "Transferências a receber", href: "/transferencias", um: "transferência a receber", varios: "transferências a receber" },
  inventarios_abertos: { rotulo: "Inventários em contagem ou aguardando decisão", href: "/estoque/inventario", um: "inventário aberto", varios: "inventários abertos" },
  retornos_a_conferir: { rotulo: "Retornos de venda cancelada a conferir", href: "/vendas", um: "retorno a conferir", varios: "retornos a conferir" },
  sem_conferencia_hoje: { rotulo: "Aparelhos e chips sem a conferência de hoje", href: "/estoque?aba=conferencia", um: "item sem conferência hoje", varios: "itens sem conferência hoje" },
};

/** As pendências de um conjunto de locais, somadas, na ordem fixa; só as que têm algo. */
export function pendenciasDe(locais: readonly LocalDoEstoque[]) {
  return PENDENCIAS.map((p) => ({ chave: p, ...NOMES_DAS_PENDENCIAS[p], quantidade: locais.reduce((s, l) => s + l.pendencias[p], 0) })).filter((p) => p.quantidade > 0);
}

/**
 * Recorte do painel. Quem consulta mais de um local escolhe: um deles ou a rede inteira (o padrão é
 * a loja do turno, como no /financeiro). Local que a pessoa não consulta cai no padrão.
 */
export function escopoDoEstoque(parametro: string | undefined, locais: readonly LocalDoEstoque[], turno: string): { unidade: string | null; chave: string } {
  if (locais.length <= 1) return { unidade: locais[0]?.unidadeId ?? turno, chave: locais[0]?.unidadeId ?? turno };
  if (parametro === "rede") return { unidade: null, chave: "rede" };
  const pedido = locais.find((l) => l.unidadeId === parametro);
  if (pedido) return { unidade: pedido.unidadeId, chave: pedido.unidadeId };
  return locais.some((l) => l.unidadeId === turno) ? { unidade: turno, chave: turno } : { unidade: null, chave: "rede" };
}

// Painéis do Início (lote G1): leitura de public.vendas_painel e as regras puras dos gráficos.
// Contrato dos números: docs/alinhamento/MATRIZ_DEMO_REAL.md, seção 3. Aqui não há acesso a dados
// (as consultas ficam em ./consulta); a soma no banco está provada em
// packages/banco/src/vendas-painel.test.ts. Nada de custo nem margem neste arquivo.
import { centavosDoBanco } from "../dinheiro";
import type { Escopo, LojaDoFiltro } from "../financeiro/escopo";
import { chavesDaJanela, RespostaInesperada, rotuloDaChave, type Janela, type MeioRecebido, type PeriodoFinanceiro } from "../financeiro/painel";

/** Resultado de uma leitura. Falha e fonte ausente têm estado próprio: nunca viram zero. */
export type Leitura<T> = { estado: "ok"; dados: T } | { estado: "indisponivel" } | { estado: "falha" };

// ---------------------------------------------------------------------------------------------
// Leitura da resposta do banco
// ---------------------------------------------------------------------------------------------
type Linha = Record<string, unknown>;
const ehObjeto = (v: unknown): v is Linha => typeof v === "object" && v !== null && !Array.isArray(v);
const lista = (dado: Linha, campo: string): Linha[] => {
  const v = dado[campo];
  if (!Array.isArray(v) || !v.every(ehObjeto)) throw new RespostaInesperada(campo);
  return v;
};
// Número ausente é erro, não zero: centavosDoBanco recusa undefined, nulo e fração.
const n = (l: Linha, campo: string) => centavosDoBanco(l[campo]);
const t = (l: Linha, campo: string) => {
  const v = l[campo];
  if (typeof v !== "string" || v === "") throw new RespostaInesperada(campo);
  return v;
};
const tOuNulo = (l: Linha, campo: string) => {
  const v = l[campo];
  if (v === null) return null;
  if (typeof v !== "string") throw new RespostaInesperada(campo);
  return v;
};
const desfeitos = (l: Linha) => ({ cancelamentos: n(l, "cancelamentos"), cancelado: n(l, "cancelado"), devolucoes: n(l, "devolucoes"), devolvido: n(l, "devolvido") });
const porItem = (l: Linha) => ({
  itens: n(l, "itens"), vendido: n(l, "vendido"),
  itensCancelados: n(l, "itens_cancelados"), cancelado: n(l, "cancelado"),
  itensDevolvidos: n(l, "itens_devolvidos"), devolvido: n(l, "devolvido"),
});

type Desfeitos = ReturnType<typeof desfeitos>;
type PorItem = ReturnType<typeof porItem>;
export type VendasDoBanco = {
  totais: { vendas: number; vendido: number; subtotal: number; descontos: number; vendasComDesconto: number } & Desfeitos;
  periodos: ({ periodo: string; vendas: number; vendido: number; subtotal: number; descontos: number } & Desfeitos)[];
  tipos: ({ tipo: string } & PorItem)[];
  categorias: ({ categoriaId: string | null; categoria: string | null } & PorItem)[];
  lojas: ({ unidadeId: string; nome: string | null; vendas: number; vendido: number } & Desfeitos)[];
  vendedores: ({ vendedorId: string; vendas: number; vendido: number } & Desfeitos)[];
};

/** Converte a resposta de public.vendas_painel. Forma inesperada é erro (a tela mostra falha, não zero). */
export function lerVendas(dado: unknown): VendasDoBanco {
  if (!ehObjeto(dado)) throw new RespostaInesperada("vendas_painel");
  const totais = dado.totais;
  if (!ehObjeto(totais)) throw new RespostaInesperada("totais");
  return {
    totais: { vendas: n(totais, "vendas"), vendido: n(totais, "vendido"), subtotal: n(totais, "subtotal"), descontos: n(totais, "descontos"), vendasComDesconto: n(totais, "vendas_com_desconto"), ...desfeitos(totais) },
    periodos: lista(dado, "periodos").map((l) => ({ periodo: t(l, "periodo"), vendas: n(l, "vendas"), vendido: n(l, "vendido"), subtotal: n(l, "subtotal"), descontos: n(l, "descontos"), ...desfeitos(l) })),
    tipos: lista(dado, "tipos").map((l) => ({ tipo: t(l, "tipo"), ...porItem(l) })),
    categorias: lista(dado, "categorias").map((l) => ({ categoriaId: tOuNulo(l, "categoria_id"), categoria: tOuNulo(l, "categoria"), ...porItem(l) })),
    lojas: lista(dado, "lojas").map((l) => ({ unidadeId: t(l, "unidade_id"), nome: tOuNulo(l, "nome"), vendas: n(l, "vendas"), vendido: n(l, "vendido"), ...desfeitos(l) })),
    vendedores: lista(dado, "vendedores").map((l) => ({ vendedorId: t(l, "vendedor_id"), vendas: n(l, "vendas"), vendido: n(l, "vendido"), ...desfeitos(l) })),
  };
}

// ---------------------------------------------------------------------------------------------
// Quem vê o quê, e de qual loja
// ---------------------------------------------------------------------------------------------
export type Visao = "rede" | "loja" | "vendedor" | "nenhuma";

/** A visão mais ampla que a pessoa tem: rede (venda.ver_todas), loja do turno (venda.ver_unidade) ou só as próprias vendas. */
export const visaoDoInicio = (p: { verTodas: boolean; verUnidade: boolean; verPropria: boolean }): Visao =>
  p.verTodas ? "rede" : p.verUnidade ? "loja" : p.verPropria ? "vendedor" : "nenhuma";

/**
 * Escopo dos painéis. Quem vê a rede começa pela rede inteira e pode escolher uma loja; os demais
 * ficam na loja do turno, qualquer que seja o endereço pedido (o banco confere de novo pelo RLS).
 */
export function escopoDoInicio(parametro: string | undefined, lojas: readonly LojaDoFiltro[], turno: LojaDoFiltro, daRede: boolean): Escopo {
  if (!daRede) return { unidade: turno.id, nome: turno.nome, chave: turno.id };
  const loja = parametro === turno.id ? turno : lojas.find((l) => l.id === parametro);
  return loja ? { unidade: loja.id, nome: loja.nome, chave: loja.id } : { unidade: null, nome: "Rede inteira", chave: "rede" };
}

/** Opções do filtro de loja no Início: a rede, a loja do turno e as demais em ordem alfabética. */
export function lojasDoFiltro(lojas: readonly LojaDoFiltro[], turno: LojaDoFiltro): LojaDoFiltro[] {
  const outras = lojas.filter((l) => l.id !== turno.id).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return [{ id: "rede", nome: "Rede inteira" }, turno, ...outras];
}

const endereco = (caminho: string, valores: Record<string, string | null | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) if (v) q.set(k, v);
  const texto = q.toString();
  return texto ? `${caminho}?${texto}` : caminho;
};

/** Endereço do Início: o padrão (hoje; rede inteira ou loja do turno) fica fora do endereço. */
export const enderecoDoInicio = (periodo: PeriodoFinanceiro, loja: string | null): string =>
  endereco("/inicio", { periodo: periodo === "hoje" ? null : periodo, loja });

/**
 * O mesmo recorte no /financeiro, onde ficam os registros que explicam cada número (lá o padrão é a
 * loja do turno). `ver` abre direto os registros de pagamentos.
 */
export const enderecoDoFinanceiro = (periodo: PeriodoFinanceiro, escopo: Escopo, turno: string, daRede: boolean, ver?: "pagamentos"): string =>
  endereco("/financeiro", { periodo: periodo === "hoje" ? null : periodo, loja: daRede && escopo.unidade !== turno ? escopo.unidade ?? "rede" : null, ver });

// ---------------------------------------------------------------------------------------------
// Números do período
// ---------------------------------------------------------------------------------------------
/** V5: vendido ÷ vendas, no centavo. Sem venda não há ticket (a tela diz "sem vendas", não zero). */
export const ticketMedio = (vendido: number, vendas: number): number | null => (vendas > 0 ? Math.round(vendido / vendas) : null);

export function numerosDasVendas(v: VendasDoBanco) {
  const { vendas, vendido, subtotal, descontos, vendasComDesconto, cancelamentos, cancelado, devolucoes, devolvido } = v.totais;
  return {
    vendas, vendido, descontos, vendasComDesconto, cancelamentos, cancelado, devolucoes, devolvido,
    desfeito: cancelado + devolvido,
    liquido: vendido - cancelado - devolvido,
    ticket: ticketMedio(vendido, vendas),
    /** V6: descontos ÷ valor de tabela das vendas do período. */
    fracaoDeDesconto: subtotal > 0 ? descontos / subtotal : null,
  };
}
export type NumerosDasVendas = ReturnType<typeof numerosDasVendas>;

/** ok: há base para o percentual; sem_historico: leu e não havia venda antes; nao_lida: o período anterior não pôde ser lido. */
export type Comparacao = "ok" | "sem_historico" | "nao_lida";
export const comparacaoDasVendas = (anterior: Leitura<VendasDoBanco>): Comparacao =>
  anterior.estado !== "ok" ? "nao_lida" : anterior.dados.totais.vendas > 0 ? "ok" : "sem_historico";

export const NOMES_DAS_SERIES: Record<PeriodoFinanceiro, { atual: string; anterior: string }> = {
  hoje: { atual: "Hoje", anterior: "Ontem" },
  "7": { atual: "Estes 7 dias", anterior: "7 dias anteriores" },
  "30": { atual: "Estes 30 dias", anterior: "30 dias anteriores" },
};

// ---------------------------------------------------------------------------------------------
// Série do gráfico: o período atual e o anterior, ponto a ponto
// ---------------------------------------------------------------------------------------------
export type PontoDeVendas = {
  chave: string; rotulo: string; vendas: number; vendido: number;
  /** Mesma hora de ontem, ou o dia na mesma posição da janela anterior. */
  chaveAnterior: string | null; rotuloAnterior: string | null; vendasAntes: number; vendidoAntes: number;
};

export function serieDeVendas(atual: VendasDoBanco, anterior: VendasDoBanco | null, janelas: { atual: Janela; anterior: Janela; porHora: boolean }): PontoDeVendas[] {
  const fatos = new Map(atual.periodos.map((p) => [p.periodo, p] as const));
  const antes = new Map((anterior?.periodos ?? []).map((p) => [p.periodo, p] as const));
  const diasAnteriores = chavesDaJanela(janelas.anterior, false);
  let pares: (readonly [string, string | null])[];
  if (janelas.porHora) {
    const diaAtual = chavesDaJanela(janelas.atual, false)[0] ?? "";
    const diaAnterior = diasAnteriores[0] ?? "";
    // Fato de ontem antes das 7h também abre a hora no eixo de hoje.
    const levadas = [...antes.keys()].filter((c) => c.startsWith(diaAnterior)).map((c) => `${diaAtual}${c.slice(10)}`);
    pares = chavesDaJanela(janelas.atual, true, [...fatos.keys(), ...levadas]).map((c) => [c, `${diaAnterior}${c.slice(10)}`] as const);
  } else {
    pares = chavesDaJanela(janelas.atual, false).map((c, i) => [c, diasAnteriores[i] ?? null] as const);
  }
  return pares.map(([chave, chaveAnterior]) => {
    const f = fatos.get(chave);
    const a = chaveAnterior ? antes.get(chaveAnterior) : undefined;
    return {
      chave, rotulo: rotuloDaChave(chave), vendas: f?.vendas ?? 0, vendido: f?.vendido ?? 0,
      chaveAnterior, rotuloAnterior: chaveAnterior ? rotuloDaChave(chaveAnterior) : null, vendasAntes: a?.vendas ?? 0, vendidoAntes: a?.vendido ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Mix, lojas, vendedores e meios: ordem e cor fixas por entidade
// ---------------------------------------------------------------------------------------------
type Cor = 1 | 2 | 3 | 4 | 5 | 6;

/** Rótulo repetido ganha número ("Loja inativa (2)"): os gráficos usam o nome como identidade visível. */
function rotulosUnicos<T extends { nome: string }>(linhas: readonly T[]): T[] {
  const vistos = new Map<string, number>();
  return linhas.map((l) => {
    const vez = (vistos.get(l.nome) ?? 0) + 1;
    vistos.set(l.nome, vez);
    return vez === 1 ? l : { ...l, nome: `${l.nome} (${vez})` };
  });
}
const porVendido = <T extends { vendido: number; nome: string }>(a: T, b: T) => b.vendido - a.vendido || a.nome.localeCompare(b.nome, "pt-BR");

// V7: grupos do mix. A cor é do grupo (não da posição) e a soma dos grupos é o total vendido (V1).
const GRUPOS = [
  { chave: "aparelhos", nome: "Aparelhos", serie: 1, tipos: ["aparelho"] },
  { chave: "acessorios", nome: "Acessórios", serie: 2, tipos: ["acessorio"] },
  { chave: "connect", nome: "Ora Connect", serie: 3, tipos: ["chip", "ativacao", "portabilidade", "recarga"] },
  { chave: "servicos", nome: "Serviços", serie: 4, tipos: ["servico"] },
] as const;
type Medidas = { itens: number; vendido: number; itensDesfeitos: number; desfeito: number };
const medidas = (linhas: readonly PorItem[]): Medidas => linhas.reduce<Medidas>((s, l) => ({
  itens: s.itens + l.itens, vendido: s.vendido + l.vendido,
  itensDesfeitos: s.itensDesfeitos + l.itensCancelados + l.itensDevolvidos, desfeito: s.desfeito + l.cancelado + l.devolvido,
}), { itens: 0, vendido: 0, itensDesfeitos: 0, desfeito: 0 });

export type GrupoDoMix = { chave: string; nome: string; serie: Cor } & Medidas;
export function mixPorGrupo(tipos: VendasDoBanco["tipos"]): GrupoDoMix[] {
  const grupos: GrupoDoMix[] = GRUPOS.map((g) => ({ chave: g.chave, nome: g.nome, serie: g.serie, ...medidas(tipos.filter((x) => (g.tipos as readonly string[]).includes(x.tipo))) }));
  const conhecidos = new Set<string>(GRUPOS.flatMap((g) => g.tipos));
  // Tipo que esta tela ainda não conhece não some: vai para "Outros", e a soma continua igual a V1.
  const outros = medidas(tipos.filter((x) => !conhecidos.has(x.tipo)));
  return outros.itens || outros.vendido || outros.itensDesfeitos || outros.desfeito ? [...grupos, { chave: "outros", nome: "Outros", serie: 5, ...outros }] : grupos;
}

export type CategoriaDoMix = { chave: string; nome: string } & Medidas;
/** V8: todas as categorias (tabela) e as maiores para o gráfico; o resto junta em "Outras categorias". */
export function categoriasDoMix(categorias: VendasDoBanco["categorias"], limite = 6): { barras: CategoriaDoMix[]; todas: CategoriaDoMix[] } {
  const todas = rotulosUnicos(categorias
    .map((c): CategoriaDoMix => ({ chave: c.categoriaId ?? "sem-categoria", nome: c.categoria ?? (c.categoriaId ? "Categoria não identificada" : "Sem categoria"), ...medidas([c]) }))
    .sort(porVendido));
  const comVenda = todas.filter((c) => c.vendido > 0);
  const resto = comVenda.slice(limite);
  // Uma categoria sozinha não vira "outras": só junta quando sobram duas ou mais.
  const barras = resto.length > 1
    ? rotulosUnicos([...comVenda.slice(0, limite), { chave: "outras", nome: "Outras categorias", ...resto.reduce<Medidas>((s, c) => ({ itens: s.itens + c.itens, vendido: s.vendido + c.vendido, itensDesfeitos: s.itensDesfeitos + c.itensDesfeitos, desfeito: s.desfeito + c.desfeito }), { itens: 0, vendido: 0, itensDesfeitos: 0, desfeito: 0 }) }])
    : comVenda;
  return { barras, todas };
}

type Desempenho = { id: string; nome: string; vendas: number; vendido: number; desfeito: number; liquido: number; ticket: number | null };
const desempenho = (id: string, nome: string, l: { vendas: number; vendido: number } & Desfeitos): Desempenho => ({
  id, nome, vendas: l.vendas, vendido: l.vendido, desfeito: l.cancelado + l.devolvido, liquido: l.vendido - l.cancelado - l.devolvido, ticket: ticketMedio(l.vendido, l.vendas),
});

const SEM_FATOS = { vendas: 0, vendido: 0, cancelamentos: 0, cancelado: 0, devolucoes: 0, devolvido: 0 };
export type LojaDoPainel = Desempenho;
/**
 * V9: a venda fica na loja em que foi feita. Loja do cadastro sem venda no período entra com zero (a
 * leitura da rede deu certo e não achou fato); loja que a pessoa não lê mais (inativa) aparece sem o nome.
 */
export function lojasDoPainel(lojas: VendasDoBanco["lojas"], cadastro: readonly LojaDoFiltro[] = []): LojaDoPainel[] {
  const comFatos = new Set(lojas.map((l) => l.unidadeId));
  const nomes = new Map(cadastro.map((l) => [l.id, l.nome] as const));
  return rotulosUnicos([
    ...lojas.map((l) => desempenho(l.unidadeId, l.nome ?? nomes.get(l.unidadeId) ?? "Loja inativa", l)),
    ...cadastro.filter((l) => !comFatos.has(l.id)).map((l) => desempenho(l.id, l.nome, SEM_FATOS)),
  ].sort(porVendido));
}

export type VendedorDoPainel = Desempenho & { eu: boolean };
/** V10: vendido por vendedor de origem (não é comissão). Os nomes vêm de ranking_nomes; quem consulta vê "(você)". */
export function vendedoresDoPainel(vendedores: VendasDoBanco["vendedores"], nomes: ReadonlyMap<string, string>, eu: string): VendedorDoPainel[] {
  return rotulosUnicos(vendedores.map((v) => {
    const nome = nomes.get(v.vendedorId);
    const sou = v.vendedorId === eu;
    return { ...desempenho(v.vendedorId, sou ? (nome ? `${nome} (você)` : "Você") : nome ?? "Vendedor não identificado", v), eu: sou };
  }).sort(porVendido));
}

// P1: cada meio tem a sua cor, sempre a mesma, em qualquer período.
const MEIOS_COM_COR = ["pix_picpay", "cartao_picpay", "dinheiro", "pix_direto", "cartao_pagseguro", "link_pagamento"] as const;
export type ParteRecebida = { chave: string; nome: string; nomeInteiro: string; valor: number; quantidade: number; entradas: number; serie: Cor };
/** Partes do "Recebido na loja" por meio, na ordem fixa; a soma das partes é o recebido do financeiro. */
export function partesRecebidas(meios: readonly MeioRecebido[]): ParteRecebida[] {
  const parte = (m: MeioRecebido, serie: Cor): ParteRecebida => ({ chave: m.meio, nome: m.nome.replace(" na maquininha", ""), nomeInteiro: m.nome, valor: m.valor, quantidade: m.quantidade, entradas: m.entradas, serie });
  const fixas = MEIOS_COM_COR.flatMap((codigo, i) => {
    const m = meios.find((x) => x.meio === codigo);
    return m ? [parte(m, (i + 1) as Cor)] : [];
  });
  const fora = meios.filter((m) => !(MEIOS_COM_COR as readonly string[]).includes(m.meio));
  if (fora.length === 0) return fixas;
  // Meio que esta tela ainda não conhece: junta com o link de pagamento na sexta cor, sem perder valor.
  const juntas = [...fixas.filter((p) => p.serie === 6), ...fora.map((m) => parte(m, 6))];
  const soma = (campo: "valor" | "quantidade" | "entradas") => juntas.reduce((s, p) => s + p[campo], 0);
  return [...fixas.filter((p) => p.serie !== 6), { chave: "outros", nome: "Outros meios", nomeInteiro: `Outros meios (${juntas.map((p) => p.nomeInteiro).join(", ")})`, valor: soma("valor"), quantidade: soma("quantidade"), entradas: soma("entradas"), serie: 6 }];
}

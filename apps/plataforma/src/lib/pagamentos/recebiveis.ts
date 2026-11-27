// Recebíveis por loja e adquirente (lote L8e: ORA-FIN-005). Leitura estrita de public.recebiveis_painel, os
// filtros da tela e as somas que a tela mostra. A regra está no banco (packages/banco/src/recebiveis.test.ts):
// aqui só se confere a resposta, e conta que não fecha é falha de leitura, nunca número.
import { ehUuid } from "../acesso/regras";
import type { obterSessao } from "../acesso/sessao";
import { RespostaInesperada } from "../financeiro/painel";
import { ehObjeto, inteiro as n, inteiroOuNulo, lista, objeto, texto as t, textoOuNulo, type Leitura, type Linha } from "../leitura-do-banco";
import { textoDoParametro, type ValorDeParametro } from "../parametros";

/** Quem deve: as maquininhas (pelo provedor), o Pix direto na conta da loja e as financeiras. */
// A Mercado Pago (o #112, maquininha da loja) entra como as outras: sem ela, a primeira venda na maquininha Mercado Pago
// derrubava a tela inteira (a leitura estrita recusa adquirente desconhecida). O teste confere que toda maquininha que o
// site conhece (PROVEDORES) está aqui.
export const ADQUIRENTES = { picpay: "PicPay", pagbank: "PagBank", mercado_pago: "Mercado Pago", conta: "Pix direto na conta", payjoy: "PayJoy", aiva: "Aiva" } as const;
export type Adquirente = keyof typeof ADQUIRENTES;
const ehAdquirente = (v: unknown): v is Adquirente => typeof v === "string" && Object.hasOwn(ADQUIRENTES, v);
/** Os que se conciliam com o extrato (cartão e Pix) e os que pagam por repasse (financeiras). */
export const DO_EXTRATO: readonly Adquirente[] = ["picpay", "pagbank", "mercado_pago", "conta"];
export const DAS_FINANCEIRAS: readonly Adquirente[] = ["payjoy", "aiva"];

/** Janelas do recebido, em dias (o banco aceita de 7 a 90). */
export const JANELAS = [7, 30, 90] as const;
export type Janela = (typeof JANELAS)[number];
export const JANELA_PADRAO: Janela = 30;

export type Contagem = { quantidade: number; valor: number };
export type LinhaDosRecebiveis = {
  unidade: string; adquirente: Adquirente;
  aReceber: number; valorAReceber: number; ate7Dias: number; de8a30Dias: number; maisDe30Dias: number; maisAntigaDias: number | null;
  recebidos: number; recebidoBruto: number; recebidoLiquido: number; estornos: number; valorEstornos: number;
};
export type ItemAntigo = {
  tipo: "pagamento" | "financeira"; id: string; vendaId: string; vendaNumero: number; unidade: string; adquirente: Adquirente;
  valor: number; dias: number; terminal: string | null;
};
export type Recebiveis = {
  hoje: string; dias: number; unidade: string | null; lojas: { id: string; nome: string }[]; linhas: LinhaDosRecebiveis[];
  totalAReceber: Contagem; maisAntigos: ItemAntigo[];
  pendencias: { semMaquininha: Contagem; entradasNaMaquininha: Contagem; financeiraDeVendaCancelada: Contagem };
};

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const contagem = (dado: Linha, campo: string): Contagem => {
  const c = objeto(dado, campo);
  const r = { quantidade: n(c, "quantidade"), valor: n(c, "valor") };
  if (r.quantidade < 0 || r.valor < 0 || (r.quantidade === 0) !== (r.valor === 0)) throw new RespostaInesperada(campo);
  return r;
};

/** Converte a resposta de public.recebiveis_painel. Idade, somas e lojas que não fecham são falha, não número. */
export function lerRecebiveis(dado: unknown): Recebiveis {
  if (!ehObjeto(dado)) throw new RespostaInesperada("recebiveis_painel");
  const hoje = t(dado, "hoje");
  if (!DIA.test(hoje)) throw new RespostaInesperada("hoje");
  const dias = n(dado, "dias");
  if (dias < 7 || dias > 90) throw new RespostaInesperada("dias");
  const unidade = textoOuNulo(dado, "unidade");
  if (unidade !== null && !ehUuid(unidade)) throw new RespostaInesperada("unidade");
  const lojas = lista(dado, "lojas").map((l) => {
    const id = t(l, "id");
    if (!ehUuid(id)) throw new RespostaInesperada("lojas");
    return { id, nome: t(l, "nome") };
  });
  const conhecidas = new Set(lojas.map((l) => l.id));
  if (lojas.length === 0 || conhecidas.size !== lojas.length || (unidade !== null && !conhecidas.has(unidade))) throw new RespostaInesperada("lojas");
  const dentro = (id: string) => conhecidas.has(id) && (unidade === null || id === unidade);

  const vistas = new Set<string>();
  const linhas = lista(dado, "linhas").map((l): LinhaDosRecebiveis => {
    const loja = t(l, "unidade");
    const adquirente = l.adquirente;
    if (!dentro(loja) || !ehAdquirente(adquirente) || vistas.has(`${loja}:${adquirente}`)) throw new RespostaInesperada("linhas");
    vistas.add(`${loja}:${adquirente}`);
    const r = {
      unidade: loja, adquirente,
      aReceber: n(l, "a_receber"), valorAReceber: n(l, "valor_a_receber"),
      ate7Dias: n(l, "ate_7_dias"), de8a30Dias: n(l, "de_8_a_30_dias"), maisDe30Dias: n(l, "mais_de_30_dias"), maisAntigaDias: inteiroOuNulo(l, "mais_antiga_dias"),
      recebidos: n(l, "recebidos"), recebidoBruto: n(l, "recebido_bruto"), recebidoLiquido: n(l, "recebido_liquido"),
      estornos: n(l, "estornos_a_confirmar"), valorEstornos: n(l, "valor_estornos_a_confirmar"),
    };
    const numeros = [r.aReceber, r.valorAReceber, r.ate7Dias, r.de8a30Dias, r.maisDe30Dias, r.recebidos, r.recebidoBruto, r.recebidoLiquido, r.estornos, r.valorEstornos];
    if (numeros.some((x) => x < 0)
      || r.ate7Dias + r.de8a30Dias + r.maisDe30Dias !== r.valorAReceber
      || (r.aReceber > 0) !== (r.maisAntigaDias !== null) || (r.maisAntigaDias !== null && r.maisAntigaDias < 0)
      || (r.aReceber === 0 && r.valorAReceber !== 0) || (r.recebidos === 0 && (r.recebidoBruto !== 0 || r.recebidoLiquido !== 0))
      || r.recebidoLiquido > r.recebidoBruto || (r.estornos === 0) !== (r.valorEstornos === 0)
      || (DAS_FINANCEIRAS.includes(adquirente) && r.estornos > 0)) {
      throw new RespostaInesperada("linhas");
    }
    return r;
  });
  const totalAReceber = contagem(dado, "total_a_receber");
  if (totalAReceber.quantidade !== linhas.reduce((s, l) => s + l.aReceber, 0) || totalAReceber.valor !== linhas.reduce((s, l) => s + l.valorAReceber, 0)) {
    throw new RespostaInesperada("total_a_receber");
  }
  const maisAntigos = lista(dado, "mais_antigos").map((l): ItemAntigo => {
    const tipo = l.tipo;
    const id = t(l, "id");
    const vendaId = t(l, "venda_id");
    const loja = t(l, "unidade");
    const adquirente = l.adquirente;
    if ((tipo !== "pagamento" && tipo !== "financeira") || !ehUuid(id) || !ehUuid(vendaId) || !dentro(loja) || !ehAdquirente(adquirente)
      || (tipo === "financeira") !== DAS_FINANCEIRAS.includes(adquirente)) {
      throw new RespostaInesperada("mais_antigos");
    }
    const r = { tipo, id, vendaId, vendaNumero: n(l, "venda_numero"), unidade: loja, adquirente, valor: n(l, "valor"), dias: n(l, "dias"), terminal: textoOuNulo(l, "terminal") } as const;
    if (r.valor <= 0 || r.dias < 0) throw new RespostaInesperada("mais_antigos");
    return r;
  });
  if (maisAntigos.length > Math.min(20, totalAReceber.quantidade) || maisAntigos.some((m, i) => i > 0 && m.dias > (maisAntigos[i - 1]?.dias ?? 0))) {
    throw new RespostaInesperada("mais_antigos");
  }
  const p = objeto(dado, "pendencias");
  const pendencias = {
    semMaquininha: contagem(p, "sem_maquininha"),
    entradasNaMaquininha: contagem(p, "entradas_na_maquininha"),
    financeiraDeVendaCancelada: contagem(p, "financeira_de_venda_cancelada"),
  };
  return { hoje, dias, unidade, lojas, linhas, totalAReceber, maisAntigos, pendencias };
}

// ---------------------------------------------------------------------------------------------
// Somas da tela (sempre a partir das linhas lidas)
// ---------------------------------------------------------------------------------------------
export type Soma = {
  aReceber: number; valorAReceber: number; ate7Dias: number; de8a30Dias: number; maisDe30Dias: number; maisAntigaDias: number | null;
  recebidos: number; recebidoBruto: number; recebidoLiquido: number; estornos: number; valorEstornos: number;
};
export function somar(linhas: readonly LinhaDosRecebiveis[], de: readonly Adquirente[] = [...DO_EXTRATO, ...DAS_FINANCEIRAS]): Soma {
  const s: Soma = { aReceber: 0, valorAReceber: 0, ate7Dias: 0, de8a30Dias: 0, maisDe30Dias: 0, maisAntigaDias: null, recebidos: 0, recebidoBruto: 0, recebidoLiquido: 0, estornos: 0, valorEstornos: 0 };
  for (const l of linhas) {
    if (!de.includes(l.adquirente)) continue;
    s.aReceber += l.aReceber; s.valorAReceber += l.valorAReceber; s.ate7Dias += l.ate7Dias; s.de8a30Dias += l.de8a30Dias; s.maisDe30Dias += l.maisDe30Dias;
    s.recebidos += l.recebidos; s.recebidoBruto += l.recebidoBruto; s.recebidoLiquido += l.recebidoLiquido; s.estornos += l.estornos; s.valorEstornos += l.valorEstornos;
    if (l.maisAntigaDias !== null) s.maisAntigaDias = Math.max(s.maisAntigaDias ?? 0, l.maisAntigaDias);
  }
  return s;
}

/** O que falta receber de cada adquirente, somado nas lojas do recorte, na ordem fixa (cor segue o adquirente). */
export function porAdquirente(linhas: readonly LinhaDosRecebiveis[]): { adquirente: Adquirente; soma: Soma }[] {
  return (Object.keys(ADQUIRENTES) as Adquirente[])
    .map((adquirente) => ({ adquirente, soma: somar(linhas, [adquirente]) }))
    .filter((x) => x.soma.aReceber > 0 || x.soma.recebidos > 0 || x.soma.estornos > 0);
}

/** A diferença observada no extrato em fração do bruto (nula sem recebido). */
export const fracaoDaDiferenca = (s: Pick<Soma, "recebidoBruto" | "recebidoLiquido">) =>
  s.recebidoBruto > 0 ? (s.recebidoBruto - s.recebidoLiquido) / s.recebidoBruto : null;

/** Faixa de idade de um valor a receber, para o selo (sem prazo contratual verificado: só os dias desde a venda). */
export function idadeDoRecebivel(dias: number): { rotulo: string; tom: "neutro" | "info" | "aviso" } {
  const rotulo = dias === 0 ? "vendida hoje" : `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  if (dias <= 7) return { rotulo, tom: "neutro" };
  if (dias <= 30) return { rotulo, tom: "info" };
  return { rotulo, tom: "aviso" };
}

// ---------------------------------------------------------------------------------------------
// Filtros do endereço
// ---------------------------------------------------------------------------------------------
export type FiltroDosRecebiveis = { loja: string | null; dias: Janela };
export function lerFiltro(parametros: { loja?: ValorDeParametro; dias?: ValorDeParametro }): FiltroDosRecebiveis {
  const loja = textoDoParametro(parametros.loja);
  const dias = Number(textoDoParametro(parametros.dias));
  return {
    loja: ehUuid(loja) ? loja : null,
    dias: (JANELAS as readonly number[]).includes(dias) ? (dias as Janela) : JANELA_PADRAO,
  };
}
export function enderecoDosRecebiveis(filtro: FiltroDosRecebiveis): string {
  const p = new URLSearchParams();
  if (filtro.loja) p.set("loja", filtro.loja);
  if (filtro.dias !== JANELA_PADRAO) p.set("dias", String(filtro.dias));
  const q = p.toString();
  return `/pagamentos/recebiveis${q ? `?${q}` : ""}`;
}

// ---------------------------------------------------------------------------------------------
// Consulta: devolve o próprio estado; banco sem a função é "indisponível", nunca zero
// ---------------------------------------------------------------------------------------------
type Cliente = Awaited<ReturnType<typeof obterSessao>>["supabase"];
const FUNCAO_AUSENTE = new Set(["PGRST202", "42883"]);
export type LeituraDosRecebiveis = Leitura<Recebiveis> | { estado: "sem_permissao" };

export async function consultarRecebiveis(supabase: Cliente, filtro: FiltroDosRecebiveis): Promise<LeituraDosRecebiveis> {
  const r = await supabase.rpc("recebiveis_painel", { ...(filtro.loja ? { p_unidade: filtro.loja } : {}), p_dias: filtro.dias });
  if (r.error) {
    if (FUNCAO_AUSENTE.has(r.error.code)) return { estado: "indisponivel" };
    if (r.error.code === "42501") return { estado: "sem_permissao" };
    console.error("pagamentos: falha ao consultar recebiveis_painel", { codigo: r.error.code || null });
    return { estado: "falha" };
  }
  try {
    return { estado: "ok", dados: lerRecebiveis(r.data) };
  } catch (e) {
    console.error("pagamentos: resposta inesperada de recebiveis_painel", { campo: e instanceof RespostaInesperada ? e.message : null });
    return { estado: "falha" };
  }
}

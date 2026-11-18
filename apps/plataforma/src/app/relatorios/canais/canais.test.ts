// Os canais de venda lado a lado (lote CANAIS-a: ORA-REPORT-008; ADR-019) com a sessão e o Supabase SIMULADOS: nenhuma
// credencial, números fictícios. Cada painel do banco tem o teste dele; aqui, a tela que os junta.
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOJA = "00000000-0000-4000-8000-0000000000cc";
type Resposta = { data: unknown; error: null | { code: string; message?: string } };
const cenario = vi.hoisted(() => ({
  permissoes: new Set<string>(),
  chamadas: [] as { nome: string; argumentos: Record<string, unknown> }[],
  respostas: {} as Record<string, Resposta>,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (destino: string) => { throw new Error(`redirecionou para ${destino}`); } }));
const sessaoFicticia = {
  usuario: { id: "eu" },
  situacao: { usuario_ativo: true, sessao_no_turno: true, unidade_id: LOJA, unidade_nome: "Santa Cândida (teste)", turno_termina_em: "2026-11-17T23:00:00Z" },
  get molde() { return { permissoes: cenario.permissoes, nome: "Dono (fictício)", vinculos: [], pendencias: { aprovacoes: 0, notas: 0 } }; },
  supabase: {
    rpc: async (nome: string, argumentos: Record<string, unknown> = {}) => {
      cenario.chamadas.push({ nome, argumentos });
      return cenario.respostas[nome] ?? { data: null, error: null };
    },
  },
};
vi.mock("../../../lib/acesso/sessao", () => ({ FalhaDoServico: class extends Error {}, obterSessao: async () => sessaoFicticia }));

import CanaisDeVenda from "./page";

function texto(v: unknown): string {
  if (Array.isArray(v)) return v.map(texto).join(" ");
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (isValidElement<Record<string, unknown>>(v)) {
    if (typeof v.type === "function" && /^[A-Z]/.test((v.type as { name?: string }).name ?? "")) {
      try { return texto((v.type as (p: unknown) => unknown)(v.props)); } catch { /* componente com estado: lê as propriedades */ }
    }
    return Object.values(v.props).map(texto).join(" ");
  }
  if (v && typeof v === "object") return Object.values(v).map(texto).join(" ");
  return "";
}
const limpar = (v: unknown) => texto(v).replace(/\s+/g, " ");
const params = (p: Record<string, string> = {}) => ({ searchParams: Promise.resolve(p) }) as never;
const parcelas = { itens: 5, vendido: 80_000, itens_com_custo: 5, vendido_com_custo: 80_000, custo: 60_000, itens_sem_custo: 0, vendido_sem_custo: 0,
  itens_devolvidos_com_custo: 0, devolvido_com_custo: 0, custo_devolvido: 0, itens_cancelados_com_custo: 0, cancelado_com_custo: 0, custo_cancelado: 0, margem: 20_000 };

beforeEach(() => {
  cenario.permissoes = new Set(["resultado.ver"]);
  cenario.chamadas = [];
  cenario.respostas = {
    financeiro_painel: { data: {
      periodos: [{ periodo: "2026-11-17", vendas: 5, vendido: 80_000, cancelamentos: 1, cancelado: 2_000, devolucoes: 1, devolvido: 5_000 }],
      pagamentos: [{ meio: "cartao_picpay", situacao: "confirmado", meio_entrada: null, quantidade: 3, valor: 40_000, entrada: 0, troco: 0, conciliados: 2, conciliado: 30_000, liquido: 29_100 }],
      reembolsos: [], estornos: [], a_receber: [], movimentos: [],
      caixas: { abertos_agora: 0, fechados: 1, conferidos: 1, com_diferenca: 0, diferenca: 0, diferenca_absoluta: 0 },
    }, error: null },
    margem_painel: { data: { totais: parcelas, periodos: [], lojas_com_custo: 1, lojas_fora: 0 }, error: null },
    reservas_do_site_painel: { data: { origens: [{ origem: "instagram", fonte: "instagram", campanha: "natal", reservas: 3, atendidas: 2, canceladas: 0, vencidas: 0, vendas: 2, vendas_centavos: 15_800 }], vendedores: [] }, error: null },
    marketplace_painel: { data: {
      canais: [{ canal: "shopee", pedidos: 3, unidades: 4, bruto: 28_700, reembolsos: 7_900, tarifas: 2_500, frete: 800, liquido: 16_700, liquidos_estimados: 1, custo: 6_000, lucro: 6_500, pedidos_sem_custo: 1 }],
      anuncios: [], pedidos: [], pedidos_no_periodo: 3, itens_sem_produto: 0,
    }, error: null },
    anuncios_painel: { data: {
      campanhas: [{ chave: "natal", campanha: "Natal", gasto: 15_000, impressoes: null, cliques: null, resultados: null, dias: 2, reservas: 2, oportunidades: 0,
        vendas: 2, vendas_devolvidas: 0, receita: 15_800, devolvido: 0, margem: 7_000, vendas_sem_custo: 0, recebido: 15_800, reembolsado: 0, clientes_novos: 1 }],
      por_loja: [], por_vendedor: [], contatos_sem_campanha: 0, importado_ate: "2026-11-17",
    }, error: null },
  };
});

describe("a tela dos canais de venda", () => {
  it("quem não vê o resultado da rede vê o aviso, sem ler nada", async () => {
    cenario.permissoes = new Set(["venda.ver_todas"]);
    expect(limpar(await CanaisDeVenda(params()))).toContain("Os canais lado a lado são do dono");
    expect(cenario.chamadas).toEqual([]);
  });

  it("as lojas, o site, cada marketplace e os anúncios no mesmo período, sem somar duas vezes; o resultado estimado", async () => {
    const tela = limpar(await CanaisDeVenda(params({ inicio: "2026-11-17", fim: "2026-11-17" })));
    for (const trecho of ["De 17/11/2026 a 17/11/2026", "Receita da rede", "R$ 1.017,00", "R$ 271,00", "Resultado dos canais (estimado)", "R$ 106,00",
      "Lojas físicas · 5 vendas", "Vendido R$ 800,00", "devoluções e cancelamentos R$ 70,00", "receita R$ 730,00", "Taxas dos meios R$ 9,00", "(observadas em R$ 300,00 conciliados)",
      "margem bruta R$ 200,00", "2 vieram de reserva do site: R$ 158,00 (já dentro da receita das lojas)", "Shopee · 3 pedidos", "tarifas, frete e reembolsos R$ 112,00",
      "Lucro estimado R$ 65,00", "(fora 1 pedido sem custo)", "Anúncios (Meta)", "Valor usado R$ 150,00", "Como cada número é calculado"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(cenario.chamadas.map((c) => c.nome).sort()).toEqual(["anuncios_painel", "financeiro_painel", "margem_painel", "marketplace_painel", "reservas_do_site_painel"]);
    expect(cenario.chamadas.find((c) => c.nome === "marketplace_painel")?.argumentos).toEqual({ p_inicio: "2026-11-17", p_fim: "2026-11-17" });
    expect(cenario.chamadas.find((c) => c.nome === "financeiro_painel")?.argumentos).toMatchObject({ p_inicio: "2026-11-17T03:00:00.000Z", p_fim: "2026-11-18T03:00:00.000Z" });
  });

  // GRAF-a (a orientação de 18/11: "estado vazio não pode mascarar falha de consulta").
  it("GRAF-a: a margem e as reservas do site que falham aparecem como falha, com o tentar de novo; nunca como \"sem o custo\" ou nada", async () => {
    cenario.respostas.margem_painel = { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
    cenario.respostas.reservas_do_site_painel = { data: null, error: { code: "57014" } };
    const tela = limpar(await CanaisDeVenda(params({ inicio: "2026-11-17", fim: "2026-11-17" })));
    for (const trecho of ["Parte dos números não pôde ser lida agora", "A margem das lojas não respondeu", "As reservas do site não responderam",
      "Os outros números estão certos.", "Tentar de novo", "margem bruta — (não deu para ler agora)", "não deu para ler a margem das lojas agora: tente de novo",
      "Não deu para ler as reservas do site agora", "Vendido R$ 800,00", "Shopee · 3 pedidos"]) {
      expect(tela, trecho).toContain(trecho);
    }
    expect(tela).not.toContain("sem o custo");
    expect(tela).not.toContain("vieram de reserva do site");
  });

  it("GRAF-a: o banco sem a função da margem diz isso, sem o aviso de falha", async () => {
    cenario.respostas.margem_painel = { data: null, error: { code: "PGRST202" } };
    const tela = limpar(await CanaisDeVenda(params({ inicio: "2026-11-17", fim: "2026-11-17" })));
    expect(tela).toContain("margem bruta — (ainda não disponível neste banco)");
    expect(tela).toContain("a margem das lojas ainda não está disponível neste banco");
    expect(tela).not.toContain("Parte dos números não pôde ser lida agora");
  });
});


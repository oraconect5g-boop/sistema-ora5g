// Saúde da operação (lote Q1): quem vê cada fila, a contagem e a data da mais antiga, a fila que some num banco sem a
// tabela e a falha que aparece como falha; a fila das vendas sem pedido de nota, que vem de uma função (SAUDE-a).
// Supabase SIMULADO; dados fictícios.
import { describe, expect, it, vi } from "vitest";

import { diasDesde, FILAS, lerFilas } from "./filas";

type Resposta = { data: unknown; count: number | null; error: { code: string } | null };
type RespostaRpc = { data: unknown; error: { code: string } | null };
// A resposta de uma tabela pode depender dos filtros: duas filas leem a mesma tabela (as transferências, TRF-e).
function supabaseSimulado(respostas: Record<string, Resposta | ((filtros: unknown[]) => Resposta)>, rpc: Record<string, RespostaRpc> = {}) {
  const pedidos: { tabela: string; filtros: unknown[] }[] = [];
  const cliente = {
    rpc(nome: string) {
      pedidos.push({ tabela: `rpc:${nome}`, filtros: [] });
      return Promise.resolve(rpc[nome] ?? { data: { quantidade: 0, desde: null }, error: null });
    },
    from(tabela: string) {
      const filtros: unknown[] = [];
      pedidos.push({ tabela, filtros });
      const consulta = {
        select: (coluna: string, opcoes: unknown) => { filtros.push(["select", coluna, opcoes]); return consulta; },
        eq: (c: string, v: unknown) => { filtros.push(["eq", c, v]); return consulta; },
        in: (c: string, v: unknown) => { filtros.push(["in", c, v]); return consulta; },
        is: (c: string, v: unknown) => { filtros.push(["is", c, v]); return consulta; },
        lt: (c: string, v: unknown) => { filtros.push(["lt", c, v]); return consulta; },
        order: (c: string) => { filtros.push(["order", c]); return consulta; },
        limit: (n: number) => { filtros.push(["limit", n]); return consulta; },
        then: (resolver: (r: Resposta) => unknown) => {
          const r = respostas[tabela];
          return Promise.resolve(typeof r === "function" ? r(filtros) : r ?? { data: [], count: 0, error: null }).then(resolver);
        },
      };
      return consulta;
    },
  };
  return { cliente: cliente as unknown as Parameters<typeof lerFilas>[0], pedidos };
}

describe("filas da operação", () => {
  it("lê só as filas que a pessoa decide, com a contagem exata e a data da mais antiga", async () => {
    const { cliente, pedidos } = supabaseSimulado({
      notas_pedidos: { data: [{ venda_concluida_em: "2026-11-10T14:00:00Z" }], count: 4, error: null },
      whatsapp_envios: { data: [], count: 0, error: null },
    });
    const filas = await lerFilas(cliente, new Set(["nota.aprovar"]), "2026-11-14");
    expect(pedidos.map((p) => p.tabela)).toEqual(["rpc:notas_vendas_sem_pedido", "notas_pedidos", "whatsapp_envios"]);
    expect(filas).toEqual([
      expect.objectContaining({ estado: "ok", chave: "vendas_sem_nota", quantidade: 0, desde: null, href: "/notas/conciliacao" }),
      expect.objectContaining({ estado: "ok", chave: "notas", quantidade: 4, desde: "2026-11-10T14:00:00Z", href: "/notas" }),
      expect.objectContaining({ estado: "ok", chave: "whatsapp", quantidade: 0, desde: null }),
    ]);
    // A contagem é exata e a data é a mais antiga (ordem crescente, uma linha).
    expect(pedidos[1]?.filtros).toEqual([
      ["select", "venda_concluida_em", { count: "exact" }], ["in", "situacao", ["aguardando_aprovacao", "correcao_solicitada", "aprovada"]],
      ["order", "venda_concluida_em"], ["limit", 1],
    ]);
  });

  it("o vendedor não lê nenhuma fila; a gerência lê as dela; vencimento e prazo contam até ontem", async () => {
    const vendedor = supabaseSimulado({});
    expect(await lerFilas(vendedor.cliente, new Set(["venda.registrar"]), "2026-11-14")).toEqual([]);
    expect(vendedor.pedidos).toEqual([]);
    const gerente = supabaseSimulado({});
    await lerFilas(gerente.cliente, new Set(["venda.ver_unidade", "conta_pagar.gerir", "os.gerir", "estoque.consultar"]), "2026-11-14");
    expect(gerente.pedidos.map((p) => p.tabela)).toEqual(["estornos_externos", "venda_retornos", "transferencias", "transferencias", "ordens_servico", "ordens_servico", "contas_a_pagar"]);
    // TRF-e: as transferências em aberto e, à parte, as recebidas com falta que ainda esperam o destino do que faltou.
    const [emAberto, comFalta] = gerente.pedidos.filter((p) => p.tabela === "transferencias");
    expect(emAberto?.filtros).toContainEqual(["in", "situacao", ["solicitada", "separada", "enviada"]]);
    expect(comFalta?.filtros).toEqual([
      ["select", "recebido_em", { count: "exact" }], ["eq", "situacao", "recebida_com_divergencia"], ["is", "divergencia_resolvida_em", null],
      ["order", "recebido_em"], ["limit", 1],
    ]);
    expect(gerente.pedidos.find((p) => p.tabela === "contas_a_pagar")?.filtros).toContainEqual(["lt", "vencimento", "2026-11-14"]);
  });

  // TRF-e (o complemento do TRF-d): a transferência recebida com falta não some das filas enquanto o que faltou não tem destino.
  it("a transferência recebida com falta é uma fila à parte, desde o recebimento; num banco sem a coluna do TRF-d, some sem derrubar as outras", async () => {
    const comFalta = (filtros: unknown[]) => JSON.stringify(filtros).includes("recebida_com_divergencia");
    const { cliente } = supabaseSimulado({
      transferencias: (filtros) => (comFalta(filtros)
        ? { data: [{ recebido_em: "2026-11-20T15:00:00Z" }], count: 2, error: null }
        : { data: [{ solicitado_em: "2026-11-22T12:00:00Z" }], count: 1, error: null }),
    });
    const filas = await lerFilas(cliente, new Set(["venda.ver_unidade", "estoque.consultar"]), "2026-11-23");
    expect(filas.filter((f) => f.href === "/transferencias")).toEqual([
      expect.objectContaining({ estado: "ok", chave: "transferencias", rotulo: "Transferências em aberto", quantidade: 1, desde: "2026-11-22T12:00:00Z" }),
      expect.objectContaining({ estado: "ok", chave: "faltas_de_transferencia", rotulo: "Transferências com falta", quantidade: 2, desde: "2026-11-20T15:00:00Z",
        detalhe: "recebidas a menos, sem o destino do que faltou" }),
    ]);
    // O banco de antes do TRF-d não tem a coluna (42703): a fila nova some, e a das transferências em aberto continua.
    const antigo = supabaseSimulado({
      transferencias: (filtros) => (comFalta(filtros) ? { data: null, count: null, error: { code: "42703" } } : { data: [], count: 0, error: null }),
    });
    expect((await lerFilas(antigo.cliente, new Set(["venda.ver_unidade", "estoque.consultar"]), "2026-11-23")).map((f) => f.chave))
      .toEqual(["estornos", "retornos", "transferencias"]);
    // Quem só consulta o estoque, sem gerir a loja, não lê nenhuma das duas.
    const vendedor = supabaseSimulado({});
    expect(await lerFilas(vendedor.cliente, new Set(["estoque.consultar"]), "2026-11-23")).toEqual([]);
  });

  it("fila que o banco ainda não tem some; outra falha aparece como falha (nunca zero); contagem sem número some", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { cliente } = supabaseSimulado({
      notas_pedidos: { data: null, count: null, error: { code: "57014" } },
      whatsapp_envios: { data: null, count: null, error: { code: "PGRST205" } },
      connect_operacoes: { data: [], count: null, error: null },
    });
    const filas = await lerFilas(cliente, new Set(["nota.aprovar", "connect.gerir"]), "2026-11-14");
    expect(filas).toEqual([
      expect.objectContaining({ estado: "ok", chave: "vendas_sem_nota" }),
      { estado: "falha", chave: "notas", rotulo: "Notas na fila", href: "/notas", icone: "nota" },
    ]);
    expect(console.error).toHaveBeenCalledWith("operação: falha ao ler a fila", { fila: "notas", codigo: "57014" });
  });

  it("a venda sem o pedido da nota (SAUDE-a) vem da função do banco, com quantas e a mais antiga; sem a função, some; com erro, falha", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const comVendas = supabaseSimulado({}, { notas_vendas_sem_pedido: { data: { quantidade: 3, desde: "2026-11-11T13:00:00Z" }, error: null } });
    const [fila] = await lerFilas(comVendas.cliente, new Set(["nota.aprovar"]), "2026-11-14");
    expect(fila).toEqual({ estado: "ok", chave: "vendas_sem_nota", rotulo: "Vendas sem pedido de nota", detalhe: "concluídas, sem a nota pedida",
      href: "/notas/conciliacao", icone: "venda_sem_nota", quantidade: 3, desde: "2026-11-11T13:00:00Z" });
    const semFuncao = supabaseSimulado({}, { notas_vendas_sem_pedido: { data: null, error: { code: "PGRST202" } } });
    expect((await lerFilas(semFuncao.cliente, new Set(["nota.aprovar"]), "2026-11-14")).map((f) => f.chave)).toEqual(["notas", "whatsapp"]);
    const comErro = supabaseSimulado({}, { notas_vendas_sem_pedido: { data: null, error: { code: "57014" } } });
    expect((await lerFilas(comErro.cliente, new Set(["nota.aprovar"]), "2026-11-14"))[0]).toMatchObject({ estado: "falha", chave: "vendas_sem_nota" });
    const estranha = supabaseSimulado({}, { notas_vendas_sem_pedido: { data: [1], error: null } });
    expect((await lerFilas(estranha.cliente, new Set(["nota.aprovar"]), "2026-11-14")).map((f) => f.chave)).toEqual(["notas", "whatsapp"]);
    // Quem não aprova nota não pergunta.
    const vendedor = supabaseSimulado({});
    await lerFilas(vendedor.cliente, new Set(["venda.registrar"]), "2026-11-14");
    expect(vendedor.pedidos).toEqual([]);
  });

  it("cada fila tem uma chave só e leva a uma tela do sistema", () => {
    expect(new Set(FILAS.map((f) => f.chave)).size).toBe(FILAS.length);
    for (const f of FILAS) expect(f.href, f.chave).toMatch(/^\/[a-z]/);
  });

  it("há quantos dias: data pura e data e hora no dia de São Paulo; hoje é zero", () => {
    expect(diasDesde("2026-11-14", "2026-11-14")).toBe(0);
    expect(diasDesde("2026-11-10", "2026-11-14")).toBe(4);
    expect(diasDesde("2026-11-14T01:00:00Z", "2026-11-14")).toBe(1);
    expect(diasDesde("2026-11-14T15:00:00Z", "2026-11-14")).toBe(0);
    expect(diasDesde("2026-11-20", "2026-11-14")).toBe(0);
  });
});

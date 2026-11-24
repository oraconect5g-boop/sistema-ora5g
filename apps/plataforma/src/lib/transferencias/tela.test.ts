// A tela de Transferências numa ida (lote VEL-g): a leitura estrita da resposta de public.transferencias_tela e o que a tela
// faz com cada resposta do banco. Dados FICTÍCIOS. A função de verdade está em packages/banco/src/transferencias-tela.test.ts.
import { describe, expect, it, vi } from "vitest";

vi.mock("../acesso/sessao", () => ({ FalhaDoServico: class FalhaDoServico extends Error {} }));

import { consultarTelaDasTransferencias, LIMITE_DA_LISTA, lerTelaDasTransferencias } from "./tela";

const T = "00000000-0000-4000-9000-000000000001";
const RESPOSTA = {
  transferencias: [{ id: T, numero: 7, origem_id: "a", destino_id: "b", variante_id: "v", quantidade: 1, motivo: "Reposição", situacao: "enviada",
    solicitado_por: "p", quantidade_recebida: null, observacao: null, solicitado_em: "2026-11-19T17:03:38.123+00:00", remessa_id: null }],
  variantes: [{ id: "v", nome: "Moto G24", sku: "APA-0002", tipo: "aparelho" }],
  unidades: [{ id: "a", nome: "Loja A", tipo: "loja_fisica" }],
  itens: [{ transferencia_id: T, item_serializado_id: "i", recebido: null }],
  remessas: [],
  saldos: [{ unidade_id: "a", variante_id: "v", quantidade: 3, reservado: 1 }],
  disponiveis: [{ id: "i2", variante_id: "v", imei: "350000000000031", iccid: null }],
};

describe("a leitura da resposta", () => {
  it("lê cada parte, com os nulos onde o banco manda nulo", () => {
    const t = lerTelaDasTransferencias(RESPOSTA);
    expect(t.transferencias[0]).toMatchObject({ numero: 7, quantidade_recebida: null, remessa_id: null, situacao: "enviada" });
    expect(t.variantes[0]?.tipo).toBe("aparelho");
    expect(t.itens[0]?.recebido).toBeNull();
    expect(t.saldos[0]).toEqual({ unidade_id: "a", variante_id: "v", quantidade: 3, reservado: 1 });
    expect(t.disponiveis[0]?.iccid).toBeNull();
  });

  // TRF-d (o achado F21-04 da auditoria do Codex de 21/11): o destino do que faltou no recebimento.
  it("lê as resoluções da divergência e quando ela ficou resolvida; o banco sem a migration do TRF-d não as traz, e a tela segue", () => {
    // Antes da migration: sem a chave das resoluções e sem o campo da transferência.
    const antes = lerTelaDasTransferencias(RESPOSTA);
    expect(antes.resolucoes).toEqual([]);
    expect(antes.transferencias[0]?.divergencia_resolvida_em).toBeNull();
    const depois = lerTelaDasTransferencias({
      ...RESPOSTA,
      transferencias: [{ ...RESPOSTA.transferencias[0], situacao: "recebida_com_divergencia", quantidade: 3, quantidade_recebida: 1,
        divergencia_resolvida_em: "2026-11-23T14:00:00+00:00" }],
      resolucoes: [
        { transferencia_id: T, decisao: "voltou_a_origem", quantidade: 1, item_serializado_id: null, motivo: "Ficou na prateleira da origem", criado_em: "2026-11-23T13:50:00+00:00" },
        { transferencia_id: T, decisao: "baixada", quantidade: 1, item_serializado_id: "i", motivo: "Não apareceu em nenhuma loja", criado_em: "2026-11-23T14:00:00+00:00" },
      ],
    });
    expect(depois.transferencias[0]?.divergencia_resolvida_em).toBe("2026-11-23T14:00:00+00:00");
    expect(depois.resolucoes.map((r) => [r.decisao, r.quantidade, r.item_serializado_id])).toEqual([["voltou_a_origem", 1, null], ["baixada", 1, "i"]]);
    // A resolução fora da forma é erro, como o resto.
    expect(() => lerTelaDasTransferencias({ ...RESPOSTA, resolucoes: [{ transferencia_id: T, decisao: "baixada", quantidade: "uma" }] })).toThrow();
    expect(() => lerTelaDasTransferencias({ ...RESPOSTA, resolucoes: "nenhuma" })).toThrow();
  });

  // TRF-f (o achado F24-01 do Codex, 24/11): as em andamento e o histórico, cada parte com as suas páginas.
  it("lê se cada uma está em andamento e as contas das duas partes; o banco de antes do TRF-f, pela mesma regra e numa página só", () => {
    const comContas = lerTelaDasTransferencias({
      ...RESPOSTA, transferencias: [{ ...RESPOSTA.transferencias[0], aberta: true }],
      abertas: 51, historico: 120, pagina_abertas: 2, paginas_abertas: 2, pagina: 3, paginas: 3,
    });
    expect(comContas.transferencias[0]?.aberta).toBe(true);
    expect(comContas.contas).toEqual({ abertas: 51, historico: 120, paginaAbertas: 2, paginasAbertas: 2, pagina: 3, paginas: 3 });
    // Sem os campos (o banco de antes): a regra é a mesma do banco, e tudo cabe numa página.
    const deAntes = lerTelaDasTransferencias({ ...RESPOSTA, transferencias: [
      { ...RESPOSTA.transferencias[0] },
      { ...RESPOSTA.transferencias[0], id: "t2", numero: 6, situacao: "cancelada" },
      { ...RESPOSTA.transferencias[0], id: "t3", numero: 5, situacao: "recebida_com_divergencia", divergencia_resolvida_em: null },
      { ...RESPOSTA.transferencias[0], id: "t4", numero: 4, situacao: "recebida_com_divergencia", divergencia_resolvida_em: "2026-11-23T14:00:00+00:00" },
    ] });
    expect(deAntes.transferencias.map((x) => x.aberta)).toEqual([true, false, true, false]);
    expect(deAntes.contas).toEqual({ abertas: 2, historico: 2, paginaAbertas: 1, paginasAbertas: 1, pagina: 1, paginas: 1 });
    // Fora da forma é erro: a marca que não é sim/não e a conta que falta.
    expect(() => lerTelaDasTransferencias({ ...RESPOSTA, transferencias: [{ ...RESPOSTA.transferencias[0], aberta: "sim" }] })).toThrow();
    expect(() => lerTelaDasTransferencias({ ...RESPOSTA, abertas: 1, historico: 0 })).toThrow();
  });

  it("forma inesperada é erro, nunca a tela vazia", () => {
    for (const ruim of [null, [], { ...RESPOSTA, transferencias: undefined }, { ...RESPOSTA, saldos: [{ unidade_id: "a", variante_id: "v", quantidade: 1.5, reservado: 0 }] },
      { ...RESPOSTA, itens: [{ transferencia_id: T, item_serializado_id: "i", recebido: "sim" }] }, { ...RESPOSTA, variantes: [{ id: "v" }] }]) {
      expect(() => lerTelaDasTransferencias(ruim)).toThrow();
    }
  });
});

describe("o que a tela faz com a resposta do banco", () => {
  const banco = (resposta: { data: unknown; error: { code: string } | null }) => {
    const chamadas: string[] = [];
    const argumentos: unknown[] = [];
    const tabela = { select: () => tabela, or: () => tabela, order: () => tabela, limit: () => tabela, in: () => tabela, eq: () => tabela,
      filter: () => tabela, not: () => tabela,
      then: (r: (x: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) };
    const supabase = {
      rpc: async (nome: string, args: unknown) => { chamadas.push(nome); argumentos.push(args); return resposta; },
      from: (nome: string) => { chamadas.push(nome); return tabela; },
    };
    return { supabase: supabase as never, chamadas, argumentos };
  };

  it("com a função: uma ida só, com o limite da lista; a tela pede a página de cada parte e o número procurado", async () => {
    const { supabase, chamadas, argumentos } = banco({ data: RESPOSTA, error: null });
    expect((await consultarTelaDasTransferencias(supabase, "a")).transferencias).toHaveLength(1);
    expect(chamadas).toEqual(["transferencias_tela"]);
    expect(argumentos).toEqual([{ p_limite: LIMITE_DA_LISTA, p_pagina: 1, p_pagina_abertas: 1 }]);
    const outra = banco({ data: RESPOSTA, error: null });
    await consultarTelaDasTransferencias(outra.supabase, "a", { pagina: 3, paginaAbertas: 2, numero: 17 });
    expect(outra.argumentos).toEqual([{ p_limite: LIMITE_DA_LISTA, p_pagina: 3, p_pagina_abertas: 2, p_numero: 17 }]);
  });

  it("o banco sem a função (PGRST202 ou 42883): as leituras de antes", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { supabase, chamadas } = banco({ data: null, error: { code } });
      expect(await consultarTelaDasTransferencias(supabase, "a")).toEqual({
        transferencias: [], contas: { abertas: 0, historico: 0, paginaAbertas: 1, paginasAbertas: 1, pagina: 1, paginas: 1 },
        variantes: [], unidades: [], itens: [], remessas: [], saldos: [], disponiveis: [], resolucoes: [] });
      // TRF-f: as em andamento e o histórico em leituras separadas (a pedida antiga não some atrás das canceladas).
      expect(chamadas).toEqual(["transferencias_tela", "transferencias", "transferencias"]);
    }
  });

  it("outra falha ou a resposta fora da forma vira a página de erro, nunca a lista vazia", async () => {
    await expect(consultarTelaDasTransferencias(banco({ data: null, error: { code: "57014" } }).supabase, "a")).rejects.toThrow();
    await expect(consultarTelaDasTransferencias(banco({ data: { transferencias: "x" }, error: null }).supabase, "a")).rejects.toThrow();
  });
});
